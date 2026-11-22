'use strict';

const express = require('express');
const router  = express.Router();

const dashboardController = require('../controllers/dashboard.controller');
const { authenticate }    = require('../middlewares/auth.middleware');
const { validate }        = require('../middlewares/validate.middleware');
const { query }           = require('express-validator');

// All dashboard routes require a valid JWT — no level restriction.
// Each endpoint is scoped to req.user.id, so users only see their own data.
router.use(authenticate);

// ─── Validators ───────────────────────────────────────────────────────────────

const paginationQ = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer').toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be 1–100').toInt(),
];

const taskFilters = [
  ...paginationQ,
  query('status').optional().isIn([
    'CREATED', 'ASSIGNED', 'ACCEPTED', 'REJECTED',
    'IN_PROGRESS', 'SUBMITTED', 'MANAGER_REVIEW',
    'MANAGER_APPROVED', 'COMPLETED', 'REOPENED',
    'ALL',
  ]).withMessage('Invalid task status'),
  query('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).withMessage('Invalid priority'),
  query('role').optional().isIn(['assignee', 'manager']).withMessage('role must be "assignee" or "manager"'),
  query('search').optional().isString().trim(),
];

const subTaskFilters = [
  ...paginationQ,
  query('status').optional().isIn([
    'CREATED', 'ASSIGNED', 'LOCKED', 'AVAILABLE',
    'IN_PROGRESS', 'SUBMITTED', 'TEAM_LEAD_REVIEW',
    'TEAM_LEAD_APPROVED', 'TEAM_LEAD_REJECTED',
    'MANAGER_REVIEW', 'FINAL_APPROVED', 'REOPENED',
    'ALL',
  ]).withMessage('Invalid subtask status'),
  query('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).withMessage('Invalid priority'),
  query('search').optional().isString().trim(),
];

const docketFilters = [
  ...paginationQ,
  query('status').optional().isIn([
    'DRAFT', 'PUBLISHED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED',
  ]).withMessage('Invalid docket status'),
  query('docketType').optional().isIn([
    'RETAINER', 'PROJECT', 'AD_HOC', 'INTERNAL',
  ]).withMessage('Invalid docket type'),
  query('search').optional().isString().trim(),
];

const ticketFilters = [
  ...paginationQ,
  query('status').optional().isIn([
    'OPEN', 'IN_PROGRESS', 'PENDING_APPROVAL', 'RESOLVED', 'CLOSED', 'REJECTED',
  ]).withMessage('Invalid ticket status'),
  query('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).withMessage('Invalid priority'),
  query('ticketType').optional().isIn([
    'SERVICE_DELIVERY', 'ADD_ON_REQUEST', 'BUG', 'CHANGE_REQUEST', 'APPROVAL',
  ]).withMessage('Invalid ticket type'),
  query('search').optional().isString().trim(),
];

const leaveFilters = [
  ...paginationQ,
  query('status').optional().isIn(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).withMessage('Invalid leave status'),
  query('leaveType').optional().isIn([
    'ANNUAL', 'SICK', 'UNPAID', 'EMERGENCY', 'MATERNITY', 'PATERNITY',
  ]).withMessage('Invalid leave type'),
];

const notificationFilters = [
  ...paginationQ,
  query('isRead').optional().isBoolean().withMessage('isRead must be true or false').toBoolean(),
];

const performanceFilters = [
  ...paginationQ,
  query('ratingType').optional().isIn(['SUBTASK', 'DIRECT']).withMessage('ratingType must be SUBTASK or DIRECT'),
];

const followUpFilters = [
  ...paginationQ,
  query('status').optional().isIn(['PENDING', 'COMPLETED', 'ALL']).withMessage('Invalid status'),
  query('search').optional().isString().trim(),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
];

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /dashboard/summary
 * Full counts overview — no filters needed.
 */
router.get('/summary', dashboardController.getSummary);

/**
 * GET /dashboard/tasks
 * Paginated tasks where I am assignee (team lead) or manager.
 * Optional: ?status=IN_PROGRESS&priority=HIGH&role=assignee&search=keyword
 */
router.get('/tasks', taskFilters, validate, dashboardController.getTasks);

/**
 * GET /dashboard/subtasks
 * Paginated subtasks assigned to me as a member.
 * Optional: ?status=IN_PROGRESS&priority=HIGH&search=keyword
 */
router.get('/subtasks', subTaskFilters, validate, dashboardController.getSubTasks);

/**
 * GET /dashboard/dockets
 * Paginated dockets where I am a manager.
 * Optional: ?status=ACTIVE&docketType=PROJECT&search=keyword
 */
router.get('/dockets', docketFilters, validate, dashboardController.getDockets);

/**
 * GET /dashboard/tickets
 * Paginated docket tickets assigned to me.
 * Optional: ?status=OPEN&priority=HIGH&ticketType=BUG&search=keyword
 */
router.get('/tickets', ticketFilters, validate, dashboardController.getTickets);

/**
 * GET /dashboard/leaves
 * My paginated leave requests.
 * Optional: ?status=PENDING&leaveType=SICK
 */
router.get('/leaves', leaveFilters, validate, dashboardController.getLeaves);

/**
 * GET /dashboard/notifications
 * My paginated notifications.
 * Optional: ?isRead=false
 */
router.get('/notifications', notificationFilters, validate, dashboardController.getNotifications);

/**
 * GET /dashboard/performance
 * My performance ratings + summary stats.
 * Optional: ?ratingType=SUBTASK
 */
router.get('/performance', performanceFilters, validate, dashboardController.getPerformanceFull);

/**
 * GET /dashboard/activity
 * Combined recent activity feed (tasks + subtasks + tickets) sorted by updatedAt.
 * Optional: ?page=1&limit=20
 */
router.get('/activity', paginationQ, validate, dashboardController.getActivity);

/**
 * GET /dashboard/follow-ups
 * Client communication follow-ups where followUpDate is set.
 * Optional: ?status=PENDING&search=keyword&page=1&limit=50
 */
router.get('/follow-ups', followUpFilters, validate, dashboardController.getFollowUps);

/**
 * PATCH /dashboard/follow-ups/:logId/toggle
 * Toggle or set followUpDone
 */
router.patch('/follow-ups/:logId/toggle', dashboardController.toggleFollowUp);

module.exports = router;
