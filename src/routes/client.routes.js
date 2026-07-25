'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/client.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');
const { validate } = require('../middlewares/validate.middleware');
const upload = require('../middlewares/upload.middleware');
const { body, param, query } = require('express-validator');
const { CLIENT_MANAGE_MAX_LEVEL } = require('../constants');

router.use(authenticate);

const clientValidators = [
  body('name').trim().notEmpty().withMessage('Client name is required'),
  body('clientCode').optional().trim(),
  body('accountOwnerId').optional({ nullable: true }).isUUID().withMessage('Valid UUID required for account owner'),
  body('primaryContactName').optional().trim(),
  body('phone').optional().trim(),
  body('whatsappNumber').optional().trim(),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Valid email required').normalizeEmail(),
  body('billingDate').optional({ nullable: true }).isInt({ min: 1, max: 31 }).withMessage('Billing date must be between 1 and 31').toInt(),
  body('industry').optional().trim(),
  body('website').optional({ nullable: true, checkFalsy: true }).isURL().withMessage('Valid website URL required'),
  body('gst').optional().trim(),
  body('joinedDate').optional({ nullable: true }).isISO8601().withMessage('Valid date required for joinedDate'),
  body('locationPreference').optional().trim(),
  body('leadSource').optional().trim(),
  body('referralSource').optional().trim(),
  body('preferredLanguage').optional().trim(),
  body('preferredChannel').optional().trim(),
  body('internalTags')
    .optional()
    .customSanitizer(value => {
      if (typeof value === 'string') {
        try { return JSON.parse(value); } catch(e) { return value; }
      }
      return value;
    })
    .isArray().withMessage('internalTags must be an array'),
  body('socialMediaLinks')
    .optional()
    .customSanitizer(value => {
      if (typeof value === 'string') {
        try { return JSON.parse(value); } catch(e) { return value; }
      }
      return value;
    })
    .isObject().withMessage('socialMediaLinks must be an object'),
];

// GET /clients - List all clients (with search/pagination)
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim(),
  ],
  validate,
  ctrl.getClients
);

// GET /clients/:id - Get client details
router.get(
  '/:id',
  [param('id').isUUID().withMessage('Valid client ID required')],
  validate,
  ctrl.getClientById
);

// POST /clients - Create a new client (MANAGER+)
router.post(
  '/',
  authorizeLevel(CLIENT_MANAGE_MAX_LEVEL),
  upload.single('logo'),
  clientValidators,
  validate,
  ctrl.createClient
);

// PATCH /clients/:id - Update an existing client (MANAGER+)
router.patch(
  '/:id',
  authorizeLevel(CLIENT_MANAGE_MAX_LEVEL),
  upload.single('logo'),
  [
    param('id').isUUID().withMessage('Valid client ID required'),
    ...clientValidators.map(v => v.optional()) // all fields optional for update
  ],
  validate,
  ctrl.updateClient
);

// DELETE /clients/:id - Delete a client (MANAGER+)
router.delete(
  '/:id',
  authorizeLevel(CLIENT_MANAGE_MAX_LEVEL),
  [param('id').isUUID().withMessage('Valid client ID required')],
  validate,
  ctrl.deleteClient
);

// ─── Client Overview ───────────────────────────────────────────────────────────
const overviewCtrl = require('../controllers/clientOverview.controller');

// GET /clients/:clientId/overview — Full overview aggregation
router.get(
  '/:clientId/overview',
  [param('clientId').isUUID().withMessage('Valid client ID required')],
  validate,
  overviewCtrl.getClientOverview
);

// PATCH /clients/:clientId/scores — Admin updates loyalty/health/relationship
router.patch(
  '/:clientId/scores',
  authorizeLevel(CLIENT_MANAGE_MAX_LEVEL),
  [
    param('clientId').isUUID().withMessage('Valid client ID required'),
    body('loyaltyScore').optional().isInt({ min: 0, max: 100 }).withMessage('Loyalty score must be 0-100'),
    body('healthScore').optional().isInt({ min: 0, max: 100 }).withMessage('Health score must be 0-100'),
    body('relationshipStatus').optional().isIn(['NEW', 'GROWING', 'TRUSTED_PARTNER', 'AT_RISK', 'CHURNED']),
  ],
  validate,
  overviewCtrl.updateClientScores
);

// ─── Client Risks ─────────────────────────────────────────────────────────────

// GET /clients/:clientId/risks — List risks
router.get(
  '/:clientId/risks',
  [param('clientId').isUUID()],
  validate,
  overviewCtrl.getRisks
);

// POST /clients/:clientId/risks — Create a risk
router.post(
  '/:clientId/risks',
  authorizeLevel(CLIENT_MANAGE_MAX_LEVEL),
  [
    param('clientId').isUUID(),
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('description').optional().trim(),
    body('severity').optional().isIn(['info', 'warning', 'danger']),
    body('category').optional().isIn(['BILLING', 'OPERATIONAL', 'RELATIONSHIP', 'DELIVERY', 'OTHER']),
  ],
  validate,
  overviewCtrl.createRisk
);

// PATCH /clients/:clientId/risks/:riskId — Update a risk
router.patch(
  '/:clientId/risks/:riskId',
  authorizeLevel(CLIENT_MANAGE_MAX_LEVEL),
  [
    param('clientId').isUUID(),
    param('riskId').isUUID(),
    body('title').optional().trim(),
    body('description').optional().trim(),
    body('severity').optional().isIn(['info', 'warning', 'danger']),
    body('category').optional().isIn(['BILLING', 'OPERATIONAL', 'RELATIONSHIP', 'DELIVERY', 'OTHER']),
    body('isResolved').optional().isBoolean(),
  ],
  validate,
  overviewCtrl.updateRisk
);

// DELETE /clients/:clientId/risks/:riskId — Delete a risk
router.delete(
  '/:clientId/risks/:riskId',
  authorizeLevel(CLIENT_MANAGE_MAX_LEVEL),
  [param('clientId').isUUID(), param('riskId').isUUID()],
  validate,
  overviewCtrl.deleteRisk
);

module.exports = router;
