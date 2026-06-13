'use strict';

const { db }            = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const {
  HTTP_STATUS, AUDIT_CATEGORY, AUDIT_ACTION,
  TASK_STATUS, TASK_CREATE_MIN_LEVEL, TASK_MANAGE_MIN_LEVEL,
} = require('../constants');

// ─── Selects ──────────────────────────────────────────────────────────────────
const USER_SNAP = { select: { id: true, firstName: true, lastName: true, email: true, role: { select: { name: true, displayName: true } } } };

const TASK_SELECT = {
  id: true, title: true, description: true, priority: true, status: true,
  startDate: true, dueDate: true, estimatedHours: true, actualHours: true,
  completionPercent: true, managerRemark: true, managerActionAt: true,
  submittedAt: true, approvedAt: true, completedAt: true,
  createdAt: true, updatedAt: true,
  createdBy: USER_SNAP,
  manager:   USER_SNAP,
  assignments: {
    select: {
      id: true, assignedAt: true,
      teamLead: USER_SNAP,
      assignedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  _count: { select: { subTasks: true, comments: true, attachments: true } },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function assertLevel(user, minLevel, msg) {
  if (user.roleLevel < minLevel) {
    const err = new Error(msg || `Minimum access level ${minLevel} required`);
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }
}

function notFound(msg = 'Task not found') {
  const err = new Error(msg);
  err.statusCode = HTTP_STATUS.NOT_FOUND;
  throw err;
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Create main task (Admin/BOSS — level 5)
 */
async function createTask({ requestingUser, title, description, priority, startDate, dueDate, estimatedHours, managerId, req }) {
  assertLevel(requestingUser, TASK_CREATE_MIN_LEVEL, 'Only Admin (level 5) can create main tasks');

  // Validate manager exists and has level 4
  if (managerId) {
    const mgr = await db.user.findUnique({ where: { id: managerId, deletedAt: null }, select: { id: true, role: { select: { accessLevel: true } } } });
    if (!mgr) notFound('Assigned manager not found');
    if (mgr.role.accessLevel < TASK_MANAGE_MIN_LEVEL) {
      const err = new Error('Assigned user must be a Manager (level 4+)');
      err.statusCode = HTTP_STATUS.BAD_REQUEST;
      throw err;
    }
  }

  const task = await db.task.create({
    data: {
      title, description, priority: priority || 'MEDIUM',
      startDate: startDate ? new Date(startDate) : null,
      dueDate:   dueDate   ? new Date(dueDate)   : null,
      estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
      createdById: requestingUser.id,
      managerId:   managerId || null,
      status: managerId ? TASK_STATUS.ASSIGNED : TASK_STATUS.CREATED,
    },
    select: TASK_SELECT,
  });

  await writeAuditLog({
    performedBy: requestingUser,
    action:      AUDIT_ACTION.TASK_CREATED,
    category:    AUDIT_CATEGORY.TASK,
    entity:      'Task', entityId: task.id, entityName: task.title,
    description: `Admin created task "${task.title}"${managerId ? ` and assigned to manager` : ''}`,
    newValues:   { title, priority, dueDate, managerId },
    req,
  });

  if (managerId) {
    await _createNotifications([managerId], {
      type:       'TASK_ASSIGNED',
      title:      'New Task Assigned',
      message:    `You have been assigned a new task: "${task.title}"`,
      entityType: 'Task', entityId: task.id,
    });
  }

  return task;
}

/**
 * List tasks — scoped by role
 * BOSS: all | Manager: assigned to them | Team Lead: assigned to them | Member: tasks their subtasks belong to
 */
async function getTasks({ requestingUser, page = 1, limit = 20, status, priority, search }) {
  page  = parseInt(page);
  limit = parseInt(limit);
  const skip = (page - 1) * limit;

  let where = { deletedAt: null };

  if (requestingUser.roleLevel >= 5) {
    // BOSS sees all
  } else if (requestingUser.roleLevel >= TASK_MANAGE_MIN_LEVEL) {
    // Manager sees tasks assigned to them
    where.managerId = requestingUser.id;
  } else if (requestingUser.roleLevel >= 2) {
    // Team Lead sees tasks they're assigned to
    where.assignments = { some: { teamLeadId: requestingUser.id } };
  } else {
    // Member sees tasks their sub-tasks belong to
    where.subTasks = { some: { assignments: { some: { memberId: requestingUser.id } } } };
  }

  if (status)   where.status   = status;
  if (priority) where.priority = priority;
  if (search)   where.OR = [
    { title:       { contains: search, mode: 'insensitive' } },
    { description: { contains: search, mode: 'insensitive' } },
  ];

  const [tasks, total] = await Promise.all([
    db.task.findMany({ where, select: TASK_SELECT, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    db.task.count({ where }),
  ]);

  return { tasks, total };
}

/**
 * Get single task with full details + sub-tasks
 */
async function getTaskById({ id, requestingUser }) {
  const task = await db.task.findUnique({
    where: { id, deletedAt: null },
    select: {
      ...TASK_SELECT,
      subTasks: {
        select: {
          id: true, title: true, description: true, priority: true, status: true,
          startDate: true, dueDate: true, estimatedHours: true, actualHours: true,
          startedAt: true, completedAt: true, submittedAt: true,
          createdBy: USER_SNAP,
          assignments: {
            select: {
              id: true, contribution: true,
              member: USER_SNAP,
            },
          },
          dependencies: {
            select: { prerequisiteId: true, prerequisite: { select: { id: true, title: true, status: true } } },
          },
          _count: { select: { comments: true, ratings: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!task) notFound();
  _assertCanViewTask(requestingUser, task);
  return task;
}

/**
 * Update task metadata (Admin only, before it moves past IN_PROGRESS)
 */
async function updateTask({ id, requestingUser, data, req }) {
  assertLevel(requestingUser, TASK_CREATE_MIN_LEVEL, 'Only Admin can update task details');

  const task = await db.task.findUnique({ where: { id, deletedAt: null }, select: { id: true, title: true, status: true } });
  if (!task) notFound();

  const allowed = ['title', 'description', 'priority', 'startDate', 'dueDate', 'estimatedHours'];
  const updateData = {};
  allowed.forEach((f) => { if (data[f] !== undefined) updateData[f] = data[f]; });

  const updated = await db.task.update({ where: { id }, data: updateData, select: TASK_SELECT });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.TASK_UPDATED,
    category: AUDIT_CATEGORY.TASK, entity: 'Task', entityId: id, entityName: task.title,
    description: `Updated task "${task.title}"`, oldValues: task, newValues: updateData, req,
  });

  return updated;
}

/**
 * Assign task to Manager (Admin only)
 */
async function assignManager({ id, requestingUser, managerId, req }) {
  assertLevel(requestingUser, TASK_CREATE_MIN_LEVEL, 'Only Admin can assign managers');

  const [task, mgr] = await Promise.all([
    db.task.findUnique({ where: { id, deletedAt: null }, select: { id: true, title: true, status: true, managerId: true } }),
    db.user.findUnique({ where: { id: managerId, deletedAt: null }, select: { id: true, firstName: true, lastName: true, role: { select: { accessLevel: true } } } }),
  ]);

  if (!task) notFound();
  if (!mgr)  notFound('Manager not found');
  if (mgr.role.accessLevel < TASK_MANAGE_MIN_LEVEL) {
    const err = new Error('Assigned user must be a Manager (level 4+)'); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  const updated = await db.task.update({
    where: { id },
    data:  { managerId, status: TASK_STATUS.ASSIGNED },
    select: TASK_SELECT,
  });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.TASK_ASSIGNED,
    category: AUDIT_CATEGORY.TASK, entity: 'Task', entityId: id, entityName: task.title,
    targetUserId: managerId, targetUserName: `${mgr.firstName} ${mgr.lastName}`,
    description: `Assigned task "${task.title}" to manager "${mgr.firstName} ${mgr.lastName}"`, req,
  });

  await _createNotifications([managerId], {
    type: 'TASK_ASSIGNED', title: 'New Task Assigned',
    message: `You have been assigned task: "${task.title}"`, entityType: 'Task', entityId: id,
  });

  return updated;
}

/**
 * Manager accepts task
 */
async function acceptTask({ id, requestingUser, remark, req }) {
  const task = await _getManagerTask(id, requestingUser);
  _assertStatus(task, [TASK_STATUS.ASSIGNED], 'Task must be in ASSIGNED status to accept');

  const updated = await db.task.update({
    where: { id },
    data:  { status: TASK_STATUS.ACCEPTED, managerRemark: remark || null, managerActionAt: new Date() },
    select: TASK_SELECT,
  });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.TASK_ACCEPTED,
    category: AUDIT_CATEGORY.TASK, entity: 'Task', entityId: id, entityName: task.title,
    description: `Manager accepted task "${task.title}"${remark ? `: "${remark}"` : ''}`, req,
  });

  await _createNotifications([task.createdById], {
    type: 'TASK_ACCEPTED', title: 'Task Accepted',
    message: `Your task "${task.title}" was accepted by the manager`, entityType: 'Task', entityId: id,
  });

  return updated;
}

/**
 * Manager rejects task
 */
async function rejectTask({ id, requestingUser, remark, req }) {
  const task = await _getManagerTask(id, requestingUser);
  _assertStatus(task, [TASK_STATUS.ASSIGNED], 'Task must be in ASSIGNED status to reject');

  if (!remark?.trim()) {
    const err = new Error('Rejection remark is required'); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  const updated = await db.task.update({
    where: { id },
    data:  { status: TASK_STATUS.REJECTED, managerRemark: remark, managerActionAt: new Date() },
    select: TASK_SELECT,
  });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.TASK_REJECTED,
    category: AUDIT_CATEGORY.TASK, entity: 'Task', entityId: id, entityName: task.title,
    description: `Manager rejected task "${task.title}": "${remark}"`, req,
  });

  await _createNotifications([task.createdById], {
    type: 'TASK_REJECTED', title: 'Task Rejected',
    message: `Your task "${task.title}" was rejected: "${remark}"`, entityType: 'Task', entityId: id,
  });

  return updated;
}

/**
 * Manager assigns task to one or more Team Leads
 */
async function assignTeamLeads({ id, requestingUser, teamLeadIds, req }) {
  const task = await _getManagerTask(id, requestingUser);
  _assertStatus(task, [TASK_STATUS.ACCEPTED, TASK_STATUS.IN_PROGRESS], 'Task must be ACCEPTED before assigning team leads');

  if (!Array.isArray(teamLeadIds) || teamLeadIds.length === 0) {
    const err = new Error('At least one Team Lead ID is required'); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  // Validate all team leads exist and have level 2
  const leads = await db.user.findMany({
    where: { id: { in: teamLeadIds }, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, role: { select: { accessLevel: true } } },
  });

  if (leads.length !== teamLeadIds.length) notFound('One or more Team Leads not found');
  const invalidLead = leads.find((l) => l.role.accessLevel < 2);
  if (invalidLead) {
    const err = new Error(`User "${invalidLead.firstName}" does not have Team Lead level`); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  // Upsert assignments
  await db.$transaction([
    ...teamLeadIds.map((tlId) => db.taskAssignment.upsert({
      where:  { taskId_teamLeadId: { taskId: id, teamLeadId: tlId } },
      create: { taskId: id, teamLeadId: tlId, assignedById: requestingUser.id },
      update: { assignedById: requestingUser.id, assignedAt: new Date() },
    })),
    db.task.update({ where: { id }, data: { status: TASK_STATUS.IN_PROGRESS } }),
  ]);

  const updated = await db.task.findUnique({ where: { id }, select: TASK_SELECT });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.TASK_LEAD_ASSIGNED,
    category: AUDIT_CATEGORY.TASK, entity: 'Task', entityId: id, entityName: task.title,
    description: `Assigned task "${task.title}" to ${leads.length} team lead(s): ${leads.map((l) => l.firstName).join(', ')}`,
    newValues: { teamLeadIds }, req,
  });

  await _createNotifications(teamLeadIds, {
    type: 'TASK_ASSIGNED', title: 'Task Assigned to You',
    message: `You have been assigned task: "${task.title}"`, entityType: 'Task', entityId: id,
  });

  return updated;
}

/**
 * Team Lead submits completed task to Manager
 */
async function submitTask({ id, requestingUser, req }) {
  const task = await _getTeamLeadTask(id, requestingUser);
  _assertStatus(task, [TASK_STATUS.IN_PROGRESS], 'Task must be IN_PROGRESS to submit');

  // All sub-tasks must be approved
  const pendingSubTasks = await db.subTask.count({
    where: { taskId: id, status: { notIn: ['TEAM_LEAD_APPROVED', 'FINAL_APPROVED'] } },
  });

  if (pendingSubTasks > 0) {
    const err = new Error(`${pendingSubTasks} sub-task(s) are not yet approved. Complete all sub-tasks before submitting.`);
    err.statusCode = HTTP_STATUS.CONFLICT;
    throw err;
  }

  const updated = await db.task.update({
    where: { id },
    data:  { status: TASK_STATUS.SUBMITTED, submittedAt: new Date() },
    select: TASK_SELECT,
  });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.TASK_SUBMITTED,
    category: AUDIT_CATEGORY.TASK, entity: 'Task', entityId: id, entityName: task.title,
    description: `Team Lead submitted task "${task.title}" for manager approval`, req,
  });

  if (task.managerId) {
    await _createNotifications([task.managerId], {
      type: 'TASK_SUBMITTED', title: 'Task Submitted for Approval',
      message: `Task "${task.title}" has been submitted for your approval`, entityType: 'Task', entityId: id,
    });
  }

  return updated;
}

/**
 * Manager approves completed task
 */
async function approveTask({ id, requestingUser, remark, req }) {
  const task = await _getManagerTask(id, requestingUser);
  _assertStatus(task, [TASK_STATUS.SUBMITTED, TASK_STATUS.MANAGER_REVIEW], 'Task must be SUBMITTED to approve');

  const updated = await db.task.update({
    where: { id },
    data:  { status: TASK_STATUS.COMPLETED, managerRemark: remark || null, approvedAt: new Date(), completedAt: new Date() },
    select: TASK_SELECT,
  });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.TASK_APPROVED,
    category: AUDIT_CATEGORY.TASK, entity: 'Task', entityId: id, entityName: task.title,
    description: `Manager approved and completed task "${task.title}"`, req,
  });

  // Notify all team leads
  const assignedLeadIds = task.assignments.map((a) => a.teamLeadId);
  await _createNotifications([task.createdById, ...assignedLeadIds], {
    type: 'TASK_APPROVED', title: 'Task Approved!',
    message: `Task "${task.title}" has been approved and marked complete`, entityType: 'Task', entityId: id,
  });

  return updated;
}

/**
 * Reopen a rejected/completed task (Admin or Manager)
 */
async function reopenTask({ id, requestingUser, remark, req }) {
  assertLevel(requestingUser, TASK_MANAGE_MIN_LEVEL, 'Manager level required to reopen tasks');

  const task = await db.task.findUnique({ where: { id, deletedAt: null }, select: { id: true, title: true, status: true, managerId: true, createdById: true, assignments: { select: { teamLeadId: true } } } });
  if (!task) notFound();

  _assertStatus(task, [TASK_STATUS.REJECTED, TASK_STATUS.COMPLETED, TASK_STATUS.SUBMITTED], 'Task cannot be reopened in its current state');

  const updated = await db.task.update({
    where: { id },
    data:  { status: TASK_STATUS.REOPENED, managerRemark: remark || null },
    select: TASK_SELECT,
  });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.TASK_REOPENED,
    category: AUDIT_CATEGORY.TASK, entity: 'Task', entityId: id, entityName: task.title,
    description: `Reopened task "${task.title}"${remark ? `: "${remark}"` : ''}`, req,
  });

  return updated;
}

/**
 * Soft-delete task (Admin only)
 */
async function deleteTask({ id, requestingUser, req }) {
  assertLevel(requestingUser, TASK_CREATE_MIN_LEVEL, 'Only Admin can delete tasks');

  const task = await db.task.findUnique({ where: { id, deletedAt: null }, select: { id: true, title: true } });
  if (!task) notFound();

  await db.task.update({ where: { id }, data: { deletedAt: new Date() } });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.TASK_DELETED,
    category: AUDIT_CATEGORY.TASK, entity: 'Task', entityId: id, entityName: task.title,
    description: `Deleted task "${task.title}"`, req,
  });
}

/**
 * Get tasks summary/stats for dashboard
 */
async function getTaskStats({ requestingUser }) {
  let where = { deletedAt: null };

  if (requestingUser.roleLevel >= 5) { /* all */ }
  else if (requestingUser.roleLevel >= 4) { where.managerId = requestingUser.id; }
  else if (requestingUser.roleLevel >= 2) { where.assignments = { some: { teamLeadId: requestingUser.id } }; }
  else { where.subTasks = { some: { assignments: { some: { memberId: requestingUser.id } } } }; }

  const [byStatus, overdue, total] = await Promise.all([
    db.task.groupBy({ by: ['status'], where, _count: { id: true } }),
    db.task.count({ where: { ...where, dueDate: { lt: new Date() }, status: { notIn: ['COMPLETED', 'REJECTED'] } } }),
    db.task.count({ where }),
  ]);

  return {
    total,
    overdue,
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.id })),
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _getManagerTask(id, user) {
  assertLevel(user, TASK_MANAGE_MIN_LEVEL, 'Manager level required');
  const task = await db.task.findUnique({ where: { id, deletedAt: null }, select: { id: true, title: true, status: true, managerId: true, createdById: true, assignments: { select: { teamLeadId: true } } } });
  if (!task) notFound();
  if (task.managerId !== user.id && user.roleLevel < 5) {
    const err = new Error('Access denied — not your task'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }
  return task;
}

async function _getTeamLeadTask(id, user) {
  const task = await db.task.findUnique({
    where: { id, deletedAt: null, assignments: { some: { teamLeadId: user.id } } },
    select: { id: true, title: true, status: true, managerId: true, createdById: true, assignments: { select: { teamLeadId: true } } },
  });
  if (!task) notFound('Task not found or not assigned to you');
  return task;
}

function _assertStatus(task, allowedStatuses, msg) {
  if (!allowedStatuses.includes(task.status)) {
    const err = new Error(msg || `Invalid task status: ${task.status}`);
    err.statusCode = HTTP_STATUS.CONFLICT;
    throw err;
  }
}

function _assertCanViewTask(user, task) {
  if (user.roleLevel >= 5) return;
  if (user.roleLevel >= 4 && task.manager?.id === user.id) return;
  if (task.assignments?.some((a) => a.teamLead?.id === user.id)) return;
  if (task.subTasks?.some((st) => st.assignments?.some((sa) => sa.member?.id === user.id))) return;
  const err = new Error('Access denied'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
}

async function _createNotifications(userIds, { type, title, message, entityType, entityId }) {
  if (!userIds?.length) return;
  const unique = [...new Set(userIds)];
  try {
    await db.notification.createMany({
      data: unique.map((userId) => ({ userId, type, title, message, entityType, entityId })),
      skipDuplicates: true,
    });
  } catch { /* non-fatal */ }
}

module.exports = {
  createTask, getTasks, getTaskById, updateTask,
  assignManager, acceptTask, rejectTask,
  assignTeamLeads, submitTask, approveTask,
  reopenTask, deleteTask, getTaskStats,
};
