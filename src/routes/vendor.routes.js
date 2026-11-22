'use strict';

const express = require('express');
const router  = express.Router();

const vendorController = require('../controllers/vendor.controller');
const { authenticate }   = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');
const { validate }       = require('../middlewares/validate.middleware');
const { body, param, query } = require('express-validator');
const { VENDOR_MANAGE_MAX_LEVEL } = require('../constants');

// All vendor management routes require auth and manager+ role (level <= 3)
router.use(authenticate);
router.use(authorizeLevel(VENDOR_MANAGE_MAX_LEVEL));

// ── Vendor Hub Stats ─────────────────────────────────────────────────────────
router.get('/stats', vendorController.getVendorStats);

// ── Rate Cards General Search ────────────────────────────────────────────────
router.get(
  '/rate-cards',
  [
    query('vendorId').optional().isUUID(),
    query('category').optional().isString(),
    query('pricingModel').optional().isIn(['PER_UNIT', 'PER_HOUR', 'PER_DAY', 'PER_MONTH', 'PER_PROJECT', 'FIXED']),
    query('search').optional().isString(),
    validate,
  ],
  vendorController.getRateCards
);

// ── Rate Cards Direct Mutation ───────────────────────────────────────────────
router.put('/rate-cards/:rateCardId', [param('rateCardId').isUUID(), validate], vendorController.updateRateCard);
router.delete('/rate-cards/:rateCardId', [param('rateCardId').isUUID(), validate], vendorController.deleteRateCard);

// ── Performance Records General Search ───────────────────────────────────────
router.get(
  '/performances',
  [
    query('vendorId').optional().isUUID(),
    query('deliveryTimeline').optional().isIn(['EARLY', 'ON_TIME', 'SLIGHTLY_DELAYED', 'SEVERELY_DELAYED']),
    query('costAdherence').optional().isIn(['WITHIN_BUDGET', 'UNDER_BUDGET', 'OVER_BUDGET']),
    validate,
  ],
  vendorController.getPerformanceRecords
);

router.delete('/performances/:recordId', [param('recordId').isUUID(), validate], vendorController.deletePerformanceRecord);

// ── Vendor CRUD ──────────────────────────────────────────────────────────────
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().isString(),
    query('type').optional().isIn(['VENDOR', 'FREELANCER', 'COLLABORATOR', 'PARTNER_AGENCY']),
    query('status').optional().isIn(['ACTIVE', 'ON_HOLD', 'INACTIVE', 'BLACKLISTED']),
    validate,
  ],
  vendorController.getVendors
);

router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Vendor/Freelancer name is required'),
    body('type').optional().isIn(['VENDOR', 'FREELANCER', 'COLLABORATOR', 'PARTNER_AGENCY']),
    body('status').optional().isIn(['ACTIVE', 'ON_HOLD', 'INACTIVE', 'BLACKLISTED']),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Must be a valid email'),
    body('phone').optional().isString(),
    body('paymentTerms').optional().isString(),
    body('currency').optional().isString(),
    validate,
  ],
  vendorController.createVendor
);

router.get('/:id', [param('id').isUUID(), validate], vendorController.getVendorById);

router.put(
  '/:id',
  [
    param('id').isUUID(),
    body('name').optional().trim().notEmpty(),
    body('type').optional().isIn(['VENDOR', 'FREELANCER', 'COLLABORATOR', 'PARTNER_AGENCY']),
    body('status').optional().isIn(['ACTIVE', 'ON_HOLD', 'INACTIVE', 'BLACKLISTED']),
    body('email').optional({ checkFalsy: true }).isEmail(),
    validate,
  ],
  vendorController.updateVendor
);

router.delete('/:id', [param('id').isUUID(), validate], vendorController.deleteVendor);

// ── Nested Vendor Rate Cards ─────────────────────────────────────────────────
router.get('/:id/rate-cards', [param('id').isUUID(), validate], vendorController.getRateCards);

router.post(
  '/:id/rate-cards',
  [
    param('id').isUUID(),
    body('serviceTitle').trim().notEmpty().withMessage('serviceTitle is required'),
    body('baseRate').isNumeric().withMessage('baseRate must be a valid number'),
    body('pricingModel').optional().isIn(['PER_UNIT', 'PER_HOUR', 'PER_DAY', 'PER_MONTH', 'PER_PROJECT', 'FIXED']),
    validate,
  ],
  vendorController.createRateCard
);

// ── Nested Vendor Performance ────────────────────────────────────────────────
router.get('/:id/performances', [param('id').isUUID(), validate], vendorController.getPerformanceRecords);

router.post(
  '/:id/performances',
  [
    param('id').isUUID(),
    body('reviewTitle').trim().notEmpty().withMessage('reviewTitle is required'),
    body('qualityRating').optional().isInt({ min: 1, max: 5 }),
    body('timelinessRating').optional().isInt({ min: 1, max: 5 }),
    body('communicationRating').optional().isInt({ min: 1, max: 5 }),
    body('costRating').optional().isInt({ min: 1, max: 5 }),
    body('deliveryTimeline').optional().isIn(['EARLY', 'ON_TIME', 'SLIGHTLY_DELAYED', 'SEVERELY_DELAYED']),
    body('costAdherence').optional().isIn(['WITHIN_BUDGET', 'UNDER_BUDGET', 'OVER_BUDGET']),
    validate,
  ],
  vendorController.createPerformanceRecord
);

module.exports = router;
