'use strict';

const { Op, fn, col, literal } = require('sequelize');
const { db }            = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const {
  HTTP_STATUS, AUDIT_CATEGORY, AUDIT_ACTION,
  TASK_STATUS, TASK_CREATE_MIN_LEVEL, TASK_MANAGE_MIN_LEVEL,
} = require('../constants');

// ─── Includes ─────────────────────────────────────────────────────────────────
const USER_SNAP_INCLUDE = (as) => ({
  model: db.User, as,
  attributes: ['id', 'firstName', 'lastName', 'email'],
  include: [{ model: db.RoleDefinition, as: 'role', attributes: ['name', 'displayName'] }],
});

const TASK_INCLUDE = [
  USER_SNAP_INCLUDE('createdBy'),
  USER_SNAP_INCLUDE('manager'),
  {
    model: db.TaskAssignment, as: 'assignments',
    include: [USER_SNAP_INCLUDE('teamLead'), { model: db.User, as: 'assignedBy', attributes: ['id', 'firstName', 'lastName'] }],
  },
];

const TASK_ATTRS = [
  'id', 'title', 'description', 'priority', 'status',
  'startDate', 'dueDate', 'estimatedHours', 'actualHours', 'completionPercent',
  'managerRemark', 'managerActionAt', 'submittedAt', 'approvedAt', 'completedAt',
  'createdById', 'managerId', 'createdAt', 'updatedAt',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function assertLevel(user, min, msg) {
  if (user.roleLevel < min) {
    const err = new Error(msg || `Minimum access level ${min} required`);
    err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }
}
function notFound(msg = 'Task not found') {
  const err = new Error(msg); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
}
function assertStatus(task, allowed, msg) {
  if (!allowed.includes(task.status)) {
    const err = new Error(msg || `Invalid task status: ${task.status}`);
    err.statusCode = HTTP_STATUS.CONFLICT; throw err;
  }
}

async function getFullTask(id) {
  return db.Task.findOne({
    where: { id, deletedAt: null },
    attributes: TASK_ATTRS,
    include: TASK_INCLUDE,
  });
}

async function _createNotifications(userIds, { type, title, message, entityType, entityId }) {
  if (!userIds?.length) return;
  const unique = [...new Set(userIds.filter(Boolean))];
  try {
    await db.Notification.bulkCreate(
      unique.map(userId => ({ userId, type, title, message, entityType, entityId })),
      { ignoreDuplicates: true }
    );
  } catch { /* non-fatal */ }
}

// ─── Service Functions ────────────────────────────────────────────────────────

async function createTask({ requestingUser, title, description, priority, startDate, dueDate, estimatedHours, managerId, req }) {
  assertLevel(requestingUser, TASK_CREATE_MIN_LEVEL, 'Only Admin (level 5) can create main tasks');

  if (managerId) {
    const mgr = await db.User.findOne({
      where: { id: managerId, deletedAt: null },
      attributes: ['id'],
      include: [{ model: db.RoleDefinition, as: 'role', attributes: ['accessLevel'] }],
    });
    if (!mgr) notFound('Assigned manager not found');
    if (mgr.role.accessLevel < TASK_MANAGE_MIN_LEVEL) {
      const err = new Error('Assigned user must be level 3+'); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
    }
  }

  const task = await db.Task.create({
    title, description, priority: priority || 'MEDIUM',
    startDate: startDate ? new Date(startDate) : null,
    dueDate:   dueDate   ? new Date(dueDate)   : null,
    estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
    createdById: requestingUser.id,
    managerId:   managerId || null,
    status: managerId ? TASK_STATUS.ASSIGNED : TASK_STATUS.CREATED,
  });

  const created = await getFullTask(task.id);

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.TASK_CREATED, category: AUDIT_CATEGORY.TASK,
    entity: 'Task', entityId: task.id, entityName: task.title,
    description: `Admin created task "${task.title}"${managerId ? ` and assigned to manager` : ''}`,
    newValues: { title, priority, dueDate, managerId }, req,
  });

  if (managerId) {
    await _createNotifications([managerId], {
      type: 'TASK_ASSIGNED', title: 'New Task Assigned',
      message: `You have been assigned a new task: "${task.title}"`, entityType: 'Task', entityId: task.id,
    });
  }

  return created;
}

async function getTasks({ requestingUser, page = 1, limit = 20, status, priority, search }) {
  page  = parseInt(page);
  limit = parseInt(limit);

  const where = { deletedAt: null };

  if (requestingUser.roleLevel > 3) {
    // Can see all tasks
  } else {
    const taskIds = await _getAccessibleTaskIds(requestingUser);
    where.id = { [Op.in]: taskIds };
  }

  if (status)   where.status   = status;
  if (priority) where.priority = priority;
  if (search) {
    where[Op.or] = [
      { title:       { [Op.like]: `%${search}%` } },
      { description: { [Op.like]: `%${search}%` } },
    ];
  }

  const [total, tasks] = await Promise.all([
    db.Task.count({ where }),
    db.Task.findAll({
      where, attributes: TASK_ATTRS, include: TASK_INCLUDE,
      offset: (page - 1) * limit, limit,
      order: [['createdAt', 'DESC']],
      distinct: true,
    }),
  ]);

  return { tasks, total };
}

async function getTaskById({ id, requestingUser }) {
  const task = await db.Task.findOne({
    where: { id, deletedAt: null },
    attributes: TASK_ATTRS,
    include: [
      ...TASK_INCLUDE,
      {
        model: db.SubTask, as: 'subTasks',
        include: [
          USER_SNAP_INCLUDE('createdBy'),
          {
            model: db.SubTaskAssignment, as: 'assignments',
            include: [USER_SNAP_INCLUDE('member')],
          },
          {
            model: db.SubTaskDependency, as: 'dependencies',
            include: [{ model: db.SubTask, as: 'prerequisite', attributes: ['id', 'title', 'status'] }],
          },
        ],
        order: [['createdAt', 'ASC']],
      },
    ],
  });

  if (!task) notFound();
  _assertCanViewTask(requestingUser, task);
  return task;
}

async function updateTask({ id, requestingUser, data, req }) {
  assertLevel(requestingUser, TASK_CREATE_MIN_LEVEL, 'Only Admin can update task details');

  const task = await db.Task.findOne({ where: { id, deletedAt: null }, attributes: ['id', 'title', 'status'] });
  if (!task) notFound();

  const allowed = ['title', 'description', 'priority', 'startDate', 'dueDate', 'estimatedHours'];
  const updateData = {};
  allowed.forEach(f => { if (data[f] !== undefined) updateData[f] = data[f]; });

  await task.update(updateData);
  const updated = await getFullTask(id);

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.TASK_UPDATED, category: AUDIT_CATEGORY.TASK,
    entity: 'Task', entityId: id, entityName: task.title,
    description: `Updated task "${task.title}"`, oldValues: task.toJSON(), newValues: updateData, req,
  });

  return updated;
}

async function assignManager({ id, requestingUser, managerId, req }) {
  assertLevel(requestingUser, TASK_CREATE_MIN_LEVEL, 'Only Admin can assign managers');

  const [task, mgr] = await Promise.all([
    db.Task.findOne({ where: { id, deletedAt: null }, attributes: ['id', 'title', 'status', 'managerId'] }),
    db.User.findOne({
      where: { id: managerId, deletedAt: null }, attributes: ['id', 'firstName', 'lastName'],
      include: [{ model: db.RoleDefinition, as: 'role', attributes: ['accessLevel'] }],
    }),
  ]);

  if (!task) notFound();
  if (!mgr)  notFound('Manager not found');
  if (mgr.role.accessLevel < TASK_MANAGE_MIN_LEVEL) {
    const err = new Error('Assigned user must be level 3+'); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  await task.update({ managerId, status: TASK_STATUS.ASSIGNED });
  const updated = await getFullTask(id);

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.TASK_ASSIGNED, category: AUDIT_CATEGORY.TASK,
    entity: 'Task', entityId: id, entityName: task.title,
    targetUserId: managerId, targetUserName: `${mgr.firstName} ${mgr.lastName}`,
    description: `Assigned task "${task.title}" to manager "${mgr.firstName} ${mgr.lastName}"`, req,
  });

  await _createNotifications([managerId], {
    type: 'TASK_ASSIGNED', title: 'New Task Assigned',
    message: `You have been assigned task: "${task.title}"`, entityType: 'Task', entityId: id,
  });

  return updated;
}

async function acceptTask({ id, requestingUser, remark, req }) {
  const task = await _getManagerTask(id, requestingUser);
  assertStatus(task, [TASK_STATUS.ASSIGNED], 'Task must be in ASSIGNED status to accept');

  await db.Task.update(
    { status: TASK_STATUS.ACCEPTED, managerRemark: remark || null, managerActionAt: new Date() },
    { where: { id } }
  );
  const updated = await getFullTask(id);

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.TASK_ACCEPTED, category: AUDIT_CATEGORY.TASK,
    entity: 'Task', entityId: id, entityName: task.title,
    description: `Manager accepted task "${task.title}"${remark ? `: "${remark}"` : ''}`, req,
  });
  await _createNotifications([task.createdById], {
    type: 'TASK_ACCEPTED', title: 'Task Accepted',
    message: `Your task "${task.title}" was accepted by the manager`, entityType: 'Task', entityId: id,
  });

  return updated;
}

async function rejectTask({ id, requestingUser, remark, req }) {
  const task = await _getManagerTask(id, requestingUser);
  assertStatus(task, [TASK_STATUS.ASSIGNED], 'Task must be in ASSIGNED status to reject');

  if (!remark?.trim()) {
    const err = new Error('Rejection remark is required'); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  await db.Task.update(
    { status: TASK_STATUS.REJECTED, managerRemark: remark, managerActionAt: new Date() },
    { where: { id } }
  );
  const updated = await getFullTask(id);

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.TASK_REJECTED, category: AUDIT_CATEGORY.TASK,
    entity: 'Task', entityId: id, entityName: task.title,
    description: `Manager rejected task "${task.title}": "${remark}"`, req,
  });
  await _createNotifications([task.createdById], {
    type: 'TASK_REJECTED', title: 'Task Rejected',
    message: `Your task "${task.title}" was rejected: "${remark}"`, entityType: 'Task', entityId: id,
  });

  return updated;
}

async function assignTeamLeads({ id, requestingUser, teamLeadIds, req }) {
  const task = await _getManagerTask(id, requestingUser);
  assertStatus(task, [TASK_STATUS.ACCEPTED, TASK_STATUS.IN_PROGRESS], 'Task must be ACCEPTED before assigning team leads');

  if (!Array.isArray(teamLeadIds) || teamLeadIds.length === 0) {
    const err = new Error('At least one Team Lead ID is required'); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  const leads = await db.User.findAll({
    where: { id: { [Op.in]: teamLeadIds }, deletedAt: null },
    attributes: ['id', 'firstName', 'lastName'],
    include: [{ model: db.RoleDefinition, as: 'role', attributes: ['accessLevel'] }],
  });

  if (leads.length !== teamLeadIds.length) notFound('One or more Team Leads not found');
  const invalidLead = leads.find(l => l.role.accessLevel < 2);
  if (invalidLead) {
    const err = new Error(`User "${invalidLead.firstName}" does not have Team Lead level`); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  // Upsert assignments
  for (const tlId of teamLeadIds) {
    await db.TaskAssignment.findOrCreate({
      where: { taskId: id, teamLeadId: tlId },
      defaults: { taskId: id, teamLeadId: tlId, assignedById: requestingUser.id },
    });
  }
  await db.Task.update({ status: TASK_STATUS.IN_PROGRESS }, { where: { id } });

  const updated = await getFullTask(id);

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.TASK_LEAD_ASSIGNED, category: AUDIT_CATEGORY.TASK,
    entity: 'Task', entityId: id, entityName: task.title,
    description: `Assigned task "${task.title}" to ${leads.length} team lead(s): ${leads.map(l => l.firstName).join(', ')}`,
    newValues: { teamLeadIds }, req,
  });
  await _createNotifications(teamLeadIds, {
    type: 'TASK_ASSIGNED', title: 'Task Assigned to You',
    message: `You have been assigned task: "${task.title}"`, entityType: 'Task', entityId: id,
  });

  return updated;
}

async function submitTask({ id, requestingUser, req }) {
  // Allow: assigned team leads OR the task creator (e.g. Admin who created it)
  let task;
  const directTask = await db.Task.findOne({
    where: { id, deletedAt: null },
    attributes: ['id', 'title', 'status', 'managerId', 'createdById'],
    include: [{ model: db.TaskAssignment, as: 'assignments', attributes: ['teamLeadId'] }],
  });
  if (!directTask) notFound();

  const isCreator    = directTask.createdById === requestingUser.id;
  const isAssignedTL = directTask.assignments?.some(a => a.teamLeadId === requestingUser.id);
  const isHighLevel  = requestingUser.roleLevel >= 5; // Admin/Boss can always submit

  if (!isCreator && !isAssignedTL && !isHighLevel) {
    const err = new Error('Access denied — you must be the task creator or an assigned team lead to submit');
    err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }
  task = directTask;

  assertStatus(task, [TASK_STATUS.IN_PROGRESS], 'Task must be IN_PROGRESS to submit');

  const pendingSubTasks = await db.SubTask.count({
    where: { taskId: id, status: { [Op.notIn]: ['TEAM_LEAD_APPROVED', 'FINAL_APPROVED'] } },
  });
  if (pendingSubTasks > 0) {
    const err = new Error(`${pendingSubTasks} sub-task(s) are not yet approved.`);
    err.statusCode = HTTP_STATUS.CONFLICT; throw err;
  }

  await db.Task.update({ status: TASK_STATUS.SUBMITTED, submittedAt: new Date() }, { where: { id } });
  const updated = await getFullTask(id);

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.TASK_SUBMITTED, category: AUDIT_CATEGORY.TASK,
    entity: 'Task', entityId: id, entityName: task.title,
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

async function approveTask({ id, requestingUser, remark, req }) {
  const task = await _getManagerTask(id, requestingUser);
  assertStatus(task, [TASK_STATUS.SUBMITTED, TASK_STATUS.MANAGER_REVIEW], 'Task must be SUBMITTED to approve');

  await db.Task.update(
    { status: TASK_STATUS.COMPLETED, managerRemark: remark || null, approvedAt: new Date(), completedAt: new Date() },
    { where: { id } }
  );
  const updated = await getFullTask(id);

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.TASK_APPROVED, category: AUDIT_CATEGORY.TASK,
    entity: 'Task', entityId: id, entityName: task.title,
    description: `Manager approved and completed task "${task.title}"`, req,
  });

  const assignments = await db.TaskAssignment.findAll({ where: { taskId: id }, attributes: ['teamLeadId'] });
  const leadIds = assignments.map(a => a.teamLeadId);
  await _createNotifications([task.createdById, ...leadIds], {
    type: 'TASK_APPROVED', title: 'Task Approved!',
    message: `Task "${task.title}" has been approved and marked complete`, entityType: 'Task', entityId: id,
  });

  return updated;
}

async function reopenTask({ id, requestingUser, remark, req }) {
  assertLevel(requestingUser, TASK_MANAGE_MIN_LEVEL, 'Manager level required to reopen tasks');

  const task = await db.Task.findOne({ where: { id, deletedAt: null }, attributes: ['id', 'title', 'status', 'managerId', 'createdById'] });
  if (!task) notFound();
  assertStatus(task, [TASK_STATUS.REJECTED, TASK_STATUS.COMPLETED, TASK_STATUS.SUBMITTED], 'Task cannot be reopened in its current state');

  await task.update({ status: TASK_STATUS.REOPENED, managerRemark: remark || null });
  const updated = await getFullTask(id);

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.TASK_REOPENED, category: AUDIT_CATEGORY.TASK,
    entity: 'Task', entityId: id, entityName: task.title,
    description: `Reopened task "${task.title}"${remark ? `: "${remark}"` : ''}`, req,
  });

  return updated;
}

async function deleteTask({ id, requestingUser, req }) {
  assertLevel(requestingUser, TASK_CREATE_MIN_LEVEL, 'Only Admin can delete tasks');

  const task = await db.Task.findOne({ where: { id, deletedAt: null }, attributes: ['id', 'title'] });
  if (!task) notFound();

  await task.update({ deletedAt: new Date() });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.TASK_DELETED, category: AUDIT_CATEGORY.TASK,
    entity: 'Task', entityId: id, entityName: task.title,
    description: `Deleted task "${task.title}"`, req,
  });
}

async function getTaskStats({ requestingUser }) {
  const where = { deletedAt: null };
  if (requestingUser.roleLevel > 3) {
    // Can see all tasks
  } else {
    const taskIds = await _getAccessibleTaskIds(requestingUser);
    where.id = { [Op.in]: taskIds };
  }

  const [byStatus, overdueCount, total] = await Promise.all([
    db.Task.findAll({
      where, attributes: ['status', [fn('COUNT', col('id')), 'count']],
      group: ['status'], raw: true,
    }),
    db.Task.count({
      where: { ...where, dueDate: { [Op.lt]: new Date() }, status: { [Op.notIn]: ['COMPLETED', 'REJECTED'] } },
    }),
    db.Task.count({ where }),
  ]);

  return {
    total,
    overdue: overdueCount,
    byStatus: byStatus.map(s => ({ status: s.status, count: parseInt(s.count) })),
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _getManagerTask(id, user) {
  assertLevel(user, TASK_MANAGE_MIN_LEVEL, 'Manager level required');
  const task = await db.Task.findOne({
    where: { id, deletedAt: null },
    attributes: ['id', 'title', 'status', 'managerId', 'createdById'],
    include: [{ model: db.TaskAssignment, as: 'assignments', attributes: ['teamLeadId'] }],
  });
  if (!task) notFound();
  if (task.managerId !== user.id && user.roleLevel < 5) {
    const err = new Error('Access denied — not your task'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }
  return task;
}

async function _getTeamLeadTask(id, user) {
  const assignment = await db.TaskAssignment.findOne({ where: { taskId: id, teamLeadId: user.id } });
  if (!assignment) notFound('Task not found or not assigned to you');
  const task = await db.Task.findOne({
    where: { id, deletedAt: null },
    attributes: ['id', 'title', 'status', 'managerId', 'createdById'],
    include: [{ model: db.TaskAssignment, as: 'assignments', attributes: ['teamLeadId'] }],
  });
  if (!task) notFound();
  return task;
}

function _assertCanViewTask(user, task) {
  if (user.roleLevel > 3) return;
  const taskJson = task.toJSON ? task.toJSON() : task;
  if (taskJson.createdById === user.id) return;
  if (taskJson.manager?.id === user.id || taskJson.managerId === user.id) return;
  if (taskJson.assignments?.some(a => a.teamLead?.id === user.id || a.teamLeadId === user.id)) return;
  if (taskJson.subTasks?.some(st => st.assignments?.some(sa => sa.member?.id === user.id || sa.memberId === user.id))) return;
  const err = new Error('Access denied'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
}

async function _getAccessibleTaskIds(user) {
  // Run all 3 lookups in PARALLEL → 1 round-trip instead of 3
  const [directTasks, assignments, subTaskAssignments] = await Promise.all([
    db.Task.findAll({
      where: {
        [Op.or]: [{ managerId: user.id }, { createdById: user.id }],
        deletedAt: null,
      },
      attributes: ['id'],
      raw: true,
    }),
    db.TaskAssignment.findAll({
      where: { teamLeadId: user.id },
      attributes: ['taskId'],
      raw: true,
    }),
    db.SubTaskAssignment.findAll({
      where: { memberId: user.id },
      include: [{ model: db.SubTask, as: 'subTask', attributes: ['taskId'] }],
    }),
  ]);

  const taskIds = new Set();
  directTasks.forEach(t => taskIds.add(t.id));
  assignments.forEach(a => taskIds.add(a.taskId));
  subTaskAssignments.forEach(sa => { if (sa.subTask) taskIds.add(sa.subTask.taskId); });

  return Array.from(taskIds);
}

module.exports = {
  createTask, getTasks, getTaskById, updateTask,
  assignManager, acceptTask, rejectTask,
  assignTeamLeads, submitTask, approveTask,
  reopenTask, deleteTask, getTaskStats,
};
