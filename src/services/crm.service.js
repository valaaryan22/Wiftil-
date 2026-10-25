'use strict';

const { Op } = require('sequelize');
const { db } = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const { AUDIT_CATEGORY, AUDIT_ACTION, CRM_MANAGE_MAX_LEVEL } = require('../constants');

const USER_ATTRS = ['id', 'firstName', 'lastName', 'email', 'department'];

function assertLevel(user, maxLevel, msg) {
  if (user && user.roleLevel > maxLevel) {
    const err = new Error(msg || `Access level ≤ ${maxLevel} required`);
    err.statusCode = 403;
    throw err;
  }
}

// ── Code Generators ──────────────────────────────────────────────────────────

async function generateLeadCode() {
  const year = new Date().getFullYear();
  const count = await db.Lead.count({ paranoid: false });
  const seq = String(count + 1).padStart(4, '0');
  return `LED-${year}-${seq}`;
}

async function generateDealCode() {
  const year = new Date().getFullYear();
  const count = await db.Deal.count({ paranoid: false });
  const seq = String(count + 1).padStart(4, '0');
  return `DEL-${year}-${seq}`;
}

async function generateContractNumber(type = 'CTR') {
  const prefixMap = {
    PROPOSAL: 'PROP',
    AGREEMENT: 'AGR',
    NDA: 'NDA',
    SOW: 'SOW',
    SERVICE_CONTRACT: 'CTR',
    RETAINER: 'RET',
  };
  const prefix = prefixMap[type] || 'CTR';
  const year = new Date().getFullYear();
  const count = await db.DealContract.count({ paranoid: false });
  const seq = String(count + 1).padStart(4, '0');
  return `${prefix}-${year}-${seq}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. LEADS MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

async function getLeads({
  page = 1,
  limit = 20,
  search = '',
  status,
  source,
  priority,
  assignedToId,
  sortBy = 'created_at',
  sortOrder = 'DESC',
} = {}) {
  const offset = (Math.max(1, parseInt(page)) - 1) * Math.max(1, parseInt(limit));
  const where = {};

  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    where[Op.or] = [
      { title: { [Op.like]: q } },
      { contactName: { [Op.like]: q } },
      { companyName: { [Op.like]: q } },
      { email: { [Op.like]: q } },
      { phone: { [Op.like]: q } },
      { leadCode: { [Op.like]: q } },
    ];
  }

  if (status && status !== 'ALL') where.status = status;
  if (source && source !== 'ALL') where.source = source;
  if (priority && priority !== 'ALL') where.priority = priority;
  if (assignedToId) where.assignedToId = assignedToId;

  const validSortCols = ['created_at', 'updated_at', 'estimated_value', 'title', 'contact_name', 'priority', 'status'];
  const col = validSortCols.includes(sortBy) ? sortBy : 'created_at';
  const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const { count, rows } = await db.Lead.findAndCountAll({
    where,
    limit: Math.max(1, parseInt(limit)),
    offset,
    order: [[col, order]],
    include: [
      { model: db.User, as: 'assignedTo', attributes: USER_ATTRS },
      { model: db.User, as: 'creator', attributes: USER_ATTRS },
      { model: db.Client, as: 'convertedClient', attributes: ['id', 'name', 'clientCode'] },
    ],
  });

  return {
    leads: rows,
    total: count,
    meta: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / Math.max(1, parseInt(limit))),
    },
  };
}

async function getLeadById(id) {
  const lead = await db.Lead.findByPk(id, {
    include: [
      { model: db.User, as: 'assignedTo', attributes: USER_ATTRS },
      { model: db.User, as: 'creator', attributes: USER_ATTRS },
      { model: db.Client, as: 'convertedClient', attributes: ['id', 'name', 'clientCode', 'email', 'phone'] },
      {
        model: db.CrmActivity,
        as: 'activities',
        include: [{ model: db.User, as: 'assignedTo', attributes: USER_ATTRS }],
        order: [['scheduledAt', 'ASC']],
      },
      {
        model: db.DealContract,
        as: 'contracts',
        order: [['createdAt', 'DESC']],
      },
    ],
  });

  if (!lead) {
    const err = new Error('Lead not found');
    err.statusCode = 404;
    throw err;
  }
  return lead;
}

async function createLead(data, requestingUser) {
  assertLevel(requestingUser, CRM_MANAGE_MAX_LEVEL, 'You do not have permission to create leads');

  const leadCode = await generateLeadCode();

  const lead = await db.Lead.create({
    leadCode,
    title: data.title,
    contactName: data.contactName,
    companyName: data.companyName || null,
    email: data.email || null,
    phone: data.phone || null,
    source: data.source || 'WEBSITE',
    status: data.status || 'NEW',
    priority: data.priority || 'MEDIUM',
    estimatedValue: data.estimatedValue ? parseFloat(data.estimatedValue) : 0,
    currency: data.currency || 'INR',
    assignedToId: data.assignedToId || requestingUser?.id || null,
    notes: data.notes || null,
    tags: Array.isArray(data.tags) ? data.tags : [],
    createdById: requestingUser?.id || null,
  });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.CRM_LEAD_CREATED,
    category: AUDIT_CATEGORY.CRM,
    targetId: lead.id,
    targetType: 'Lead',
    description: `Created new lead "${lead.title}" (${lead.leadCode})`,
    newValues: lead.toJSON(),
  });

  return getLeadById(lead.id);
}

async function updateLead(id, data, requestingUser) {
  assertLevel(requestingUser, CRM_MANAGE_MAX_LEVEL, 'You do not have permission to update leads');

  const lead = await db.Lead.findByPk(id);
  if (!lead) {
    const err = new Error('Lead not found');
    err.statusCode = 404;
    throw err;
  }

  const oldValues = lead.toJSON();

  const allowedFields = [
    'title', 'contactName', 'companyName', 'email', 'phone',
    'source', 'status', 'priority', 'estimatedValue', 'currency',
    'assignedToId', 'notes', 'tags', 'lostReason',
  ];

  allowedFields.forEach(f => {
    if (data[f] !== undefined) {
      if (f === 'estimatedValue') {
        lead[f] = data[f] ? parseFloat(data[f]) : 0;
      } else {
        lead[f] = data[f];
      }
    }
  });

  await lead.save();

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.CRM_LEAD_UPDATED,
    category: AUDIT_CATEGORY.CRM,
    targetId: lead.id,
    targetType: 'Lead',
    description: `Updated lead "${lead.title}" (${lead.leadCode})`,
    oldValues,
    newValues: lead.toJSON(),
  });

  return getLeadById(lead.id);
}

async function deleteLead(id, requestingUser) {
  assertLevel(requestingUser, CRM_MANAGE_MAX_LEVEL, 'You do not have permission to delete leads');

  const lead = await db.Lead.findByPk(id);
  if (!lead) {
    const err = new Error('Lead not found');
    err.statusCode = 404;
    throw err;
  }

  await lead.destroy();

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.CRM_LEAD_DELETED,
    category: AUDIT_CATEGORY.CRM,
    targetId: lead.id,
    targetType: 'Lead',
    description: `Deleted lead "${lead.title}" (${lead.leadCode})`,
    oldValues: lead.toJSON(),
  });

  return { success: true, message: 'Lead deleted successfully' };
}

/**
 * Convert Lead to Deal (and optionally create official Client)
 */
async function convertLeadToDeal(leadId, { dealName, dealValue, expectedCloseDate, createClient = false }, requestingUser) {
  assertLevel(requestingUser, CRM_MANAGE_MAX_LEVEL, 'You do not have permission to convert leads');

  const lead = await db.Lead.findByPk(leadId);
  if (!lead) {
    const err = new Error('Lead not found');
    err.statusCode = 404;
    throw err;
  }

  let client = null;

  // Optionally create a client record or link to existing
  if (createClient && (lead.companyName || lead.contactName)) {
    const existingClient = lead.email
      ? await db.Client.findOne({ where: { email: lead.email, deletedAt: null } })
      : null;

    if (existingClient) {
      client = existingClient;
    } else {
      const clientName = lead.companyName || lead.contactName;
      const clientCode = `CLT-${new Date().getFullYear()}-${String(await db.Client.count() + 1).padStart(3, '0')}`;
      client = await db.Client.create({
        name: clientName,
        clientCode,
        primaryContactName: lead.contactName,
        phone: lead.phone,
        email: lead.email,
        accountOwnerId: lead.assignedToId || requestingUser?.id,
        createdById: requestingUser?.id,
      });
    }
  }

  const dealCode = await generateDealCode();

  const deal = await db.Deal.create({
    dealCode,
    dealName: dealName || `${lead.title} Deal`,
    leadId: lead.id,
    clientId: client ? client.id : null,
    companyName: lead.companyName || (client ? client.name : null),
    contactName: lead.contactName,
    contactEmail: lead.email,
    contactPhone: lead.phone,
    stage: 'PROPOSAL_SHARED',
    probability: 40,
    dealValue: dealValue !== undefined ? parseFloat(dealValue) : parseFloat(lead.estimatedValue || 0),
    currency: lead.currency || 'INR',
    pipeline: 'Standard Sales Pipeline',
    expectedCloseDate: expectedCloseDate || null,
    ownerId: lead.assignedToId || requestingUser?.id,
    notes: lead.notes,
    createdById: requestingUser?.id,
  });

  // Update lead status
  lead.status = 'CONVERTED';
  lead.convertedDealId = deal.id;
  lead.convertedClientId = client ? client.id : null;
  lead.convertedAt = new Date();
  await lead.save();

  // Link lead's activities to the new deal
  await db.CrmActivity.update(
    { dealId: deal.id, clientId: client ? client.id : null },
    { where: { leadId: lead.id } }
  );

  // Link lead's contracts to the new deal
  await db.DealContract.update(
    { dealId: deal.id, clientId: client ? client.id : null },
    { where: { leadId: lead.id } }
  );

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.CRM_LEAD_CONVERTED,
    category: AUDIT_CATEGORY.CRM,
    targetId: lead.id,
    targetType: 'Lead',
    description: `Converted lead "${lead.title}" to deal "${deal.dealName}" (${deal.dealCode})${client ? ` and created client "${client.name}"` : ''}`,
    newValues: { dealId: deal.id, clientId: client ? client.id : null },
  });

  return {
    lead: await getLeadById(lead.id),
    deal: await getDealById(deal.id),
    client,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. DEALS MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

async function getDeals({
  page = 1,
  limit = 20,
  search = '',
  stage,
  ownerId,
  clientId,
  sortBy = 'created_at',
  sortOrder = 'DESC',
} = {}) {
  const offset = (Math.max(1, parseInt(page)) - 1) * Math.max(1, parseInt(limit));
  const where = {};

  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    where[Op.or] = [
      { dealName: { [Op.like]: q } },
      { dealCode: { [Op.like]: q } },
      { companyName: { [Op.like]: q } },
      { contactName: { [Op.like]: q } },
      { contactEmail: { [Op.like]: q } },
    ];
  }

  if (stage && stage !== 'ALL') where.stage = stage;
  if (ownerId) where.ownerId = ownerId;
  if (clientId) where.clientId = clientId;

  const validSortCols = ['created_at', 'updated_at', 'deal_value', 'deal_name', 'stage', 'probability', 'expected_close_date'];
  const col = validSortCols.includes(sortBy) ? sortBy : 'created_at';
  const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const { count, rows } = await db.Deal.findAndCountAll({
    where,
    limit: Math.max(1, parseInt(limit)),
    offset,
    order: [[col, order]],
    include: [
      { model: db.User, as: 'owner', attributes: USER_ATTRS },
      { model: db.Client, as: 'client', attributes: ['id', 'name', 'clientCode'] },
      { model: db.Lead, as: 'lead', attributes: ['id', 'title', 'leadCode', 'source'] },
      { model: db.DealContract, as: 'contracts', attributes: ['id', 'contractNumber', 'title', 'status', 'contractValue'] },
      { model: db.CrmActivity, as: 'activities', attributes: ['id', 'title', 'type', 'status', 'scheduledAt'] },
    ],
  });

  return {
    deals: rows,
    total: count,
    meta: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / Math.max(1, parseInt(limit))),
    },
  };
}

async function getDealById(id) {
  const deal = await db.Deal.findByPk(id, {
    include: [
      { model: db.User, as: 'owner', attributes: USER_ATTRS },
      { model: db.User, as: 'creator', attributes: USER_ATTRS },
      { model: db.Client, as: 'client', attributes: ['id', 'name', 'clientCode', 'email', 'phone'] },
      { model: db.Lead, as: 'lead', attributes: ['id', 'title', 'leadCode', 'source', 'status'] },
      {
        model: db.CrmActivity,
        as: 'activities',
        include: [{ model: db.User, as: 'assignedTo', attributes: USER_ATTRS }],
        order: [['scheduledAt', 'ASC']],
      },
      {
        model: db.DealContract,
        as: 'contracts',
        include: [{ model: db.User, as: 'creator', attributes: USER_ATTRS }],
        order: [['createdAt', 'DESC']],
      },
    ],
  });

  if (!deal) {
    const err = new Error('Deal not found');
    err.statusCode = 404;
    throw err;
  }
  return deal;
}

async function createDeal(data, requestingUser) {
  assertLevel(requestingUser, CRM_MANAGE_MAX_LEVEL, 'You do not have permission to create deals');

  const dealCode = await generateDealCode();

  const probabilityMap = {
    DISCOVERY: 20,
    PROPOSAL_SHARED: 40,
    NEGOTIATION: 60,
    CONTRACT_SENT: 80,
    WON: 100,
    LOST: 0,
  };

  const stage = data.stage || 'DISCOVERY';
  const probability = data.probability !== undefined ? parseInt(data.probability) : (probabilityMap[stage] || 20);

  const deal = await db.Deal.create({
    dealCode,
    dealName: data.dealName,
    leadId: data.leadId || null,
    clientId: data.clientId || null,
    companyName: data.companyName || null,
    contactName: data.contactName || null,
    contactEmail: data.contactEmail || null,
    contactPhone: data.contactPhone || null,
    stage,
    probability,
    dealValue: data.dealValue ? parseFloat(data.dealValue) : 0,
    currency: data.currency || 'INR',
    pipeline: data.pipeline || 'Standard Sales Pipeline',
    expectedCloseDate: data.expectedCloseDate || null,
    actualCloseDate: stage === 'WON' ? new Date() : null,
    ownerId: data.ownerId || requestingUser?.id || null,
    notes: data.notes || null,
    createdById: requestingUser?.id || null,
  });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.CRM_DEAL_CREATED,
    category: AUDIT_CATEGORY.CRM,
    targetId: deal.id,
    targetType: 'Deal',
    description: `Created new deal "${deal.dealName}" (${deal.dealCode}) for ${deal.currency} ${deal.dealValue}`,
    newValues: deal.toJSON(),
  });

  return getDealById(deal.id);
}

async function updateDeal(id, data, requestingUser) {
  assertLevel(requestingUser, CRM_MANAGE_MAX_LEVEL, 'You do not have permission to update deals');

  const deal = await db.Deal.findByPk(id);
  if (!deal) {
    const err = new Error('Deal not found');
    err.statusCode = 404;
    throw err;
  }

  const oldValues = deal.toJSON();
  const stageChanged = data.stage && data.stage !== deal.stage;

  const allowedFields = [
    'dealName', 'companyName', 'contactName', 'contactEmail', 'contactPhone',
    'clientId', 'stage', 'probability', 'dealValue', 'currency', 'pipeline',
    'expectedCloseDate', 'actualCloseDate', 'ownerId', 'notes', 'lostReason',
  ];

  allowedFields.forEach(f => {
    if (data[f] !== undefined) {
      if (f === 'dealValue') {
        deal[f] = data[f] ? parseFloat(data[f]) : 0;
      } else if (f === 'probability') {
        deal[f] = parseInt(data[f]);
      } else {
        deal[f] = data[f];
      }
    }
  });

  if (stageChanged) {
    if (deal.stage === 'WON') {
      deal.probability = 100;
      if (!deal.actualCloseDate) deal.actualCloseDate = new Date();
    } else if (deal.stage === 'LOST') {
      deal.probability = 0;
      if (!deal.actualCloseDate) deal.actualCloseDate = new Date();
    }
  }

  await deal.save();

  await writeAuditLog({
    performedBy: requestingUser,
    action: stageChanged ? AUDIT_ACTION.CRM_DEAL_STAGE_CHANGED : AUDIT_ACTION.CRM_DEAL_UPDATED,
    category: AUDIT_CATEGORY.CRM,
    targetId: deal.id,
    targetType: 'Deal',
    description: stageChanged
      ? `Deal "${deal.dealName}" moved to stage "${deal.stage}"`
      : `Updated deal "${deal.dealName}" (${deal.dealCode})`,
    oldValues,
    newValues: deal.toJSON(),
  });

  return getDealById(deal.id);
}

async function deleteDeal(id, requestingUser) {
  assertLevel(requestingUser, CRM_MANAGE_MAX_LEVEL, 'You do not have permission to delete deals');

  const deal = await db.Deal.findByPk(id);
  if (!deal) {
    const err = new Error('Deal not found');
    err.statusCode = 404;
    throw err;
  }

  await deal.destroy();

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.CRM_DEAL_DELETED,
    category: AUDIT_CATEGORY.CRM,
    targetId: deal.id,
    targetType: 'Deal',
    description: `Deleted deal "${deal.dealName}" (${deal.dealCode})`,
    oldValues: deal.toJSON(),
  });

  return { success: true, message: 'Deal deleted successfully' };
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. FOLLOW-UPS / MEETINGS / ACTIVITIES
// ══════════════════════════════════════════════════════════════════════════════

async function getActivities({
  page = 1,
  limit = 20,
  type,
  status,
  leadId,
  dealId,
  clientId,
  assignedToId,
  fromDate,
  toDate,
  sortBy = 'scheduled_at',
  sortOrder = 'ASC',
} = {}) {
  const offset = (Math.max(1, parseInt(page)) - 1) * Math.max(1, parseInt(limit));
  const where = {};

  if (type && type !== 'ALL') where.type = type;
  if (status && status !== 'ALL') where.status = status;
  if (leadId) where.leadId = leadId;
  if (dealId) where.dealId = dealId;
  if (clientId) where.clientId = clientId;
  if (assignedToId) where.assignedToId = assignedToId;

  if (fromDate || toDate) {
    where.scheduledAt = {};
    if (fromDate) where.scheduledAt[Op.gte] = new Date(fromDate);
    if (toDate) where.scheduledAt[Op.lte] = new Date(toDate);
  }

  const validSortCols = ['scheduled_at', 'created_at', 'status', 'type', 'priority'];
  const col = validSortCols.includes(sortBy) ? sortBy : 'scheduled_at';
  const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const { count, rows } = await db.CrmActivity.findAndCountAll({
    where,
    limit: Math.max(1, parseInt(limit)),
    offset,
    order: [[col, order]],
    include: [
      { model: db.User, as: 'assignedTo', attributes: USER_ATTRS },
      { model: db.User, as: 'creator', attributes: USER_ATTRS },
      { model: db.Lead, as: 'lead', attributes: ['id', 'title', 'leadCode', 'contactName', 'phone', 'email'] },
      { model: db.Deal, as: 'deal', attributes: ['id', 'dealName', 'dealCode', 'stage', 'dealValue'] },
      { model: db.Client, as: 'client', attributes: ['id', 'name', 'clientCode'] },
    ],
  });

  return {
    activities: rows,
    total: count,
    meta: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / Math.max(1, parseInt(limit))),
    },
  };
}

async function getActivityById(id) {
  const act = await db.CrmActivity.findByPk(id, {
    include: [
      { model: db.User, as: 'assignedTo', attributes: USER_ATTRS },
      { model: db.User, as: 'creator', attributes: USER_ATTRS },
      { model: db.Lead, as: 'lead', attributes: ['id', 'title', 'leadCode', 'contactName', 'phone', 'email'] },
      { model: db.Deal, as: 'deal', attributes: ['id', 'dealName', 'dealCode', 'stage', 'dealValue'] },
      { model: db.Client, as: 'client', attributes: ['id', 'name', 'clientCode'] },
    ],
  });
  if (!act) {
    const err = new Error('Activity not found');
    err.statusCode = 404;
    throw err;
  }
  return act;
}

async function createActivity(data, requestingUser) {
  const activity = await db.CrmActivity.create({
    type: data.type || 'FOLLOW_UP',
    title: data.title,
    description: data.description || null,
    scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : new Date(),
    durationMinutes: data.durationMinutes ? parseInt(data.durationMinutes) : 30,
    status: data.status || 'SCHEDULED',
    priority: data.priority || 'MEDIUM',
    leadId: data.leadId || null,
    dealId: data.dealId || null,
    clientId: data.clientId || null,
    assignedToId: data.assignedToId || requestingUser?.id || null,
    outcomeNotes: data.outcomeNotes || null,
    nextFollowUpDate: data.nextFollowUpDate ? new Date(data.nextFollowUpDate) : null,
    meetingLink: data.meetingLink || null,
    createdById: requestingUser?.id || null,
  });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.CRM_ACTIVITY_CREATED,
    category: AUDIT_CATEGORY.CRM,
    targetId: activity.id,
    targetType: 'CrmActivity',
    description: `Scheduled ${activity.type}: "${activity.title}" on ${activity.scheduledAt}`,
    newValues: activity.toJSON(),
  });

  return getActivityById(activity.id);
}

async function updateActivity(id, data, requestingUser) {
  const activity = await db.CrmActivity.findByPk(id);
  if (!activity) {
    const err = new Error('Activity not found');
    err.statusCode = 404;
    throw err;
  }

  const oldValues = activity.toJSON();
  const markingCompleted = data.status === 'COMPLETED' && activity.status !== 'COMPLETED';

  const allowedFields = [
    'type', 'title', 'description', 'scheduledAt', 'durationMinutes',
    'status', 'priority', 'leadId', 'dealId', 'clientId', 'assignedToId',
    'outcomeNotes', 'nextFollowUpDate', 'meetingLink',
  ];

  allowedFields.forEach(f => {
    if (data[f] !== undefined) {
      if (f === 'scheduledAt' || f === 'nextFollowUpDate') {
        activity[f] = data[f] ? new Date(data[f]) : null;
      } else if (f === 'durationMinutes') {
        activity[f] = parseInt(data[f]);
      } else {
        activity[f] = data[f];
      }
    }
  });

  await activity.save();

  await writeAuditLog({
    performedBy: requestingUser,
    action: markingCompleted ? AUDIT_ACTION.CRM_ACTIVITY_COMPLETED : AUDIT_ACTION.CRM_ACTIVITY_UPDATED,
    category: AUDIT_CATEGORY.CRM,
    targetId: activity.id,
    targetType: 'CrmActivity',
    description: markingCompleted
      ? `Completed ${activity.type}: "${activity.title}"`
      : `Updated ${activity.type}: "${activity.title}"`,
    oldValues,
    newValues: activity.toJSON(),
  });

  return getActivityById(activity.id);
}

async function deleteActivity(id, requestingUser) {
  const activity = await db.CrmActivity.findByPk(id);
  if (!activity) {
    const err = new Error('Activity not found');
    err.statusCode = 404;
    throw err;
  }

  await activity.destroy();

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.CRM_ACTIVITY_DELETED,
    category: AUDIT_CATEGORY.CRM,
    targetId: activity.id,
    targetType: 'CrmActivity',
    description: `Deleted activity "${activity.title}"`,
    oldValues: activity.toJSON(),
  });

  return { success: true, message: 'Activity deleted successfully' };
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. CONTRACTS & PROPOSALS
// ══════════════════════════════════════════════════════════════════════════════

async function getContracts({
  page = 1,
  limit = 20,
  dealId,
  leadId,
  clientId,
  type,
  status,
  sortBy = 'created_at',
  sortOrder = 'DESC',
} = {}) {
  const offset = (Math.max(1, parseInt(page)) - 1) * Math.max(1, parseInt(limit));
  const where = {};

  if (dealId) where.dealId = dealId;
  if (leadId) where.leadId = leadId;
  if (clientId) where.clientId = clientId;
  if (type && type !== 'ALL') where.type = type;
  if (status && status !== 'ALL') where.status = status;

  const validSortCols = ['created_at', 'contract_number', 'contract_value', 'valid_until', 'status', 'title'];
  const col = validSortCols.includes(sortBy) ? sortBy : 'created_at';
  const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const { count, rows } = await db.DealContract.findAndCountAll({
    where,
    limit: Math.max(1, parseInt(limit)),
    offset,
    order: [[col, order]],
    include: [
      { model: db.Deal, as: 'deal', attributes: ['id', 'dealName', 'dealCode', 'stage'] },
      { model: db.Lead, as: 'lead', attributes: ['id', 'title', 'leadCode', 'contactName'] },
      { model: db.Client, as: 'client', attributes: ['id', 'name', 'clientCode'] },
      { model: db.User, as: 'creator', attributes: USER_ATTRS },
    ],
  });

  return {
    contracts: rows,
    total: count,
    meta: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / Math.max(1, parseInt(limit))),
    },
  };
}

async function getContractById(id) {
  const ctr = await db.DealContract.findByPk(id, {
    include: [
      { model: db.Deal, as: 'deal', attributes: ['id', 'dealName', 'dealCode', 'stage'] },
      { model: db.Lead, as: 'lead', attributes: ['id', 'title', 'leadCode', 'contactName'] },
      { model: db.Client, as: 'client', attributes: ['id', 'name', 'clientCode'] },
      { model: db.User, as: 'creator', attributes: USER_ATTRS },
    ],
  });
  if (!ctr) {
    const err = new Error('Contract not found');
    err.statusCode = 404;
    throw err;
  }
  return ctr;
}

async function createContract(data, requestingUser) {
  assertLevel(requestingUser, CRM_MANAGE_MAX_LEVEL, 'You do not have permission to create contracts');

  const contractNumber = data.contractNumber && data.contractNumber.trim()
    ? data.contractNumber.trim()
    : await generateContractNumber(data.type || 'PROPOSAL');

  const contract = await db.DealContract.create({
    contractNumber,
    title: data.title,
    type: data.type || 'PROPOSAL',
    status: data.status || 'DRAFT',
    dealId: data.dealId || null,
    leadId: data.leadId || null,
    clientId: data.clientId || null,
    contractValue: data.contractValue ? parseFloat(data.contractValue) : 0,
    currency: data.currency || 'INR',
    validUntil: data.validUntil || null,
    startDate: data.startDate || null,
    endDate: data.endDate || null,
    fileUrl: data.fileUrl || null,
    fileName: data.fileName || null,
    termsAndConditions: data.termsAndConditions || null,
    scopeOfWork: data.scopeOfWork || null,
    createdById: requestingUser?.id || null,
  });

  // If contract is linked to a deal, optionally progress stage to CONTRACT_SENT or PROPOSAL_SHARED
  if (contract.dealId) {
    if (contract.type === 'PROPOSAL') {
      await db.Deal.update({ stage: 'PROPOSAL_SHARED', probability: 40 }, { where: { id: contract.dealId, stage: 'DISCOVERY' } });
    } else if (contract.type === 'AGREEMENT' || contract.type === 'SERVICE_CONTRACT') {
      await db.Deal.update({ stage: 'CONTRACT_SENT', probability: 80 }, { where: { id: contract.dealId } });
    }
  }

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.CRM_CONTRACT_CREATED,
    category: AUDIT_CATEGORY.CRM,
    targetId: contract.id,
    targetType: 'DealContract',
    description: `Created ${contract.type}: "${contract.title}" (${contract.contractNumber})`,
    newValues: contract.toJSON(),
  });

  return getContractById(contract.id);
}

async function updateContract(id, data, requestingUser) {
  assertLevel(requestingUser, CRM_MANAGE_MAX_LEVEL, 'You do not have permission to update contracts');

  const contract = await db.DealContract.findByPk(id);
  if (!contract) {
    const err = new Error('Contract not found');
    err.statusCode = 404;
    throw err;
  }

  const oldValues = contract.toJSON();

  const allowedFields = [
    'title', 'type', 'status', 'dealId', 'leadId', 'clientId',
    'contractValue', 'currency', 'validUntil', 'startDate', 'endDate',
    'fileUrl', 'fileName', 'termsAndConditions', 'scopeOfWork',
  ];

  allowedFields.forEach(f => {
    if (data[f] !== undefined) {
      if (f === 'contractValue') {
        contract[f] = data[f] ? parseFloat(data[f]) : 0;
      } else {
        contract[f] = data[f];
      }
    }
  });

  await contract.save();

  // If status became SIGNED or ACCEPTED, update linked Deal to WON!
  if ((data.status === 'SIGNED' || data.status === 'ACCEPTED') && contract.dealId) {
    await db.Deal.update(
      { stage: 'WON', probability: 100, actualCloseDate: new Date() },
      { where: { id: contract.dealId } }
    );
  }

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.CRM_CONTRACT_UPDATED,
    category: AUDIT_CATEGORY.CRM,
    targetId: contract.id,
    targetType: 'DealContract',
    description: `Updated contract "${contract.title}" (${contract.contractNumber}) status: ${contract.status}`,
    oldValues,
    newValues: contract.toJSON(),
  });

  return getContractById(contract.id);
}

async function deleteContract(id, requestingUser) {
  assertLevel(requestingUser, CRM_MANAGE_MAX_LEVEL, 'You do not have permission to delete contracts');

  const contract = await db.DealContract.findByPk(id);
  if (!contract) {
    const err = new Error('Contract not found');
    err.statusCode = 404;
    throw err;
  }

  await contract.destroy();

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.CRM_CONTRACT_DELETED,
    category: AUDIT_CATEGORY.CRM,
    targetId: contract.id,
    targetType: 'DealContract',
    description: `Deleted contract "${contract.title}" (${contract.contractNumber})`,
    oldValues: contract.toJSON(),
  });

  return { success: true, message: 'Contract deleted successfully' };
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. CRM METRICS & ANALYTICS
// ══════════════════════════════════════════════════════════════════════════════

async function getCrmMetrics() {
  const [
    totalLeads,
    convertedLeads,
    newLeads,
    activeDeals,
    wonDeals,
    lostDeals,
    dealsPipelineSum,
    wonDealsSum,
    pendingFollowUps,
    todayMeetings,
    totalContracts,
    signedContracts,
  ] = await Promise.all([
    db.Lead.count(),
    db.Lead.count({ where: { status: 'CONVERTED' } }),
    db.Lead.count({ where: { status: 'NEW' } }),
    db.Deal.count({ where: { stage: { [Op.notIn]: ['WON', 'LOST'] } } }),
    db.Deal.count({ where: { stage: 'WON' } }),
    db.Deal.count({ where: { stage: 'LOST' } }),
    db.Deal.sum('dealValue', { where: { stage: { [Op.notIn]: ['WON', 'LOST'] } } }),
    db.Deal.sum('dealValue', { where: { stage: 'WON' } }),
    db.CrmActivity.count({ where: { status: 'SCHEDULED' } }),
    db.CrmActivity.count({
      where: {
        scheduledAt: {
          [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0)),
          [Op.lte]: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      },
    }),
    db.DealContract.count(),
    db.DealContract.count({ where: { status: 'SIGNED' } }),
  ]);

  // Stage breakdown
  const stages = ['DISCOVERY', 'PROPOSAL_SHARED', 'NEGOTIATION', 'CONTRACT_SENT', 'WON', 'LOST'];
  const stageStats = await Promise.all(
    stages.map(async (stage) => {
      const count = await db.Deal.count({ where: { stage } });
      const value = await db.Deal.sum('dealValue', { where: { stage } }) || 0;
      return { stage, count, value };
    })
  );

  const conversionRate = totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(1) : '0';
  const totalClosedDeals = wonDeals + lostDeals;
  const winRate = totalClosedDeals > 0 ? ((wonDeals / totalClosedDeals) * 100).toFixed(1) : '0';

  return {
    leads: {
      total: totalLeads,
      converted: convertedLeads,
      new: newLeads,
      conversionRate: parseFloat(conversionRate),
    },
    deals: {
      activeCount: activeDeals,
      wonCount: wonDeals,
      lostCount: lostDeals,
      pipelineValue: dealsPipelineSum || 0,
      wonValue: wonDealsSum || 0,
      winRate: parseFloat(winRate),
      stageStats,
    },
    activities: {
      pendingFollowUps,
      todayMeetings,
    },
    contracts: {
      total: totalContracts,
      signed: signedContracts,
    },
  };
}

module.exports = {
  // Leads
  getLeads,
  getLeadById,
  createLead,
  updateLead,
  deleteLead,
  convertLeadToDeal,
  // Deals
  getDeals,
  getDealById,
  createDeal,
  updateDeal,
  deleteDeal,
  // Activities
  getActivities,
  getActivityById,
  createActivity,
  updateActivity,
  deleteActivity,
  // Contracts
  getContracts,
  getContractById,
  createContract,
  updateContract,
  deleteContract,
  // Metrics
  getCrmMetrics,
};
