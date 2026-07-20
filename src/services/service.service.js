'use strict';

const { db } = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const { HTTP_STATUS, AUDIT_CATEGORY, AUDIT_ACTION, PACKAGE_MANAGE_MAX_LEVEL } = require('../constants');

function assertLevel(user, maxLevel, msg) {
  if (user.roleLevel > maxLevel) {
    const err = new Error(msg || `Access level ≤ ${maxLevel} required`);
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }
}

// ─── Service Catalog ──────────────────────────────────────────────────────────

async function createService({ requestingUser, data, req }) {
  assertLevel(requestingUser, PACKAGE_MANAGE_MAX_LEVEL, 'Only Manager level or above can manage service catalog');

  const { name, category, description, unit, defaultPrice } = data;

  const service = await db.ServiceCatalog.create({
    name, category, description, unit, defaultPrice,
    isActive: true,
    createdById: requestingUser.id,
  });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.SERVICE_CREATED,
    category: AUDIT_CATEGORY.SERVICE,
    entity: 'ServiceCatalog',
    entityId: service.id,
    entityName: service.name,
    description: `Created service: ${service.name}`,
    newValues: service.toJSON(),
    req,
  });

  return service;
}

async function getServices({ isActive } = {}) {
  const where = {};
  if (isActive !== undefined) where.isActive = isActive === 'true' || isActive === true;

  return db.ServiceCatalog.findAll({
    where,
    include: [{ model: db.User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'] }],
    order: [['category', 'ASC'], ['name', 'ASC']],
  });
}

async function getServiceById({ id }) {
  const service = await db.ServiceCatalog.findByPk(id, {
    include: [{ model: db.User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'] }],
  });
  if (!service) {
    const err = new Error('Service not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }
  return service;
}

async function updateService({ requestingUser, id, data, req }) {
  assertLevel(requestingUser, PACKAGE_MANAGE_MAX_LEVEL, 'Only Manager level or above can update service catalog');

  const service = await db.ServiceCatalog.findByPk(id);
  if (!service) {
    const err = new Error('Service not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  const oldValues = service.toJSON();
  const fields = ['name', 'category', 'description', 'unit', 'defaultPrice', 'isActive'];
  fields.forEach(f => { if (data[f] !== undefined) service[f] = data[f]; });
  await service.save();

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.SERVICE_UPDATED,
    category: AUDIT_CATEGORY.SERVICE,
    entity: 'ServiceCatalog',
    entityId: service.id,
    entityName: service.name,
    description: `Updated service: ${service.name}`,
    oldValues,
    newValues: service.toJSON(),
    req,
  });

  return service;
}

async function deleteService({ requestingUser, id, req }) {
  assertLevel(requestingUser, PACKAGE_MANAGE_MAX_LEVEL, 'Only Manager level or above can delete services');

  const service = await db.ServiceCatalog.findByPk(id);
  if (!service) {
    const err = new Error('Service not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  // Soft-delete via isActive flag (do not hard-delete to preserve history)
  service.isActive = false;
  await service.save();

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.SERVICE_DELETED,
    category: AUDIT_CATEGORY.SERVICE,
    entity: 'ServiceCatalog',
    entityId: service.id,
    entityName: service.name,
    description: `Deactivated service: ${service.name}`,
    req,
  });
}

module.exports = {
  createService,
  getServices,
  getServiceById,
  updateService,
  deleteService,
};
