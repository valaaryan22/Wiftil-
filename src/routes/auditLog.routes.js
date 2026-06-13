'use strict';

const express = require('express');
const router  = express.Router();

const auditLogController = require('../controllers/auditLog.controller');
const { authenticate }   = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');
const { validate }       = require('../middlewares/validate.middleware');
const { param, query }   = require('express-validator');

router.use(authenticate);

// GET /audit-logs/stats — Level 4+ only
router.get(
  '/stats',
  authorizeLevel(4),
  [
    query('dateFrom').optional().isISO8601().withMessage('dateFrom must be ISO date'),
    query('dateTo').optional().isISO8601().withMessage('dateTo must be ISO date'),
  ],
  validate,
  auditLogController.getAuditStats
);

// GET /audit-logs — Level 1 sees own; Level 4+ sees team/all
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
    query('category').optional().isIn(['USER', 'ROLE', 'LEAVE', 'AUTH', 'SYSTEM', 'GENERAL']),
    query('status').optional().isIn(['SUCCESS', 'FAILED']),
    query('dateFrom').optional().isISO8601(),
    query('dateTo').optional().isISO8601(),
  ],
  validate,
  auditLogController.getAuditLogs
);

// GET /audit-logs/:id
router.get(
  '/:id',
  [param('id').isUUID().withMessage('Valid log ID required')],
  validate,
  auditLogController.getAuditLogById
);

module.exports = router;
