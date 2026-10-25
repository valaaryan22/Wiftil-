'use strict';

const express = require('express');
const router  = express.Router();

const reportsController = require('../controllers/reports.controller');
const { authenticate }   = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');
const { validate }       = require('../middlewares/validate.middleware');
const { query }          = require('express-validator');

// All reports routes require authentication and manager+ access level (1=Boss, 2=Admin, 3=Manager)
router.use(authenticate);
router.use(authorizeLevel(3));

const standardFilterValidators = [
  query('period').optional().isIn(['today', 'this_week', 'this_month', 'this_quarter', 'this_year', 'all_time']),
  query('dateFrom').optional().isISO8601().withMessage('dateFrom must be a valid date'),
  query('dateTo').optional().isISO8601().withMessage('dateTo must be a valid date'),
  validate,
];

// GET /api/v1/reports/kpis - Executive Scorecard & Business Health Index
router.get('/kpis', standardFilterValidators, reportsController.getExecutiveKpis);

// GET /api/v1/reports/finance - Financial Analytics & Aging
router.get('/finance', standardFilterValidators, reportsController.getFinanceReport);

// GET /api/v1/reports/operations - Productivity, Throughput & Leaderboard
router.get('/operations', standardFilterValidators, reportsController.getOperationsReport);

// GET /api/v1/reports/hr - Headcount, Attendance & Payroll
router.get('/hr', standardFilterValidators, reportsController.getHrReport);

// GET /api/v1/reports/crm - Client Revenue, Concentration & Retention
router.get('/crm', standardFilterValidators, reportsController.getCrmReport);

// GET /api/v1/reports/daily-activity - Daily Pulse of all modules
router.get(
  '/daily-activity',
  [
    query('date').optional().isISO8601().withMessage('date must be a valid date (YYYY-MM-DD)'),
    validate,
  ],
  reportsController.getDailyActivitySummary
);

// GET /api/v1/reports/timeline - Docket & Task Timelines & Change Requests
router.get('/timeline', standardFilterValidators, reportsController.getTimelineReport);

module.exports = router;
