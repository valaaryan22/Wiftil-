'use strict';

/**
 * packageItem.routes.js
 * Routes for a single package: /packages/:packageId
 * Includes:  package CRUD, package-services management, and add-on management.
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/package.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { body, param } = require('express-validator');
const { PACKAGE_MANAGE_MAX_LEVEL } = require('../constants');

router.use(authenticate);

const pkgIdParam = [param('packageId').isUUID().withMessage('Valid packageId required')];

// GET    /packages/:packageId
router.get('/:packageId', pkgIdParam, validate, ctrl.getPackageById);

// PATCH  /packages/:packageId
router.patch(
  '/:packageId',
  authorizeLevel(PACKAGE_MANAGE_MAX_LEVEL),
  [
    ...pkgIdParam,
    body('name').optional().trim(),
    body('packageType').optional().isIn(['BASIC', 'STANDARD', 'PREMIUM', 'CUSTOM']),
    body('billingCycle').optional().isIn(['MONTHLY', 'QUARTERLY', 'ANNUAL']),
    body('basePrice').optional().isDecimal(),
    body('status').optional().isIn(['ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED']),
    body('startDate').optional({ nullable: true }).isISO8601(),
    body('endDate').optional({ nullable: true }).isISO8601(),
    body('renewalDate').optional({ nullable: true }).isISO8601(),
    body('notes').optional({ nullable: true }).trim(),
    body('whatWeDo').optional({ nullable: true }).trim(),
    body('whatWeDoNot').optional({ nullable: true }).trim(),
    body('moderationScope').optional({ nullable: true }).trim(),
  ],
  validate,
  ctrl.updatePackage
);

// DELETE /packages/:packageId
router.delete('/:packageId', authorizeLevel(PACKAGE_MANAGE_MAX_LEVEL), pkgIdParam, validate, ctrl.deletePackage);

// ─── Package Services (/packages/:packageId/services) ───────────────────────

// POST /packages/:packageId/services — add a service to this package
router.post(
  '/:packageId/services',
  authorizeLevel(PACKAGE_MANAGE_MAX_LEVEL),
  [
    ...pkgIdParam,
    body('serviceId').optional({ nullable: true }).isUUID(),
    body('quantity').optional({ nullable: true }).isInt({ min: 1 }),
    body('scope').optional().trim(),
    body('frequency').optional().isIn(['MONTHLY', 'WEEKLY', 'ALWAYS_ON', 'ON_DEMAND', 'PER_CYCLE']),
    body('ownerLabel').optional({ nullable: true }).isString().trim(),
    body('isIncluded').optional().isBoolean(),
    body('unitPrice').optional({ nullable: true }).isDecimal(),
  ],
  validate,
  ctrl.addServiceToPackage
);

// PATCH /packages/:packageId/services/:serviceEntryId — update an inclusion entry
router.patch(
  '/:packageId/services/:serviceEntryId',
  authorizeLevel(PACKAGE_MANAGE_MAX_LEVEL),
  [
    ...pkgIdParam, 
    param('serviceEntryId').isUUID(),
    body('quantity').optional({ nullable: true }).isInt({ min: 1 }),
    body('scope').optional().trim(),
    body('frequency').optional().isIn(['MONTHLY', 'WEEKLY', 'ALWAYS_ON', 'ON_DEMAND', 'PER_CYCLE']),
    body('ownerLabel').optional({ nullable: true }).isString().trim(),
    body('isIncluded').optional().isBoolean(),
    body('unitPrice').optional({ nullable: true }).isDecimal(),
  ],
  validate,
  ctrl.updatePackageService
);

// DELETE /packages/:packageId/services/:serviceEntryId — remove an inclusion entry
router.delete(
  '/:packageId/services/:serviceEntryId',
  authorizeLevel(PACKAGE_MANAGE_MAX_LEVEL),
  [...pkgIdParam, param('serviceEntryId').isUUID()],
  validate,
  ctrl.removeServiceFromPackage
);

// ─── Add-ons (/packages/:packageId/addons) ───────────────────────────────────

// POST /packages/:packageId/addons — request an add-on
router.post(
  '/:packageId/addons',
  [
    ...pkgIdParam,
    body('serviceId').optional({ nullable: true }).isUUID(),
    body('docketId').optional({ nullable: true }).isUUID(),
    body('customDescription').optional().trim(),
    body('quantity').optional().isInt({ min: 1 }),
    body('unitPrice').optional({ nullable: true }).isDecimal(),
  ],
  validate,
  ctrl.requestAddOn
);

// PATCH /:packageId/addons/:addOnId/review — approve or reject an add-on
router.patch(
  '/:packageId/addons/:addOnId/review',
  authorizeLevel(PACKAGE_MANAGE_MAX_LEVEL),
  [
    param('addOnId').isUUID(),
    body('approve').isBoolean().withMessage('approve (boolean) is required'),
    body('rejectionReason').optional().trim(),
  ],
  validate,
  ctrl.approveAddOn
);

// PATCH /:packageId/addons/:addOnId/status — move add-on to DELIVERED or BILLED
router.patch(
  '/:packageId/addons/:addOnId/status',
  authorizeLevel(PACKAGE_MANAGE_MAX_LEVEL),
  [
    param('addOnId').isUUID(),
    body('status').isIn(['DELIVERED', 'BILLED']).withMessage('status must be DELIVERED or BILLED'),
  ],
  validate,
  ctrl.updateAddOnStatus
);

module.exports = router;
