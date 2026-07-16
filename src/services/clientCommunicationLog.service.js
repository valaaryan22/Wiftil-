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

const LOG_INCLUDE = [
  { model: db.User, as: 'loggedBy', attributes: ['id', 'firstName', 'lastName'] },
  {
    model: db.ClientContact,
    as: 'contactPerson',
    attributes: ['id', 'name', 'jobTitle', 'department'],
  },
];

async function createLog({ requestingUser, clientId, data, req }) {
  // Any authenticated user can log a communication (they were involved)
  const client = await db.Client.findOne({ where: { id: clientId, deletedAt: null } });
  if (!client) {
    const err = new Error('Client not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  const {
    title, channel, contactPersonId, communicatedAt,
    summary, nextAction, followUpDate, attachmentUrl,
  } = data;

  // Validate contactPersonId belongs to this client if provided
  if (contactPersonId) {
    const contact = await db.ClientContact.findOne({
      where: { id: contactPersonId, clientId, deletedAt: null },
    });
    if (!contact) {
      const err = new Error('Contact person not found for this client');
      err.statusCode = HTTP_STATUS.BAD_REQUEST;
      throw err;
    }
  }

  const log = await db.ClientCommunicationLog.create({
    clientId,
    title, channel, loggedById: requestingUser.id,
    contactPersonId, communicatedAt,
    summary, nextAction, followUpDate, attachmentUrl,
  });

  const fullLog = await db.ClientCommunicationLog.findByPk(log.id, { include: LOG_INCLUDE });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.CLIENT_UPDATED,
    category: AUDIT_CATEGORY.CLIENT,
    entity: 'ClientCommunicationLog',
    entityId: log.id,
    entityName: log.title,
    description: `Logged "${channel}" communication for client "${client.name}": ${title}`,
    newValues: log.toJSON(),
    req,
  });

  return fullLog;
}

async function getLogs({
  requestingUser, clientId,
  page = 1, limit = 20,
  channel, followUpPending, search,
}) {
  page = parseInt(page) || 1;
  limit = parseInt(limit) || 20;

  const where = { clientId, deletedAt: null };

  if (channel) where.channel = channel;

  if (followUpPending === 'true' || followUpPending === true) {
    where.followUpDate = { [Op.lte]: new Date() };
    where.followUpDone = false;
  }

  if (search) {
    where[Op.or] = [
      { title: { [Op.like]: `%${search}%` } },
      { summary: { [Op.like]: `%${search}%` } },
      { nextAction: { [Op.like]: `%${search}%` } },
    ];
  }

  const { count: total, rows: logs } = await db.ClientCommunicationLog.findAndCountAll({
    where,
    include: LOG_INCLUDE,
    offset: (page - 1) * limit,
    limit,
    order: [['communicated_at', 'DESC']],
    distinct: true,
  });

  return { logs, total };
}

async function getLogById({ clientId, logId }) {
  const log = await db.ClientCommunicationLog.findOne({
    where: { id: logId, clientId, deletedAt: null },
    include: LOG_INCLUDE,
  });
  if (!log) {
    const err = new Error('Communication log not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }
  return log;
}

async function updateLog({ requestingUser, clientId, logId, data, req }) {
  const log = await db.ClientCommunicationLog.findOne({ where: { id: logId, clientId, deletedAt: null } });
  if (!log) {
    const err = new Error('Communication log not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  // Only the logger or a manager+ can edit
  if (log.loggedById !== requestingUser.id) {
    assertLevel(requestingUser, CLIENT_MANAGE_MAX_LEVEL, 'Only Manager level or above can edit other\'s logs');
  }

  const oldValues = log.toJSON();

  if (data.contactPersonId) {
    const contact = await db.ClientContact.findOne({
      where: { id: data.contactPersonId, clientId, deletedAt: null },
    });
    if (!contact) {
      const err = new Error('Contact person not found for this client');
      err.statusCode = HTTP_STATUS.BAD_REQUEST;
      throw err;
    }
  }

  const updateFields = [
    'title', 'channel', 'contactPersonId', 'communicatedAt',
    'summary', 'nextAction', 'followUpDate', 'followUpDone', 'attachmentUrl',
  ];

  updateFields.forEach(field => {
    if (data[field] !== undefined) log[field] = data[field];
  });

  await log.save();

  const fullLog = await db.ClientCommunicationLog.findByPk(log.id, { include: LOG_INCLUDE });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.CLIENT_UPDATED,
    category: AUDIT_CATEGORY.CLIENT,
    entity: 'ClientCommunicationLog',
    entityId: log.id,
    entityName: log.title,
    description: `Updated communication log "${log.title}"`,
    oldValues,
    newValues: fullLog.toJSON(),
    req,
  });

  return fullLog;
}

async function deleteLog({ requestingUser, clientId, logId, req }) {
  assertLevel(requestingUser, CLIENT_MANAGE_MAX_LEVEL, 'Only Manager level or above can delete communication logs');

  const log = await db.ClientCommunicationLog.findOne({ where: { id: logId, clientId, deletedAt: null } });
  if (!log) {
    const err = new Error('Communication log not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  await log.update({ deletedAt: new Date() });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.CLIENT_UPDATED,
    category: AUDIT_CATEGORY.CLIENT,
    entity: 'ClientCommunicationLog',
    entityId: log.id,
    entityName: log.title,
    description: `Deleted communication log "${log.title}"`,
    req,
  });
}

module.exports = {
  createLog,
  getLogs,
  getLogById,
  updateLog,
  deleteLog,
};
