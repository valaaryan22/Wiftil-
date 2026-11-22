'use strict';

const express = require('express');
const router  = express.Router();

const roleController = require('../controllers/role.controller');
const { authenticate }    = require('../middlewares/auth.middleware');
const { authorizeLevel }  = require('../middlewares/authorize.middleware');
const { validate }        = require('../middlewares/validate.middleware');
const { body, param }     = require('express-validator');

// All role routes require authentication
router.use(authenticate);

// GET /roles — all authenticated users can view available roles
router.get('/', roleController.getAllRoles);

// GET /roles/:id
router.get(
  '/:id',
  [param('id').isUUID().withMessage('Valid role ID required')],
  validate,
  roleController.getRoleById
);

// POST /roles — BOSS/ADMIN only (level <= 2)
router.post(
  '/',
  authorizeLevel(2),
  [
    body('name')
      .trim().notEmpty().withMessage('Role name is required')
      .matches(/^[A-Za-z0-9_ ]+$/).withMessage('Role name: letters, numbers, spaces, underscores only'),
    body('displayName')
      .trim().notEmpty().withMessage('Display name is required')
      .isLength({ max: 80 }),
    body('description').optional().trim().isLength({ max: 500 }),
    body('accessLevel')
      .isInt({ min: 2 }).withMessage('Access level must be >= 2 (level 1 is reserved for BOSS)')
      .toInt(),
    body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Color must be a valid hex code e.g. #ff6b6b'),
  ],
  validate,
  roleController.createRole
);

// PATCH /roles/:id — BOSS/ADMIN only (level <= 2)
router.patch(
  '/:id',
  authorizeLevel(2),
  [
    param('id').isUUID().withMessage('Valid role ID required'),
    body('displayName').optional().trim().isLength({ max: 80 }),
    body('description').optional().trim().isLength({ max: 500 }),
    body('accessLevel').optional().isInt({ min: 2 }).withMessage('Access level must be >= 2 (1 is reserved for BOSS)').toInt(),
    body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Invalid hex color'),
    body('isActive').optional().isBoolean().toBoolean(),
  ],
  validate,
  roleController.updateRole
);

// DELETE /roles/:id — BOSS/ADMIN only (level <= 2)
router.delete(
  '/:id',
  authorizeLevel(2),
  [param('id').isUUID().withMessage('Valid role ID required')],
  validate,
  roleController.deleteRole
);

module.exports = router;
