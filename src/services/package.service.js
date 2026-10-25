'use strict';

const { db } = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const { HTTP_STATUS, AUDIT_CATEGORY, AUDIT_ACTION, PACKAGE_MANAGE_MAX_LEVEL, ADDON_APPROVE_MAX_LEVEL } = require('../constants');

function assertLevel(user, maxLevel, msg) {
  if (user.roleLevel > maxLevel) {
    const err = new Error(msg || `Access level <= ${maxLevel} required`);
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }
}

// Use function so db references resolve lazily after associations are loaded
function getPackageInclude() {
  return [
    { model: db.Client, as: 'client', attributes: ['id', 'name', 'clientCode'] },
    { model: db.User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'] },
    {
      model: db.PackageService, as: 'services',
      include: [
        { model: db.ServiceCatalog, as: 'service', attributes: ['id', 'name', 'category', 'unit', 'defaultPrice', 'serviceLevel'] },
      ],
    },
    {
      model: db.PackageAddOn, as: 'addOns',
      include: [
        { model: db.ServiceCatalog, as: 'service', attributes: ['id', 'name', 'category', 'serviceLevel'] },
        { model: db.User, as: 'requestedBy', attributes: ['id', 'firstName', 'lastName'] },
        { model: db.User, as: 'approvedBy', attributes: ['id', 'firstName', 'lastName'] },
      ],
    },
  ];
}

/**
 * _recalcPackageBasePrice — Recalculates and stores the basePrice snapshot on a ClientPackage.
 *
 * Iterates all isIncluded=true PackageService rows for the package.
 * For each row: effectiveUnitPrice = PackageService.unitPrice ?? ServiceCatalog.defaultPrice ?? 0
 * basePrice = SUM( quantity * effectiveUnitPrice )
 *
 * Also builds a packageOverview breakdown by service level tier (BL/SL/PL/UL).
 */
async function _recalcPackageBasePrice(packageId) {
  const services = await db.PackageService.findAll({
    where: { packageId, isIncluded: true },
    include: [{ model: db.ServiceCatalog, as: 'service', attributes: ['id', 'defaultPrice', 'serviceLevel'] }],
  });

  let total = 0;
  const levelCounts = { BL: 0, SL: 0, PL: 0, UL: 0 };
  const levelTotals = { BL: 0, SL: 0, PL: 0, UL: 0 };

  for (const ps of services) {
    const qty = ps.quantity || 1;
    const effectivePrice = parseFloat(
      ps.unitPrice != null ? ps.unitPrice : (ps.service?.defaultPrice ?? 0)
    );
    const lineAmount = qty * effectivePrice;
    total += lineAmount;

    // Track level breakdown
    const level = ps.service?.serviceLevel; // e.g. 'BL-1', 'SL-2', 'UL-1'
    if (level) {
      const tier = level.split('-')[0]; // 'BL', 'SL', 'PL', 'UL'
      if (levelCounts[tier] !== undefined) {
        levelCounts[tier]++;
        levelTotals[tier] += lineAmount;
      }
    }
  }

  await db.ClientPackage.update(
    { basePrice: parseFloat(total.toFixed(2)) },
    { where: { id: packageId } }
  );

  return { total: parseFloat(total.toFixed(2)), levelCounts, levelTotals };
}

async function assertClientExists(clientId) {
  const client = await db.Client.findOne({ where: { id: clientId, deletedAt: null } });
  if (!client) {
    const err = new Error('Client not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }
  return client;
}

async function assertPackageExists(packageId) {
  const pkg = await db.ClientPackage.findOne({ where: { id: packageId, deletedAt: null } });
  if (!pkg) {
    const err = new Error('Package not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }
  return pkg;
}

// ─── Client Package CRUD ──────────────────────────────────────────────────────

async function createPackage({ requestingUser, clientId, data, req }) {
  assertLevel(requestingUser, PACKAGE_MANAGE_MAX_LEVEL, 'Only Manager level or above can create packages');
  await assertClientExists(clientId);

  // basePrice is NOT accepted from user input — it is calculated from linked services.
  const { name, packageType, billingCycle, startDate, endDate, renewalDate, notes,
          whatWeDo, whatWeDoNot, moderationScope } = data;

  const pkg = await db.ClientPackage.create({
    clientId, name, packageType, billingCycle,
    basePrice: 0, // starts at 0; recalculated when services are added
    startDate, endDate, renewalDate, notes,
    whatWeDo: whatWeDo || null,
    whatWeDoNot: whatWeDoNot || null,
    moderationScope: moderationScope || null,
    status: 'ACTIVE',
    createdById: requestingUser.id,
  });

  const fullPkg = await db.ClientPackage.findByPk(pkg.id, { include: getPackageInclude() });
  const clientName = fullPkg?.client?.name || clientId;

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.PACKAGE_CREATED,
    category: AUDIT_CATEGORY.PACKAGE,
    entity: 'ClientPackage',
    entityId: pkg.id,
    entityName: pkg.name,
    description: `Created package: ${pkg.name} for client "${clientName}"`,
    newValues: pkg.toJSON(),
    req,
  });

  return fullPkg;
}

async function getPackagesByClient({ clientId }) {
  await assertClientExists(clientId);
  return db.ClientPackage.findAll({
    where: { clientId, deletedAt: null },
    include: getPackageInclude(),
    order: [['created_at', 'DESC']],
  });
}

async function getPackageById({ packageId }) {
  const pkg = await db.ClientPackage.findOne({
    where: { id: packageId, deletedAt: null },
    include: getPackageInclude(),
  });
  if (!pkg) {
    const err = new Error('Package not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }
  return pkg;
}

async function updatePackage({ requestingUser, packageId, data, req }) {
  assertLevel(requestingUser, PACKAGE_MANAGE_MAX_LEVEL, 'Only Manager level or above can update packages');

  const pkg = await assertPackageExists(packageId);
  const oldValues = pkg.toJSON();

  // basePrice is excluded — it is auto-calculated from services, not user-editable.
  const fields = [
    'name', 'packageType', 'billingCycle',
    'startDate', 'endDate', 'renewalDate', 'status', 'notes',
    'whatWeDo', 'whatWeDoNot', 'moderationScope',
  ];
  fields.forEach(f => { if (data[f] !== undefined) pkg[f] = data[f]; });
  await pkg.save();

  const fullPkg = await db.ClientPackage.findByPk(pkg.id, { include: getPackageInclude() });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.PACKAGE_UPDATED,
    category: AUDIT_CATEGORY.PACKAGE,
    entity: 'ClientPackage',
    entityId: pkg.id,
    entityName: pkg.name,
    description: `Updated package: ${pkg.name}`,
    oldValues,
    newValues: fullPkg.toJSON(),
    req,
  });

  return fullPkg;
}

async function deletePackage({ requestingUser, packageId, req }) {
  assertLevel(requestingUser, PACKAGE_MANAGE_MAX_LEVEL, 'Only Manager level or above can delete packages');
  const pkg = await assertPackageExists(packageId);
  await pkg.update({ deletedAt: new Date(), status: 'CANCELLED' });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.PACKAGE_DELETED,
    category: AUDIT_CATEGORY.PACKAGE,
    entity: 'ClientPackage',
    entityId: pkg.id,
    entityName: pkg.name,
    description: `Deleted (cancelled) package: ${pkg.name}`,
    req,
  });
}

// ─── Package Services ─────────────────────────────────────────────────────────

async function addServiceToPackage({ requestingUser, packageId, data, req }) {
  assertLevel(requestingUser, PACKAGE_MANAGE_MAX_LEVEL, 'Only Manager level or above can add services to a package');
  const pkg = await assertPackageExists(packageId);

  const { serviceId, quantity, scope, frequency, ownerLabel, unitPrice, isIncluded, notes } = data;

  if (serviceId) {
    const svc = await db.ServiceCatalog.findByPk(serviceId);
    if (!svc) {
      const err = new Error('Service not found in catalog');
      err.statusCode = HTTP_STATUS.NOT_FOUND;
      throw err;
    }
  }

  const ps = await db.PackageService.create({
    packageId, serviceId, quantity, scope,
    frequency: frequency || 'MONTHLY',
    ownerLabel: ownerLabel || null,
    unitPrice: unitPrice != null ? unitPrice : null,
    isIncluded: isIncluded !== undefined ? isIncluded : true,
    notes,
  });

  // Recalculate package basePrice from all included services
  await _recalcPackageBasePrice(packageId);

  const full = await db.PackageService.findByPk(ps.id, {
    include: [
      { model: db.ServiceCatalog, as: 'service', attributes: ['id', 'name', 'category', 'unit', 'defaultPrice', 'serviceLevel'] },
    ],
  });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.PACKAGE_SERVICE_ADDED,
    category: AUDIT_CATEGORY.PACKAGE,
    entity: 'PackageService',
    entityId: ps.id,
    entityName: pkg.name,
    description: `Added service to package: ${pkg.name}`,
    newValues: ps.toJSON(),
    req,
  });

  return full;
}

async function updatePackageService({ requestingUser, packageServiceId, data, req }) {
  assertLevel(requestingUser, PACKAGE_MANAGE_MAX_LEVEL, 'Only Manager level or above can update package services');

  const ps = await db.PackageService.findByPk(packageServiceId);
  if (!ps) {
    const err = new Error('Package service not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  const fields = ['quantity', 'scope', 'frequency', 'ownerLabel', 'unitPrice', 'isIncluded', 'notes'];
  fields.forEach(f => { if (data[f] !== undefined) ps[f] = data[f]; });
  await ps.save();

  // Recalculate package basePrice from all included services
  await _recalcPackageBasePrice(ps.packageId);

  const [svc, pkg] = await Promise.all([
    db.ServiceCatalog.findByPk(ps.serviceId, { attributes: ['id', 'name'] }),
    db.ClientPackage.findByPk(ps.packageId, { attributes: ['id', 'name'] }),
  ]);
  const serviceName = svc?.name || 'Service';
  const pkgName = pkg?.name || 'Package';

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.PACKAGE_SERVICE_UPDATED,
    category: AUDIT_CATEGORY.PACKAGE,
    entity: 'PackageService',
    entityId: ps.id,
    entityName: `${pkgName} → ${serviceName}`,
    description: `Updated package service "${serviceName}" in package "${pkgName}"`,
    newValues: ps.toJSON(),
    req,
  });

  return ps;
}

async function removeServiceFromPackage({ requestingUser, packageServiceId, req }) {
  assertLevel(requestingUser, PACKAGE_MANAGE_MAX_LEVEL, 'Only Manager level or above can remove package services');

  const ps = await db.PackageService.findByPk(packageServiceId);
  if (!ps) {
    const err = new Error('Package service not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  const { packageId } = ps;
  const [svc, pkg] = await Promise.all([
    db.ServiceCatalog.findByPk(ps.serviceId, { attributes: ['id', 'name'] }),
    db.ClientPackage.findByPk(packageId, { attributes: ['id', 'name'] }),
  ]);
  const serviceName = svc?.name || 'Service';
  const pkgName = pkg?.name || 'Package';

  await ps.destroy();

  // Recalculate package basePrice after removal
  await _recalcPackageBasePrice(packageId);

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.PACKAGE_SERVICE_REMOVED,
    category: AUDIT_CATEGORY.PACKAGE,
    entity: 'PackageService',
    entityId: packageServiceId,
    entityName: `${pkgName} → ${serviceName}`,
    description: `Removed service "${serviceName}" from package "${pkgName}"`,
    req,
  });
}

// ─── Add-ons ──────────────────────────────────────────────────────────────────

async function requestAddOn({ requestingUser, packageId, data, req }) {
  const pkg = await assertPackageExists(packageId);

  const { serviceId, docketId, customDescription, quantity, unitPrice, notes, requestedAt } = data;

  if (!serviceId && !customDescription) {
    const err = new Error('Either serviceId or customDescription is required for an add-on');
    err.statusCode = HTTP_STATUS.BAD_REQUEST;
    throw err;
  }

  const qty = quantity || 1;
  const price = unitPrice || 0;

  const addOn = await db.PackageAddOn.create({
    packageId,
    serviceId: serviceId || null,
    docketId: docketId || null,
    customDescription,
    quantity: qty,
    unitPrice: price || null,
    totalPrice: qty * price || null,
    status: 'REQUESTED',
    requestedAt: requestedAt || new Date(),
    requestedById: requestingUser.id,
    notes,
  });

  let addOnLabel = customDescription || 'Add-on';
  if (serviceId) {
    const svc = await db.ServiceCatalog.findByPk(serviceId, { attributes: ['id', 'name'] });
    if (svc?.name) addOnLabel = svc.name;
  }

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.ADDON_REQUESTED,
    category: AUDIT_CATEGORY.ADDON,
    entity: 'PackageAddOn',
    entityId: addOn.id,
    entityName: `${pkg.name} → ${addOnLabel}`,
    description: `Add-on "${addOnLabel}" requested on package "${pkg.name}"`,
    newValues: addOn.toJSON(),
    req,
  });

  return addOn;
}

async function approveAddOn({ requestingUser, addOnId, approve, rejectionReason, req }) {
  assertLevel(requestingUser, ADDON_APPROVE_MAX_LEVEL, 'Only Manager level or above can approve add-ons');

  const addOn = await db.PackageAddOn.findByPk(addOnId);
  if (!addOn) {
    const err = new Error('Add-on not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  if (addOn.status !== 'REQUESTED') {
    const err = new Error(`Add-on is already ${addOn.status}`);
    err.statusCode = HTTP_STATUS.CONFLICT;
    throw err;
  }

  if (approve) {
    addOn.status = 'APPROVED';
    addOn.approvedAt = new Date();
    addOn.approvedById = requestingUser.id;
  } else {
    addOn.status = 'REJECTED';
    addOn.rejectionReason = rejectionReason || null;
    addOn.approvedById = requestingUser.id;
  }

  await addOn.save();

  const pkg = await db.ClientPackage.findByPk(addOn.packageId, { attributes: ['id', 'name'] });
  let addOnLabel = addOn.customDescription || 'Add-on';
  if (addOn.serviceId) {
    const svc = await db.ServiceCatalog.findByPk(addOn.serviceId, { attributes: ['id', 'name'] });
    if (svc?.name) addOnLabel = svc.name;
  }
  const pkgName = pkg?.name || 'Package';

  await writeAuditLog({
    performedBy: requestingUser,
    action: approve ? AUDIT_ACTION.ADDON_APPROVED : AUDIT_ACTION.ADDON_REJECTED,
    category: AUDIT_CATEGORY.ADDON,
    entity: 'PackageAddOn',
    entityId: addOn.id,
    entityName: `${pkgName} → ${addOnLabel}`,
    description: `Add-on "${addOnLabel}" ${approve ? 'approved' : 'rejected'} for package "${pkgName}"`,
    newValues: addOn.toJSON(),
    req,
  });

  return addOn;
}

async function updateAddOnStatus({ requestingUser, addOnId, status, req }) {
  assertLevel(requestingUser, ADDON_APPROVE_MAX_LEVEL, 'Only Manager level or above can update add-on status');

  const addOn = await db.PackageAddOn.findByPk(addOnId);
  if (!addOn) {
    const err = new Error('Add-on not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  const validTransitions = { APPROVED: ['DELIVERED'], DELIVERED: ['BILLED'] };
  if (!validTransitions[addOn.status] || !validTransitions[addOn.status].includes(status)) {
    const err = new Error(`Cannot transition add-on from ${addOn.status} to ${status}`);
    err.statusCode = HTTP_STATUS.CONFLICT;
    throw err;
  }

  addOn.status = status;
  if (status === 'DELIVERED') addOn.deliveredAt = new Date();
  if (status === 'BILLED') addOn.billedAt = new Date();
  await addOn.save();

  const pkg = await db.ClientPackage.findByPk(addOn.packageId, { attributes: ['id', 'name'] });
  let addOnLabel = addOn.customDescription || 'Add-on';
  if (addOn.serviceId) {
    const svc = await db.ServiceCatalog.findByPk(addOn.serviceId, { attributes: ['id', 'name'] });
    if (svc?.name) addOnLabel = svc.name;
  }
  const pkgName = pkg?.name || 'Package';

  await writeAuditLog({
    performedBy: requestingUser,
    action: status === 'DELIVERED' ? AUDIT_ACTION.ADDON_DELIVERED : AUDIT_ACTION.ADDON_BILLED,
    category: AUDIT_CATEGORY.ADDON,
    entity: 'PackageAddOn',
    entityId: addOn.id,
    entityName: `${pkgName} → ${addOnLabel}`,
    description: `Add-on "${addOnLabel}" marked as ${status} for package "${pkgName}"`,
    newValues: addOn.toJSON(),
    req,
  });

  return addOn;
}

module.exports = {
  createPackage,
  getPackagesByClient,
  getPackageById,
  updatePackage,
  deletePackage,
  addServiceToPackage,
  updatePackageService,
  removeServiceFromPackage,
  requestAddOn,
  approveAddOn,
  updateAddOnStatus,
  // Exported for use in seed scripts / admin tools
  recalcPackageBasePrice: _recalcPackageBasePrice,
};
