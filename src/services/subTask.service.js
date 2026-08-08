'use strict';

const { Op }            = require('sequelize');
const { db }            = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const dateChangeRequestService = require('./dateChangeRequest.service');
const { HTTP_STATUS, AUDIT_CATEGORY, AUDIT_ACTION, SUBTASK_STATUS, SUBTASK_CREATE_MIN_LEVEL } = require('../constants');

// ─── Includes ─────────────────────────────────────────────────────────────────
const USER_SNAP_INCLUDE = (as) => ({
  model: db.User, as,
  attributes: ['id', 'firstName', 'lastName', 'email'],
  include: [{ model: db.RoleDefinition, as: 'role', attributes: ['name'] }],
});

const SUBTASK_INCLUDE = [
  USER_SNAP_INCLUDE('createdBy'),
  USER_SNAP_INCLUDE('reviewedBy'),
  {
    model: db.SubTaskAssignment, as: 'assignments',
    include: [
      USER_SNAP_INCLUDE('member'),
      { model: db.User, as: 'assignedBy', attributes: ['id', 'firstName', 'lastName'] },
    ],
  },
  {
    model: db.SubTaskDependency, as: 'dependencies',
    include: [{ model: db.SubTask, as: 'prerequisite', attributes: ['id', 'title', 'status'] }],
  },
];

const SUBTASK_ATTRS = [
  'id', 'taskId', 'docketId', 'title', 'description', 'priority', 'status',
  'startDate', 'dueDate', 'estimatedHours', 'actualHours',
  'startedAt', 'completedAt', 'submittedAt', 'reviewedAt', 'reviewComment',
  'createdById', 'reviewedById', 'createdAt', 'updatedAt',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function notFound(msg = 'Sub-task not found') { const err = new Error(msg); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err; }
function forbidden(msg) { const err = new Error(msg); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err; }
function conflict(msg)  { const err = new Error(msg); err.statusCode = HTTP_STATUS.CONFLICT;  throw err; }
function badReq(msg)    { const err = new Error(msg); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err; }

async function _getTask(taskId) {
  const task = await db.Task.findOne({
    where: { id: taskId, deletedAt: null },
    attributes: ['id', 'title', 'status', 'managerId', 'estimatedHours', 'startDate', 'dueDate'],
    include: [{ model: db.TaskAssignment, as: 'assignments', attributes: ['teamLeadId'] }],
  });
  if (!task) notFound('Parent task not found');
  return task;
}

// ─── Sub-task date/hours validation against parent task ───────────────────────
async function _validateAgainstTask(task, { startDate, dueDate, estimatedHours }, { taskId, excludeSubTaskId = null } = {}) {
  // 1. Cumulative estimatedHours: sum of all sub-tasks must not exceed the main task's estimatedHours
  if (estimatedHours !== undefined && estimatedHours !== null) {
    const newHours = parseFloat(estimatedHours);
    if (!isNaN(newHours) && task.estimatedHours !== null && task.estimatedHours !== undefined) {
      // Sum hours of all OTHER sub-tasks for this task (exclude the one being updated)
      const existingSubTasks = await db.SubTask.findAll({
        where: {
          taskId,
          ...(excludeSubTaskId ? { id: { [Op.ne]: excludeSubTaskId } } : {}),
        },
        attributes: ['estimatedHours'],
      });
      const existingSum = existingSubTasks.reduce(
        (sum, st) => sum + (parseFloat(st.estimatedHours) || 0), 0
      );
      const wouldBeTotal = existingSum + newHours;
      if (wouldBeTotal > parseFloat(task.estimatedHours)) {
        badReq(
          `Total sub-task estimated hours would be ${wouldBeTotal}h ` +
          `(existing ${existingSum}h + new ${newHours}h), ` +
          `which exceeds the main task's limit of ${task.estimatedHours}h`
        );
      }
    }
  }

  const subStart = startDate ? new Date(startDate) : null;
  const subEnd   = dueDate   ? new Date(dueDate)   : null;

  // 2. startDate must not be after dueDate
  if (subStart && subEnd && subStart > subEnd) {
    badReq('Sub-task start date cannot be after its due date');
  }

  // 3. Dates must fall within the parent task's date range
  const taskStart = task.startDate ? new Date(task.startDate) : null;
  const taskEnd   = task.dueDate   ? new Date(task.dueDate)   : null;

  if (subStart && taskStart && subStart < taskStart) {
    badReq(
      `Sub-task start date (${subStart.toISOString().slice(0,10)}) cannot be before the main task's start date (${taskStart.toISOString().slice(0,10)})`
    );
  }
  if (subStart && taskEnd && subStart > taskEnd) {
    badReq(
      `Sub-task start date (${subStart.toISOString().slice(0,10)}) cannot be after the main task's due date (${taskEnd.toISOString().slice(0,10)})`
    );
  }
  if (subEnd && taskEnd && subEnd > taskEnd) {
    badReq(
      `Sub-task due date (${subEnd.toISOString().slice(0,10)}) cannot be after the main task's due date (${taskEnd.toISOString().slice(0,10)})`
    );
  }
  if (subEnd && taskStart && subEnd < taskStart) {
    badReq(
      `Sub-task due date (${subEnd.toISOString().slice(0,10)}) cannot be before the main task's start date (${taskStart.toISOString().slice(0,10)})`
    );
  }
}

function _assertIsTeamLead(user, task) {
  // Any user with Level <= 4 (TEAM_LEAD and above) can manage sub-tasks.
  // Only Level 5+ (EMPLOYEE and below) are blocked.
  if (user.roleLevel <= 4) return;
  forbidden('Only users with Team Lead level or above (level ≤ 4) can manage sub-tasks');
}

async function getFullSubTask(id) {
  return db.SubTask.findOne({ where: { id }, attributes: SUBTASK_ATTRS, include: SUBTASK_INCLUDE });
}

async function _createNotification(userId, { type, title, message, entityType, entityId }) {
  try {
    await db.Notification.create({ userId, type, title, message, entityType, entityId });
  } catch { /* non-fatal */ }
}

// ─── CRUD ──────────────────────────────────────────────────────────────────────

async function createSubTask({ requestingUser, taskId, title, description, priority, startDate, dueDate, estimatedHours, req }) {
  // Access guard is already applied at the route via authorizeLevel(2); no duplicate check needed here.

  const task = await _getTask(taskId);
  _assertIsTeamLead(requestingUser, task);

  if (!['ACCEPTED', 'IN_PROGRESS', 'REOPENED'].includes(task.status)) {
    conflict(`Cannot create sub-tasks when task is "${task.status}"`);
  }

  // ── Validate hours & dates against the parent task ──
  await _validateAgainstTask(task, { startDate, dueDate, estimatedHours }, { taskId });

  const subTask = await db.SubTask.create({
    taskId, title, description,
    priority:       priority || 'MEDIUM',
    startDate:      startDate      ? new Date(startDate)      : null,
    dueDate:        dueDate        ? new Date(dueDate)        : null,
    estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
    createdById:    requestingUser.id,
    status:         SUBTASK_STATUS.CREATED,
  });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.SUBTASK_CREATED, category: AUDIT_CATEGORY.TASK,
    entity: 'SubTask', entityId: subTask.id, entityName: subTask.title,
    description: `Created sub-task "${subTask.title}" under task "${task.title}"`, req,
  });

  return getFullSubTask(subTask.id);
}

async function getSubTasks({ requestingUser, taskId, status }) {
  await _getTask(taskId); // validate task exists

  const where = { taskId };
  if (status) where.status = status;

  if (requestingUser.roleLevel >= 5) {
    // Employee: only see sub-tasks they're assigned to
    const assignedIds = await db.SubTaskAssignment.findAll({
      where: { memberId: requestingUser.id },
      attributes: ['subTaskId'],
    });
    where.id = { [Op.in]: assignedIds.map(a => a.subTaskId) };
  }

  return db.SubTask.findAll({ where, attributes: SUBTASK_ATTRS, include: SUBTASK_INCLUDE, order: [['createdAt', 'ASC']] });
}

async function getSubTaskById({ requestingUser, taskId, id }) {
  const subTask = await db.SubTask.findOne({ where: { id, taskId }, attributes: SUBTASK_ATTRS, include: SUBTASK_INCLUDE });
  if (!subTask) notFound();
  return subTask;
}

async function updateSubTask({ requestingUser, taskId, id, data, req }) {
  const task = await _getTask(taskId);
  _assertIsTeamLead(requestingUser, task);

  const subTask = await db.SubTask.findOne({ where: { id, taskId }, attributes: ['id', 'title', 'status', 'startDate', 'dueDate', 'estimatedHours'] });
  if (!subTask) notFound();

  const editable = ['CREATED', 'ASSIGNED', 'LOCKED', 'AVAILABLE'];
  if (!editable.includes(subTask.status)) conflict(`Cannot edit sub-task in status "${subTask.status}"`);

  // ── Date-change approval gate ────────────────────────────────────────────────
  // Level > 2 (MANAGER and below) cannot change dates directly — route to approval flow.
  // Only BOSS (level 1) and ADMIN (level 2) may apply dates immediately.
  const DATE_FIELDS = ['startDate', 'dueDate'];
  const hasDateChange = DATE_FIELDS.some(f => data[f] !== undefined);
  let pendingDateRequest = null;

  if (hasDateChange && requestingUser.roleLevel > 2) {
    const requestedStartDate = data.startDate;
    const requestedEndDate   = data.dueDate;
    DATE_FIELDS.forEach(f => delete data[f]);

    pendingDateRequest = await dateChangeRequestService.requestDateChange({
      requestingUser,
      entityType: 'SubTask',
      entityId: id,
      requestedStartDate,
      requestedEndDate,
      req,
    });
  }

  const allowed = ['title', 'description', 'priority', 'startDate', 'dueDate', 'estimatedHours'];
  const updateData = {};
  allowed.forEach(f => { if (data[f] !== undefined) updateData[f] = data[f]; });

  // ── Validate hours & dates against the parent task (merge with existing values, exclude self from sum) ──
  await _validateAgainstTask(task, {
    startDate:      'startDate'      in updateData ? updateData.startDate      : subTask.startDate,
    dueDate:        'dueDate'        in updateData ? updateData.dueDate        : subTask.dueDate,
    estimatedHours: 'estimatedHours' in updateData ? updateData.estimatedHours : subTask.estimatedHours,
  }, { taskId, excludeSubTaskId: id });

  await subTask.update(updateData);

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.SUBTASK_UPDATED, category: AUDIT_CATEGORY.TASK,
    entity: 'SubTask', entityId: id, entityName: subTask.title,
    description: `Updated sub-task "${subTask.title}"`, oldValues: subTask.toJSON(), newValues: updateData, req,
  });

  const updated = await getFullSubTask(id);
  return pendingDateRequest ? { subTask: updated, pendingDateRequest } : updated;
}

async function deleteSubTask({ requestingUser, taskId, id, req }) {
  const task = await _getTask(taskId);
  _assertIsTeamLead(requestingUser, task);

  const subTask = await db.SubTask.findOne({ where: { id, taskId }, attributes: ['id', 'title', 'status'] });
  if (!subTask) notFound();

  const deletable = ['CREATED', 'ASSIGNED', 'LOCKED', 'AVAILABLE'];
  if (!deletable.includes(subTask.status)) conflict('Cannot delete a sub-task that has been started');

  await subTask.destroy();

  // Recalculate parent task completion after deletion so the percentage stays accurate
  await _updateTaskCompletion(taskId);

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.SUBTASK_DELETED, category: AUDIT_CATEGORY.TASK,
    entity: 'SubTask', entityId: id, entityName: subTask.title,
    description: `Deleted sub-task "${subTask.title}"`, req,
  });
}

// ─── ASSIGNMENT ────────────────────────────────────────────────────────────────

async function assignSubTask({ requestingUser, taskId, id, assignments, req }) {
  const task = await _getTask(taskId);
  _assertIsTeamLead(requestingUser, task);

  const subTask = await db.SubTask.findOne({ where: { id, taskId }, attributes: ['id', 'title', 'status'] });
  if (!subTask) notFound();
  if (!Array.isArray(assignments) || assignments.length === 0) badReq('assignments array is required');

  const memberIds = assignments.map(a => a.memberId);
  const members = await db.User.findAll({
    where: { id: { [Op.in]: memberIds }, deletedAt: null },
    attributes: ['id', 'firstName', 'lastName'],
  });
  if (members.length !== memberIds.length) notFound('One or more members not found');

  if (assignments.length > 1) {
    const total = assignments.reduce((s, a) => s + (parseFloat(a.contribution) || 0), 0);
    if (Math.abs(total - 100) > 0.01) badReq(`Total contribution must equal 100% (got ${total}%)`);
  }

  // Check dependencies
  const unmetDeps = await _countUnmetDeps(id);
  const newStatus = unmetDeps > 0 ? SUBTASK_STATUS.LOCKED : SUBTASK_STATUS.AVAILABLE;

  // Replace assignments
  await db.SubTaskAssignment.destroy({ where: { subTaskId: id } });
  await db.SubTaskAssignment.bulkCreate(
    assignments.map(a => ({
      subTaskId: id, memberId: a.memberId,
      contribution: parseFloat(a.contribution) || 100,
      assignedById: requestingUser.id,
    }))
  );
  await subTask.update({ status: newStatus });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.SUBTASK_ASSIGNED, category: AUDIT_CATEGORY.TASK,
    entity: 'SubTask', entityId: id, entityName: subTask.title,
    description: `Assigned sub-task "${subTask.title}" to ${members.length} member(s): ${members.map(m => m.firstName).join(', ')}`,
    newValues: { assignments }, req,
  });

  for (const m of members) {
    await _createNotification(m.id, {
      type: 'SUBTASK_ASSIGNED', title: 'New Sub-Task Assigned',
      message: unmetDeps > 0
        ? `You have been assigned "${subTask.title}" (locked — waiting on dependencies)`
        : `You have been assigned "${subTask.title}" — ready to start!`,
      entityType: 'SubTask', entityId: id,
    });
  }

  return getFullSubTask(id);
}

// ─── MEMBER WORKFLOW ───────────────────────────────────────────────────────────

async function startSubTask({ requestingUser, taskId, id, req }) {
  const subTask = await _getMemberSubTask(id, taskId, requestingUser);

  if (subTask.status === 'LOCKED') conflict('This sub-task is locked — prerequisite sub-tasks must be completed first');
  if (!['AVAILABLE', 'ASSIGNED', 'REOPENED', 'TEAM_LEAD_REJECTED'].includes(subTask.status)) conflict(`Cannot start sub-task in status "${subTask.status}"`);

  await subTask.update({ status: SUBTASK_STATUS.IN_PROGRESS, startedAt: new Date() });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.SUBTASK_STARTED, category: AUDIT_CATEGORY.TASK,
    entity: 'SubTask', entityId: id, entityName: subTask.title,
    description: `Member started working on sub-task "${subTask.title}"`, req,
  });

  return getFullSubTask(id);
}

async function submitSubTask({ requestingUser, taskId, id, actualHours, req }) {
  const subTask = await _getMemberSubTask(id, taskId, requestingUser);

  if (!['IN_PROGRESS', 'TEAM_LEAD_REJECTED', 'REOPENED'].includes(subTask.status)) {
    conflict(`Cannot submit sub-task in status "${subTask.status}"`);
  }

  const updateData = {
    status: SUBTASK_STATUS.TEAM_LEAD_REVIEW,
    submittedAt: new Date(), completedAt: new Date(),
  };
  if (actualHours) updateData.actualHours = parseFloat(actualHours);

  await subTask.update(updateData);

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.SUBTASK_SUBMITTED, category: AUDIT_CATEGORY.TASK,
    entity: 'SubTask', entityId: id, entityName: subTask.title,
    description: `Member submitted sub-task "${subTask.title}" for Team Lead review`, req,
  });

  await _createNotification(subTask.createdById, {
    type: 'SUBTASK_SUBMITTED', title: 'Sub-Task Submitted for Review',
    message: `"${subTask.title}" has been submitted for your review`, entityType: 'SubTask', entityId: id,
  });

  return getFullSubTask(id);
}

// ─── TEAM LEAD REVIEW ──────────────────────────────────────────────────────────

async function approveSubTask({ requestingUser, taskId, id, comment, req }) {
  const task = await _getTask(taskId);
  _assertIsTeamLead(requestingUser, task);

  const subTask = await db.SubTask.findOne({
    where: { id, taskId },
    attributes: ['id', 'title', 'status', 'createdById'],
    include: [{ model: db.SubTaskAssignment, as: 'assignments', attributes: ['memberId'] }],
  });
  if (!subTask) notFound();
  if (!['TEAM_LEAD_REVIEW', 'SUBMITTED'].includes(subTask.status)) conflict('Sub-task is not under review');

  await subTask.update({
    status: SUBTASK_STATUS.TEAM_LEAD_APPROVED,
    reviewedById: requestingUser.id, reviewedAt: new Date(), reviewComment: comment || null,
  });

  await _updateTaskCompletion(taskId);

  // Unlock dependent sub-tasks
  const dependentLinks = await db.SubTaskDependency.findAll({
    where: { prerequisiteId: id },
    attributes: ['subTaskId'],
  });

  for (const link of dependentLinks) {
    const unmetCount = await _countUnmetDeps(link.subTaskId);
    if (unmetCount === 0) {
      await db.SubTask.update(
        { status: SUBTASK_STATUS.AVAILABLE },
        { where: { id: link.subTaskId, status: { [Op.in]: ['LOCKED', 'ASSIGNED'] } } }
      );

      const unlocked = await db.SubTask.findByPk(link.subTaskId, {
        attributes: ['title'],
        include: [{ model: db.SubTaskAssignment, as: 'assignments', attributes: ['memberId'] }],
      });
      if (unlocked) {
        for (const a of unlocked.assignments) {
          await _createNotification(a.memberId, {
            type: 'DEPENDENCY_UNLOCKED', title: 'Sub-Task Unlocked!',
            message: `"${unlocked.title}" is now available to start`, entityType: 'SubTask', entityId: link.subTaskId,
          });
        }
      }

      await writeAuditLog({
        performedBy: requestingUser, action: AUDIT_ACTION.DEPENDENCY_UNLOCKED, category: AUDIT_CATEGORY.TASK,
        entity: 'SubTask', entityId: link.subTaskId,
        description: `Sub-task unlocked after dependency "${subTask.title}" was approved`, req,
      });
    }
  }

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.SUBTASK_APPROVED, category: AUDIT_CATEGORY.TASK,
    entity: 'SubTask', entityId: id, entityName: subTask.title,
    description: `Team Lead approved sub-task "${subTask.title}"${comment ? `: "${comment}"` : ''}`, req,
  });

  for (const a of subTask.assignments) {
    await _createNotification(a.memberId, {
      type: 'SUBTASK_APPROVED', title: 'Sub-Task Approved!',
      message: `Your sub-task "${subTask.title}" has been approved`, entityType: 'SubTask', entityId: id,
    });
  }

  return getFullSubTask(id);
}

async function rejectSubTask({ requestingUser, taskId, id, comment, req }) {
  const task = await _getTask(taskId);
  _assertIsTeamLead(requestingUser, task);

  const subTask = await db.SubTask.findOne({
    where: { id, taskId },
    attributes: ['id', 'title', 'status'],
    include: [{ model: db.SubTaskAssignment, as: 'assignments', attributes: ['memberId'] }],
  });
  if (!subTask) notFound();
  if (!['TEAM_LEAD_REVIEW', 'SUBMITTED'].includes(subTask.status)) conflict('Sub-task is not under review');
  if (!comment?.trim()) badReq('Rejection comment is required');

  await subTask.update({
    status: SUBTASK_STATUS.TEAM_LEAD_REJECTED,
    reviewedById: requestingUser.id, reviewedAt: new Date(), reviewComment: comment,
  });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.SUBTASK_REJECTED, category: AUDIT_CATEGORY.TASK,
    entity: 'SubTask', entityId: id, entityName: subTask.title,
    description: `Team Lead rejected sub-task "${subTask.title}": "${comment}"`, req,
  });

  for (const a of subTask.assignments) {
    await _createNotification(a.memberId, {
      type: 'SUBTASK_REJECTED', title: 'Sub-Task Needs Rework',
      message: `"${subTask.title}" was rejected: "${comment}"`, entityType: 'SubTask', entityId: id,
    });
  }

  return getFullSubTask(id);
}

// ─── DEPENDENCIES ──────────────────────────────────────────────────────────────

async function addDependency({ requestingUser, taskId, id, prerequisiteId, req }) {
  const task = await _getTask(taskId);
  _assertIsTeamLead(requestingUser, task);
  if (id === prerequisiteId) badReq('A sub-task cannot depend on itself');

  const [subTask, prereq] = await Promise.all([
    db.SubTask.findOne({ where: { id, taskId }, attributes: ['id', 'title', 'status'] }),
    db.SubTask.findOne({ where: { id: prerequisiteId, taskId }, attributes: ['id', 'title', 'status'] }),
  ]);
  if (!subTask) notFound('Sub-task not found');
  if (!prereq)  notFound('Prerequisite sub-task not found');

  const wouldCreateCycle = await _hasCycle(id, prerequisiteId);
  if (wouldCreateCycle) conflict('This dependency would create a circular dependency chain');

  await db.SubTaskDependency.findOrCreate({
    where: { subTaskId: id, prerequisiteId },
    defaults: { subTaskId: id, prerequisiteId },
  });

  const prereqApproved = ['TEAM_LEAD_APPROVED', 'FINAL_APPROVED'].includes(prereq.status);
  if (!prereqApproved && ['AVAILABLE', 'ASSIGNED'].includes(subTask.status)) {
    await subTask.update({ status: SUBTASK_STATUS.LOCKED });
  }

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.DEPENDENCY_ADDED, category: AUDIT_CATEGORY.TASK,
    entity: 'SubTask', entityId: id, entityName: subTask.title,
    description: `Added dependency: "${subTask.title}" depends on "${prereq.title}"`, req,
  });

  return getFullSubTask(id);
}

async function removeDependency({ requestingUser, taskId, id, prerequisiteId, req }) {
  const task = await _getTask(taskId);
  _assertIsTeamLead(requestingUser, task);

  const dep = await db.SubTaskDependency.findOne({ where: { subTaskId: id, prerequisiteId } });
  if (!dep) notFound('Dependency not found');

  await dep.destroy();

  const remaining = await _countUnmetDeps(id);
  if (remaining === 0) {
    await db.SubTask.update(
      { status: SUBTASK_STATUS.AVAILABLE },
      { where: { id, status: SUBTASK_STATUS.LOCKED } }
    );
  }

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.DEPENDENCY_REMOVED, category: AUDIT_CATEGORY.TASK,
    entity: 'SubTask', entityId: id,
    description: `Removed dependency from prerequisite ${prerequisiteId}`, req,
  });

  return getFullSubTask(id);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _getMemberSubTask(id, taskId, user) {
  const subTask = await db.SubTask.findOne({
    where: { id, taskId },
    attributes: ['id', 'title', 'status', 'createdById'],
    include: [{ model: db.SubTaskAssignment, as: 'assignments', attributes: ['memberId'] }],
  });
  if (!subTask) notFound();
  if (user.roleLevel > 1) {
    // Not BOSS: verify assignment
    const subTaskJson = subTask.toJSON ? subTask.toJSON() : subTask;
    const isAssigned = subTaskJson.assignments.some(a => a.memberId === user.id);
    if (!isAssigned) forbidden('Not assigned to this sub-task');
  }
  return subTask;
}

async function _countUnmetDeps(subTaskId) {
  const deps = await db.SubTaskDependency.findAll({
    where: { subTaskId },
    include: [{ model: db.SubTask, as: 'prerequisite', attributes: ['status'] }],
  });
  return deps.filter(d => !['TEAM_LEAD_APPROVED', 'FINAL_APPROVED'].includes(d.prerequisite.status)).length;
}

async function _updateTaskCompletion(taskId) {
  const [total, approved] = await Promise.all([
    db.SubTask.count({ where: { taskId } }),
    db.SubTask.count({ where: { taskId, status: { [Op.in]: ['TEAM_LEAD_APPROVED', 'FINAL_APPROVED'] } } }),
  ]);
  const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
  await db.Task.update({ completionPercent: pct }, { where: { id: taskId } });
}

async function _hasCycle(startId, newPrereqId) {
  const visited = new Set();
  const queue = [newPrereqId];
  while (queue.length) {
    const current = queue.shift();
    if (current === startId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const deps = await db.SubTaskDependency.findAll({ where: { subTaskId: current }, attributes: ['prerequisiteId'] });
    queue.push(...deps.map(d => d.prerequisiteId));
  }
  return false;
}

module.exports = {
  createSubTask, getSubTasks, getSubTaskById, updateSubTask, deleteSubTask,
  assignSubTask, startSubTask, submitSubTask,
  approveSubTask, rejectSubTask,
  addDependency, removeDependency,
};
