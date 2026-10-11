'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/finance.controller');
const { authenticate }   = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');
const { validate }       = require('../middlewares/validate.middleware');
const { body, param, query } = require('express-validator');
const { FINANCE_MANAGE_MAX_LEVEL, BILLING_CONFIG_MAX_LEVEL } = require('../constants');

router.use(authenticate);

// ── Finance Dashboard ─────────────────────────────────────────────────────────
// GET /finance/dashboard
router.get(
  '/dashboard',
  authorizeLevel(FINANCE_MANAGE_MAX_LEVEL),
  ctrl.getFinanceDashboard
);

// ── Global Invoice List ───────────────────────────────────────────────────────
// GET /finance/invoices
router.get(
  '/invoices',
  authorizeLevel(FINANCE_MANAGE_MAX_LEVEL),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim(),
    query('invoiceStatus').optional().isIn(['DRAFT', 'UNDER_REVIEW', 'APPROVED', 'CANCELLED']),
    query('paymentStatus').optional().isIn(['UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'DISPUTED', 'WRITTEN_OFF']),
    query('clientId').optional().isUUID(),
    query('fromDate').optional().isDate(),
    query('toDate').optional().isDate(),
    query('sortBy').optional().trim(),
    query('sortOrder').optional().isIn(['ASC', 'DESC']),
  ],
  validate,
  ctrl.getAllInvoices
);

// GET /finance/invoices/:invoiceId/pdf
router.get(
  '/invoices/:invoiceId/pdf',
  authorizeLevel(FINANCE_MANAGE_MAX_LEVEL),
  [
    param('invoiceId').isUUID().withMessage('Valid invoice ID required'),
  ],
  validate,
  ctrl.downloadInvoicePdf
);

// ── Receivables ───────────────────────────────────────────────────────────────
// GET /finance/receivables
router.get(
  '/receivables',
  authorizeLevel(FINANCE_MANAGE_MAX_LEVEL),
  [
    query('clientId').optional().isUUID(),
  ],
  validate,
  ctrl.getReceivables
);

// ── Auto Invoice Generation ───────────────────────────────────────────────────
// POST /finance/invoices/generate-due
router.post(
  '/invoices/generate-due',
  authorizeLevel(BILLING_CONFIG_MAX_LEVEL),
  ctrl.generateDueInvoices
);

// ── Manual Invoice Creation ───────────────────────────────────────────────────
// POST /finance/invoices
router.post(
  '/invoices',
  authorizeLevel(FINANCE_MANAGE_MAX_LEVEL),
  [
    body('clientId').isUUID().withMessage('Valid client ID required'),
    body('packageId').optional().isUUID(),
    body('addOnIds').optional().isArray(),
    body('amount').optional().isFloat({ min: 0 }).toFloat(),
    body('taxRate').optional().isFloat({ min: 0, max: 100 }).toFloat(),
    body('taxAmount').optional().isFloat({ min: 0 }).toFloat(),
    body('discountAmount').optional().isFloat({ min: 0 }).toFloat(),
    body('penaltyAmount').optional().isFloat({ min: 0 }).toFloat(),
    body('invoiceDate').optional().isDate(),
    body('dueDate').optional().isDate(),
    body('description').optional().trim(),
    body('internalNotes').optional().trim(),
    body('currency').optional().trim().isLength({ max: 10 }),
  ],
  validate,
  ctrl.createInvoice
);

// ── Payment Collection ────────────────────────────────────────────────────────
// POST /finance/invoices/:invoiceId/collect
router.post(
  '/invoices/:invoiceId/collect',
  authorizeLevel(FINANCE_MANAGE_MAX_LEVEL),
  [
    param('invoiceId').isUUID().withMessage('Valid invoice ID required'),
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be > 0'),
    body('paymentMode').optional().isIn(['BANK_TRANSFER', 'UPI', 'CHEQUE', 'CASH', 'CARD', 'NEFT', 'RTGS', 'IMPS', 'OTHER']),
    body('paidDate').optional().isDate(),
    body('referenceNumber').optional().trim(),
    body('internalNotes').optional().trim(),
  ],
  validate,
  ctrl.collectPayment
);

// ── Billing Config (per client) ───────────────────────────────────────────────
// GET  /finance/billing-config/:clientId
// PUT  /finance/billing-config/:clientId
router.get(
  '/billing-config/:clientId',
  authorizeLevel(FINANCE_MANAGE_MAX_LEVEL),
  [param('clientId').isUUID().withMessage('Valid client ID required')],
  validate,
  ctrl.getBillingConfig
);

router.put(
  '/billing-config/:clientId',
  authorizeLevel(BILLING_CONFIG_MAX_LEVEL),
  [
    param('clientId').isUUID().withMessage('Valid client ID required'),
    body('billingDay').isInt({ min: 1, max: 28 }).withMessage('billingDay must be 1-28'),
    body('billingFrequency').optional().isIn(['MONTHLY', 'QUARTERLY', 'ANNUAL']),
    body('isAutoGenerate').optional().isBoolean().toBoolean(),
    body('packageId').optional().isUUID(),
    body('defaultTaxRate').optional().isFloat({ min: 0, max: 100 }).toFloat(),
    body('defaultDueDays').optional().isInt({ min: 0, max: 365 }).toInt(),
    body('includeAddOns').optional().isBoolean().toBoolean(),
    body('notes').optional().trim(),
  ],
  validate,
  ctrl.upsertBillingConfig
);

module.exports = router;
