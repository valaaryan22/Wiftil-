'use strict';

const { db }            = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const {
  HTTP_STATUS, AUDIT_CATEGORY, AUDIT_ACTION,
  SUBTASK_STATUS, SUBTASK_CREATE_MIN_LEVEL,
} = require('../constants');

const USER_SNAP = { select: { id: true, firstName: true, lastName: true, email: true, role: { select: { name: true } } } };

const SUBTASK_SELECT = {
  id: true, taskId: true, title: true, description: true, priority: true, status: true,
  startDate: true, dueDate: true, estimatedHours: true, actualHours: true,
  startedAt: true, completedAt: true, submittedAt: true,
  reviewedAt: true, reviewComment: true,
  createdAt: true, updatedAt: true,
  createdBy:  USER_SNAP,
  reviewedBy: USER_SNAP,
  assignments: {
    select: {
      id: true, contribution: true, assignedAt: true,
      member:     USER_SNAP,
      assignedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  dependencies: {
    select: { prerequisiteId: true, prerequisite: { select: { id: true, title: true, status: true } } },
  },
  _count: { select: { ratings: true, comments: true } },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function notFound(msg = 'Sub-task not found') { const err = new Error(msg); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err; }
function forbidden(msg) { const err = new Error(msg); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err; }
function conflict(msg)  { const err = new Error(msg); err.statusCode = HTTP_STATUS.CONFLICT;  throw err; }
function badReq(msg)    { const err = new Error(msg); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err; }

async function _getTask(taskId) {
  const task = await db.task.findUnique({
    where: { id: taskId, deletedAt: null },
    select: { id: true, title: true, status: true, managerId: true, assignments: { select: { teamLeadId: true } } },
  });
  if (!task) notFound('Parent task not found');
  return task;
}

function _assertIsTeamLead(user, task) {
  if (user.roleLevel >= 5) return; // BOSS can do anything
  const isLead = task.assignments.some((a) => a.teamLeadId === user.id);
  if (!isLead) forbidden('Only assigned Team Leads can manage sub-tasks for this task');
}

// ─── CRUD ──────────────────────────────────────────────────────────────────────

/**
 * Create sub-task under a main task (Team Lead only)
 */
async function createSubTask({ requestingUser, taskId, title, description, priority, startDate, dueDate, estimatedHours, req }) {
  if (requestingUser.roleLevel < SUBTASK_CREATE_MIN_LEVEL) forbidden('Team Lead (level 2+) required to create sub-tasks');

  const task = await _getTask(taskId);
  _assertIsTeamLead(requestingUser, task);

  if (!['ACCEPTED', 'IN_PROGRESS', 'REOPENED'].includes(task.status)) {
    conflict(`Cannot create sub-tasks when task is "${task.status}"`);
  }

  const subTask = await db.subTask.create({
    data: {
      taskId, title, description,
      priority:       priority || 'MEDIUM',
      startDate:      startDate      ? new Date(startDate)      : null,
      dueDate:        dueDate        ? new Date(dueDate)        : null,
      estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
      createdById:    requestingUser.id,
      status:         SUBTASK_STATUS.CREATED,
    },
    select: SUBTASK_SELECT,
  });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.SUBTASK_CREATED,
    category: AUDIT_CATEGORY.TASK, entity: 'SubTask', entityId: subTask.id, entityName: subTask.title,
    description: `Created sub-task "${subTask.title}" under task "${task.title}"`, req,
  });

  return subTask;
}

/**
 * Get all sub-tasks for a task
 */
async function getSubTasks({ requestingUser, taskId, status }) {
  const task = await _getTask(taskId);

  let where = { taskId };
  if (status) where.status = status;

  // Members only see their own sub-tasks
  if (requestingUser.roleLevel === 1) {
    where.assignments = { some: { memberId: requestingUser.id } };
  }

  const subTasks = await db.subTask.findMany({
    where,
    select: SUBTASK_SELECT,
    orderBy: { createdAt: 'asc' },
  });

  return subTasks;
}

/**
 * Get single sub-task
 */
async function getSubTaskById({ requestingUser, taskId, id }) {
  const subTask = await db.subTask.findUnique({
    where: { id, taskId },
    select: SUBTASK_SELECT,
  });
  if (!subTask) notFound();
  return subTask;
}

/**
 * Update sub-task (Team Lead only, before members start working)
 */
async function updateSubTask({ requestingUser, taskId, id, data, req }) {
  const task = await _getTask(taskId);
  _assertIsTeamLead(requestingUser, task);

  const subTask = await db.subTask.findUnique({ where: { id, taskId }, select: { id: true, title: true, status: true } });
  if (!subTask) notFound();

  const editable = ['CREATED', 'ASSIGNED', 'LOCKED', 'AVAILABLE'];
  if (!editable.includes(subTask.status)) conflict(`Cannot edit sub-task in status "${subTask.status}"`);

  const allowed = ['title', 'description', 'priority', 'startDate', 'dueDate', 'estimatedHours'];
  const updateData = {};
  allowed.forEach((f) => { if (data[f] !== undefined) updateData[f] = data[f]; });

  const updated = await db.subTask.update({ where: { id }, data: updateData, select: SUBTASK_SELECT });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.SUBTASK_UPDATED,
    category: AUDIT_CATEGORY.TASK, entity: 'SubTask', entityId: id, entityName: subTask.title,
    description: `Updated sub-task "${subTask.title}"`, oldValues: subTask, newValues: updateData, req,
  });

  return updated;
}

/**
 * Delete sub-task (Team Lead, only if not started)
 */
async function deleteSubTask({ requestingUser, taskId, id, req }) {
  const task = await _getTask(taskId);
  _assertIsTeamLead(requestingUser, task);

  const subTask = await db.subTask.findUnique({ where: { id, taskId }, select: { id: true, title: true, status: true } });
  if (!subTask) notFound();

  const deletable = ['CREATED', 'ASSIGNED', 'LOCKED', 'AVAILABLE'];
  if (!deletable.includes(subTask.status)) conflict('Cannot delete a sub-task that has been started');

  await db.subTask.delete({ where: { id } });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.SUBTASK_DELETED,
    category: AUDIT_CATEGORY.TASK, entity: 'SubTask', entityId: id, entityName: subTask.title,
    description: `Deleted sub-task "${subTask.title}"`, req,
  });
}

// ─── ASSIGNMENT ────────────────────────────────────────────────────────────────

/**
 * Assign sub-task to one or more members with optional % contribution
 */
async function assignSubTask({ requestingUser, taskId, id, assignments, req }) {
  const task = await _getTask(taskId);
  _assertIsTeamLead(requestingUser, task);

  const subTask = await db.subTask.findUnique({ where: { id, taskId }, select: { id: true, title: true, status: true } });
  if (!subTask) notFound();

  if (!Array.isArray(assignments) || assignments.length === 0) badReq('assignments array is required');

  // assignments = [{ memberId, contribution }]
  const memberIds = assignments.map((a) => a.memberId);
  const members = await db.user.findMany({
    where: { id: { in: memberIds }, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  });
  if (members.length !== memberIds.length) notFound('One or more members not found');

  // Validate total contribution = 100% (if multiple)
  if (assignments.length > 1) {
    const total = assignments.reduce((s, a) => s + (parseFloat(a.contribution) || 0), 0);
    if (Math.abs(total - 100) > 0.01) badReq(`Total contribution must equal 100% (got ${total}%)`);
  }

  // Check if dependencies are met
  const unmetDeps = await db.subTaskDependency.count({
    where: {
      subTaskId: id,
      prerequisite: { status: { notIn: ['TEAM_LEAD_APPROVED', 'FINAL_APPROVED'] } },
    },
  });

  const newStatus = unmetDeps > 0 ? SUBTASK_STATUS.LOCKED : SUBTASK_STATUS.AVAILABLE;

  await db.$transaction([
    db.subTaskAssignment.deleteMany({ where: { subTaskId: id } }),
    ...assignments.map((a) => db.subTaskAssignment.create({
      data: { subTaskId: id, memberId: a.memberId, contribution: parseFloat(a.contribution) || 100, assignedById: requestingUser.id },
    })),
    db.subTask.update({ where: { id }, data: { status: newStatus } }),
  ]);

  const updated = await db.subTask.findUnique({ where: { id }, select: SUBTASK_SELECT });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.SUBTASK_ASSIGNED,
    category: AUDIT_CATEGORY.TASK, entity: 'SubTask', entityId: id, entityName: subTask.title,
    description: `Assigned sub-task "${subTask.title}" to ${members.length} member(s): ${members.map((m) => m.firstName).join(', ')}`,
    newValues: { assignments }, req,
  });

  // Notify members
  for (const m of members) {
    await _createNotification(m.id, {
      type: 'SUBTASK_ASSIGNED', title: 'New Sub-Task Assigned',
      message: unmetDeps > 0
        ? `You have been assigned "${subTask.title}" (locked — waiting on dependencies)`
        : `You have been assigned "${subTask.title}" — ready to start!`,
      entityType: 'SubTask', entityId: id,
    });
  }

  return updated;
}

// ─── MEMBER WORKFLOW ───────────────────────────────────────────────────────────

/**
 * Member starts working on a sub-task
 */
async function startSubTask({ requestingUser, taskId, id, req }) {
  const subTask = await _getMemberSubTask(id, taskId, requestingUser);

  if (subTask.status === 'LOCKED') conflict('This sub-task is locked — prerequisite sub-tasks must be completed first');
  if (!['AVAILABLE', 'ASSIGNED', 'REOPENED'].includes(subTask.status)) conflict(`Cannot start sub-task in status "${subTask.status}"`);

  const updated = await db.subTask.update({
    where: { id },
    data:  { status: SUBTASK_STATUS.IN_PROGRESS, startedAt: new Date() },
    select: SUBTASK_SELECT,
  });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.SUBTASK_STARTED,
    category: AUDIT_CATEGORY.TASK, entity: 'SubTask', entityId: id, entityName: subTask.title,
    description: `Member started working on sub-task "${subTask.title}"`, req,
  });

  return updated;
}

/**
 * Member submits completed sub-task to Team Lead
 */
async function submitSubTask({ requestingUser, taskId, id, actualHours, req }) {
  const subTask = await _getMemberSubTask(id, taskId, requestingUser);

  if (!['IN_PROGRESS', 'TEAM_LEAD_REJECTED', 'REOPENED'].includes(subTask.status)) {
    conflict(`Cannot submit sub-task in status "${subTask.status}"`);
  }

  const updateData = {
    status:      SUBTASK_STATUS.TEAM_LEAD_REVIEW,
    submittedAt: new Date(),
    completedAt: new Date(),
  };
  if (actualHours) updateData.actualHours = parseFloat(actualHours);

  const updated = await db.subTask.update({ where: { id }, data: updateData, select: SUBTASK_SELECT });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.SUBTASK_SUBMITTED,
    category: AUDIT_CATEGORY.TASK, entity: 'SubTask', entityId: id, entityName: subTask.title,
    description: `Member submitted sub-task "${subTask.title}" for Team Lead review`, req,
  });

  // Notify team lead (creator of sub-task)
  await _createNotification(subTask.createdById, {
    type: 'SUBTASK_SUBMITTED', title: 'Sub-Task Submitted for Review',
    message: `"${subTask.title}" has been submitted for your review`, entityType: 'SubTask', entityId: id,
  });

  return updated;
}

// ─── TEAM LEAD REVIEW ──────────────────────────────────────────────────────────

/**
 * Team Lead approves sub-task (then unlocks any dependent sub-tasks)
 */
async function approveSubTask({ requestingUser, taskId, id, comment, req }) {
  const task = await _getTask(taskId);
  _assertIsTeamLead(requestingUser, task);

  const subTask = await db.subTask.findUnique({ where: { id, taskId }, select: { id: true, title: true, status: true, createdById: true, assignments: { select: { memberId: true } } } });
  if (!subTask) notFound();

  if (!['TEAM_LEAD_REVIEW', 'SUBMITTED'].includes(subTask.status)) conflict('Sub-task is not under review');

  await db.subTask.update({
    where: { id },
    data:  { status: SUBTASK_STATUS.TEAM_LEAD_APPROVED, reviewedById: requestingUser.id, reviewedAt: new Date(), reviewComment: comment || null },
  });

  // Update task completion percentage
  await _updateTaskCompletion(taskId);

  // ── Dependency unlock logic ────────────────────────────────────────────────
  // Find sub-tasks that depend on this one and check if all their deps are now met
  const dependentLinks = await db.subTaskDependency.findMany({
    where: { prerequisiteId: id },
    select: { subTaskId: true },
  });

  for (const link of dependentLinks) {
    const unmetCount = await db.subTaskDependency.count({
      where: {
        subTaskId: link.subTaskId,
        prerequisite: { status: { notIn: ['TEAM_LEAD_APPROVED', 'FINAL_APPROVED'] } },
      },
    });

    if (unmetCount === 0) {
      await db.subTask.update({
        where: { id: link.subTaskId, status: { in: ['LOCKED', 'ASSIGNED'] } },
        data:  { status: SUBTASK_STATUS.AVAILABLE },
      });

      // Notify assigned members of unlocked sub-task
      const unlocked = await db.subTask.findUnique({
        where: { id: link.subTaskId },
        select: { title: true, assignments: { select: { memberId: true } } },
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
        performedBy: requestingUser, action: AUDIT_ACTION.DEPENDENCY_UNLOCKED,
        category: AUDIT_CATEGORY.TASK, entity: 'SubTask', entityId: link.subTaskId,
        description: `Sub-task unlocked after dependency "${subTask.title}" was approved`, req,
      });
    }
  }

  const updated = await db.subTask.findUnique({ where: { id }, select: SUBTASK_SELECT });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.SUBTASK_APPROVED,
    category: AUDIT_CATEGORY.TASK, entity: 'SubTask', entityId: id, entityName: subTask.title,
    description: `Team Lead approved sub-task "${subTask.title}"${comment ? `: "${comment}"` : ''}`, req,
  });

  // Notify all assigned members
  for (const a of subTask.assignments) {
    await _createNotification(a.memberId, {
      type: 'SUBTASK_APPROVED', title: 'Sub-Task Approved!',
      message: `Your sub-task "${subTask.title}" has been approved`, entityType: 'SubTask', entityId: id,
    });
  }

  return updated;
}

/**
 * Team Lead rejects sub-task (sends back to member)
 */
async function rejectSubTask({ requestingUser, taskId, id, comment, req }) {
  const task = await _getTask(taskId);
  _assertIsTeamLead(requestingUser, task);

  const subTask = await db.subTask.findUnique({ where: { id, taskId }, select: { id: true, title: true, status: true, assignments: { select: { memberId: true } } } });
  if (!subTask) notFound();

  if (!['TEAM_LEAD_REVIEW', 'SUBMITTED'].includes(subTask.status)) conflict('Sub-task is not under review');
  if (!comment?.trim()) badReq('Rejection comment is required');

  await db.subTask.update({
    where: { id },
    data:  { status: SUBTASK_STATUS.TEAM_LEAD_REJECTED, reviewedById: requestingUser.id, reviewedAt: new Date(), reviewComment: comment },
  });

  const updated = await db.subTask.findUnique({ where: { id }, select: SUBTASK_SELECT });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.SUBTASK_REJECTED,
    category: AUDIT_CATEGORY.TASK, entity: 'SubTask', entityId: id, entityName: subTask.title,
    description: `Team Lead rejected sub-task "${subTask.title}": "${comment}"`, req,
  });

  for (const a of subTask.assignments) {
    await _createNotification(a.memberId, {
      type: 'SUBTASK_REJECTED', title: 'Sub-Task Needs Rework',
      message: `"${subTask.title}" was rejected: "${comment}"`, entityType: 'SubTask', entityId: id,
    });
  }

  return updated;
}

// ─── DEPENDENCIES ──────────────────────────────────────────────────────────────

/**
 * Add dependency: subTaskId depends on prerequisiteId
 */
async function addDependency({ requestingUser, taskId, id, prerequisiteId, req }) {
  const task = await _getTask(taskId);
  _assertIsTeamLead(requestingUser, task);

  if (id === prerequisiteId) badReq('A sub-task cannot depend on itself');

  const [subTask, prereq] = await Promise.all([
    db.subTask.findUnique({ where: { id, taskId }, select: { id: true, title: true, status: true } }),
    db.subTask.findUnique({ where: { id: prerequisiteId, taskId }, select: { id: true, title: true, status: true } }),
  ]);

  if (!subTask) notFound('Sub-task not found');
  if (!prereq)  notFound('Prerequisite sub-task not found');

  // Check for circular dependency
  const wouldCreateCycle = await _hasCycle(id, prerequisiteId);
  if (wouldCreateCycle) conflict('This dependency would create a circular dependency chain');

  await db.subTaskDependency.upsert({
    where:  { subTaskId_prerequisiteId: { subTaskId: id, prerequisiteId } },
    create: { subTaskId: id, prerequisiteId },
    update: {},
  });

  // If prerequisite is not yet approved, lock the sub-task
  const prereqApproved = ['TEAM_LEAD_APPROVED', 'FINAL_APPROVED'].includes(prereq.status);
  if (!prereqApproved && ['AVAILABLE', 'ASSIGNED'].includes(subTask.status)) {
    await db.subTask.update({ where: { id }, data: { status: SUBTASK_STATUS.LOCKED } });
  }

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.DEPENDENCY_ADDED,
    category: AUDIT_CATEGORY.TASK, entity: 'SubTask', entityId: id, entityName: subTask.title,
    description: `Added dependency: "${subTask.title}" depends on "${prereq.title}"`, req,
  });

  return db.subTask.findUnique({ where: { id }, select: SUBTASK_SELECT });
}

/**
 * Remove dependency
 */
async function removeDependency({ requestingUser, taskId, id, prerequisiteId, req }) {
  const task = await _getTask(taskId);
  _assertIsTeamLead(requestingUser, task);

  const dep = await db.subTaskDependency.findUnique({
    where: { subTaskId_prerequisiteId: { subTaskId: id, prerequisiteId } },
  });
  if (!dep) notFound('Dependency not found');

  await db.subTaskDependency.delete({ where: { subTaskId_prerequisiteId: { subTaskId: id, prerequisiteId } } });

  // Re-check if sub-task should be unlocked now
  const remaining = await db.subTaskDependency.count({
    where: { subTaskId: id, prerequisite: { status: { notIn: ['TEAM_LEAD_APPROVED', 'FINAL_APPROVED'] } } },
  });

  if (remaining === 0) {
    await db.subTask.update({
      where: { id, status: SUBTASK_STATUS.LOCKED },
      data:  { status: SUBTASK_STATUS.AVAILABLE },
    });
  }

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.DEPENDENCY_REMOVED,
    category: AUDIT_CATEGORY.TASK, entity: 'SubTask', entityId: id,
    description: `Removed dependency from prerequisite ${prerequisiteId}`, req,
  });

  return db.subTask.findUnique({ where: { id }, select: SUBTASK_SELECT });
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _getMemberSubTask(id, taskId, user) {
  const subTask = await db.subTask.findUnique({
    where: { id, taskId },
    select: { id: true, title: true, status: true, createdById: true, assignments: { select: { memberId: true } } },
  });
  if (!subTask) notFound();
  if (user.roleLevel < 5) {
    const isAssigned = subTask.assignments.some((a) => a.memberId === user.id);
    if (!isAssigned) forbidden('Not assigned to this sub-task');
  }
  return subTask;
}

async function _updateTaskCompletion(taskId) {
  const [total, approved] = await Promise.all([
    db.subTask.count({ where: { taskId } }),
    db.subTask.count({ where: { taskId, status: { in: ['TEAM_LEAD_APPROVED', 'FINAL_APPROVED'] } } }),
  ]);
  const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
  await db.task.update({ where: { id: taskId }, data: { completionPercent: pct } });
}

async function _hasCycle(startId, newPrereqId) {
  // BFS: check if startId is reachable from newPrereqId (would create cycle)
  const visited = new Set();
  const queue = [newPrereqId];
  while (queue.length) {
    const current = queue.shift();
    if (current === startId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const deps = await db.subTaskDependency.findMany({ where: { subTaskId: current }, select: { prerequisiteId: true } });
    queue.push(...deps.map((d) => d.prerequisiteId));
  }
  return false;
}

async function _createNotification(userId, { type, title, message, entityType, entityId }) {
  try {
    await db.notification.create({ data: { userId, type, title, message, entityType, entityId } });
  } catch { /* non-fatal */ }
}

module.exports = {
  createSubTask, getSubTasks, getSubTaskById, updateSubTask, deleteSubTask,
  assignSubTask, startSubTask, submitSubTask,
  approveSubTask, rejectSubTask,
  addDependency, removeDependency,
};
