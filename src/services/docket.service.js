'use strict';

const { Op } = require('sequelize');
const { db } = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const { HTTP_STATUS, AUDIT_CATEGORY, AUDIT_ACTION, PACKAGE_MANAGE_MAX_LEVEL } = require('../constants');

function assertLevel(user, maxLevel, msg) {
  if (user.roleLevel > maxLevel) {
    const err = new Error(msg || `Access level <= ${maxLevel} required`);
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }
}

const DOCKET_INCLUDE = [
  { model: db.Client, as: 'client', attributes: ['id', 'name', 'clientCode'] },
  { model: db.ClientPackage, as: 'package', attributes: ['id', 'name', 'packageType', 'status'] },
  { model: db.User, as: 'assignedManager', attributes: ['id', 'firstName', 'lastName'] },
  { model: db.User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'] },
];

const TICKET_INCLUDE = [
  { model: db.ServiceCatalog, as: 'service', attributes: ['id', 'name', 'category'] },
  { model: db.User, as: 'assignedTo', attributes: ['id', 'firstName', 'lastName'] },
  { model: db.User, as: 'reportedBy', attributes: ['id', 'firstName', 'lastName'] },
  { model: db.PackageAddOn, as: 'addOn', attributes: ['id', 'status', 'totalPrice'] },
];

// ─── Docket CRUD ──────────────────────────────────────────────────────────────

async function createDocket({ requestingUser, clientId, data, req }) {
  assertLevel(requestingUser, PACKAGE_MANAGE_MAX_LEVEL, 'Only Manager level or above can create dockets');

  const client = await db.Client.findOne({ where: { id: clientId, deletedAt: null } });
  if (!client) {
    const err = new Error('Client not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  const { title, description, docketType, isTicketBased, status, startDate, endDate, assignedManagerId, packageId } = data;

  const docket = await db.Docket.create({
    clientId, title, description,
    docketType: docketType || 'PROJECT',
    isTicketBased: isTicketBased !== undefined ? isTicketBased : false,
    status: status || 'PLANNING',
    startDate, endDate,
    assignedManagerId: assignedManagerId || null,
    packageId: packageId || null,
    createdById: requestingUser.id,
  });

  const full = await db.Docket.findByPk(docket.id, { include: DOCKET_INCLUDE });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.DOCKET_CREATED,
    category: AUDIT_CATEGORY.DOCKET,
    entity: 'Docket',
    entityId: docket.id,
    entityName: docket.title,
    description: `Created docket: ${docket.title} for client ${clientId}`,
    newValues: docket.toJSON(),
    req,
  });

  return full;
}

async function getDocketsByClient({ clientId }) {
  const client = await db.Client.findOne({ where: { id: clientId, deletedAt: null } });
  if (!client) {
    const err = new Error('Client not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  return db.Docket.findAll({
    where: { clientId, deletedAt: null },
    include: DOCKET_INCLUDE,
    order: [['created_at', 'DESC']],
  });
}

async function getDocketById({ docketId }) {
  const docket = await db.Docket.findOne({
    where: { id: docketId, deletedAt: null },
    include: [
      ...DOCKET_INCLUDE,
      { model: db.DocketTicket, as: 'tickets', include: TICKET_INCLUDE },
      { model: db.PackageAddOn, as: 'addOns', attributes: ['id', 'status', 'totalPrice', 'customDescription'] },
    ],
  });
  if (!docket) {
    const err = new Error('Docket not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }
  return docket;
}

async function updateDocket({ requestingUser, docketId, data, req }) {
  assertLevel(requestingUser, PACKAGE_MANAGE_MAX_LEVEL, 'Only Manager level or above can update dockets');

  const docket = await db.Docket.findOne({ where: { id: docketId, deletedAt: null } });
  if (!docket) {
    const err = new Error('Docket not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  const oldValues = docket.toJSON();
  const fields = ['title', 'description', 'docketType', 'isTicketBased', 'status', 'startDate', 'endDate', 'assignedManagerId', 'packageId'];
  fields.forEach(f => { if (data[f] !== undefined) docket[f] = data[f]; });
  await docket.save();

  const full = await db.Docket.findByPk(docket.id, { include: DOCKET_INCLUDE });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.DOCKET_UPDATED,
    category: AUDIT_CATEGORY.DOCKET,
    entity: 'Docket',
    entityId: docket.id,
    entityName: docket.title,
    description: `Updated docket: ${docket.title}`,
    oldValues,
    newValues: full.toJSON(),
    req,
  });

  return full;
}

async function deleteDocket({ requestingUser, docketId, req }) {
  assertLevel(requestingUser, PACKAGE_MANAGE_MAX_LEVEL, 'Only Manager level or above can delete dockets');

  const docket = await db.Docket.findOne({ where: { id: docketId, deletedAt: null } });
  if (!docket) {
    const err = new Error('Docket not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  await docket.update({ deletedAt: new Date(), status: 'CANCELLED' });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.DOCKET_DELETED,
    category: AUDIT_CATEGORY.DOCKET,
    entity: 'Docket',
    entityId: docket.id,
    entityName: docket.title,
    description: `Deleted docket: ${docket.title}`,
    req,
  });
}

// ─── Docket Tickets ───────────────────────────────────────────────────────────

async function createTicket({ requestingUser, docketId, data, req }) {
  const docket = await db.Docket.findOne({ where: { id: docketId, deletedAt: null } });
  if (!docket) {
    const err = new Error('Docket not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  if (!docket.isTicketBased) {
    const err = new Error('This docket is not ticket-based. Use the Task system instead.');
    err.statusCode = HTTP_STATUS.BAD_REQUEST;
    throw err;
  }

  const { title, description, ticketType, priority, serviceId, addOnId, dueDate, assignedToId } = data;

  const ticket = await db.DocketTicket.create({
    docketId,
    title, description,
    ticketType: ticketType || 'SERVICE_DELIVERY',
    priority: priority || 'MEDIUM',
    status: 'OPEN',
    serviceId: serviceId || null,
    addOnId: addOnId || null,
    dueDate,
    assignedToId: assignedToId || null,
    reportedById: requestingUser.id,
  });

  const full = await db.DocketTicket.findByPk(ticket.id, { include: TICKET_INCLUDE });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.TICKET_CREATED,
    category: AUDIT_CATEGORY.TICKET,
    entity: 'DocketTicket',
    entityId: ticket.id,
    entityName: ticket.title,
    description: `Created ticket: ${ticket.title} in docket ${docket.title}`,
    newValues: ticket.toJSON(),
    req,
  });

  return full;
}

async function getTicketsByDocket({ docketId }) {
  const docket = await db.Docket.findOne({ where: { id: docketId, deletedAt: null } });
  if (!docket) {
    const err = new Error('Docket not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  return db.DocketTicket.findAll({
    where: { docketId },
    include: TICKET_INCLUDE,
    order: [['created_at', 'DESC']],
  });
}

async function getTicketById({ ticketId }) {
  const ticket = await db.DocketTicket.findByPk(ticketId, { include: TICKET_INCLUDE });
  if (!ticket) {
    const err = new Error('Ticket not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }
  return ticket;
}

async function updateTicket({ requestingUser, ticketId, data, req }) {
  const ticket = await db.DocketTicket.findByPk(ticketId);
  if (!ticket) {
    const err = new Error('Ticket not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  const oldValues = ticket.toJSON();
  const fields = ['title', 'description', 'ticketType', 'priority', 'status', 'serviceId', 'addOnId', 'taskId', 'dueDate', 'assignedToId', 'resolutionNote'];
  fields.forEach(f => { if (data[f] !== undefined) ticket[f] = data[f]; });

  if (data.status === 'RESOLVED' && !ticket.resolvedAt) ticket.resolvedAt = new Date();
  if (data.status === 'CLOSED' && !ticket.closedAt) ticket.closedAt = new Date();

  await ticket.save();

  const full = await db.DocketTicket.findByPk(ticket.id, { include: TICKET_INCLUDE });

  const actionMap = {
    RESOLVED: AUDIT_ACTION.TICKET_RESOLVED,
    CLOSED: AUDIT_ACTION.TICKET_CLOSED,
  };

  await writeAuditLog({
    performedBy: requestingUser,
    action: actionMap[data.status] || AUDIT_ACTION.TICKET_UPDATED,
    category: AUDIT_CATEGORY.TICKET,
    entity: 'DocketTicket',
    entityId: ticket.id,
    entityName: ticket.title,
    description: `Updated ticket: ${ticket.title}`,
    oldValues,
    newValues: full.toJSON(),
    req,
  });

  return full;
}

async function deleteTicket({ requestingUser, ticketId, req }) {
  assertLevel(requestingUser, PACKAGE_MANAGE_MAX_LEVEL, 'Only Manager level or above can delete tickets');

  const ticket = await db.DocketTicket.findByPk(ticketId);
  if (!ticket) {
    const err = new Error('Ticket not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  await ticket.destroy();

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.TICKET_DELETED,
    category: AUDIT_CATEGORY.TICKET,
    entity: 'DocketTicket',
    entityId: ticketId,
    entityName: ticket.title,
    description: `Deleted ticket: ${ticket.title}`,
    req,
  });
}

module.exports = {
  createDocket,
  getDocketsByClient,
  getDocketById,
  updateDocket,
  deleteDocket,
  createTicket,
  getTicketsByDocket,
  getTicketById,
  updateTicket,
  deleteTicket,
};
