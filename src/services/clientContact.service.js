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

const CONTACT_INCLUDE = [
  { model: db.User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'] },
];

async function createContact({ requestingUser, clientId, data, req }) {
  assertLevel(requestingUser, CLIENT_MANAGE_MAX_LEVEL, 'Only Manager level or above can add client contacts');

  // Verify client exists
  const client = await db.Client.findOne({ where: { id: clientId, deletedAt: null } });
  if (!client) {
    const err = new Error('Client not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  const {
    name, jobTitle, department, phone, whatsappNumber, email,
    badges, preferredChannel, stakeholderType, relationshipNote,
    lastContactedAt, isActive,
  } = data;

  const contact = await db.ClientContact.create({
    clientId,
    name, jobTitle, department, phone, whatsappNumber, email,
    badges, preferredChannel, stakeholderType, relationshipNote,
    lastContactedAt, isActive,
    createdById: requestingUser.id,
  });

  const fullContact = await db.ClientContact.findByPk(contact.id, { include: CONTACT_INCLUDE });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.CLIENT_UPDATED,
    category: AUDIT_CATEGORY.CLIENT,
    entity: 'ClientContact',
    entityId: contact.id,
    entityName: contact.name,
    description: `Added contact "${contact.name}" to client "${client.name}"`,
    newValues: contact.toJSON(),
    req,
  });

  return fullContact;
}

async function getContacts({ clientId, requestingUser, page = 1, limit = 20, search, stakeholderType }) {
  page = parseInt(page) || 1;
  limit = parseInt(limit) || 20;

  const where = { clientId, deletedAt: null };

  if (stakeholderType) where.stakeholderType = stakeholderType;

  if (search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { email: { [Op.like]: `%${search}%` } },
      { department: { [Op.like]: `%${search}%` } },
      { jobTitle: { [Op.like]: `%${search}%` } },
    ];
  }

  const { count: total, rows: contacts } = await db.ClientContact.findAndCountAll({
    where,
    include: CONTACT_INCLUDE,
    offset: (page - 1) * limit,
    limit,
    order: [['created_at', 'DESC']],
    distinct: true,
  });

  return { contacts, total };
}

async function getContactById({ clientId, contactId }) {
  const contact = await db.ClientContact.findOne({
    where: { id: contactId, clientId, deletedAt: null },
    include: CONTACT_INCLUDE,
  });
  if (!contact) {
    const err = new Error('Contact not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }
  return contact;
}

async function updateContact({ requestingUser, clientId, contactId, data, req }) {
  assertLevel(requestingUser, CLIENT_MANAGE_MAX_LEVEL, 'Only Manager level or above can update client contacts');

  const contact = await db.ClientContact.findOne({ where: { id: contactId, clientId, deletedAt: null } });
  if (!contact) {
    const err = new Error('Contact not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  const oldValues = contact.toJSON();

  const updateFields = [
    'name', 'jobTitle', 'department', 'phone', 'whatsappNumber', 'email',
    'badges', 'preferredChannel', 'stakeholderType', 'relationshipNote',
    'lastContactedAt', 'isActive',
  ];

  updateFields.forEach(field => {
    if (data[field] !== undefined) contact[field] = data[field];
  });

  await contact.save();

  const fullContact = await db.ClientContact.findByPk(contact.id, { include: CONTACT_INCLUDE });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.CLIENT_UPDATED,
    category: AUDIT_CATEGORY.CLIENT,
    entity: 'ClientContact',
    entityId: contact.id,
    entityName: contact.name,
    description: `Updated contact "${contact.name}"`,
    oldValues,
    newValues: fullContact.toJSON(),
    req,
  });

  return fullContact;
}

async function deleteContact({ requestingUser, clientId, contactId, req }) {
  assertLevel(requestingUser, CLIENT_MANAGE_MAX_LEVEL, 'Only Manager level or above can delete client contacts');

  const contact = await db.ClientContact.findOne({ where: { id: contactId, clientId, deletedAt: null } });
  if (!contact) {
    const err = new Error('Contact not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  await contact.update({ deletedAt: new Date() });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.CLIENT_UPDATED,
    category: AUDIT_CATEGORY.CLIENT,
    entity: 'ClientContact',
    entityId: contact.id,
    entityName: contact.name,
    description: `Deleted contact "${contact.name}"`,
    req,
  });
}

module.exports = {
  createContact,
  getContacts,
  getContactById,
  updateContact,
  deleteContact,
};
