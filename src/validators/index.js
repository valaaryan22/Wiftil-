'use strict';

const { body, param, query } = require('express-validator');
const { LEAVE_TYPES } = require('../constants');

// ─── Auth ──────────────────────────────────────────────────────

const registerValidator = [
  body('email')
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .withMessage('Password must contain uppercase, lowercase, number, and special character'),
  body('firstName')
    .trim().notEmpty().withMessage('First name is required')
    .isLength({ max: 50 }).withMessage('First name max 50 chars'),
  body('lastName')
    .trim().notEmpty().withMessage('Last name is required')
    .isLength({ max: 50 }).withMessage('Last name max 50 chars'),
  body('department').optional().trim().isLength({ max: 100 }),
  body('jobTitle').optional().trim().isLength({ max: 100 }),
  body('phone').optional().isMobilePhone().withMessage('Invalid phone number'),
];

const loginValidator = [
  body('email')
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required'),
];

const refreshTokenValidator = [
  body('refreshToken')
    .notEmpty().withMessage('Refresh token is required'),
];

const changePasswordValidator = [
  body('currentPassword')
    .notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .withMessage('New password must contain uppercase, lowercase, number, and special character')
    .custom((value, { req }) => {
      if (value === req.body.currentPassword) {
        throw new Error('New password must be different from current password');
      }
      return true;
    }),
];

// ─── Users ─────────────────────────────────────────────────────

const updateUserValidator = [
  param('id').isUUID().withMessage('Valid user ID is required'),
  body('firstName').optional().trim().isLength({ max: 50 }),
  body('lastName').optional().trim().isLength({ max: 50 }),
  body('phone').optional().isMobilePhone().withMessage('Invalid phone number'),
  body('department').optional().trim().isLength({ max: 100 }),
  body('jobTitle').optional().trim().isLength({ max: 100 }),
];

const updateRoleValidator = [
  param('id').isUUID().withMessage('Valid user ID is required'),
  body('roleId').notEmpty().withMessage('roleId (UUID or role name) is required'),
];

const paginationValidator = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer').toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1–100').toInt(),
];

// ─── Leaves ────────────────────────────────────────────────────

const createLeaveValidator = [
  body('leaveType')
    .isIn(Object.values(LEAVE_TYPES))
    .withMessage(`Leave type must be one of: ${Object.values(LEAVE_TYPES).join(', ')}`),
  body('startDate')
    .isISO8601().withMessage('Start date must be a valid date (YYYY-MM-DD)')
    .toDate(),
  body('endDate')
    .isISO8601().withMessage('End date must be a valid date (YYYY-MM-DD)')
    .toDate()
    .custom((endDate, { req }) => {
      if (new Date(endDate) < new Date(req.body.startDate)) {
        throw new Error('End date must be after or equal to start date');
      }
      return true;
    }),
  body('reason')
    .trim().notEmpty().withMessage('Reason is required')
    .isLength({ max: 500 }).withMessage('Reason max 500 characters'),
];

const reviewLeaveValidator = [
  param('id').isUUID().withMessage('Valid leave request ID is required'),
  body('status')
    .isIn(['APPROVED', 'REJECTED']).withMessage('Status must be APPROVED or REJECTED'),
  body('reviewComment')
    .optional().trim().isLength({ max: 500 }).withMessage('Review comment max 500 characters'),
];

module.exports = {
  registerValidator,
  loginValidator,
  refreshTokenValidator,
  changePasswordValidator,
  updateUserValidator,
  updateRoleValidator,
  paginationValidator,
  createLeaveValidator,
  reviewLeaveValidator,
};
