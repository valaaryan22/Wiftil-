'use strict';

const express = require('express');
const router = express.Router();

const reminderController = require('../controllers/reminder.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { body, param, query } = require('express-validator');

// All reminder endpoints require authentication
router.use(authenticate);

// ── Reminders Summary ────────────────────────────────────────────────────────
router.get('/summary', reminderController.getRemindersSummary);

// ── Reminders List ───────────────────────────────────────────────────────────
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['PENDING', 'COMPLETED', 'DISMISSED', 'ALL']),
    query('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'ALL']),
    query('search').optional().isString(),
    query('dateFrom').optional().isISO8601(),
    query('dateTo').optional().isISO8601(),
    validate,
  ],
  reminderController.getReminders
);

// ── Get Single Reminder ──────────────────────────────────────────────────────
router.get(
  '/:id',
  [param('id').isUUID().withMessage('Valid reminder ID required'), validate],
  reminderController.getReminderById
);

// ── Create Reminder ──────────────────────────────────────────────────────────
router.post(
  '/',
  [
    body('title').isString().notEmpty().withMessage('Reminder title is required').trim(),
    body('remindAt').notEmpty().withMessage('Remind date/time is required'),
    body('description').optional().isString(),
    body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    body('status').optional().isIn(['PENDING', 'COMPLETED', 'DISMISSED']),
    body('bossId').optional({ checkFalsy: true }).isUUID().withMessage('Valid boss ID required'),
    body('category').optional().isString(),
    body('isAllDay').optional().isBoolean(),
    body('entityType').optional().isString(),
    body('entityId').optional({ checkFalsy: true }).isUUID(),
    validate,
  ],
  reminderController.createReminder
);

// ── Update Reminder ──────────────────────────────────────────────────────────
router.put(
  '/:id',
  [
    param('id').isUUID().withMessage('Valid reminder ID required'),
    body('title').optional().isString().notEmpty().trim(),
    body('remindAt').optional().notEmpty(),
    body('description').optional().isString(),
    body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    body('status').optional().isIn(['PENDING', 'COMPLETED', 'DISMISSED']),
    body('bossId').optional({ checkFalsy: true }).isUUID(),
    body('category').optional().isString(),
    body('isAllDay').optional().isBoolean(),
    validate,
  ],
  reminderController.updateReminder
);

// ── Quick Update Status ──────────────────────────────────────────────────────
router.patch(
  '/:id/status',
  [
    param('id').isUUID().withMessage('Valid reminder ID required'),
    body('status').isIn(['PENDING', 'COMPLETED', 'DISMISSED']).withMessage('Status must be PENDING, COMPLETED, or DISMISSED'),
    validate,
  ],
  reminderController.updateReminderStatus
);

// ── Delete Reminder ──────────────────────────────────────────────────────────
router.delete(
  '/:id',
  [param('id').isUUID().withMessage('Valid reminder ID required'), validate],
  reminderController.deleteReminder
);

module.exports = router;
