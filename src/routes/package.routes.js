'use strict';

const express = require('express');
const router = express.Router({ mergeParams: true }); // mergeParams to get :clientId
const ctrl = require('../controllers/package.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { body, param } = require('express-validator');
const { PACKAGE_MANAGE_MAX_LEVEL } = require('../constants');

router.use(authenticate);

// ─── Package routes (nested under /clients/:clientId/packages) ─────────────
// GET    /clients/:clientId/packages
router.get('/', ctrl.getPackagesByClient);

// POST   /clients/:clientId/packages
router.post(
  '/',
  authorizeLevel(PACKAGE_MANAGE_MAX_LEVEL),
  [
    body('name').trim().notEmpty().withMessage('Package name is required'),
    body('packageType').optional().isIn(['BASIC', 'STANDARD', 'PREMIUM', 'CUSTOM']),
    body('billingCycle').optional().isIn(['MONTHLY', 'QUARTERLY', 'ANNUAL']),
    body('basePrice').optional().isDecimal(),
    body('startDate').optional({ nullable: true }).isISO8601(),
    body('endDate').optional({ nullable: true }).isISO8601(),
    body('renewalDate').optional({ nullable: true }).isISO8601(),
    body('notes').optional({ nullable: true }).trim(),
    body('whatWeDo').optional({ nullable: true }).trim(),
    body('whatWeDoNot').optional({ nullable: true }).trim(),
    body('moderationScope').optional({ nullable: true }).trim(),
  ],
  validate,
  ctrl.createPackage
);

module.exports = router;
