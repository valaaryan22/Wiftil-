'use strict';

const express = require('express');
const router = express.Router({ mergeParams: true });
const ctrl = require('../controllers/docket.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { body, param } = require('express-validator');
const { PACKAGE_MANAGE_MAX_LEVEL } = require('../constants');

router.use(authenticate);

// ─── Docket routes (nested under /clients/:clientId/dockets) ─────────────────

// GET  /clients/:clientId/dockets
router.get('/', ctrl.getDocketsByClient);

// POST /clients/:clientId/dockets
router.post(
  '/',
  authorizeLevel(PACKAGE_MANAGE_MAX_LEVEL),
  [
    body('title').trim().notEmpty().withMessage('Docket title is required'),
    body('description').optional().trim(),
    body('docketType').optional().isIn(['RETAINER', 'PROJECT', 'AD_HOC', 'INTERNAL']),
    body('isTicketBased').optional().isBoolean(),
    body('status').optional().isIn(['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']),
    body('startDate').optional({ nullable: true }).isISO8601(),
    body('endDate').optional({ nullable: true }).isISO8601(),
    body('assignedManagerId').optional({ nullable: true }).isUUID(),
    body('packageId').optional({ nullable: true }).isUUID(),
  ],
  validate,
  ctrl.createDocket
);

module.exports = router;
