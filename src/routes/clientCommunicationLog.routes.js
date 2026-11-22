'use strict';

const express = require('express');
const router = express.Router({ mergeParams: true }); // mergeParams to access :clientId
const ctrl = require('../controllers/clientCommunicationLog.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');
const { validate } = require('../middlewares/validate.middleware');
const upload = require('../middlewares/upload.middleware');
const { body, param, query } = require('express-validator');
const { CLIENT_MANAGE_MAX_LEVEL } = require('../constants');

router.use(authenticate);

const CHANNELS = ['Call', 'Meeting', 'Email', 'WhatsApp', 'Other'];

const logValidators = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('channel').isIn(CHANNELS).withMessage(`Channel must be one of: ${CHANNELS.join(', ')}`),
  body('contactPersonId').optional({ nullable: true }).isUUID().withMessage('Valid UUID required for contact person'),
  body('communicatedAt').notEmpty().isISO8601().withMessage('communicatedAt must be a valid date-time'),
  body('summary').trim().notEmpty().withMessage('Summary is required'),
  body('nextAction').optional().trim(),
  body('followUpDate').optional({ nullable: true }).isISO8601().withMessage('followUpDate must be a valid date'),
  body('followUpDone').optional().isBoolean().toBoolean(),
];

// GET /clients/:clientId/comms
router.get(
  '/',
  [
    param('clientId').isUUID().withMessage('Valid client ID required'),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim(),
    query('channel').optional().isIn(CHANNELS).withMessage(`Channel must be one of: ${CHANNELS.join(', ')}`),
    query('followUpPending').optional().isBoolean(),
  ],
  validate,
  ctrl.getLogs
);

// GET /clients/:clientId/comms/:logId
router.get(
  '/:logId',
  [
    param('clientId').isUUID().withMessage('Valid client ID required'),
    param('logId').isUUID().withMessage('Valid log ID required'),
  ],
  validate,
  ctrl.getLogById
);

// POST /clients/:clientId/comms — any authenticated user can log a communication
router.post(
  '/',
  upload.single('attachment'),
  [param('clientId').isUUID().withMessage('Valid client ID required'), ...logValidators],
  validate,
  ctrl.createLog
);

// PATCH /clients/:clientId/comms/:logId — logger or MANAGER+
router.patch(
  '/:logId',
  upload.single('attachment'),
  [
    param('clientId').isUUID().withMessage('Valid client ID required'),
    param('logId').isUUID().withMessage('Valid log ID required'),
    ...logValidators.map(v => v.optional()),
  ],
  validate,
  ctrl.updateLog
);

// DELETE /clients/:clientId/comms/:logId (MANAGER+)
router.delete(
  '/:logId',
  authorizeLevel(CLIENT_MANAGE_MAX_LEVEL),
  [
    param('clientId').isUUID().withMessage('Valid client ID required'),
    param('logId').isUUID().withMessage('Valid log ID required'),
  ],
  validate,
  ctrl.deleteLog
);

module.exports = router;
