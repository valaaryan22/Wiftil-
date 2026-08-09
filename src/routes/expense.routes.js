'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/expense.controller');
const { authenticate }   = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');
const { validate }       = require('../middlewares/validate.middleware');
const { body, param, query } = require('express-validator');
const { EXPENSE_MANAGE_MAX_LEVEL } = require('../constants');

router.use(authenticate);

const STATUSES      = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID'];
const PAYMENT_MODES = ['BANK_TRANSFER', 'UPI', 'CASH', 'CHEQUE', 'CARD', 'OTHER'];

const expenseIdParam = param('expenseId').isUUID().withMessage('Valid expense ID required');
const categoryIdParam = param('categoryId').isUUID().withMessage('Valid category ID required');

const expenseBodyValidators = [
  body('title').trim().notEmpty().withMessage('title is required'),
  body('amount').isFloat({ min: 0 }).withMessage('amount must be a non-negative number'),
  body('expenseDate').isDate().withMessage('expenseDate must be a valid date'),
  body('categoryId').optional().isUUID(),
  body('clientId').optional().isUUID(),
  body('bankAccountId').optional().isUUID(),
  body('vendorName').optional().trim(),
  body('description').optional().trim(),
  body('paymentMode').optional().isIn(PAYMENT_MODES),
  body('taxAmount').optional().isFloat({ min: 0 }).toFloat(),
  body('taxRate').optional().isFloat({ min: 0, max: 100 }).toFloat(),
  body('referenceNumber').optional().trim(),
  body('internalNotes').optional().trim(),
  body('isBillable').optional().isBoolean().toBoolean(),
  body('currency').optional().trim().isLength({ max: 10 }),
];

// ── Categories ────────────────────────────────────────────────────────────────
// GET  /expenses/categories
// POST /expenses/categories
// PATCH /expenses/categories/:categoryId

router.get('/categories', ctrl.getCategories);

router.post(
  '/categories',
  authorizeLevel(EXPENSE_MANAGE_MAX_LEVEL),
  [
    body('name').trim().notEmpty().withMessage('Category name is required'),
    body('description').optional().trim(),
    body('colorCode').optional().trim(),
  ],
  validate,
  ctrl.createCategory
);

router.patch(
  '/categories/:categoryId',
  authorizeLevel(EXPENSE_MANAGE_MAX_LEVEL),
  [
    categoryIdParam,
    body('name').optional().trim(),
    body('description').optional().trim(),
    body('colorCode').optional().trim(),
    body('isActive').optional().isBoolean().toBoolean(),
  ],
  validate,
  ctrl.updateCategory
);

// ── Expenses ──────────────────────────────────────────────────────────────────
// GET  /expenses/summary
// GET  /expenses
// POST /expenses
// GET  /expenses/:expenseId
// PATCH /expenses/:expenseId
// POST /expenses/:expenseId/submit
// POST /expenses/:expenseId/approve
// POST /expenses/:expenseId/reject
// DELETE /expenses/:expenseId

router.get(
  '/summary',
  [
    query('fromDate').optional().isDate(),
    query('toDate').optional().isDate(),
    query('categoryId').optional().isUUID(),
  ],
  validate,
  ctrl.getExpenseSummary
);

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim(),
    query('status').optional().isIn(STATUSES),
    query('categoryId').optional().isUUID(),
    query('clientId').optional().isUUID(),
    query('fromDate').optional().isDate(),
    query('toDate').optional().isDate(),
    query('sortBy').optional().trim(),
    query('sortOrder').optional().isIn(['ASC', 'DESC']),
  ],
  validate,
  ctrl.getExpenses
);

router.post(
  '/',
  [...expenseBodyValidators],
  validate,
  ctrl.createExpense
);

router.get(
  '/:expenseId',
  [expenseIdParam],
  validate,
  ctrl.getExpenseById
);

router.patch(
  '/:expenseId',
  [expenseIdParam, ...expenseBodyValidators.map(v => v.optional())],
  validate,
  ctrl.updateExpense
);

router.post(
  '/:expenseId/submit',
  [expenseIdParam],
  validate,
  ctrl.submitExpense
);

router.post(
  '/:expenseId/approve',
  authorizeLevel(EXPENSE_MANAGE_MAX_LEVEL),
  [expenseIdParam],
  validate,
  ctrl.approveExpense
);

router.post(
  '/:expenseId/reject',
  authorizeLevel(EXPENSE_MANAGE_MAX_LEVEL),
  [
    expenseIdParam,
    body('rejectionReason').optional().trim(),
  ],
  validate,
  ctrl.rejectExpense
);

router.delete(
  '/:expenseId',
  [expenseIdParam],
  validate,
  ctrl.deleteExpense
);

module.exports = router;
