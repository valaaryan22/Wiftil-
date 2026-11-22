'use strict';

const { Op, fn, col }   = require('sequelize');
const { db }            = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const { HTTP_STATUS, AUDIT_CATEGORY, AUDIT_ACTION, RATING_MIN_LEVEL } = require('../constants');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function _validateScores(scores) {
  const keys = ['quality', 'timeliness', 'communication', 'accuracy', 'ownership'];
  const parsed = {};
  for (const key of keys) {
    const n = parseInt(scores[key]);
    if (isNaN(n) || n < 1 || n > 10) {
      const err = new Error(`"${key}" must be a number between 1 and 10`);
      err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
    }
    parsed[key] = n;
  }
  parsed.rawOverall = parseFloat(((parsed.quality + parsed.timeliness + parsed.communication + parsed.accuracy + parsed.ownership) / 5).toFixed(2));
  return parsed;
}

// ─── 1. RATE MEMBER ON A SUB-TASK (Manager, level 4+) ────────────────────────
// Supports sub-tasks assigned to multiple members — each member is rated
// separately and their 'overall' is weighted by their contribution %.
// e.g. 2 members: 70% + 30% → overall = rawAvg × 0.7 or rawAvg × 0.3
async function rateSubTask({ requestingUser, subTaskId, ratedUserId, quality, timeliness, communication, accuracy, ownership, comments, req }) {
  if (requestingUser.roleLevel > RATING_MIN_LEVEL) {
    const err = new Error('Only Manager level or above (level ≤ 3) can submit sub-task performance ratings');
    err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  // Load the sub-task and its assignments
  const subTask = await db.SubTask.findOne({
    where: { id: subTaskId },
    attributes: ['id', 'title', 'status'],
    include: [{ model: db.SubTaskAssignment, as: 'assignments', attributes: ['memberId', 'contribution'] }],
  });
  if (!subTask) { const err = new Error('Sub-task not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err; }

  const approvedStatuses = ['TEAM_LEAD_APPROVED', 'FINAL_APPROVED'];
  if (!approvedStatuses.includes(subTask.status)) {
    const err = new Error('Can only rate approved sub-tasks'); err.statusCode = HTTP_STATUS.CONFLICT; throw err;
  }

  const subTaskJson = subTask.toJSON ? subTask.toJSON() : subTask;
  const assignment  = subTaskJson.assignments.find(a => a.memberId === ratedUserId);
  if (!assignment) {
    const err = new Error('This user was not assigned to this sub-task'); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  // Validate criteria scores
  const scores = _validateScores({ quality, timeliness, communication, accuracy, ownership });

  // Weight the overall by this member's contribution percentage.
  // If sole member (100%), overall === rawOverall. If 30% of a team, overall = rawOverall × 0.30.
  const contributionPct = parseFloat(assignment.contribution) || 100;
  const overall = parseFloat((scores.rawOverall * (contributionPct / 100)).toFixed(2));

  // Check if this member has already been rated for this sub-task
  const existingRating = await db.PerformanceRating.findOne({
    where: { subTaskId, ratedUserId },
    include: [{ model: db.User, as: 'ratedUser', attributes: ['firstName', 'lastName'] }],
  });
  if (existingRating) {
    const name = existingRating.ratedUser
      ? `${existingRating.ratedUser.firstName} ${existingRating.ratedUser.lastName}`
      : ratedUserId;
    const err = new Error(`"${name}" has already been rated for this sub-task. Each member can only be rated once per sub-task.`);
    err.statusCode = HTTP_STATUS.CONFLICT;
    throw err;
  }

  const rating = await db.PerformanceRating.create({
    subTaskId, ratedUserId, ratedById: requestingUser.id,
    ratingType: 'SUBTASK',
    quality: scores.quality, timeliness: scores.timeliness,
    communication: scores.communication, accuracy: scores.accuracy,
    ownership: scores.ownership,
    overall, contributionPct, comments,
  });

  const fullRating = await db.PerformanceRating.findByPk(rating.id, {
    include: [
      { model: db.User,    as: 'ratedUser', attributes: ['id', 'firstName', 'lastName', 'email'] },
      { model: db.User,    as: 'ratedBy',   attributes: ['id', 'firstName', 'lastName'] },
      { model: db.SubTask, as: 'subTask',   attributes: ['id', 'title'] },
    ],
  });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.RATING_SUBMITTED, category: AUDIT_CATEGORY.TASK,
    entity: 'PerformanceRating', entityId: rating.id,
    targetUserId: ratedUserId, targetUserName: `${fullRating.ratedUser.firstName} ${fullRating.ratedUser.lastName}`,
    description: `Rated "${fullRating.ratedUser.firstName}" overall ${overall}/10 (contribution ${contributionPct}%, raw avg ${scores.rawOverall}/10) on sub-task "${subTask.title}"`,
    newValues: { ...scores, overall, contributionPct }, req,
  });

  try {
    await db.Notification.create({
      userId: ratedUserId, type: 'RATING_SUBMITTED', title: 'Performance Rating Received',
      message: `You received a rating of ${overall}/10 for "${subTask.title}" (your ${contributionPct}% contribution)`,
      entityType: 'SubTask', entityId: subTaskId,
    });
  } catch { /* non-fatal */ }

  return fullRating;
}

// ─── 2. RATE A MANAGER / TEAM LEAD DIRECTLY (Boss/Admin, level 5 only) ───────
// Not tied to any sub-task. Used by Boss to evaluate Managers and Team Leads
// for a given review period (e.g. "Q2 2026", "June 2026").
async function rateUserDirectly({ requestingUser, ratedUserId, periodLabel, quality, timeliness, communication, accuracy, ownership, comments, req }) {
  if (requestingUser.roleLevel > 2) {
    const err = new Error('Only BOSS or ADMIN (level ≤ 2) can submit direct performance ratings');
    err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  // Cannot rate yourself
  if (requestingUser.id === ratedUserId) {
    const err = new Error('You cannot rate yourself'); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  // Verify the target user exists and is a Manager (4) or Team Lead (2-3)
  const ratedUser = await db.User.findOne({
    where: { id: ratedUserId, deletedAt: null },
    attributes: ['id', 'firstName', 'lastName', 'email'],
    include: [{ model: db.RoleDefinition, as: 'role', attributes: ['name', 'accessLevel'] }],
  });
  if (!ratedUser) {
    const err = new Error('User not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
  }

  // Target must not be BOSS (level 1) — only Managers (level 3) or Team Leads (level 4) get direct ratings
  const targetLevel = ratedUser.role?.accessLevel;
  if (!targetLevel || targetLevel <= 2) {
    const err = new Error('Direct ratings can only be given to Managers (level 3) or Team Leads (level 4)');
    err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  if (!periodLabel?.trim()) {
    const err = new Error('periodLabel is required for direct ratings (e.g. "Q2 2026")');
    err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  // Validate scores
  const scores = _validateScores({ quality, timeliness, communication, accuracy, ownership });
  const overall = scores.rawOverall; // No contribution weighting for direct ratings

  // Allow multiple ratings per user per period; or upsert by (ratedUserId + periodLabel)
  const [rating, created] = await db.PerformanceRating.findOrCreate({
    where: { subTaskId: null, ratedUserId, periodLabel: periodLabel.trim() },
    defaults: {
      ratedById: requestingUser.id,
      ratingType: 'DIRECT',
      periodLabel: periodLabel.trim(),
      quality: scores.quality, timeliness: scores.timeliness,
      communication: scores.communication, accuracy: scores.accuracy,
      ownership: scores.ownership,
      overall, contributionPct: 100, comments,
    },
  });
  if (!created) {
    await rating.update({
      quality: scores.quality, timeliness: scores.timeliness,
      communication: scores.communication, accuracy: scores.accuracy,
      ownership: scores.ownership,
      overall, comments,
      ratedById: requestingUser.id, ratedAt: new Date(),
    });
  }

  const fullRating = await db.PerformanceRating.findByPk(rating.id, {
    include: [
      { model: db.User, as: 'ratedUser', attributes: ['id', 'firstName', 'lastName', 'email'] },
      { model: db.User, as: 'ratedBy',   attributes: ['id', 'firstName', 'lastName'] },
    ],
  });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.RATING_SUBMITTED, category: AUDIT_CATEGORY.TASK,
    entity: 'PerformanceRating', entityId: rating.id,
    targetUserId: ratedUserId, targetUserName: `${ratedUser.firstName} ${ratedUser.lastName}`,
    description: `Boss directly rated "${ratedUser.firstName} ${ratedUser.lastName}" ${overall}/10 for period "${periodLabel}"`,
    newValues: { ...scores, overall, periodLabel }, req,
  });

  try {
    await db.Notification.create({
      userId: ratedUserId, type: 'RATING_SUBMITTED', title: 'Performance Review Received',
      message: `You received a performance review of ${overall}/10 for the period "${periodLabel}"`,
      entityType: 'User', entityId: ratedUserId,
    });
  } catch { /* non-fatal */ }

  return fullRating;
}

// ─── 3. GET USER PERFORMANCE HISTORY ─────────────────────────────────────────
// Returns paginated ratings + overall averages.
// Distinguishes SUBTASK vs DIRECT ratings in response.
// Averages for SUBTASK ratings use weighted 'overall'; DIRECT use straight overall.
async function getUserPerformance({ requestingUser, userId, page = 1, limit = 20 }) {
  page  = parseInt(page);
  limit = parseInt(limit);
  // BOSS/ADMIN can query any user's performance; others see only their own
  const targetId = (requestingUser.roleLevel <= RATING_MIN_LEVEL) ? (userId || requestingUser.id) : requestingUser.id;

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

  // Compute averages across ALL ratings
  const allRatings = await db.PerformanceRating.findAll({
    where: { ratedUserId: targetId },
    attributes: ['quality', 'timeliness', 'communication', 'accuracy', 'ownership', 'overall', 'ratingType'],
    raw: true,
  });

  // For criteria averages, use raw criteria (not contribution-weighted)
  // For 'overall' average, use the stored weighted/direct overall
  const avg = (field) =>
    allRatings.length
      ? parseFloat((allRatings.reduce((s, r) => s + (r[field] || 0), 0) / allRatings.length).toFixed(2))
      : 0;

  const subtaskRatings = allRatings.filter(r => r.ratingType === 'SUBTASK');
  const directRatings  = allRatings.filter(r => r.ratingType === 'DIRECT');

  const avgOf = (list, field) =>
    list.length ? parseFloat((list.reduce((s, r) => s + (r[field] || 0), 0) / list.length).toFixed(2)) : 0;

  return {
    ratings,
    total,
    averages: {
      quality:       avg('quality'),
      timeliness:    avg('timeliness'),
      communication: avg('communication'),
      accuracy:      avg('accuracy'),
      ownership:     avg('ownership'),
      overall:       avg('overall'),
    },
    subtask: {
      count:          subtaskRatings.length,
      averageOverall: avgOf(subtaskRatings, 'overall'),
    },
    direct: {
      count:          directRatings.length,
      averageOverall: avgOf(directRatings, 'overall'),
    },
  };
}

// ─── 4. MEMBER DASHBOARD ─────────────────────────────────────────────────────
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
    db.PerformanceRating.findAll({ where: { ratedUserId: userId }, attributes: ['overall', 'ratingType'], raw: true }),
  ]);

  const onTimePct  = assignedTotal > 0 ? Math.round(((completedTotal - overdueTotal) / Math.max(completedTotal, 1)) * 100) : 0;
  const avgOverall = allRatings.length ? parseFloat((allRatings.reduce((s, r) => s + r.overall, 0) / allRatings.length).toFixed(2)) : 0;

  return {
    totalAssigned: assignedTotal, completed: completedTotal, overdue: overdueTotal,
    onTimeDelivery: `${Math.max(0, onTimePct)}%`,
    averageRating: avgOverall, totalRatings: allRatings.length,
  };
}

// ─── 5. TEAM LEAD DASHBOARD ───────────────────────────────────────────────────
// Shows team sub-task stats AND the team lead's own personal ratings (DIRECT from Boss).
async function getTeamDashboard({ requestingUser }) {
  const taskIds = (await db.TaskAssignment.findAll({
    where: { teamLeadId: requestingUser.id }, attributes: ['taskId'], raw: true,
  })).map(a => a.taskId);

  const [totalSubTasks, approvedSubTasks, inProgressSubTasks, teamRatings, myRatings] = await Promise.all([
    db.SubTask.count({ where: { taskId: { [Op.in]: taskIds } } }),
    db.SubTask.count({ where: { taskId: { [Op.in]: taskIds }, status: { [Op.in]: ['TEAM_LEAD_APPROVED', 'FINAL_APPROVED'] } } }),
    db.SubTask.count({ where: { taskId: { [Op.in]: taskIds }, status: 'IN_PROGRESS' } }),
    db.PerformanceRating.findAll({
      attributes: ['overall'],
      include: [{ model: db.SubTask, as: 'subTask', where: { taskId: { [Op.in]: taskIds } }, attributes: [] }],
      raw: true,
    }),
    // Personal ratings received by this team lead (DIRECT from Boss)
    db.PerformanceRating.findAll({
      where: { ratedUserId: requestingUser.id },
      attributes: ['overall', 'ratingType', 'periodLabel', 'ratedAt'],
      order: [['ratedAt', 'DESC']],
      raw: true,
    }),
  ]);

  const avgRating  = teamRatings.length  ? parseFloat((teamRatings.reduce((s, r) => s + r.overall, 0) / teamRatings.length).toFixed(2)) : 0;
  const myAvgRating = myRatings.length   ? parseFloat((myRatings.reduce((s, r) => s + r.overall, 0) / myRatings.length).toFixed(2)) : 0;

  return {
    assignedTasks: taskIds.length, totalSubTasks, approvedSubTasks, inProgressSubTasks,
    completionRate: totalSubTasks > 0 ? `${Math.round((approvedSubTasks / totalSubTasks) * 100)}%` : '0%',
    teamAverageRating: avgRating, totalRatings: teamRatings.length,
    // Personal performance section (from Boss/Admin direct ratings)
    myPerformance: {
      totalRatings:  myRatings.length,
      averageRating: myAvgRating,
      recentRatings: myRatings.slice(0, 5),
    },
  };
}

// ─── 6. MANAGER DASHBOARD ─────────────────────────────────────────────────────
// Shows task management stats AND the manager's own personal ratings (DIRECT from Boss).
async function getManagerDashboard({ requestingUser }) {
  const where = { managerId: requestingUser.id, deletedAt: null };
  const [total, completed, overdue, byStatus, myRatings] = await Promise.all([
    db.Task.count({ where }),
    db.Task.count({ where: { ...where, status: 'COMPLETED' } }),
    db.Task.count({ where: { ...where, dueDate: { [Op.lt]: new Date() }, status: { [Op.notIn]: ['COMPLETED', 'REJECTED'] } } }),
    db.Task.findAll({
      where, attributes: ['status', [fn('COUNT', col('id')), 'count']],
      group: ['status'], raw: true,
    }),
    // Personal ratings received by this manager (DIRECT from Boss)
    db.PerformanceRating.findAll({
      where: { ratedUserId: requestingUser.id },
      attributes: ['overall', 'ratingType', 'periodLabel', 'ratedAt', 'quality', 'timeliness', 'communication', 'accuracy', 'ownership', 'comments'],
      order: [['ratedAt', 'DESC']],
      raw: true,
    }),
  ]);

  const myAvgRating = myRatings.length ? parseFloat((myRatings.reduce((s, r) => s + r.overall, 0) / myRatings.length).toFixed(2)) : 0;

  return {
    totalTasks: total, completedTasks: completed, overdueTasks: overdue,
    completionRate: total > 0 ? `${Math.round((completed / total) * 100)}%` : '0%',
    byStatus: byStatus.map(s => ({ status: s.status, count: parseInt(s.count) })),
    // Personal performance section (from Boss/Admin direct ratings)
    myPerformance: {
      totalRatings:  myRatings.length,
      averageRating: myAvgRating,
      recentRatings: myRatings.slice(0, 5),
    },
  };
}

// ─── 7. LEADERBOARD ───────────────────────────────────────────────────────────
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
  const users   = await db.User.findAll({
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
  rateSubTask,
  rateUserDirectly,
  getUserPerformance,
  getMemberDashboard, getTeamDashboard, getManagerDashboard,
  getLeaderboard,
};
