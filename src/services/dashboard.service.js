'use strict';

const { Op, fn, col, literal } = require('sequelize');
const { db } = require('../database/client');

// ─── Reusable attribute/include snippets ─────────────────────────────────────

const USER_SNAP = (as) => ({
  model: db.User, as,
  attributes: ['id', 'firstName', 'lastName', 'email', 'profilePicture'],
});

const ROLE_SNAP = {
  model: db.RoleDefinition, as: 'role',
  attributes: ['name', 'displayName', 'accessLevel'],
};

const CLIENT_SNAP = {
  model: db.Client, as: 'client',
  attributes: ['id', 'name'],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function paginate(page, limit) {
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit) || 20));
  return { offset: (p - 1) * l, limit: l };
}

function toToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ─── 1. Summary ───────────────────────────────────────────────────────────────

/**
 * Full dashboard summary: counts for tasks, subtasks, dockets, tickets,
 * leaves, unread notifications, and performance average.
 */
async function getDashboardSummary(userId) {
  const today = toToday();

  // ── Tasks: assigned as team lead ──────────────────────────────────────
  const assignedTaskIds = (
    await db.TaskAssignment.findAll({
      where: { teamLeadId: userId },
      attributes: ['taskId'],
      raw: true,
    })
  ).map((r) => r.taskId);

  const taskRows = await db.Task.findAll({
    where: {
      [Op.or]: [
        { id: { [Op.in]: assignedTaskIds } },
        { managerId: userId },
      ],
      deletedAt: null,
    },
    attributes: ['status', 'dueDate'],
    raw: true,
  });

  const taskByStatus = {};
  let taskOverdue = 0;
  for (const t of taskRows) {
    taskByStatus[t.status] = (taskByStatus[t.status] || 0) + 1;
    if (
      t.dueDate &&
      new Date(t.dueDate) < today &&
      !['COMPLETED', 'MANAGER_APPROVED'].includes(t.status)
    ) {
      taskOverdue++;
    }
  }

  // ── SubTasks: assigned as member ──────────────────────────────────────
  const assignedSubTaskIds = (
    await db.SubTaskAssignment.findAll({
      where: { memberId: userId },
      attributes: ['subTaskId'],
      raw: true,
    })
  ).map((r) => r.subTaskId);

  const subTaskRows = await db.SubTask.findAll({
    where: { id: { [Op.in]: assignedSubTaskIds } },
    attributes: ['status', 'dueDate'],
    raw: true,
  });

  const subTaskByStatus = {};
  let subTaskOverdue = 0;
  for (const s of subTaskRows) {
    subTaskByStatus[s.status] = (subTaskByStatus[s.status] || 0) + 1;
    if (
      s.dueDate &&
      new Date(s.dueDate) < today &&
      !['FINAL_APPROVED', 'TEAM_LEAD_APPROVED'].includes(s.status)
    ) {
      subTaskOverdue++;
    }
  }

  // ── Dockets: I am a manager ───────────────────────────────────────────
  const managedDocketIds = (
    await db.DocketManager.findAll({
      where: { managerId: userId },
      attributes: ['docketId'],
      raw: true,
    })
  ).map((r) => r.docketId);

  const docketRows = await db.Docket.findAll({
    where: { id: { [Op.in]: managedDocketIds }, deletedAt: null },
    attributes: ['status'],
    raw: true,
  });

  const docketByStatus = {};
  for (const d of docketRows) {
    docketByStatus[d.status] = (docketByStatus[d.status] || 0) + 1;
  }

  // ── Tickets: assigned to me ───────────────────────────────────────────
  const ticketRows = await db.DocketTicket.findAll({
    where: { assignedToId: userId },
    attributes: ['status'],
    raw: true,
  });

  const ticketByStatus = {};
  for (const tk of ticketRows) {
    ticketByStatus[tk.status] = (ticketByStatus[tk.status] || 0) + 1;
  }

  // ── Leaves ────────────────────────────────────────────────────────────
  const user = await db.User.findByPk(userId, { include: ['role'] });
  const isManager = user?.role?.accessLevel <= 3;
  const leaveWhere = isManager ? {} : { requesterId: userId };
  
  const [leaveTotal, leavePending] = await Promise.all([
    db.LeaveRequest.count({ where: leaveWhere }),
    db.LeaveRequest.count({ where: { ...leaveWhere, status: 'PENDING' } }),
  ]);

  // ── Date Change Requests ──────────────────────────────────────────────
  const reqWhere = isManager ? {} : { requestedById: userId };
  const [reqTotal, reqPending] = await Promise.all([
    db.DateChangeRequest.count({ where: reqWhere }),
    db.DateChangeRequest.count({ where: { ...reqWhere, status: 'PENDING' } }),
  ]);

  // ── Notifications ─────────────────────────────────────────────────────
  const unreadNotifications = await db.Notification.count({
    where: { userId, isRead: false },
  });

  // ── Performance ───────────────────────────────────────────────────────
  const perfRows = await db.PerformanceRating.findAll({
    where: { ratedUserId: userId },
    attributes: ['overall'],
    raw: true,
  });

  const totalRatings = perfRows.length;
  const avgOverall =
    totalRatings > 0
      ? +(perfRows.reduce((sum, r) => sum + r.overall, 0) / totalRatings).toFixed(2)
      : null;

  return {
    tasks: {
      total: taskRows.length,
      byStatus: taskByStatus,
      overdue: taskOverdue,
    },
    subtasks: {
      total: subTaskRows.length,
      byStatus: subTaskByStatus,
      overdue: subTaskOverdue,
    },
    dockets: {
      total: docketRows.length,
      byStatus: docketByStatus,
    },
    tickets: {
      total: ticketRows.length,
      byStatus: ticketByStatus,
    },
    leaves: {
      total: leaveTotal,
      pending: leavePending,
    },
    requests: {
      total: reqTotal,
      pending: reqPending,
    },
    notifications: {
      unread: unreadNotifications,
    },
    performance: {
      totalRatings,
      avgOverall,
    },
  };
}

// ─── 2. Tasks ─────────────────────────────────────────────────────────────────

/**
 * Tasks where the user is team-lead assignee OR manager.
 * Query param `role`: "assignee" | "manager" | (omit = both)
 */
async function getDashboardTasks(userId, { page, limit, status, priority, search, role } = {}) {
  const { offset, limit: lim } = paginate(page, limit);

  // Resolve task IDs where user is team-lead
  let assignedTaskIds = null;
  if (!role || role === 'assignee') {
    const rows = await db.TaskAssignment.findAll({
      where: { teamLeadId: userId },
      attributes: ['taskId'],
      raw: true,
    });
    assignedTaskIds = rows.map((r) => r.taskId);
  }

  // Build OR condition
  const orConditions = [];
  if (assignedTaskIds !== null) {
    if (assignedTaskIds.length > 0) {
      orConditions.push({ id: { [Op.in]: assignedTaskIds } });
    }
  }
  if (!role || role === 'manager') {
    orConditions.push({ managerId: userId });
  }

  if (orConditions.length === 0) {
    return { tasks: [], total: 0 };
  }

  const where = { [Op.or]: orConditions, deletedAt: null };
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (search) {
    where.title = { [Op.iLike]: `%${search}%` };
  }

  const { rows: tasks, count: total } = await db.Task.findAndCountAll({
    where,
    attributes: [
      'id', 'title', 'description', 'priority', 'status',
      'startDate', 'dueDate', 'estimatedHours', 'actualHours',
      'completionPercent', 'managerId', 'createdById',
      'submittedAt', 'approvedAt', 'completedAt', 'createdAt', 'updatedAt',
    ],
    include: [
      USER_SNAP('createdBy'),
      USER_SNAP('manager'),
      {
        model: db.TaskAssignment, as: 'assignments',
        include: [USER_SNAP('teamLead')],
      },
      {
        model: db.Docket, as: 'docket',
        attributes: ['id', 'docketCode', 'title'],
        include: [CLIENT_SNAP],
      },
    ],
    order: [['createdAt', 'DESC']],
    limit: lim,
    offset,
    distinct: true,
  });

  return { tasks, total };
}

// ─── 3. SubTasks ──────────────────────────────────────────────────────────────

/**
 * SubTasks assigned to the user as a member.
 */
async function getDashboardSubTasks(userId, { page, limit, status, priority, search } = {}) {
  const { offset, limit: lim } = paginate(page, limit);

  const assignmentRows = await db.SubTaskAssignment.findAll({
    where: { memberId: userId },
    attributes: ['subTaskId', 'contribution'],
    raw: true,
  });

  const subTaskIds = assignmentRows.map((r) => r.subTaskId);
  if (!subTaskIds.length) return { subTasks: [], total: 0 };

  const contribMap = Object.fromEntries(
    assignmentRows.map((r) => [r.subTaskId, r.contribution])
  );

  const where = { id: { [Op.in]: subTaskIds } };
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (search) where.title = { [Op.iLike]: `%${search}%` };

  const { rows, count: total } = await db.SubTask.findAndCountAll({
    where,
    attributes: [
      'id', 'title', 'description', 'priority', 'status',
      'startDate', 'dueDate', 'estimatedHours', 'actualHours',
      'startedAt', 'submittedAt', 'completedAt', 'taskId', 'docketId',
      'createdAt', 'updatedAt',
    ],
    include: [
      {
        model: db.Task, as: 'task',
        attributes: ['id', 'title', 'status', 'priority'],
      },
      {
        model: db.Docket, as: 'docket',
        attributes: ['id', 'docketCode', 'title'],
        include: [CLIENT_SNAP],
      },
      USER_SNAP('createdBy'),
    ],
    order: [['dueDate', 'ASC'], ['createdAt', 'DESC']],
    limit: lim,
    offset,
    distinct: true,
  });

  // Attach contribution percentage to each subTask
  const subTasks = rows.map((st) => ({
    ...st.toJSON(),
    myContribution: contribMap[st.id] ?? null,
  }));

  return { subTasks, total };
}

// ─── 4. Dockets ───────────────────────────────────────────────────────────────

/**
 * Dockets where the user is listed as a manager (any role: PRIMARY / SECONDARY / REVIEWER).
 */
async function getDashboardDockets(userId, { page, limit, status, search, docketType } = {}) {
  const { offset, limit: lim } = paginate(page, limit);

  const managedRows = await db.DocketManager.findAll({
    where: { managerId: userId },
    attributes: ['docketId', 'role'],
    raw: true,
  });

  const docketIds = managedRows.map((r) => r.docketId);
  if (!docketIds.length) return { dockets: [], total: 0 };

  const roleMap = Object.fromEntries(managedRows.map((r) => [r.docketId, r.role]));

  const where = { id: { [Op.in]: docketIds }, deletedAt: null };
  if (status) where.status = status;
  if (docketType) where.docketType = docketType;
  if (search) {
    where[Op.or] = [
      { title: { [Op.iLike]: `%${search}%` } },
      { docketCode: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const { rows, count: total } = await db.Docket.findAndCountAll({
    where,
    attributes: [
      'id', 'docketCode', 'title', 'description', 'docketType',
      'isTicketBased', 'status', 'startDate', 'endDate',
      'publishedAt', 'created_at', 'updated_at',
    ],
    include: [
      CLIENT_SNAP,
      USER_SNAP('createdBy'),
      {
        model: db.DocketManager, as: 'managers',
        include: [USER_SNAP('manager')],
      },
    ],
    order: [['created_at', 'DESC']],
    limit: lim,
    offset,
    distinct: true,
  });

  const dockets = rows.map((d) => ({
    ...d.toJSON(),
    myRole: roleMap[d.id] ?? null,
  }));

  return { dockets, total };
}

// ─── 5. Tickets ───────────────────────────────────────────────────────────────

/**
 * DocketTickets directly assigned to the user.
 */
async function getDashboardTickets(userId, { page, limit, status, priority, ticketType, search } = {}) {
  const { offset, limit: lim } = paginate(page, limit);

  const where = { assignedToId: userId };
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (ticketType) where.ticketType = ticketType;
  if (search) {
    where[Op.or] = [
      { title: { [Op.like]: `%${search}%` } },
      { ticketCode: { [Op.like]: `%${search}%` } },
    ];
  }

  const { rows: tickets, count: total } = await db.DocketTicket.findAndCountAll({
    where,
    attributes: [
      'id', 'ticketCode', 'title', 'description', 'ticketType',
      'priority', 'status', 'dueDate', 'resolvedAt', 'closedAt',
      'resolutionNote',
    ],
    include: [
      {
        model: db.Docket, as: 'docket',
        attributes: ['id', 'docketCode', 'title'],
        include: [CLIENT_SNAP],
      },
      USER_SNAP('reportedBy'),
      USER_SNAP('assignedTo'),
    ],
    order: [['due_date', 'ASC'], ['created_at', 'DESC']],
    limit: lim,
    offset,
    distinct: true,
  });

  return { tickets, total };
}

// ─── 6. Leaves ────────────────────────────────────────────────────────────────

/**
 * The user's own leave requests.
 */
async function getDashboardLeaves(userId, { page, limit, status, leaveType } = {}) {
  const { offset, limit: lim } = paginate(page, limit);

  const where = { requesterId: userId };
  if (status) where.status = status;
  if (leaveType) where.leaveType = leaveType;

  const { rows: leaves, count: total } = await db.LeaveRequest.findAndCountAll({
    where,
    attributes: [
      'id', 'leaveType', 'status', 'startDate', 'endDate',
      'totalDays', 'reason', 'reviewComment', 'reviewedAt',
      'createdAt', 'updatedAt',
    ],
    include: [
      {
        model: db.User, as: 'reviewer',
        attributes: ['id', 'firstName', 'lastName'],
      },
    ],
    order: [['createdAt', 'DESC']],
    limit: lim,
    offset,
  });

  return { leaves, total };
}

// ─── 7. Notifications ─────────────────────────────────────────────────────────

/**
 * The user's notifications. Optional filter: isRead=true|false
 */
async function getDashboardNotifications(userId, { page, limit, isRead } = {}) {
  const { offset, limit: lim } = paginate(page, limit);

  const where = { userId };
  if (isRead !== undefined && isRead !== null) {
    where.isRead = isRead === true || isRead === 'true';
  }

  const { rows: notifications, count: total } = await db.Notification.findAndCountAll({
    where,
    attributes: [
      'id', 'type', 'title', 'message', 'entityType',
      'entityId', 'isRead', 'readAt', 'createdAt',
    ],
    order: [['createdAt', 'DESC']],
    limit: lim,
    offset,
  });

  return { notifications, total };
}

// ─── 8. Performance ───────────────────────────────────────────────────────────

/**
 * Performance ratings received by the user — summary + paginated list.
 */
async function getDashboardPerformance(userId, { page, limit, ratingType } = {}) {
  const { offset, limit: lim } = paginate(page, limit);

  const where = { ratedUserId: userId };
  if (ratingType) where.ratingType = ratingType;

  const { rows: ratings, count: total } = await db.PerformanceRating.findAndCountAll({
    where,
    attributes: [
      'id', 'ratingType', 'periodLabel', 'quality', 'timeliness',
      'communication', 'accuracy', 'ownership', 'overall',
      'contributionPct', 'comments', 'ratedAt',
    ],
    include: [
      USER_SNAP('ratedBy'),
      {
        model: db.SubTask, as: 'subTask',
        attributes: ['id', 'title', 'status'],
        required: false,
      },
    ],
    order: [['ratedAt', 'DESC']],
    limit: lim,
    offset,
  });

  // Compute summary across ALL matching ratings (not just current page)
  const allRatings = await db.PerformanceRating.findAll({
    where,
    attributes: ['quality', 'timeliness', 'communication', 'accuracy', 'ownership', 'overall'],
    raw: true,
  });

  const avg = (field) =>
    allRatings.length
      ? +(allRatings.reduce((s, r) => s + r[field], 0) / allRatings.length).toFixed(2)
      : null;

  const summary = {
    totalRatings: allRatings.length,
    avgOverall: avg('overall'),
    avgQuality: avg('quality'),
    avgTimeliness: avg('timeliness'),
    avgCommunication: avg('communication'),
    avgAccuracy: avg('accuracy'),
    avgOwnership: avg('ownership'),
  };

  return { ratings, total, summary };
}

// ─── 9. Activity Feed ─────────────────────────────────────────────────────────

/**
 * Combined recent activity: assigned tasks, assigned subtasks, assigned tickets.
 * Each item gets a `_type` field: "TASK" | "SUBTASK" | "TICKET"
 * Results are merged and sorted by most-recently updated, then sliced.
 */
async function getDashboardActivity(userId, { page, limit } = {}) {
  const p = Math.max(1, parseInt(page) || 1);
  const lim = Math.min(100, Math.max(1, parseInt(limit) || 20));

  // Fetch recent 100 of each to allow in-memory merge & sort
  const FETCH = 100;

  // Tasks (assigned or managed)
  const assignedTaskIds = (
    await db.TaskAssignment.findAll({
      where: { teamLeadId: userId },
      attributes: ['taskId'],
      raw: true,
    })
  ).map((r) => r.taskId);

  const [rawTasks, rawSubTasks, rawTickets] = await Promise.all([
    // Tasks
    db.Task.findAll({
      where: {
        [Op.or]: [
          ...(assignedTaskIds.length ? [{ id: { [Op.in]: assignedTaskIds } }] : []),
          { managerId: userId },
        ],
        deletedAt: null,
      },
      attributes: ['id', 'title', 'status', 'priority', 'dueDate', 'updatedAt'],
      include: [USER_SNAP('manager')],
      order: [['updatedAt', 'DESC']],
      limit: FETCH,
    }),

    // SubTasks
    db.SubTaskAssignment.findAll({
      where: { memberId: userId },
      attributes: ['subTaskId', 'contribution'],
      include: [
        {
          model: db.SubTask, as: 'subTask',
          attributes: ['id', 'title', 'status', 'priority', 'dueDate', 'updatedAt'],
          include: [
            { model: db.Task, as: 'task', attributes: ['id', 'title'] },
          ],
        },
      ],
      order: [[{ model: db.SubTask, as: 'subTask' }, 'updatedAt', 'DESC']],
      limit: FETCH,
    }),

    // Tickets
    db.DocketTicket.findAll({
      where: { assignedToId: userId },
      attributes: ['id', 'ticketCode', 'title', 'status', 'priority', 'dueDate', 'updatedAt'],
      include: [
        {
          model: db.Docket, as: 'docket',
          attributes: ['id', 'docketCode', 'title'],
          include: [CLIENT_SNAP],
        },
      ],
      order: [['updatedAt', 'DESC']],
      limit: FETCH,
    }),
  ]);

  const items = [
    ...rawTasks.map((t) => ({ _type: 'TASK', _updatedAt: t.updatedAt, ...t.toJSON() })),
    ...rawSubTasks.map((a) => ({
      _type: 'SUBTASK',
      _updatedAt: a.subTask?.updatedAt,
      contribution: a.contribution,
      ...a.subTask?.toJSON(),
    })),
    ...rawTickets.map((tk) => ({ _type: 'TICKET', _updatedAt: tk.updatedAt, ...tk.toJSON() })),
  ];

  // Sort by updatedAt desc
  items.sort((a, b) => new Date(b._updatedAt) - new Date(a._updatedAt));

  const total = items.length;
  const paginated = items.slice((p - 1) * lim, p * lim);

  return { activity: paginated, total };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getDashboardSummary,
  getDashboardTasks,
  getDashboardSubTasks,
  getDashboardDockets,
  getDashboardTickets,
  getDashboardLeaves,
  getDashboardNotifications,
  getDashboardPerformance,
  getDashboardActivity,
};
