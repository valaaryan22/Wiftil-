'use strict';

const express = require('express');
const router = express.Router();

const holidayController = require('../controllers/holiday.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { body, param, query } = require('express-validator');

// All holiday endpoints require authentication
router.use(authenticate);

// ── Holidays Summary Metrics ──────────────────────────────────────────────────
router.get('/summary', holidayController.getHolidaysSummary);

// ── Seed / Quick Populate Standard Holidays ───────────────────────────────────
router.post(
  '/seed',
  [
    body('year').optional().isInt({ min: 2000, max: 2100 }),
    validate,
  ],
  holidayController.seedStandardHolidays
);

// ── Holidays List ─────────────────────────────────────────────────────────────
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 200 }),
    query('year').optional(),
    query('type').optional().isIn(['PUBLIC', 'OPTIONAL', 'COMPANY', 'ALL']),
    query('status').optional().isIn(['ACTIVE', 'INACTIVE', 'ALL']),
    query('search').optional().isString(),
    query('dateFrom').optional().isISO8601(),
    query('dateTo').optional().isISO8601(),
    validate,
  ],
  holidayController.getHolidays
);

// ── Get Single Holiday ────────────────────────────────────────────────────────
router.get(
  '/:id',
  [param('id').isUUID().withMessage('Valid holiday ID required'), validate],
  holidayController.getHolidayById
);

// ── Create Holiday ────────────────────────────────────────────────────────────
router.post(
  '/',
  [
    body('name').isString().notEmpty().withMessage('Holiday name is required').trim(),
    body('date').notEmpty().withMessage('Holiday date is required'),
    body('year').optional().isInt({ min: 2000, max: 2100 }),
    body('type').optional().isIn(['PUBLIC', 'OPTIONAL', 'COMPANY']),
    body('description').optional().isString(),
    body('isRecurring').optional().isBoolean(),
    body('applicableFor').optional().isIn(['ALL', 'REMOTE_ONLY', 'OFFICE_ONLY']),
    body('status').optional().isIn(['ACTIVE', 'INACTIVE']),
    validate,
  ],
  holidayController.createHoliday
);

// ── Update Holiday ────────────────────────────────────────────────────────────
router.put(
  '/:id',
  [
    param('id').isUUID().withMessage('Valid holiday ID required'),
    body('name').optional().isString().trim(),
    body('date').optional().notEmpty(),
    body('year').optional().isInt({ min: 2000, max: 2100 }),
    body('type').optional().isIn(['PUBLIC', 'OPTIONAL', 'COMPANY']),
    body('description').optional().isString(),
    body('isRecurring').optional().isBoolean(),
    body('applicableFor').optional().isIn(['ALL', 'REMOTE_ONLY', 'OFFICE_ONLY']),
    body('status').optional().isIn(['ACTIVE', 'INACTIVE']),
    validate,
  ],
  holidayController.updateHoliday
);

// ── Delete Holiday ────────────────────────────────────────────────────────────
router.delete(
  '/:id',
  [param('id').isUUID().withMessage('Valid holiday ID required'), validate],
  holidayController.deleteHoliday
);

module.exports = router;
