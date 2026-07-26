'use strict';

const dashboardService = require('../services/dashboard.service');
const { successResponse, paginatedResponse } = require('../utils/response');

/**
 * GET /dashboard/summary
 * Full counts overview — tasks, subtasks, dockets, tickets,
 * leaves, notifications, performance.
 */
async function getSummary(req, res, next) {
  try {
    const summary = await dashboardService.getDashboardSummary(req.user.id);
    return successResponse(res, { message: 'Dashboard summary fetched', data: { summary } });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /dashboard/tasks
 * Query params: page, limit, status, priority, search, role ("assignee"|"manager")
 */
async function getTasks(req, res, next) {
  try {
    const { page = 1, limit = 20, status, priority, search, role } = req.query;
    const { tasks, total } = await dashboardService.getDashboardTasks(req.user.id, {
      page, limit, status, priority, search, role,
    });
    return paginatedResponse(res, { data: tasks, total, page, limit, message: 'Tasks fetched' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /dashboard/subtasks
 * Query params: page, limit, status, priority, search
 */
async function getSubTasks(req, res, next) {
  try {
    const { page = 1, limit = 20, status, priority, search } = req.query;
    const { subTasks, total } = await dashboardService.getDashboardSubTasks(req.user.id, {
      page, limit, status, priority, search,
    });
    return paginatedResponse(res, { data: subTasks, total, page, limit, message: 'SubTasks fetched' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /dashboard/dockets
 * Query params: page, limit, status, docketType, search
 */
async function getDockets(req, res, next) {
  try {
    const { page = 1, limit = 20, status, docketType, search } = req.query;
    const { dockets, total } = await dashboardService.getDashboardDockets(req.user.id, {
      page, limit, status, docketType, search,
    });
    return paginatedResponse(res, { data: dockets, total, page, limit, message: 'Dockets fetched' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /dashboard/tickets
 * Query params: page, limit, status, priority, ticketType, search
 */
async function getTickets(req, res, next) {
  try {
    const { page = 1, limit = 20, status, priority, ticketType, search } = req.query;
    const { tickets, total } = await dashboardService.getDashboardTickets(req.user.id, {
      page, limit, status, priority, ticketType, search,
    });
    return paginatedResponse(res, { data: tickets, total, page, limit, message: 'Tickets fetched' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /dashboard/leaves
 * Query params: page, limit, status, leaveType
 */
async function getLeaves(req, res, next) {
  try {
    const { page = 1, limit = 20, status, leaveType } = req.query;
    const { leaves, total } = await dashboardService.getDashboardLeaves(req.user.id, {
      page, limit, status, leaveType,
    });
    return paginatedResponse(res, { data: leaves, total, page, limit, message: 'Leave requests fetched' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /dashboard/notifications
 * Query params: page, limit, isRead (true|false)
 */
async function getNotifications(req, res, next) {
  try {
    const { page = 1, limit = 20, isRead } = req.query;
    const { notifications, total } = await dashboardService.getDashboardNotifications(req.user.id, {
      page, limit, isRead,
    });
    return paginatedResponse(res, {
      data: notifications, total, page, limit, message: 'Notifications fetched',
    });
  } catch (err) {
    next(err);
  }
}



/**
 * GET /dashboard/performance (with summary)
 * Returns both a summary object AND a paginated list.
 */
async function getPerformanceFull(req, res, next) {
  try {
    const { page = 1, limit = 20, ratingType } = req.query;
    const p = Math.max(1, parseInt(page) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit) || 20));

    const { ratings, total, summary } = await dashboardService.getDashboardPerformance(req.user.id, {
      page: p, limit: l, ratingType,
    });

    return successResponse(res, {
      message: 'Performance ratings fetched',
      data: {
        summary,
        ratings,
      },
      meta: {
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l),
        hasNextPage: p * l < total,
        hasPrevPage: p > 1,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /dashboard/activity
 * Combined recent feed: tasks + subtasks + tickets sorted by updatedAt desc.
 * Query params: page, limit
 */
async function getActivity(req, res, next) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { activity, total } = await dashboardService.getDashboardActivity(req.user.id, {
      page, limit,
    });
    return paginatedResponse(res, {
      data: activity, total, page, limit, message: 'Activity feed fetched',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSummary,
  getTasks,
  getSubTasks,
  getDockets,
  getTickets,
  getLeaves,
  getNotifications,
  getPerformanceFull,
  getActivity,
};
