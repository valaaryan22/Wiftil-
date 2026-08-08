'use strict';

const { Op } = require('sequelize');
const { db }            = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const {
  HTTP_STATUS, AUDIT_CATEGORY, AUDIT_ACTION, DATE_CHANGE_STATUS,
} = require('../constants');

// --- Helpers ------------------------------------------------------------------

function forbidden(msg) {
  const err = new Error(msg); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
}
function notFound(msg = 'Not found') {
  const err = new Error(msg); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
}
function badReq(msg) {
  const err = new Error(msg); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
}
function conflict(msg) {
  const err = new Error(msg); err.statusCode = HTTP_STATUS.CONFLICT; throw err;
}

/**
 * Resolve the notification target IDs for a date-change request.
 * - Docket  ? assigned DocketManagers; fallback to docket.createdById
 * - Task    ? task.managerId; fallback to level = 2 users
 * - SubTask ? parent task.managerId; fallback to sub-task createdById
 */
async function _resolveManagerIds(entityType, entityId) {
  if (entityType === 'Docket') {
    const docket = await db.Docket.findByPk(entityId, {
      attributes: ['id', 'createdById'],
      include: [{ model: db.DocketManager, as: 'managers', attributes: ['managerId'] }],
    });
    if (!docket) notFound('Docket');
    const managerIds = (docket.managers || []).map(m => m.managerId);
    return managerIds.length ? managerIds : [docket.createdById];
  }

  if (entityType === 'Task') {
    const task = await db.Task.findByPk(entityId, {
      attributes: ['id', 'managerId', 'createdById'],
    });
    if (!task) notFound('Task');
    if (task.managerId) return [task.managerId];
    // Fallback: notify BOSS/ADMIN (level <= 2)
    const admins = await db.User.findAll({
      include: [{ model: db.RoleDefinition, as: 'role', attributes: ['accessLevel'], where: { accessLevel: { [Op.lte]: 2 } } }],
      attributes: ['id'],
    });
    return admins.map(u => u.id);
  }

  if (entityType === 'SubTask') {
    const subTask = await db.SubTask.findByPk(entityId, {
      attributes: ['id', 'taskId', 'createdById'],
      include: [{ model: db.Task, as: 'task', attributes: ['managerId', 'createdById'] }],
    });
    if (!subTask) notFound('SubTask');
    const managerId = subTask.task?.managerId;
    return managerId ? [managerId] : [subTask.createdById];
  }

  return [];
}

/**
 * Snapshot the current dates from the entity.
 * Returns { currentStartDate, currentEndDate }
 */
async function _snapshotCurrentDates(entityType, entityId) {
  if (entityType === 'Docket') {
    const d = await db.Docket.findByPk(entityId, { attributes: ['startDate', 'endDate'] });
    if (!d) notFound('Docket');
    return { currentStartDate: d.startDate, currentEndDate: d.endDate };
  }
  if (entityType === 'Task') {
    const t = await db.Task.findOne({ where: { id: entityId, deletedAt: null }, attributes: ['startDate', 'dueDate'] });
    if (!t) notFound('Task');
    return { currentStartDate: t.startDate, currentEndDate: t.dueDate };
  }
  if (entityType === 'SubTask') {
    const s = await db.SubTask.findOne({ where: { id: entityId }, attributes: ['startDate', 'dueDate'] });
    if (!s) notFound('SubTask');
    return { currentStartDate: s.startDate, currentEndDate: s.dueDate };
  }
  notFound('Unknown entity type');
}

/**
 * Apply approved dates back to the entity.
 */
async function _applyDates(entityType, entityId, { startDate, endDate }) {
  if (entityType === 'Docket') {
    const updates = {};
    if (startDate !== undefined) updates.startDate = startDate;
    if (endDate   !== undefined) updates.endDate   = endDate;
    await db.Docket.update(updates, { where: { id: entityId } });
  } else if (entityType === 'Task') {
    const updates = {};
    if (startDate !== undefined) updates.startDate = startDate;
    if (endDate   !== undefined) updates.dueDate   = endDate;
    await db.Task.update(updates, { where: { id: entityId, deletedAt: null } });
  } else if (entityType === 'SubTask') {
    const updates = {};
    if (startDate !== undefined) updates.startDate = startDate;
    if (endDate   !== undefined) updates.dueDate   = endDate;
    await db.SubTask.update(updates, { where: { id: entityId } });
  }
}

async function _notify(userIds, payload) {
  if (!userIds?.length) return;
  const unique = [...new Set(userIds.filter(Boolean))];
  try {
    await db.Notification.bulkCreate(
      unique.map(userId => ({ userId, ...payload })),
      { ignoreDuplicates: true }
    );
  } catch { /* non-fatal */ }
}

const DCR_INCLUDE = [
  { model: db.User, as: 'requestedBy', attributes: ['id', 'firstName', 'lastName', 'email'] },
  { model: db.User, as: 'reviewedBy',  attributes: ['id', 'firstName', 'lastName'] },
];

// --- Service Functions --------------------------------------------------------

/**
 * Create a pending date-change request.
 * Called by existing services when the requesting user has roleLevel > 2. (BOSS=1 and ADMIN=2 apply immediately; MANAGER=3+ go through approval.)
 */
async function requestDateChange({ requestingUser, entityType, entityId, requestedStartDate, requestedEndDate, req }) {
  if (!['Docket', 'Task', 'SubTask'].includes(entityType)) {
    badReq('Invalid entityType — must be Docket, Task, or SubTask');
  }
  if (requestedStartDate === undefined && requestedEndDate === undefined) {
    badReq('At least one of requestedStartDate or requestedEndDate must be provided');
  }

  // Only one pending request per entity at a time
  const existing = await db.DateChangeRequest.findOne({
    where: { entityType, entityId, status: DATE_CHANGE_STATUS.PENDING },
  });
  if (existing) {
    conflict('There is already a pending date-change request for this entity. Wait for it to be reviewed before submitting a new one.');
  }

  const { currentStartDate, currentEndDate } = await _snapshotCurrentDates(entityType, entityId);

  const request = await db.DateChangeRequest.create({
    entityType,
    entityId,
    requestedById: requestingUser.id,
    requestedStartDate: requestedStartDate ?? null,
    requestedEndDate:   requestedEndDate   ?? null,
    currentStartDate,
    currentEndDate,
    status: DATE_CHANGE_STATUS.PENDING,
  });

  const managerIds = await _resolveManagerIds(entityType, entityId);
  await _notify(managerIds, {
    type:       'DATE_CHANGE_REQUESTED',
    title:      'Date Change Request',
    message:    `${requestingUser.firstName} ${requestingUser.lastName} has requested a date change on ${entityType} — please review.`,
    entityType: 'DateChangeRequest',
    entityId:   request.id,
  });

  await writeAuditLog({
    performedBy: requestingUser,
    action:      AUDIT_ACTION.DATE_CHANGE_REQUESTED,
    category:    AUDIT_CATEGORY.TASK,
    entity:      entityType,
    entityId,
    description: `${requestingUser.firstName} requested date change on ${entityType} ${entityId}` +
                 (requestedStartDate ? ` — startDate: ${requestedStartDate}` : '') +
                 (requestedEndDate   ? ` — endDate: ${requestedEndDate}` : ''),
    newValues: { requestedStartDate, requestedEndDate },
    req,
  });

  return db.DateChangeRequest.findByPk(request.id, { include: DCR_INCLUDE });
}

/**
 * Manager approves a pending request ? dates are applied immediately.
 */
async function approveDateChange({ requestingUser, requestId, comment, req }) {
  if (requestingUser.roleLevel > 2) {
    forbidden('Only Manager level or above (level = 3) can approve date-change requests');
  }

  const dcr = await db.DateChangeRequest.findByPk(requestId);
  if (!dcr) notFound('Date-change request');
  if (dcr.status !== DATE_CHANGE_STATUS.PENDING) {
    conflict(`This request has already been ${dcr.status.toLowerCase()}`);
  }

  // Apply the dates to the entity
  await _applyDates(dcr.entityType, dcr.entityId, {
    startDate: dcr.requestedStartDate,
    endDate:   dcr.requestedEndDate,
  });

  await dcr.update({
    status:       DATE_CHANGE_STATUS.APPROVED,
    reviewedById: requestingUser.id,
    reviewComment: comment || null,
    reviewedAt:   new Date(),
  });

  await _notify([dcr.requestedById], {
    type:       'DATE_CHANGE_APPROVED',
    title:      'Date Change Approved',
    message:    `Your date-change request on ${dcr.entityType} has been approved.`,
    entityType: 'DateChangeRequest',
    entityId:   dcr.id,
  });

  await writeAuditLog({
    performedBy: requestingUser,
    action:      AUDIT_ACTION.DATE_CHANGE_APPROVED,
    category:    AUDIT_CATEGORY.TASK,
    entity:      dcr.entityType,
    entityId:    dcr.entityId,
    description: `Manager approved date-change request ${requestId} for ${dcr.entityType} ${dcr.entityId}`,
    newValues:   { requestedStartDate: dcr.requestedStartDate, requestedEndDate: dcr.requestedEndDate, comment },
    req,
  });

  return db.DateChangeRequest.findByPk(requestId, { include: DCR_INCLUDE });
}

/**
 * Manager rejects a pending request ? no date changes applied.
 */
async function rejectDateChange({ requestingUser, requestId, comment, req }) {
  if (requestingUser.roleLevel > 2) {
    forbidden('Only Manager level or above (level = 3) can reject date-change requests');
  }

  const dcr = await db.DateChangeRequest.findByPk(requestId);
  if (!dcr) notFound('Date-change request');
  if (dcr.status !== DATE_CHANGE_STATUS.PENDING) {
    conflict(`This request has already been ${dcr.status.toLowerCase()}`);
  }

  await dcr.update({
    status:        DATE_CHANGE_STATUS.REJECTED,
    reviewedById:  requestingUser.id,
    reviewComment: comment || null,
    reviewedAt:    new Date(),
  });

  await _notify([dcr.requestedById], {
    type:       'DATE_CHANGE_REJECTED',
    title:      'Date Change Rejected',
    message:    `Your date-change request on ${dcr.entityType} was rejected${comment ? `: "${comment}"` : '.'}`,
    entityType: 'DateChangeRequest',
    entityId:   dcr.id,
  });

  await writeAuditLog({
    performedBy: requestingUser,
    action:      AUDIT_ACTION.DATE_CHANGE_REJECTED,
    category:    AUDIT_CATEGORY.TASK,
    entity:      dcr.entityType,
    entityId:    dcr.entityId,
    description: `Manager rejected date-change request ${requestId} for ${dcr.entityType} ${dcr.entityId}` +
                 (comment ? `: "${comment}"` : ''),
    req,
  });

  return db.DateChangeRequest.findByPk(requestId, { include: DCR_INCLUDE });
}

/**
 * List date-change requests.
 * Managers (level <= 3) see all; others see only their own.
 */
async function getDateChangeRequests({ requestingUser, entityType, entityId, status }) {
  const where = {};
  if (entityType) where.entityType = entityType;
  if (entityId)   where.entityId   = entityId;
  if (status)     where.status     = status;

  // Non-managers can only see their own requests
  if (requestingUser.roleLevel > 2) {
    where.requestedById = requestingUser.id;
  }

  return db.DateChangeRequest.findAll({
    where,
    include: DCR_INCLUDE,
    order: [['created_at', 'DESC']],
  });
}

module.exports = {
  requestDateChange,
  approveDateChange,
  rejectDateChange,
  getDateChangeRequests,
};
