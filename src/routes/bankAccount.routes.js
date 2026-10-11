'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/bankAccount.controller');
const { authenticate }   = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');
const { validate }       = require('../middlewares/validate.middleware');
const { body, param, query } = require('express-validator');
const { BANK_MANAGE_MAX_LEVEL, FINANCE_MANAGE_MAX_LEVEL } = require('../constants');

router.use(authenticate);

const ACCOUNT_TYPES  = ['SAVINGS', 'CURRENT', 'CASH', 'DIGITAL_WALLET', 'CREDIT_CARD'];
const TX_TYPES       = ['CREDIT', 'DEBIT'];
const PAYMENT_MODES  = ['BANK_TRANSFER', 'UPI', 'CHEQUE', 'CASH', 'CARD', 'NEFT', 'RTGS', 'IMPS', 'OTHER'];
const TX_SOURCES     = ['INVOICE_PAYMENT', 'EXPENSE', 'PAYROLL', 'ADVANCE', 'MANUAL', 'TRANSFER', 'ADJUSTMENT'];

const accountIdParam = param('accountId').isUUID().withMessage('Valid account ID required');

// ── Summary ───────────────────────────────────────────────────────────────────
// GET /bank-accounts/summary
router.get(
  '/summary',
  authorizeLevel(FINANCE_MANAGE_MAX_LEVEL),
  ctrl.getAccountSummary
);

// GET /bank-accounts/transactions/all
router.get(
  '/transactions/all',
  authorizeLevel(FINANCE_MANAGE_MAX_LEVEL),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
    query('search').optional().trim(),
    query('transactionType').optional().isIn(TX_TYPES),
    query('source').optional().isIn(TX_SOURCES),
    query('fromDate').optional().isDate(),
    query('toDate').optional().isDate(),
    query('bankAccountId').optional().trim(),
  ],
  validate,
  ctrl.getAllTransactions
);

// ── Bank Accounts CRUD ────────────────────────────────────────────────────────
// GET  /bank-accounts
// POST /bank-accounts
// GET  /bank-accounts/:accountId
// PATCH /bank-accounts/:accountId
// DELETE /bank-accounts/:accountId

router.get(
  '/',
  authorizeLevel(FINANCE_MANAGE_MAX_LEVEL),
  [
    query('includeInactive').optional().isBoolean().toBoolean(),
  ],
  validate,
  ctrl.getBankAccounts
);

router.post(
  '/',
  authorizeLevel(BANK_MANAGE_MAX_LEVEL),
  [
    body('accountName').trim().notEmpty().withMessage('accountName is required'),
    body('accountType').isIn(ACCOUNT_TYPES).withMessage(`accountType must be one of: ${ACCOUNT_TYPES.join(', ')}`),
    body('accountNumber').optional().trim(),
    body('bankName').optional().trim(),
    body('ifscCode').optional().trim(),
    body('openingBalance').optional().isFloat({ min: 0 }).toFloat(),
    body('isDefault').optional().isBoolean().toBoolean(),
    body('description').optional().trim(),
    body('colorCode').optional().trim(),
    body('currency').optional().trim().isLength({ max: 10 }),
  ],
  validate,
  ctrl.createBankAccount
);

router.get(
  '/:accountId',
  authorizeLevel(FINANCE_MANAGE_MAX_LEVEL),
  [accountIdParam],
  validate,
  ctrl.getBankAccountById
);

router.patch(
  '/:accountId',
  authorizeLevel(BANK_MANAGE_MAX_LEVEL),
  [
    accountIdParam,
    body('accountName').optional().trim(),
    body('accountNumber').optional().trim(),
    body('bankName').optional().trim(),
    body('ifscCode').optional().trim(),
    body('description').optional().trim(),
    body('colorCode').optional().trim(),
    body('isDefault').optional().isBoolean().toBoolean(),
    body('isActive').optional().isBoolean().toBoolean(),
  ],
  validate,
  ctrl.updateBankAccount
);

router.delete(
  '/:accountId',
  authorizeLevel(BANK_MANAGE_MAX_LEVEL),
  [accountIdParam],
  validate,
  ctrl.deleteBankAccount
);

// ── Transactions ──────────────────────────────────────────────────────────────
// GET  /bank-accounts/:accountId/transactions
// POST /bank-accounts/:accountId/transactions

router.get(
  '/:accountId/transactions',
  authorizeLevel(FINANCE_MANAGE_MAX_LEVEL),
  [
    accountIdParam,
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
    query('search').optional().trim(),
    query('transactionType').optional().isIn(TX_TYPES),
    query('source').optional().isIn(TX_SOURCES),
    query('fromDate').optional().isDate(),
    query('toDate').optional().isDate(),
  ],
  validate,
  ctrl.getTransactions
);

router.post(
  '/:accountId/transactions',
  authorizeLevel(FINANCE_MANAGE_MAX_LEVEL),
  [
    accountIdParam,
    body('transactionType').isIn(TX_TYPES).withMessage(`transactionType must be CREDIT or DEBIT`),
    body('amount').isFloat({ min: 0.01 }).withMessage('amount must be > 0'),
    body('transactionDate').optional().isDate(),
    body('paymentMode').optional().isIn(PAYMENT_MODES),
    body('source').optional().isIn(TX_SOURCES),
    body('referenceNumber').optional().trim(),
    body('purpose').optional().trim(),
    body('narration').optional().trim(),
    body('clientId').optional().isUUID(),
  ],
  validate,
  ctrl.addTransaction
);

module.exports = router;
