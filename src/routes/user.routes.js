'use strict';

const express = require('express');
const router  = express.Router();

const userController = require('../controllers/user.controller');
const { authenticate }           = require('../middlewares/auth.middleware');
const { authorizeLevel, authorizeSelfOrLevel } = require('../middlewares/authorize.middleware');
const { validate }               = require('../middlewares/validate.middleware');
const { body, param, query }     = require('express-validator');
const { updateUserValidator, paginationValidator } = require('../validators');
const upload                     = require('../middlewares/upload.middleware');

// All user routes require authentication
router.use(authenticate);

// ─── Admin: Invite / Create User ─────────────────────────────────────────────
// POST /users — Level 4+ (MANAGER+) can add users
router.post(
  '/',
  authorizeLevel(4),
  upload.single('profilePic'),
  [
    body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
    body('password')
      .optional()
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
      .withMessage('Password: 8+ chars, upper, lower, number, special char'),
    body('firstName').trim().notEmpty().withMessage('First name required'),
    body('lastName').trim().notEmpty().withMessage('Last name required'),
    body('roleId').notEmpty().withMessage('roleId (UUID or role name) is required'),
    body('department').optional().trim().isLength({ max: 100 }),
    body('jobTitle').optional().trim().isLength({ max: 100 }),
    body('phone').optional().isMobilePhone().withMessage('Invalid phone number'),
    body('managerId').optional().isUUID().withMessage('managerId must be a valid UUID'),
  ],
  validate,
  userController.inviteUser
);

// ─── List & Search ────────────────────────────────────────────────────────────
// GET /users — role-scoped list
router.get('/', paginationValidator, validate, userController.getAllUsers);

// GET /users/my-team — direct subordinates (Level 2+)
router.get('/my-team', authorizeLevel(2), userController.getMyTeam);

// ─── Individual User ──────────────────────────────────────────────────────────
// GET /users/:id — self or level 2+
router.get('/:id', [param('id').isUUID()], validate, authorizeSelfOrLevel(2), userController.getUserById);

// PATCH /users/:id — self or higher level
router.patch(
  '/:id',
  updateUserValidator,
  validate,
  authorizeSelfOrLevel(2),
  userController.updateUser
);

// POST /users/:id/profile-picture — self or higher level
router.post(
  '/:id/profile-picture',
  [param('id').isUUID().withMessage('Valid user ID required')],
  validate,
  authorizeSelfOrLevel(2),
  upload.single('profilePic'),
  userController.uploadProfilePicture
);

// PATCH /users/:id/role — Level 4+ (MANAGER+)
router.patch(
  '/:id/role',
  authorizeLevel(4),
  [
    param('id').isUUID().withMessage('Valid user ID required'),
    body('roleId').notEmpty().withMessage('roleId is required'),
  ],
  validate,
  userController.updateUserRole
);

// PATCH /users/:id/status — Level 4+ (MANAGER+)
router.patch(
  '/:id/status',
  authorizeLevel(4),
  [
    param('id').isUUID().withMessage('Valid user ID required'),
    body('isActive').isBoolean().withMessage('isActive must be a boolean').toBoolean(),
  ],
  validate,
  userController.toggleUserStatus
);

// DELETE /users/:id — Level 5 (BOSS only)
router.delete(
  '/:id',
  authorizeLevel(5),
  [param('id').isUUID().withMessage('Valid user ID required')],
  validate,
  userController.deleteUser
);

module.exports = router;
