'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/service.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { body, param } = require('express-validator');
const { PACKAGE_MANAGE_MAX_LEVEL } = require('../constants');

router.use(authenticate);

const serviceValidators = [
  body('name').trim().notEmpty().withMessage('Service name is required'),
  body('category').isIn(['DESIGN', 'MARKETING', 'ADVERTISING', 'TECHNICAL', 'CONTENT', 'OTHER']).withMessage('Invalid category'),
  body('description').optional().trim(),
  body('unit').optional().trim(),
  body('defaultPrice').optional({ nullable: true }).isDecimal().withMessage('defaultPrice must be a number'),
];

// GET /services
router.get('/', ctrl.getServices);

// GET /services/:id
router.get('/:id', [param('id').isUUID()], validate, ctrl.getServiceById);

// POST /services (MANAGER+)
router.post('/', authorizeLevel(PACKAGE_MANAGE_MAX_LEVEL), serviceValidators, validate, ctrl.createService);

// PATCH /services/:id (MANAGER+)
router.patch(
  '/:id',
  authorizeLevel(PACKAGE_MANAGE_MAX_LEVEL),
  [param('id').isUUID(), ...serviceValidators.map(v => v.optional())],
  validate,
  ctrl.updateService
);

// DELETE /services/:id (MANAGER+)
router.delete('/:id', authorizeLevel(PACKAGE_MANAGE_MAX_LEVEL), [param('id').isUUID()], validate, ctrl.deleteService);

module.exports = router;
