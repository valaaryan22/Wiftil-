'use strict';

const { Op } = require('sequelize');
const { db } = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const { AUDIT_CATEGORY, AUDIT_ACTION, VENDOR_MANAGE_MAX_LEVEL } = require('../constants');

// Standard user attributes to include
const USER_ATTRS = ['id', 'firstName', 'lastName', 'email', 'department'];

function assertLevel(user, maxLevel, msg) {
  if (user && user.roleLevel > maxLevel) {
    const err = new Error(msg || `Access level ≤ ${maxLevel} required`);
    err.statusCode = 403;
    throw err;
  }
}

// ── Vendor Master Profiles ───────────────────────────────────────────────────

/**
 * Generate unique vendor code (e.g. FL-2026-004, VND-2026-005, AGY-2026-006)
 */
async function generateVendorCode(type = 'FREELANCER') {
  const prefixMap = {
    FREELANCER: 'FL',
    VENDOR: 'VND',
    PARTNER_AGENCY: 'AGY',
    COLLABORATOR: 'COL',
  };
  const prefix = prefixMap[type] || 'VND';
  const year = new Date().getFullYear();
  const count = await db.Vendor.count({ paranoid: false });
  const seq = String(count + 1).padStart(3, '0');
  return `${prefix}-${year}-${seq}`;
}

/**
 * Get paginated list of vendors with filters & search
 */
async function getVendors({
  page = 1,
  limit = 20,
  search = '',
  type,
  status,
  sortBy = 'created_at',
  sortOrder = 'DESC',
} = {}) {
  const offset = (Math.max(1, parseInt(page)) - 1) * Math.max(1, parseInt(limit));
  const where = { deletedAt: null };

  if (type) {
    where.type = type;
  }
  if (status) {
    where.status = status;
  }
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    where[Op.or] = [
      { name: { [Op.like]: term } },
      { vendorCode: { [Op.like]: term } },
      { primaryContactName: { [Op.like]: term } },
      { email: { [Op.like]: term } },
      { serviceCategory: { [Op.like]: term } },
      { location: { [Op.like]: term } },
    ];
  }

  const { rows, count } = await db.Vendor.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset,
    order: [[sortBy, sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC']],
    include: [
      { model: db.User, as: 'creator', attributes: USER_ATTRS },
      { model: db.VendorRateCard, as: 'rateCards', attributes: ['id', 'serviceTitle', 'baseRate', 'currency', 'pricingModel', 'isActive'], where: { deletedAt: null }, required: false },
    ],
    distinct: true,
  });

  return {
    vendors: rows.map(v => {
      const plain = v.toJSON();
      plain.rateCardsCount = (plain.rateCards || []).length;
      return plain;
    }),
    total: count,
    page: parseInt(page),
    limit: parseInt(limit),
  };
}

/**
 * Get detailed vendor profile with rate cards, reviews and linked expenses
 */
async function getVendorById(id) {
  const vendor = await db.Vendor.findOne({
    where: { id, deletedAt: null },
    include: [
      { model: db.User, as: 'creator', attributes: USER_ATTRS },
      {
        model: db.VendorRateCard,
        as: 'rateCards',
        where: { deletedAt: null },
        required: false,
        order: [['created_at', 'DESC']],
      },
      {
        model: db.VendorPerformance,
        as: 'performanceRecords',
        where: { deletedAt: null },
        required: false,
        include: [{ model: db.User, as: 'reviewer', attributes: USER_ATTRS }],
        order: [['created_at', 'DESC']],
      },
    ],
  });

  if (!vendor) {
    const err = new Error('Vendor or Collaborator not found');
    err.statusCode = 404;
    throw err;
  }

  // Find linked expenses by vendor name
  const linkedExpenses = await db.Expense.findAll({
    where: {
      deletedAt: null,
      vendorName: { [Op.like]: `%${vendor.name}%` },
    },
    attributes: ['id', 'expenseNumber', 'title', 'amount', 'totalAmount', 'status', 'created_at'],
    limit: 15,
    order: [['created_at', 'DESC']],
  }).catch(() => []);

  const totalExpensePaid = linkedExpenses
    .filter(e => e.status === 'PAID')
    .reduce((s, e) => s + parseFloat(e.totalAmount || e.amount || 0), 0);

  const vendorData = vendor.toJSON();
  vendorData.financials = {
    linkedExpensesCount: linkedExpenses.length,
    totalPaid: parseFloat(totalExpensePaid.toFixed(2)),
    recentExpenses: linkedExpenses,
  };

  return vendorData;
}

/**
 * Create a new vendor profile
 */
async function createVendor(data, requestingUser) {
  assertLevel(requestingUser, VENDOR_MANAGE_MAX_LEVEL, 'Only Managers, Admins, or Boss can register external vendors');

  const {
    name,
    type = 'FREELANCER',
    status = 'ACTIVE',
    primaryContactName,
    email,
    phone,
    whatsappNumber,
    skills,
    serviceCategory,
    location,
    website,
    portfolioUrl,
    gstNumber,
    panNumber,
    bankName,
    bankAccountNumber,
    bankIfscSwift,
    paymentTerms = 'UPON_DELIVERY',
    currency = 'INR',
    notes,
  } = data;

  if (!name || !name.trim()) {
    const err = new Error('Vendor/Freelancer name is required');
    err.statusCode = 422;
    throw err;
  }

  const vendorCode = data.vendorCode || await generateVendorCode(type);

  // Check unique code
  const existing = await db.Vendor.findOne({ where: { vendorCode } });
  if (existing) {
    const err = new Error(`Vendor code ${vendorCode} already exists`);
    err.statusCode = 409;
    throw err;
  }

  const vendor = await db.Vendor.create({
    vendorCode,
    name: name.trim(),
    type,
    status,
    primaryContactName,
    email,
    phone,
    whatsappNumber,
    skills: Array.isArray(skills) ? skills : (typeof skills === 'string' ? skills.split(',').map(s => s.trim()).filter(Boolean) : []),
    serviceCategory,
    location,
    website,
    portfolioUrl,
    gstNumber,
    panNumber,
    bankName,
    bankAccountNumber,
    bankIfscSwift,
    paymentTerms,
    currency,
    notes,
    createdById: requestingUser ? requestingUser.id : null,
  });

  if (requestingUser) {
    await writeAuditLog({
      performedBy: requestingUser,
      action: AUDIT_ACTION.VENDOR_CREATED,
      category: AUDIT_CATEGORY.VENDOR,
      entity: 'Vendor',
      entityId: vendor.id,
      entityName: vendor.name,
      description: `Created external workforce profile for ${vendor.name} (${vendor.vendorCode})`,
    });
  }

  return vendor;
}

/**
 * Update an existing vendor profile
 */
async function updateVendor(id, data, requestingUser) {
  assertLevel(requestingUser, VENDOR_MANAGE_MAX_LEVEL, 'Only Managers, Admins, or Boss can edit vendor profiles');

  const vendor = await db.Vendor.findOne({ where: { id, deletedAt: null } });
  if (!vendor) {
    const err = new Error('Vendor not found');
    err.statusCode = 404;
    throw err;
  }

  const updatable = [
    'name', 'type', 'status', 'primaryContactName', 'email', 'phone', 'whatsappNumber',
    'skills', 'serviceCategory', 'location', 'website', 'portfolioUrl', 'gstNumber',
    'panNumber', 'bankName', 'bankAccountNumber', 'bankIfscSwift', 'paymentTerms', 'currency', 'notes',
  ];

  updatable.forEach(field => {
    if (data[field] !== undefined) {
      if (field === 'skills' && typeof data[field] === 'string') {
        vendor[field] = data[field].split(',').map(s => s.trim()).filter(Boolean);
      } else {
        vendor[field] = data[field];
      }
    }
  });

  await vendor.save();

  if (requestingUser) {
    await writeAuditLog({
      performedBy: requestingUser,
      action: AUDIT_ACTION.VENDOR_UPDATED,
      category: AUDIT_CATEGORY.VENDOR,
      entity: 'Vendor',
      entityId: vendor.id,
      entityName: vendor.name,
      description: `Updated profile details for ${vendor.name} (${vendor.vendorCode})`,
    });
  }

  return vendor;
}

/**
 * Soft delete vendor
 */
async function deleteVendor(id, requestingUser) {
  assertLevel(requestingUser, VENDOR_MANAGE_MAX_LEVEL, 'Only Managers, Admins, or Boss can delete vendors');

  const vendor = await db.Vendor.findOne({ where: { id, deletedAt: null } });
  if (!vendor) {
    const err = new Error('Vendor not found');
    err.statusCode = 404;
    throw err;
  }

  await vendor.destroy(); // Soft delete via paranoid: true

  // Also soft delete active rate cards
  await db.VendorRateCard.destroy({ where: { vendorId: id } });

  if (requestingUser) {
    await writeAuditLog({
      performedBy: requestingUser,
      action: AUDIT_ACTION.VENDOR_DELETED,
      category: AUDIT_CATEGORY.VENDOR,
      entity: 'Vendor',
      entityId: vendor.id,
      entityName: vendor.name,
      description: `Removed external partner ${vendor.name} (${vendor.vendorCode})`,
    });
  }

  return { message: 'Vendor profile and rate cards deleted successfully' };
}

/**
 * Get aggregate statistics for Vendor & External Workforce Hub
 */
async function getVendorStats() {
  const vendors = await db.Vendor.findAll({
    where: { deletedAt: null },
    attributes: ['id', 'type', 'status', 'rating', 'totalRatingsCount'],
  });

  const total = vendors.length;
  const byType = { FREELANCER: 0, VENDOR: 0, PARTNER_AGENCY: 0, COLLABORATOR: 0 };
  const byStatus = { ACTIVE: 0, ON_HOLD: 0, INACTIVE: 0, BLACKLISTED: 0 };
  let ratingSum = 0;
  let ratedCount = 0;

  vendors.forEach(v => {
    if (byType[v.type] !== undefined) byType[v.type]++;
    if (byStatus[v.status] !== undefined) byStatus[v.status]++;
    if (v.totalRatingsCount > 0) {
      ratingSum += parseFloat(v.rating || 0);
      ratedCount++;
    }
  });

  const averageReliability = ratedCount > 0 ? parseFloat((ratingSum / ratedCount).toFixed(1)) : 5.0;

  const [totalRateCards, totalPerformanceEvaluations] = await Promise.all([
    db.VendorRateCard.count({ where: { deletedAt: null, isActive: true } }),
    db.VendorPerformance.count({ where: { deletedAt: null } }),
  ]);

  return {
    total,
    byType,
    byStatus,
    averageReliability,
    totalRateCards,
    totalPerformanceEvaluations,
  };
}

// ── Rate Cards ───────────────────────────────────────────────────────────────

/**
 * Get rate cards with optional filters
 */
async function getRateCards({ vendorId, category, pricingModel, search } = {}) {
  const where = { deletedAt: null };
  if (vendorId) where.vendorId = vendorId;
  if (category) where.category = category;
  if (pricingModel) where.pricingModel = pricingModel;
  if (search && search.trim()) {
    where.serviceTitle = { [Op.like]: `%${search.trim()}%` };
  }

  return db.VendorRateCard.findAll({
    where,
    include: [
      { model: db.Vendor, as: 'vendor', attributes: ['id', 'name', 'vendorCode', 'type', 'status', 'rating'] },
      { model: db.User, as: 'creator', attributes: USER_ATTRS },
    ],
    order: [['created_at', 'DESC']],
  });
}

/**
 * Add a fixed rate / package pricing for a vendor
 */
async function createRateCard(vendorId, data, requestingUser) {
  assertLevel(requestingUser, VENDOR_MANAGE_MAX_LEVEL, 'Only Managers, Admins, or Boss can configure rate cards');

  const vendor = await db.Vendor.findOne({ where: { id: vendorId, deletedAt: null } });
  if (!vendor) {
    const err = new Error('Vendor not found');
    err.statusCode = 404;
    throw err;
  }

  const {
    serviceTitle,
    category,
    pricingModel = 'PER_UNIT',
    baseRate,
    currency = vendor.currency || 'INR',
    minTurnaroundTime,
    description,
    isActive = true,
  } = data;

  if (!serviceTitle || !baseRate) {
    const err = new Error('serviceTitle and baseRate are required for rate card');
    err.statusCode = 422;
    throw err;
  }

  const rateCard = await db.VendorRateCard.create({
    vendorId,
    serviceTitle: serviceTitle.trim(),
    category,
    pricingModel,
    baseRate: parseFloat(baseRate),
    currency,
    minTurnaroundTime,
    description,
    isActive,
    createdById: requestingUser ? requestingUser.id : null,
  });

  if (requestingUser) {
    await writeAuditLog({
      performedBy: requestingUser,
      action: AUDIT_ACTION.VENDOR_RATE_CARD_CREATED,
      category: AUDIT_CATEGORY.VENDOR,
      entity: 'VendorRateCard',
      entityId: rateCard.id,
      entityName: serviceTitle,
      description: `Added rate card "${serviceTitle}" (${currency} ${baseRate}) for ${vendor.name}`,
    });
  }

  return rateCard;
}

/**
 * Update rate card
 */
async function updateRateCard(rateCardId, data, requestingUser) {
  assertLevel(requestingUser, VENDOR_MANAGE_MAX_LEVEL, 'Only Managers, Admins, or Boss can edit rate cards');

  const rateCard = await db.VendorRateCard.findOne({ where: { id: rateCardId, deletedAt: null } });
  if (!rateCard) {
    const err = new Error('Rate card not found');
    err.statusCode = 404;
    throw err;
  }

  const updatable = ['serviceTitle', 'category', 'pricingModel', 'baseRate', 'currency', 'minTurnaroundTime', 'description', 'isActive'];
  updatable.forEach(f => {
    if (data[f] !== undefined) rateCard[f] = data[f];
  });

  await rateCard.save();

  if (requestingUser) {
    await writeAuditLog({
      performedBy: requestingUser,
      action: AUDIT_ACTION.VENDOR_RATE_CARD_UPDATED,
      category: AUDIT_CATEGORY.VENDOR,
      entity: 'VendorRateCard',
      entityId: rateCard.id,
      entityName: rateCard.serviceTitle,
      description: `Updated rate card "${rateCard.serviceTitle}"`,
    });
  }

  return rateCard;
}

/**
 * Soft delete rate card
 */
async function deleteRateCard(rateCardId, requestingUser) {
  assertLevel(requestingUser, VENDOR_MANAGE_MAX_LEVEL, 'Only Managers, Admins, or Boss can delete rate cards');

  const rateCard = await db.VendorRateCard.findOne({ where: { id: rateCardId, deletedAt: null } });
  if (!rateCard) {
    const err = new Error('Rate card not found');
    err.statusCode = 404;
    throw err;
  }

  await rateCard.destroy();

  if (requestingUser) {
    await writeAuditLog({
      performedBy: requestingUser,
      action: AUDIT_ACTION.VENDOR_RATE_CARD_DELETED,
      category: AUDIT_CATEGORY.VENDOR,
      entity: 'VendorRateCard',
      entityId: rateCard.id,
      entityName: rateCard.serviceTitle,
      description: `Removed rate card "${rateCard.serviceTitle}"`,
    });
  }

  return { message: 'Rate card deleted successfully' };
}

// ── Performance Records & Reliability Tracker ────────────────────────────────

/**
 * Get performance evaluation history
 */
async function getPerformanceRecords({ vendorId, deliveryTimeline, costAdherence } = {}) {
  const where = { deletedAt: null };
  if (vendorId) where.vendorId = vendorId;
  if (deliveryTimeline) where.deliveryTimeline = deliveryTimeline;
  if (costAdherence) where.costAdherence = costAdherence;

  return db.VendorPerformance.findAll({
    where,
    include: [
      { model: db.Vendor, as: 'vendor', attributes: ['id', 'name', 'vendorCode', 'type'] },
      { model: db.User, as: 'reviewer', attributes: USER_ATTRS },
      { model: db.Task, as: 'task', attributes: ['id', 'title', 'status', 'priority'] },
      { model: db.Docket, as: 'docket', attributes: ['id', 'title'] },
    ],
    order: [['created_at', 'DESC']],
  });
}

/**
 * Record a performance and delivery quality evaluation for a vendor
 */
async function createPerformanceRecord(vendorId, data, requestingUser) {
  assertLevel(requestingUser, VENDOR_MANAGE_MAX_LEVEL, 'Only Managers, Admins, or Boss can record vendor evaluations');

  const vendor = await db.Vendor.findOne({ where: { id: vendorId, deletedAt: null } });
  if (!vendor) {
    const err = new Error('Vendor not found');
    err.statusCode = 404;
    throw err;
  }

  const {
    projectName,
    taskId,
    docketId,
    reviewTitle,
    deliveryTimeline = 'ON_TIME',
    qualityRating = 5,
    timelinessRating = 5,
    communicationRating = 5,
    costRating = 5,
    plannedDays,
    actualDays,
    costAdherence = 'WITHIN_BUDGET',
    billedAmount,
    feedback,
  } = data;

  if (!reviewTitle || !reviewTitle.trim()) {
    const err = new Error('Review title is required');
    err.statusCode = 422;
    throw err;
  }

  const q = Math.max(1, Math.min(5, parseInt(qualityRating) || 5));
  const t = Math.max(1, Math.min(5, parseInt(timelinessRating) || 5));
  const c = Math.max(1, Math.min(5, parseInt(communicationRating) || 5));
  const k = Math.max(1, Math.min(5, parseInt(costRating) || 5));
  const overallScore = parseFloat(((q + t + c + k) / 4).toFixed(1));

  const performanceRecord = await db.VendorPerformance.create({
    vendorId,
    projectName,
    taskId: taskId || null,
    docketId: docketId || null,
    reviewTitle: reviewTitle.trim(),
    deliveryTimeline,
    qualityRating: q,
    timelinessRating: t,
    communicationRating: c,
    costRating: k,
    overallScore,
    plannedDays: plannedDays ? parseInt(plannedDays) : null,
    actualDays: actualDays ? parseInt(actualDays) : null,
    costAdherence,
    billedAmount: billedAmount ? parseFloat(billedAmount) : null,
    feedback,
    reviewedById: requestingUser ? requestingUser.id : null,
  });

  // Re-calculate aggregate rating for the vendor
  const allReviews = await db.VendorPerformance.findAll({
    where: { vendorId, deletedAt: null },
    attributes: ['overallScore'],
  });

  const avg = allReviews.reduce((sum, r) => sum + parseFloat(r.overallScore || 0), 0) / (allReviews.length || 1);
  vendor.rating = parseFloat(avg.toFixed(1));
  vendor.totalRatingsCount = allReviews.length;
  await vendor.save();

  if (requestingUser) {
    await writeAuditLog({
      performedBy: requestingUser,
      action: AUDIT_ACTION.VENDOR_PERFORMANCE_RECORDED,
      category: AUDIT_CATEGORY.VENDOR,
      entity: 'VendorPerformance',
      entityId: performanceRecord.id,
      entityName: reviewTitle,
      description: `Evaluated ${vendor.name} for "${reviewTitle}" — Overall Score: ${overallScore}/5.0`,
    });
  }

  return performanceRecord;
}

/**
 * Delete a performance record and re-calculate vendor rating
 */
async function deletePerformanceRecord(recordId, requestingUser) {
  assertLevel(requestingUser, VENDOR_MANAGE_MAX_LEVEL, 'Only Managers, Admins, or Boss can delete vendor evaluations');

  const record = await db.VendorPerformance.findOne({ where: { id: recordId, deletedAt: null } });
  if (!record) {
    const err = new Error('Performance record not found');
    err.statusCode = 404;
    throw err;
  }

  const vendorId = record.vendorId;
  await record.destroy();

  // Re-calculate vendor score
  const remainingReviews = await db.VendorPerformance.findAll({
    where: { vendorId, deletedAt: null },
    attributes: ['overallScore'],
  });

  const vendor = await db.Vendor.findByPk(vendorId);
  if (vendor) {
    if (remainingReviews.length > 0) {
      const avg = remainingReviews.reduce((sum, r) => sum + parseFloat(r.overallScore || 0), 0) / remainingReviews.length;
      vendor.rating = parseFloat(avg.toFixed(1));
      vendor.totalRatingsCount = remainingReviews.length;
    } else {
      vendor.rating = 5.0;
      vendor.totalRatingsCount = 0;
    }
    await vendor.save();
  }

  if (requestingUser) {
    await writeAuditLog({
      performedBy: requestingUser,
      action: AUDIT_ACTION.VENDOR_PERFORMANCE_DELETED,
      category: AUDIT_CATEGORY.VENDOR,
      entity: 'VendorPerformance',
      entityId: record.id,
      entityName: record.reviewTitle,
      description: `Removed evaluation record "${record.reviewTitle}"`,
    });
  }

  return { message: 'Performance record deleted successfully' };
}

module.exports = {
  getVendors,
  getVendorById,
  createVendor,
  updateVendor,
  deleteVendor,
  getVendorStats,
  getRateCards,
  createRateCard,
  updateRateCard,
  deleteRateCard,
  getPerformanceRecords,
  createPerformanceRecord,
  deletePerformanceRecord,
};
