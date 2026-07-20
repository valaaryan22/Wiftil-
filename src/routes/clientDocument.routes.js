'use strict';

const express = require('express');
const router  = express.Router({ mergeParams: true }); // access :clientId from parent
const ctrl    = require('../controllers/clientDocument.controller');
const { authenticate }   = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');
const { validate }       = require('../middlewares/validate.middleware');
const { body, param, query } = require('express-validator');
const { CLIENT_MANAGE_MAX_LEVEL } = require('../constants');

router.use(authenticate);

// ── Shared validators ──────────────────────────────────────────────────────────
const ACCESS_TYPES = ['Shared', 'Restricted', 'Confidential'];

const docBodyValidators = [
  body('fileName').trim().notEmpty().withMessage('fileName is required'),
  body('filePath').trim().notEmpty().withMessage('filePath (local path) is required'),
  body('description').optional().trim(),
  body('category').trim().notEmpty().withMessage('category is required'),
  body('relatedTo').optional().trim(),
  body('system').optional().trim(),
  body('fileType').optional().trim(),
  body('fileSize').optional().isInt({ min: 0 }).toInt().withMessage('fileSize must be a non-negative integer'),
  body('accessType')
    .optional()
    .isIn(ACCESS_TYPES)
    .withMessage(`accessType must be one of: ${ACCESS_TYPES.join(', ')}`),
];

const clientIdParam = param('clientId').isUUID().withMessage('Valid client ID required');
const docIdParam    = param('docId').isUUID().withMessage('Valid document ID required');

// ── Routes ─────────────────────────────────────────────────────────────────────

// GET /clients/:clientId/documents
router.get(
  '/',
  [
    clientIdParam,
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim(),
    query('category').optional().trim(),
    query('relatedTo').optional().trim(),
    query('system').optional().trim(),
    query('accessType').optional().isIn(ACCESS_TYPES),
    query('sortBy').optional().trim(),
    query('sortOrder').optional().isIn(['ASC', 'DESC']),
  ],
  validate,
  ctrl.getDocuments
);

// GET /clients/:clientId/documents/:docId
router.get(
  '/:docId',
  [clientIdParam, docIdParam],
  validate,
  ctrl.getDocumentById
);

// POST /clients/:clientId/documents — any authenticated user can add a document reference
router.post(
  '/',
  [clientIdParam, ...docBodyValidators],
  validate,
  ctrl.createDocument
);

// PATCH /clients/:clientId/documents/:docId — uploader or MANAGER+
router.patch(
  '/:docId',
  [
    clientIdParam,
    docIdParam,
    ...docBodyValidators.map(v => v.optional()),
  ],
  validate,
  ctrl.updateDocument
);

// DELETE /clients/:clientId/documents/:docId — MANAGER+ only
router.delete(
  '/:docId',
  authorizeLevel(CLIENT_MANAGE_MAX_LEVEL),
  [clientIdParam, docIdParam],
  validate,
  ctrl.deleteDocument
);

module.exports = router;
