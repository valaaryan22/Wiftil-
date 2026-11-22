'use strict';

const { Op } = require('sequelize');
const { db } = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const { HTTP_STATUS, AUDIT_CATEGORY, AUDIT_ACTION, CLIENT_MANAGE_MAX_LEVEL } = require('../constants');

function assertLevel(user, maxLevel, msg) {
  if (user.roleLevel > maxLevel) {
    const err = new Error(msg || `Access level ≤ ${maxLevel} required`);
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }
}

const CLIENT_INCLUDE = [
  { model: db.User, as: 'accountOwner', attributes: ['id', 'firstName', 'lastName', 'email'] },
  { model: db.User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'] },
];

async function createClient({ requestingUser, data, req }) {
  assertLevel(requestingUser, CLIENT_MANAGE_MAX_LEVEL, 'Only Manager level or above can create clients');

  const {
    name, clientCode, accountOwnerId, primaryContactName,
    phone, whatsappNumber, email, billingDate, industry,
    website, gst, joinedDate, locationPreference, leadSource,
    referralSource, preferredLanguage, preferredChannel,
    internalTags, socialMediaLinks, logo, brandDna
  } = data;

  if (clientCode) {
    const existing = await db.Client.findOne({ where: { clientCode } });
    if (existing) {
      const err = new Error('Client with this code already exists');
      err.statusCode = HTTP_STATUS.CONFLICT;
      throw err;
    }
  }

  if (accountOwnerId) {
    const owner = await db.User.findByPk(accountOwnerId);
    if (!owner) {
      const err = new Error('Account owner not found');
      err.statusCode = HTTP_STATUS.BAD_REQUEST;
      throw err;
    }
  }

  const client = await db.Client.create({
    name, clientCode, accountOwnerId, primaryContactName,
    phone, whatsappNumber, email, billingDate, industry,
    website, gst, joinedDate, locationPreference, leadSource,
    referralSource, preferredLanguage, preferredChannel,
    internalTags, socialMediaLinks, logo, brandDna,
    createdById: requestingUser.id,
  });

  const fullClient = await db.Client.findByPk(client.id, { include: CLIENT_INCLUDE });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.CLIENT_CREATED,
    category: AUDIT_CATEGORY.CLIENT,
    entity: 'Client',
    entityId: client.id,
    entityName: client.name,
    description: `Created new client: ${client.name}`,
    newValues: client.toJSON(),
    req,
  });

  return fullClient;
}

async function _getAccessibleClientIds(user) {
  // Level 4 (Team Lead): clients via dockets they manage OR tasks assigned to them
  if (user.roleLevel === 4) {
    const [docketAssignments, taskAssignments] = await Promise.all([
      // Via DocketManager → Docket → clientId
      db.DocketManager.findAll({
        where: { managerId: user.id },
        include: [{ model: db.Docket, as: 'docket', attributes: ['clientId'] }],
      }),
      // Via TaskAssignment → Task (with docketId) → Docket → clientId
      db.TaskAssignment.findAll({
        where: { teamLeadId: user.id },
        include: [{
          model: db.Task, as: 'task', attributes: ['docketId'],
          include: [{ model: db.Docket, as: 'docket', attributes: ['clientId'] }],
        }],
      }),
    ]);

    const clientIds = new Set();
    docketAssignments.forEach(dm => { if (dm.docket?.clientId) clientIds.add(dm.docket.clientId); });
    taskAssignments.forEach(ta => { if (ta.task?.docket?.clientId) clientIds.add(ta.task.docket.clientId); });
    return Array.from(clientIds);
  }

  // Level 5+ (Employee/Member): clients via sub-tasks assigned to them
  const subTaskAssignments = await db.SubTaskAssignment.findAll({
    where: { memberId: user.id },
    include: [{
      model: db.SubTask, as: 'subTask', attributes: ['taskId'],
      include: [{
        model: db.Task, as: 'task', attributes: ['docketId'],
        include: [{ model: db.Docket, as: 'docket', attributes: ['clientId'] }],
      }],
    }],
  });

  const clientIds = new Set();
  subTaskAssignments.forEach(sa => {
    const clientId = sa.subTask?.task?.docket?.clientId;
    if (clientId) clientIds.add(clientId);
  });
  return Array.from(clientIds);
}

async function getClients({ requestingUser, page = 1, limit = 20, search }) {
  page = parseInt(page) || 1;
  limit = parseInt(limit) || 20;

  const where = { deletedAt: null };

  // Level 1-3 (BOSS / ADMIN / MANAGER) → see ALL clients
  // Level 4   (Team Lead)              → see clients from their docket/task assignments
  // Level 5+  (Employee)               → see clients from their sub-task assignments
  if (requestingUser.roleLevel > 3) {
    const accessibleIds = await _getAccessibleClientIds(requestingUser);
    where.id = { [Op.in]: accessibleIds };
  }

  if (search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { clientCode: { [Op.like]: `%${search}%` } },
      { email: { [Op.like]: `%${search}%` } },
    ];
  }

  const { count: total, rows: clients } = await db.Client.findAndCountAll({
    where,
    include: CLIENT_INCLUDE,
    offset: (page - 1) * limit,
    limit,
    order: [['created_at', 'DESC']],
    distinct: true,
  });

  return { clients, total };
}

async function getClientById({ id, requestingUser }) {
  const client = await db.Client.findOne({
    where: { id, deletedAt: null },
    include: CLIENT_INCLUDE,
  });
  if (!client) {
    const err = new Error('Client not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  // Level 4+ must have an assignment that leads to this client
  if (requestingUser.roleLevel > 3) {
    const accessibleIds = await _getAccessibleClientIds(requestingUser);
    if (!accessibleIds.includes(client.id)) {
      const err = new Error('Access denied — you are not assigned to any work under this client');
      err.statusCode = HTTP_STATUS.FORBIDDEN;
      throw err;
    }
  }

  return client;
}

async function updateClient({ requestingUser, id, data, req }) {
  assertLevel(requestingUser, CLIENT_MANAGE_MAX_LEVEL, 'Only Manager level or above can update clients');

  const client = await db.Client.findOne({ where: { id, deletedAt: null } });
  if (!client) {
    const err = new Error('Client not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  if (data.clientCode && data.clientCode !== client.clientCode) {
    const existing = await db.Client.findOne({ where: { clientCode: data.clientCode } });
    if (existing) {
      const err = new Error('Client with this code already exists');
      err.statusCode = HTTP_STATUS.CONFLICT;
      throw err;
    }
  }

  if (data.accountOwnerId && data.accountOwnerId !== client.accountOwnerId) {
    const owner = await db.User.findByPk(data.accountOwnerId);
    if (!owner) {
      const err = new Error('Account owner not found');
      err.statusCode = HTTP_STATUS.BAD_REQUEST;
      throw err;
    }
  }

  const oldValues = client.toJSON();

  const updateFields = [
    'name', 'clientCode', 'accountOwnerId', 'primaryContactName',
    'phone', 'whatsappNumber', 'email', 'billingDate', 'industry',
    'website', 'gst', 'joinedDate', 'locationPreference', 'leadSource',
    'referralSource', 'preferredLanguage', 'preferredChannel',
    'internalTags', 'socialMediaLinks', 'logo', 'brandDna'
  ];

  updateFields.forEach(field => {
    if (data[field] !== undefined) {
      client[field] = data[field];
    }
  });

  await client.save();

  const fullClient = await db.Client.findByPk(client.id, { include: CLIENT_INCLUDE });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.CLIENT_UPDATED,
    category: AUDIT_CATEGORY.CLIENT,
    entity: 'Client',
    entityId: client.id,
    entityName: client.name,
    description: `Updated client: ${client.name}`,
    oldValues,
    newValues: fullClient.toJSON(),
    req,
  });

  return fullClient;
}

async function deleteClient({ requestingUser, id, req }) {
  assertLevel(requestingUser, CLIENT_MANAGE_MAX_LEVEL, 'Only Manager level or above can delete clients');

  const client = await db.Client.findOne({ where: { id, deletedAt: null } });
  if (!client) {
    const err = new Error('Client not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  await client.update({ deletedAt: new Date() });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.CLIENT_DELETED,
    category: AUDIT_CATEGORY.CLIENT,
    entity: 'Client',
    entityId: client.id,
    entityName: client.name,
    description: `Deleted client: ${client.name}`,
    req,
  });
}

module.exports = {
  createClient,
  getClients,
  getClientById,
  updateClient,
  deleteClient,
};
