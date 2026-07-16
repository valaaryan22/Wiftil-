'use strict';

const express = require('express');
const router = express.Router({ mergeParams: true }); // mergeParams to access :clientId
const ctrl = require('../controllers/clientContact.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { body, param, query } = require('express-validator');
const { CLIENT_MANAGE_MAX_LEVEL } = require('../constants');

router.use(authenticate);

const contactValidators = [
  body('name').trim().notEmpty().withMessage('Contact name is required'),
  body('jobTitle').optional().trim(),
  body('department').optional().trim(),
  body('phone').optional().trim(),
  body('whatsappNumber').optional().trim(),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Valid email required').normalizeEmail(),
  body('badges')
    .optional()
    .customSanitizer(value => {
      if (typeof value === 'string') {
        try { return JSON.parse(value); } catch (e) { return value; }
      }
      return value;
    })
    .isArray().withMessage('badges must be an array'),
  body('preferredChannel').optional().isIn(['Email', 'Phone', 'WhatsApp', 'Meeting', 'Other']).withMessage('Invalid preferred channel'),
  body('stakeholderType').optional().trim(),
  body('relationshipNote').optional().trim(),
  body('lastContactedAt').optional({ nullable: true }).isISO8601().withMessage('Valid ISO date required for lastContactedAt'),
  body('isActive').optional().isBoolean().toBoolean(),
];

// GET /clients/:clientId/contacts
router.get(
  '/',
  [
    param('clientId').isUUID().withMessage('Valid client ID required'),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim(),
    query('stakeholderType').optional().trim(),
  ],
  validate,
  ctrl.getContacts
);

// GET /clients/:clientId/contacts/:contactId
router.get(
  '/:contactId',
  [
    param('clientId').isUUID().withMessage('Valid client ID required'),
    param('contactId').isUUID().withMessage('Valid contact ID required'),
  ],
  validate,
  ctrl.getContactById
);

// POST /clients/:clientId/contacts (MANAGER+)
router.post(
  '/',
  authorizeLevel(CLIENT_MANAGE_MAX_LEVEL),
  [param('clientId').isUUID().withMessage('Valid client ID required'), ...contactValidators],
  validate,
  ctrl.createContact
);

// PATCH /clients/:clientId/contacts/:contactId (MANAGER+)
router.patch(
  '/:contactId',
  authorizeLevel(CLIENT_MANAGE_MAX_LEVEL),
  [
    param('clientId').isUUID().withMessage('Valid client ID required'),
    param('contactId').isUUID().withMessage('Valid contact ID required'),
    ...contactValidators.map(v => v.optional()),
  ],
  validate,
  ctrl.updateContact
);

// DELETE /clients/:clientId/contacts/:contactId (MANAGER+)
router.delete(
  '/:contactId',
  authorizeLevel(CLIENT_MANAGE_MAX_LEVEL),
  [
    param('clientId').isUUID().withMessage('Valid client ID required'),
    param('contactId').isUUID().withMessage('Valid contact ID required'),
  ],
  validate,
  ctrl.deleteContact
);

module.exports = router;
