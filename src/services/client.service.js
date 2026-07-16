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
    internalTags, socialMediaLinks, logo
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
    internalTags, socialMediaLinks, logo,
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

async function getClients({ requestingUser, page = 1, limit = 20, search }) {
  page = parseInt(page) || 1;
  limit = parseInt(limit) || 20;

  const where = { deletedAt: null };

  // If user is Employee (level 5+), they can only see clients they own or maybe we restrict.
  // Assuming anyone can view clients, or at least they can only view if allowed.
  // The prompt doesn't specify view restriction, we'll allow all authenticated users to view
  // but if they are employees, they might only see clients they are account owner of. Let's make view global or restricted.
  if (requestingUser.roleLevel > 3) {
     where.accountOwnerId = requestingUser.id;
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

  if (requestingUser.roleLevel > 3 && client.accountOwnerId !== requestingUser.id) {
    const err = new Error('Access denied');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
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
    'internalTags', 'socialMediaLinks', 'logo'
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
