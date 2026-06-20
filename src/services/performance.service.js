'use strict';

const { Op, fn, col }   = require('sequelize');
const { db }            = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const { HTTP_STATUS, AUDIT_CATEGORY, AUDIT_ACTION, RATING_MIN_LEVEL } = require('../constants');

async function rateSubTask({ requestingUser, subTaskId, ratedUserId, quality, timeliness, communication, accuracy, ownership, comments, req }) {
  if (requestingUser.roleLevel < RATING_MIN_LEVEL) {
    const err = new Error('Only Managers (level 4+) can submit performance ratings');
    err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  const subTask = await db.SubTask.findOne({
    where: { id: subTaskId },
    attributes: ['id', 'title', 'status'],
    include: [{ model: db.SubTaskAssignment, as: 'assignments', attributes: ['memberId'] }],
  });
  if (!subTask) { const err = new Error('Sub-task not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err; }

  const approvedStatuses = ['TEAM_LEAD_APPROVED', 'FINAL_APPROVED'];
  if (!approvedStatuses.includes(subTask.status)) {
    const err = new Error('Can only rate approved sub-tasks'); err.statusCode = HTTP_STATUS.CONFLICT; throw err;
  }

  const subTaskJson = subTask.toJSON ? subTask.toJSON() : subTask;
  const isAssigned = subTaskJson.assignments.some(a => a.memberId === ratedUserId);
  if (!isAssigned) {
    const err = new Error('This user was not assigned to this sub-task'); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  const scores = { quality, timeliness, communication, accuracy, ownership };
  for (const [key, val] of Object.entries(scores)) {
    const n = parseInt(val);
    if (isNaN(n) || n < 1 || n > 10) {
      const err = new Error(`"${key}" must be a number between 1 and 10`); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
    }
    scores[key] = n;
  }

  const overall = parseFloat(((scores.quality + scores.timeliness + scores.communication + scores.accuracy + scores.ownership) / 5).toFixed(2));

  const [rating, created] = await db.PerformanceRating.findOrCreate({
    where: { subTaskId, ratedUserId },
    defaults: { subTaskId, ratedUserId, ratedById: requestingUser.id, ...scores, overall, comments },
  });
  if (!created) {
    await rating.update({ ...scores, overall, comments, ratedById: requestingUser.id, ratedAt: new Date() });
  }

  const fullRating = await db.PerformanceRating.findByPk(rating.id, {
    include: [
      { model: db.User, as: 'ratedUser', attributes: ['id', 'firstName', 'lastName', 'email'] },
      { model: db.User, as: 'ratedBy',   attributes: ['id', 'firstName', 'lastName'] },
      { model: db.SubTask, as: 'subTask', attributes: ['id', 'title'] },
    ],
  });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.RATING_SUBMITTED, category: AUDIT_CATEGORY.TASK,
    entity: 'PerformanceRating', entityId: rating.id,
    targetUserId: ratedUserId, targetUserName: `${fullRating.ratedUser.firstName} ${fullRating.ratedUser.lastName}`,
    description: `Rated "${fullRating.ratedUser.firstName}" ${overall}/10 on sub-task "${subTask.title}"`,
    newValues: { ...scores, overall }, req,
  });

  try {
    await db.Notification.create({
      userId: ratedUserId, type: 'RATING_SUBMITTED', title: 'Performance Rating Received',
      message: `You received a rating of ${overall}/10 for "${subTask.title}"`,
      entityType: 'SubTask', entityId: subTaskId,
    });
  } catch { /* non-fatal */ }

  return fullRating;
}

async function getUserPerformance({ requestingUser, userId, page = 1, limit = 20 }) {
  page  = parseInt(page);
  limit = parseInt(limit);
  const targetId = (requestingUser.roleLevel >= RATING_MIN_LEVEL) ? (userId || requestingUser.id) : requestingUser.id;

  const [ratings, total] = await Promise.all([
    db.PerformanceRating.findAll({
      where: { ratedUserId: targetId },
      include: [
        { model: db.SubTask, as: 'subTask', attributes: ['id', 'title', 'taskId', 'completedAt'] },
        { model: db.User,    as: 'ratedBy', attributes: ['id', 'firstName', 'lastName'] },
      ],
      order: [['ratedAt', 'DESC']],
      offset: (page - 1) * limit, limit,
    }),
    db.PerformanceRating.count({ where: { ratedUserId: targetId } }),
  ]);

  // Compute averages manually
  const allRatings = await db.PerformanceRating.findAll({
    where: { ratedUserId: targetId },
    attributes: ['quality', 'timeliness', 'communication', 'accuracy', 'ownership', 'overall'],
    raw: true,
  });
  const avg = (field) => allRatings.length ? parseFloat((allRatings.reduce((s, r) => s + (r[field] || 0), 0) / allRatings.length).toFixed(2)) : 0;

  return {
    ratings, total,
    averages: {
      quality: avg('quality'), timeliness: avg('timeliness'), communication: avg('communication'),
      accuracy: avg('accuracy'), ownership: avg('ownership'), overall: avg('overall'),
    },
  };
}

async function getMemberDashboard({ requestingUser }) {
  const userId = requestingUser.id;
  const [assignedTotal, completedTotal, overdueTotal, allRatings] = await Promise.all([
    db.SubTaskAssignment.count({ where: { memberId: userId } }),
    db.SubTask.count({
      where: { status: { [Op.in]: ['TEAM_LEAD_APPROVED', 'FINAL_APPROVED'] } },
      include: [{ model: db.SubTaskAssignment, as: 'assignments', where: { memberId: userId }, attributes: [] }],
    }),
    db.SubTask.count({
      where: { dueDate: { [Op.lt]: new Date() }, status: { [Op.notIn]: ['TEAM_LEAD_APPROVED', 'FINAL_APPROVED'] } },
      include: [{ model: db.SubTaskAssignment, as: 'assignments', where: { memberId: userId }, attributes: [] }],
    }),
    db.PerformanceRating.findAll({ where: { ratedUserId: userId }, attributes: ['overall'], raw: true }),
  ]);

  const onTimePct = assignedTotal > 0 ? Math.round(((completedTotal - overdueTotal) / Math.max(completedTotal, 1)) * 100) : 0;
  const avgOverall = allRatings.length ? parseFloat((allRatings.reduce((s, r) => s + r.overall, 0) / allRatings.length).toFixed(2)) : 0;

  return {
    totalAssigned: assignedTotal, completed: completedTotal, overdue: overdueTotal,
    onTimeDelivery: `${Math.max(0, onTimePct)}%`,
    averageRating: avgOverall, totalRatings: allRatings.length,
  };
}

async function getTeamDashboard({ requestingUser }) {
  const taskIds = (await db.TaskAssignment.findAll({
    where: { teamLeadId: requestingUser.id }, attributes: ['taskId'], raw: true,
  })).map(a => a.taskId);

  const [totalSubTasks, approvedSubTasks, inProgressSubTasks, teamRatings] = await Promise.all([
    db.SubTask.count({ where: { taskId: { [Op.in]: taskIds } } }),
    db.SubTask.count({ where: { taskId: { [Op.in]: taskIds }, status: { [Op.in]: ['TEAM_LEAD_APPROVED', 'FINAL_APPROVED'] } } }),
    db.SubTask.count({ where: { taskId: { [Op.in]: taskIds }, status: 'IN_PROGRESS' } }),
    db.PerformanceRating.findAll({
      attributes: ['overall'],
      include: [{ model: db.SubTask, as: 'subTask', where: { taskId: { [Op.in]: taskIds } }, attributes: [] }],
      raw: true,
    }),
  ]);

  const avgRating = teamRatings.length ? parseFloat((teamRatings.reduce((s, r) => s + r.overall, 0) / teamRatings.length).toFixed(2)) : 0;

  return {
    assignedTasks: taskIds.length, totalSubTasks, approvedSubTasks, inProgressSubTasks,
    completionRate: totalSubTasks > 0 ? `${Math.round((approvedSubTasks / totalSubTasks) * 100)}%` : '0%',
    teamAverageRating: avgRating, totalRatings: teamRatings.length,
  };
}

async function getManagerDashboard({ requestingUser }) {
  const where = { managerId: requestingUser.id, deletedAt: null };
  const [total, completed, overdue, byStatus] = await Promise.all([
    db.Task.count({ where }),
    db.Task.count({ where: { ...where, status: 'COMPLETED' } }),
    db.Task.count({ where: { ...where, dueDate: { [Op.lt]: new Date() }, status: { [Op.notIn]: ['COMPLETED', 'REJECTED'] } } }),
    db.Task.findAll({
      where, attributes: ['status', [fn('COUNT', col('id')), 'count']],
      group: ['status'], raw: true,
    }),
  ]);

  return {
    totalTasks: total, completedTasks: completed, overdueTasks: overdue,
    completionRate: total > 0 ? `${Math.round((completed / total) * 100)}%` : '0%',
    byStatus: byStatus.map(s => ({ status: s.status, count: parseInt(s.count) })),
  };
}

async function getLeaderboard({ limit = 10 }) {
  limit = parseInt(limit);

  const topUsers = await db.PerformanceRating.findAll({
    attributes: ['ratedUserId', [fn('AVG', col('overall')), 'avgRating'], [fn('COUNT', col('id')), 'totalRatings']],
    group: ['ratedUserId'],
    order: [[fn('AVG', col('overall')), 'DESC']],
    limit,
    raw: true,
  });

  const userIds = topUsers.map(u => u.ratedUserId);
  const users = await db.User.findAll({
    where: { id: { [Op.in]: userIds } },
    attributes: ['id', 'firstName', 'lastName', 'department', 'jobTitle'],
    include: [{ model: db.RoleDefinition, as: 'role', attributes: ['displayName'] }],
  });

  return topUsers.map(entry => {
    const user = users.find(u => u.id === entry.ratedUserId);
    return {
      user: user ? user.toJSON() : null,
      averageRating: parseFloat(parseFloat(entry.avgRating || 0).toFixed(2)),
      totalRatings:  parseInt(entry.totalRatings),
    };
  });
}

module.exports = {
  rateSubTask, getUserPerformance,
  getMemberDashboard, getTeamDashboard, getManagerDashboard,
  getLeaderboard,
};
