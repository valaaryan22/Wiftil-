'use strict';

const { Op } = require('sequelize');
const { db } = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const {
  HTTP_STATUS, AUDIT_CATEGORY, AUDIT_ACTION,
  PACKAGE_MANAGE_MAX_LEVEL, DOCKET_MANAGE_MAX_LEVEL,
  DOCKET_STATUS,
} = require('../constants');

function assertLevel(user, maxLevel, msg) {
  if (user.roleLevel > maxLevel) {
    const err = new Error(msg || `Access level <= ${maxLevel} required`);
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }
}

function notFound(entity) {
  const err = new Error(`${entity} not found`);
  err.statusCode = HTTP_STATUS.NOT_FOUND;
  throw err;
}

function badRequest(msg) {
  const err = new Error(msg);
  err.statusCode = HTTP_STATUS.BAD_REQUEST;
  throw err;
}

// ─── Include sets ─────────────────────────────────────────────────────────────

const MANAGER_INCLUDE = {
  model: db.DocketManager,
  as: 'managers',
  include: [
    { model: db.User, as: 'manager', attributes: ['id', 'firstName', 'lastName', 'email'] },
    { model: db.User, as: 'assignedBy', attributes: ['id', 'firstName', 'lastName'] },
  ],
};

const DOCKET_INCLUDE = [
  { model: db.Client, as: 'client', attributes: ['id', 'name', 'clientCode'] },
  { model: db.ClientPackage, as: 'package', attributes: ['id', 'name', 'packageType', 'status'] },
  { model: db.User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'] },
  { model: db.User, as: 'publishedBy', attributes: ['id', 'firstName', 'lastName'] },
  MANAGER_INCLUDE,
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
  if (!client) notFound('Client');

  const {
    title, description, docketType, isTicketBased,
    startDate, endDate, packageId, managerIds,
  } = data;

  // Always create in DRAFT status
  const docket = await db.Docket.create({
    clientId, title, description,
    docketType: docketType || 'PROJECT',
    isTicketBased: isTicketBased !== undefined ? isTicketBased : false,
    status: 'DRAFT',
    startDate, endDate,
    packageId: packageId || null,
    createdById: requestingUser.id,
  });

  // Assign initial managers if provided
  if (managerIds && Array.isArray(managerIds) && managerIds.length > 0) {
    const managerRecords = managerIds.map((mid, idx) => ({
      docketId: docket.id,
      managerId: typeof mid === 'object' ? mid.id : mid,
      role: (typeof mid === 'object' && mid.role) ? mid.role : (idx === 0 ? 'PRIMARY' : 'SECONDARY'),
      assignedById: requestingUser.id,
    }));
    await db.DocketManager.bulkCreate(managerRecords, { ignoreDuplicates: true });
  }

  const full = await db.Docket.findByPk(docket.id, { include: DOCKET_INCLUDE });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.DOCKET_CREATED,
    category: AUDIT_CATEGORY.DOCKET,
    entity: 'Docket',
    entityId: docket.id,
    entityName: docket.title,
    description: `Created docket: ${docket.title} for client ${clientId} (DRAFT)`,
    newValues: docket.toJSON(),
    req,
  });

  return full;
}

// ─── Role-based docket access helper ─────────────────────────────────────────

async function _getAccessibleDocketIds(user) {
  // Level 4 (Team Lead): dockets they are assigned to as DocketManager
  //                       OR dockets linked to tasks assigned to them
  if (user.roleLevel === 4) {
    const [docketAssignments, taskAssignments] = await Promise.all([
      db.DocketManager.findAll({
        where: { managerId: user.id },
        attributes: ['docketId'],
        raw: true,
      }),
      db.TaskAssignment.findAll({
        where: { teamLeadId: user.id },
        include: [{ model: db.Task, as: 'task', attributes: ['docketId'] }],
      }),
    ]);

    const ids = new Set();
    docketAssignments.forEach(dm => { if (dm.docketId) ids.add(dm.docketId); });
    taskAssignments.forEach(ta => { if (ta.task?.docketId) ids.add(ta.task.docketId); });
    return Array.from(ids);
  }

  // Level 5+ (Employee): dockets via sub-tasks assigned to them
  const subTaskAssignments = await db.SubTaskAssignment.findAll({
    where: { memberId: user.id },
    include: [{
      model: db.SubTask, as: 'subTask', attributes: ['taskId'],
      include: [{ model: db.Task, as: 'task', attributes: ['docketId'] }],
    }],
  });

  const ids = new Set();
  subTaskAssignments.forEach(sa => {
    const docketId = sa.subTask?.task?.docketId;
    if (docketId) ids.add(docketId);
  });
  return Array.from(ids);
}

async function getAllDockets({ requestingUser, query }) {
  const page  = parseInt(query.page)  || 1;
  const limit = parseInt(query.limit) || 20;
  const offset = (page - 1) * limit;

  const where = { deletedAt: null };

  if (query.status)     where.status     = query.status;
  if (query.clientId)   where.clientId   = query.clientId;
  if (query.docketType) where.docketType = query.docketType;

  // Level 1-3 (BOSS / ADMIN / MANAGER) → see ALL dockets
  // Level 4   (Team Lead)              → dockets they manage or are assigned tasks in
  // Level 5+  (Employee)               → dockets they have sub-task assignments in
  if (requestingUser.roleLevel > 3) {
    const accessibleIds = await _getAccessibleDocketIds(requestingUser);
    where.id = { [Op.in]: accessibleIds };
  }

  const { count: total, rows: dockets } = await db.Docket.findAndCountAll({
    where,
    include: DOCKET_INCLUDE,
    order: [['created_at', 'DESC']],
    offset,
    limit,
    distinct: true,
  });

  return { dockets, total, page, limit };
}

async function getDocketsByClient({ clientId }) {
  const client = await db.Client.findOne({ where: { id: clientId, deletedAt: null } });
  if (!client) notFound('Client');

  return db.Docket.findAll({
    where: { clientId, deletedAt: null },
    include: DOCKET_INCLUDE,
    order: [['created_at', 'DESC']],
  });
}

async function getDocketById({ docketId, requestingUser }) {
  const docket = await db.Docket.findOne({
    where: { id: docketId, deletedAt: null },
    include: [
      ...DOCKET_INCLUDE,
      { model: db.DocketTicket, as: 'tickets', include: TICKET_INCLUDE },
      { model: db.PackageAddOn, as: 'addOns', attributes: ['id', 'status', 'totalPrice', 'customDescription'] },
      {
        model: db.Task, as: 'tasks',
        attributes: ['id', 'title', 'status', 'priority', 'dueDate'],
        include: [
          { model: db.User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'] },
          { model: db.User, as: 'manager', attributes: ['id', 'firstName', 'lastName'] },
        ],
      },
      {
        model: db.SubTask, as: 'subTasks',
        attributes: ['id', 'title', 'status', 'priority', 'dueDate'],
      },
    ],
  });
  if (!docket) notFound('Docket');

  // Level 4+ can only access dockets they are assigned to
  if (requestingUser && requestingUser.roleLevel > 3) {
    const accessibleIds = await _getAccessibleDocketIds(requestingUser);
    if (!accessibleIds.includes(docket.id)) {
      const err = new Error('Access denied — you are not assigned to this docket');
      err.statusCode = HTTP_STATUS.FORBIDDEN;
      throw err;
    }
  }

  return docket;
}

async function updateDocket({ requestingUser, docketId, data, req }) {
  assertLevel(requestingUser, PACKAGE_MANAGE_MAX_LEVEL, 'Only Manager level or above can update dockets');

  const docket = await db.Docket.findOne({ where: { id: docketId, deletedAt: null } });
  if (!docket) notFound('Docket');

  const oldValues = docket.toJSON();

  // Prevent direct status changes to PUBLISHED (use publishDocket instead)
  if (data.status === 'PUBLISHED') {
    badRequest('Use the publish endpoint to publish a docket');
  }

  const fields = ['title', 'description', 'docketType', 'isTicketBased', 'status', 'startDate', 'endDate', 'packageId'];
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
  if (!docket) notFound('Docket');

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

// ─── Publish Docket ───────────────────────────────────────────────────────────

async function publishDocket({ requestingUser, docketId, req }) {
  assertLevel(requestingUser, PACKAGE_MANAGE_MAX_LEVEL, 'Only Manager level or above can publish dockets');

  const docket = await db.Docket.findOne({
    where: { id: docketId, deletedAt: null },
    include: [MANAGER_INCLUDE],
  });
  if (!docket) notFound('Docket');

  if (docket.status !== 'DRAFT') {
    badRequest(`Cannot publish a docket with status "${docket.status}". Only DRAFT dockets can be published.`);
  }

  // Validate required fields before publishing
  if (!docket.title || docket.title.trim() === '') {
    badRequest('Docket must have a title before publishing');
  }

  const oldValues = docket.toJSON();

  docket.status = 'PUBLISHED';
  docket.publishedAt = new Date();
  docket.publishedById = requestingUser.id;
  await docket.save();

  const full = await db.Docket.findByPk(docket.id, { include: DOCKET_INCLUDE });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.DOCKET_PUBLISHED,
    category: AUDIT_CATEGORY.DOCKET,
    entity: 'Docket',
    entityId: docket.id,
    entityName: docket.title,
    description: `Published docket: ${docket.title}`,
    oldValues,
    newValues: full.toJSON(),
    req,
  });

  return full;
}

// ─── Docket Manager CRUD ─────────────────────────────────────────────────────

async function getDocketManagers({ docketId }) {
  const docket = await db.Docket.findOne({ where: { id: docketId, deletedAt: null } });
  if (!docket) notFound('Docket');

  return db.DocketManager.findAll({
    where: { docketId },
    include: [
      { model: db.User, as: 'manager', attributes: ['id', 'firstName', 'lastName', 'email'] },
      { model: db.User, as: 'assignedBy', attributes: ['id', 'firstName', 'lastName'] },
    ],
    order: [['assigned_at', 'ASC']],
  });
}

async function addDocketManager({ requestingUser, docketId, data, req }) {
  assertLevel(requestingUser, PACKAGE_MANAGE_MAX_LEVEL, 'Only Manager level or above can assign docket managers');

  const docket = await db.Docket.findOne({ where: { id: docketId, deletedAt: null } });
  if (!docket) notFound('Docket');

  const { managerId, role } = data;

  // Verify the user exists and is level 2/3/4
  const manager = await db.User.findOne({
    where: { id: managerId },
    include: [{ model: db.RoleDefinition, as: 'role', attributes: ['accessLevel'] }],
  });
  if (!manager) notFound('Manager user');

  if (manager.role.accessLevel > DOCKET_MANAGE_MAX_LEVEL) {
    badRequest(`User must be level ${DOCKET_MANAGE_MAX_LEVEL} or above to be assigned as docket manager`);
  }

  // Check for duplicate
  const existing = await db.DocketManager.findOne({
    where: { docketId, managerId },
  });
  if (existing) {
    badRequest('This manager is already assigned to this docket');
  }

  const assignment = await db.DocketManager.create({
    docketId,
    managerId,
    role: role || 'PRIMARY',
    assignedById: requestingUser.id,
  });

  const full = await db.DocketManager.findByPk(assignment.id, {
    include: [
      { model: db.User, as: 'manager', attributes: ['id', 'firstName', 'lastName', 'email'] },
      { model: db.User, as: 'assignedBy', attributes: ['id', 'firstName', 'lastName'] },
    ],
  });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.DOCKET_MANAGER_ADDED,
    category: AUDIT_CATEGORY.DOCKET,
    entity: 'DocketManager',
    entityId: assignment.id,
    entityName: `${docket.title} → Manager`,
    description: `Added manager ${managerId} to docket: ${docket.title} with role ${role || 'PRIMARY'}`,
    newValues: assignment.toJSON(),
    req,
  });

  return full;
}

async function removeDocketManager({ requestingUser, docketId, managerId, req }) {
  assertLevel(requestingUser, PACKAGE_MANAGE_MAX_LEVEL, 'Only Manager level or above can remove docket managers');

  const docket = await db.Docket.findOne({ where: { id: docketId, deletedAt: null } });
  if (!docket) notFound('Docket');

  const assignment = await db.DocketManager.findOne({
    where: { docketId, managerId },
  });
  if (!assignment) notFound('Manager assignment');

  await assignment.destroy();

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.DOCKET_MANAGER_REMOVED,
    category: AUDIT_CATEGORY.DOCKET,
    entity: 'DocketManager',
    entityId: assignment.id,
    entityName: `${docket.title} → Manager`,
    description: `Removed manager ${managerId} from docket: ${docket.title}`,
    req,
  });
}

// ─── Task ↔ Docket Linking ────────────────────────────────────────────────────

async function linkTaskToDocket({ requestingUser, docketId, taskId, req }) {
  assertLevel(requestingUser, PACKAGE_MANAGE_MAX_LEVEL, 'Only Manager level or above can link tasks to dockets');

  const docket = await db.Docket.findOne({ where: { id: docketId, deletedAt: null } });
  if (!docket) notFound('Docket');

  const task = await db.Task.findByPk(taskId);
  if (!task) notFound('Task');

  if (task.docketId && task.docketId !== docketId) {
    badRequest('This task is already linked to another docket. Unlink it first.');
  }

  const oldValues = { docketId: task.docketId };
  task.docketId = docketId;
  await task.save();

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.DOCKET_TASK_LINKED,
    category: AUDIT_CATEGORY.DOCKET,
    entity: 'Task',
    entityId: task.id,
    entityName: task.title,
    description: `Linked task "${task.title}" to docket "${docket.title}"`,
    oldValues,
    newValues: { docketId },
    req,
  });

  return task;
}

async function unlinkTaskFromDocket({ requestingUser, docketId, taskId, req }) {
  assertLevel(requestingUser, PACKAGE_MANAGE_MAX_LEVEL, 'Only Manager level or above can unlink tasks from dockets');

  const docket = await db.Docket.findOne({ where: { id: docketId, deletedAt: null } });
  if (!docket) notFound('Docket');

  const task = await db.Task.findByPk(taskId);
  if (!task) notFound('Task');

  if (task.docketId !== docketId) {
    badRequest('This task is not linked to this docket');
  }

  const oldValues = { docketId: task.docketId };
  task.docketId = null;
  await task.save();

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.DOCKET_TASK_UNLINKED,
    category: AUDIT_CATEGORY.DOCKET,
    entity: 'Task',
    entityId: task.id,
    entityName: task.title,
    description: `Unlinked task "${task.title}" from docket "${docket.title}"`,
    oldValues,
    newValues: { docketId: null },
    req,
  });

  return task;
}

// ─── Docket Tickets ───────────────────────────────────────────────────────────

async function createTicket({ requestingUser, docketId, data, req }) {
  const docket = await db.Docket.findOne({ where: { id: docketId, deletedAt: null } });
  if (!docket) notFound('Docket');

  if (!docket.isTicketBased) {
    badRequest('This docket is not ticket-based. Use the Task system instead.');
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
  if (!docket) notFound('Docket');

  return db.DocketTicket.findAll({
    where: { docketId },
    include: TICKET_INCLUDE,
    order: [['created_at', 'DESC']],
  });
}

async function getTicketById({ ticketId }) {
  const ticket = await db.DocketTicket.findByPk(ticketId, { include: TICKET_INCLUDE });
  if (!ticket) notFound('Ticket');
  return ticket;
}

async function updateTicket({ requestingUser, ticketId, data, req }) {
  const ticket = await db.DocketTicket.findByPk(ticketId);
  if (!ticket) notFound('Ticket');

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
  if (!ticket) notFound('Ticket');

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
  // Docket CRUD
  createDocket,
  getAllDockets,
  getDocketsByClient,
  getDocketById,
  updateDocket,
  deleteDocket,
  // Publish
  publishDocket,
  // Manager CRUD
  getDocketManagers,
  addDocketManager,
  removeDocketManager,
  // Task linking
  linkTaskToDocket,
  unlinkTaskFromDocket,
  // Tickets
  createTicket,
  getTicketsByDocket,
  getTicketById,
  updateTicket,
  deleteTicket,
};
