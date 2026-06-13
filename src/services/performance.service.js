'use strict';

const { db }            = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const { HTTP_STATUS, AUDIT_CATEGORY, AUDIT_ACTION, RATING_MIN_LEVEL } = require('../constants');

/**
 * Rate a member on a completed sub-task (Manager only)
 * Criteria: quality, timeliness, communication, accuracy, ownership — each 1–10
 */
async function rateSubTask({ requestingUser, subTaskId, ratedUserId, quality, timeliness, communication, accuracy, ownership, comments, req }) {
  if (requestingUser.roleLevel < RATING_MIN_LEVEL) {
    const err = new Error('Only Managers (level 4+) can submit performance ratings');
    err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  // Validate sub-task exists and is completed
  const subTask = await db.subTask.findUnique({
    where: { id: subTaskId },
    select: { id: true, title: true, status: true, taskId: true, assignments: { select: { memberId: true } } },
  });
  if (!subTask) { const err = new Error('Sub-task not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err; }

  const approvedStatuses = ['TEAM_LEAD_APPROVED', 'FINAL_APPROVED'];
  if (!approvedStatuses.includes(subTask.status)) {
    const err = new Error('Can only rate approved sub-tasks'); err.statusCode = HTTP_STATUS.CONFLICT; throw err;
  }

  // Verify the rated user was assigned to this sub-task
  const isAssigned = subTask.assignments.some((a) => a.memberId === ratedUserId);
  if (!isAssigned) {
    const err = new Error('This user was not assigned to this sub-task'); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  // Validate scores 1–10
  const scores = { quality, timeliness, communication, accuracy, ownership };
  for (const [key, val] of Object.entries(scores)) {
    const n = parseInt(val);
    if (isNaN(n) || n < 1 || n > 10) {
      const err = new Error(`"${key}" must be a number between 1 and 10`); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
    }
    scores[key] = n;
  }

  const overall = parseFloat(((scores.quality + scores.timeliness + scores.communication + scores.accuracy + scores.ownership) / 5).toFixed(2));

  const rating = await db.performanceRating.upsert({
    where:  { subTaskId_ratedUserId: { subTaskId, ratedUserId } },
    create: { subTaskId, ratedUserId, ratedById: requestingUser.id, ...scores, overall, comments },
    update: { ...scores, overall, comments, ratedById: requestingUser.id, ratedAt: new Date() },
    include: {
      ratedUser: { select: { id: true, firstName: true, lastName: true, email: true } },
      ratedBy:   { select: { id: true, firstName: true, lastName: true } },
      subTask:   { select: { id: true, title: true } },
    },
  });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.RATING_SUBMITTED,
    category: AUDIT_CATEGORY.TASK, entity: 'PerformanceRating', entityId: rating.id,
    targetUserId: ratedUserId, targetUserName: `${rating.ratedUser.firstName} ${rating.ratedUser.lastName}`,
    description: `Rated "${rating.ratedUser.firstName}" ${overall}/10 on sub-task "${subTask.title}"`,
    newValues: { ...scores, overall }, req,
  });

  // Notify rated user
  try {
    await db.notification.create({
      data: {
        userId: ratedUserId,
        type: 'RATING_SUBMITTED',
        title: 'Performance Rating Received',
        message: `You received a rating of ${overall}/10 for "${subTask.title}"`,
        entityType: 'SubTask', entityId: subTaskId,
      },
    });
  } catch { /* non-fatal */ }

  return rating;
}

/**
 * Get performance history for a user
 */
async function getUserPerformance({ requestingUser, userId, page = 1, limit = 20 }) {
  page  = parseInt(page);
  limit = parseInt(limit);

  // Members can only see their own; Managers can see anyone
  const targetId = (requestingUser.roleLevel >= RATING_MIN_LEVEL) ? (userId || requestingUser.id) : requestingUser.id;

  const skip = (page - 1) * limit;
  const [ratings, total, aggregate] = await Promise.all([
    db.performanceRating.findMany({
      where: { ratedUserId: targetId },
      include: {
        subTask:  { select: { id: true, title: true, taskId: true, completedAt: true } },
        ratedBy:  { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { ratedAt: 'desc' },
      skip, take: limit,
    }),
    db.performanceRating.count({ where: { ratedUserId: targetId } }),
    db.performanceRating.aggregate({
      where: { ratedUserId: targetId },
      _avg: { quality: true, timeliness: true, communication: true, accuracy: true, ownership: true, overall: true },
    }),
  ]);

  return {
    ratings, total,
    averages: {
      quality:       parseFloat((aggregate._avg.quality       || 0).toFixed(2)),
      timeliness:    parseFloat((aggregate._avg.timeliness    || 0).toFixed(2)),
      communication: parseFloat((aggregate._avg.communication || 0).toFixed(2)),
      accuracy:      parseFloat((aggregate._avg.accuracy      || 0).toFixed(2)),
      ownership:     parseFloat((aggregate._avg.ownership     || 0).toFixed(2)),
      overall:       parseFloat((aggregate._avg.overall       || 0).toFixed(2)),
    },
  };
}

/**
 * Performance dashboard for a member (my stats)
 */
async function getMemberDashboard({ requestingUser }) {
  const userId = requestingUser.id;
  const [assignedTotal, completedTotal, overdueTotal, ratings] = await Promise.all([
    db.subTaskAssignment.count({ where: { memberId: userId } }),
    db.subTask.count({ where: { assignments: { some: { memberId: userId } }, status: { in: ['TEAM_LEAD_APPROVED', 'FINAL_APPROVED'] } } }),
    db.subTask.count({ where: { assignments: { some: { memberId: userId } }, dueDate: { lt: new Date() }, status: { notIn: ['TEAM_LEAD_APPROVED', 'FINAL_APPROVED'] } } }),
    db.performanceRating.aggregate({ where: { ratedUserId: userId }, _avg: { overall: true }, _count: { id: true } }),
  ]);

  const onTimePct = assignedTotal > 0 ? Math.round(((completedTotal - overdueTotal) / Math.max(completedTotal, 1)) * 100) : 0;

  return {
    totalAssigned:  assignedTotal,
    completed:      completedTotal,
    overdue:        overdueTotal,
    onTimeDelivery: `${Math.max(0, onTimePct)}%`,
    averageRating:  parseFloat((ratings._avg.overall || 0).toFixed(2)),
    totalRatings:   ratings._count.id,
  };
}

/**
 * Team performance dashboard (Team Lead view)
 */
async function getTeamDashboard({ requestingUser }) {
  const taskIds = (await db.taskAssignment.findMany({
    where: { teamLeadId: requestingUser.id },
    select: { taskId: true },
  })).map((a) => a.taskId);

  const [totalSubTasks, approvedSubTasks, inProgressSubTasks, teamRatings] = await Promise.all([
    db.subTask.count({ where: { taskId: { in: taskIds } } }),
    db.subTask.count({ where: { taskId: { in: taskIds }, status: { in: ['TEAM_LEAD_APPROVED', 'FINAL_APPROVED'] } } }),
    db.subTask.count({ where: { taskId: { in: taskIds }, status: 'IN_PROGRESS' } }),
    db.performanceRating.aggregate({
      where: { subTask: { taskId: { in: taskIds } } },
      _avg: { overall: true }, _count: { id: true },
    }),
  ]);

  return {
    assignedTasks:    taskIds.length,
    totalSubTasks,
    approvedSubTasks,
    inProgressSubTasks,
    completionRate:   totalSubTasks > 0 ? `${Math.round((approvedSubTasks / totalSubTasks) * 100)}%` : '0%',
    teamAverageRating: parseFloat((teamRatings._avg.overall || 0).toFixed(2)),
    totalRatings:      teamRatings._count.id,
  };
}

/**
 * Manager performance dashboard
 */
async function getManagerDashboard({ requestingUser }) {
  const where = { managerId: requestingUser.id, deletedAt: null };
  const [total, completed, overdue, byStatus] = await Promise.all([
    db.task.count({ where }),
    db.task.count({ where: { ...where, status: 'COMPLETED' } }),
    db.task.count({ where: { ...where, dueDate: { lt: new Date() }, status: { notIn: ['COMPLETED', 'REJECTED'] } } }),
    db.task.groupBy({ by: ['status'], where, _count: { id: true } }),
  ]);

  return {
    totalTasks:      total,
    completedTasks:  completed,
    overdueTasks:    overdue,
    completionRate:  total > 0 ? `${Math.round((completed / total) * 100)}%` : '0%',
    byStatus:        byStatus.map((s) => ({ status: s.status, count: s._count.id })),
  };
}

/**
 * Organization leaderboard — top performers by average rating
 */
async function getLeaderboard({ limit = 10 }) {
  limit = parseInt(limit);
  const topUsers = await db.performanceRating.groupBy({
    by: ['ratedUserId'],
    _avg: { overall: true },
    _count: { id: true },
    having: { overall: { _avg: { gt: 0 } } },
    orderBy: { _avg: { overall: 'desc' } },
    take: limit,
  });

  const userIds = topUsers.map((u) => u.ratedUserId);
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, firstName: true, lastName: true, department: true, jobTitle: true, role: { select: { displayName: true } } },
  });

  return topUsers.map((entry) => {
    const user = users.find((u) => u.id === entry.ratedUserId);
    return {
      user,
      averageRating: parseFloat((entry._avg.overall || 0).toFixed(2)),
      totalRatings:  entry._count.id,
    };
  });
}

module.exports = {
  rateSubTask, getUserPerformance,
  getMemberDashboard, getTeamDashboard, getManagerDashboard,
  getLeaderboard,
};
