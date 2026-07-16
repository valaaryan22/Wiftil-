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

module.exports = router;
