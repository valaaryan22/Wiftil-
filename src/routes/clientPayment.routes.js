'use strict';

const express = require('express');
const router  = express.Router({ mergeParams: true });
const ctrl    = require('../controllers/clientPayment.controller');
const { authenticate }   = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');
const { validate }       = require('../middlewares/validate.middleware');
const { body, param, query } = require('express-validator');
const { PAYMENT_MANAGE_MAX_LEVEL, CLIENT_MANAGE_MAX_LEVEL } = require('../constants');

router.use(authenticate);

// ── Param validators ──────────────────────────────────────────────────────────
const clientIdParam  = param('clientId').isUUID().withMessage('Valid client ID required');
const paymentIdParam = param('paymentId').isUUID().withMessage('Valid payment ID required');

// ── Shared amount validator ───────────────────────────────────────────────────
const PAYMENT_MODES = ['BANK_TRANSFER', 'UPI', 'CHEQUE', 'CASH', 'CARD', 'NEFT', 'RTGS', 'IMPS', 'OTHER'];
const PAYMENT_TYPES = ['INVOICE', 'PAYMENT', 'ADVANCE', 'CREDIT_NOTE', 'REFUND', 'WRITE_OFF', 'ADJUSTMENT'];
const STATUSES      = ['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'DISPUTED', 'CANCELLED', 'REFUNDED', 'WRITTEN_OFF'];

const invoiceBodyValidators = [
  body('amount').isFloat({ min: 0 }).withMessage('amount must be a non-negative number'),
  body('taxAmount').optional().isFloat({ min: 0 }).toFloat(),
  body('taxRate').optional().isFloat({ min: 0, max: 100 }).toFloat(),
  body('discountAmount').optional().isFloat({ min: 0 }).toFloat(),
  body('penaltyAmount').optional().isFloat({ min: 0 }).toFloat(),
  body('invoiceDate').optional().isDate().withMessage('invoiceDate must be a valid date'),
  body('dueDate').optional().isDate().withMessage('dueDate must be a valid date'),
  body('packageId').optional().isUUID(),
  body('description').optional().trim(),
  body('internalNotes').optional().trim(),
  body('currency').optional().trim().isLength({ max: 10 }),
  body('lineItems').optional().isArray(),
];

const paymentBodyValidators = [
  body('amount').isFloat({ min: 0.01 }).withMessage('amount must be > 0'),
  body('paymentMode').optional().isIn(PAYMENT_MODES).withMessage(`paymentMode must be one of: ${PAYMENT_MODES.join(', ')}`),
  body('paidDate').optional().isDate(),
  body('referenceNumber').optional().trim(),
  body('parentInvoiceId').optional().isUUID(),
  body('packageId').optional().isUUID(),
  body('collectedById').optional().isUUID(),
  body('description').optional().trim(),
  body('internalNotes').optional().trim(),
  body('currency').optional().trim().isLength({ max: 10 }),
];

// ─────────────────────────────────────────────────────────────────────────────
// COLLECTION (List + Summary)
// GET  /clients/:clientId/payments           — list all
// GET  /clients/:clientId/payments/summary   — outstanding summary
// GET  /clients/:clientId/payments/:paymentId
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  '/summary',
  [clientIdParam],
  validate,
  ctrl.getPaymentSummary
);

router.get(
  '/',
  [
    clientIdParam,
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim(),
    query('paymentType').optional().isIn(PAYMENT_TYPES),
    query('status').optional().isIn(STATUSES),
    query('paymentMode').optional().isIn(PAYMENT_MODES),
    query('packageId').optional().isUUID(),
    query('fromDate').optional().isDate(),
    query('toDate').optional().isDate(),
    query('sortBy').optional().trim(),
    query('sortOrder').optional().isIn(['ASC', 'DESC']),
  ],
  validate,
  ctrl.getPayments
);

router.get(
  '/:paymentId',
  [clientIdParam, paymentIdParam],
  validate,
  ctrl.getPaymentById
);

// ─────────────────────────────────────────────────────────────────────────────
// CREATE — Invoice / Payment / Advance / Credit Note
// POST /clients/:clientId/payments/invoice
// POST /clients/:clientId/payments/record
// POST /clients/:clientId/payments/advance
// POST /clients/:clientId/payments/credit-note
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  '/invoice',
  authorizeLevel(PAYMENT_MANAGE_MAX_LEVEL),
  [clientIdParam, ...invoiceBodyValidators],
  validate,
  ctrl.createInvoice
);

router.post(
  '/record',
  [clientIdParam, ...paymentBodyValidators],
  validate,
  ctrl.recordPayment
);

router.post(
  '/advance',
  [clientIdParam, ...paymentBodyValidators],
  validate,
  ctrl.recordAdvance
);

router.post(
  '/credit-note',
  authorizeLevel(PAYMENT_MANAGE_MAX_LEVEL),
  [
    clientIdParam,
    body('amount').isFloat({ min: 0.01 }).withMessage('amount must be > 0'),
    body('description').optional().trim(),
    body('internalNotes').optional().trim(),
    body('parentInvoiceId').optional().isUUID(),
    body('packageId').optional().isUUID(),
    body('currency').optional().trim(),
  ],
  validate,
  ctrl.issueCreditNote
);

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE — Edit DRAFT invoice fields
// PATCH /clients/:clientId/payments/:paymentId
// ─────────────────────────────────────────────────────────────────────────────

router.patch(
  '/:paymentId',
  authorizeLevel(PAYMENT_MANAGE_MAX_LEVEL),
  [
    clientIdParam,
    paymentIdParam,
    ...invoiceBodyValidators.map(v => v.optional()),
    body('referenceNumber').optional().trim(),
    body('paymentMode').optional().isIn(PAYMENT_MODES),
    body('paidDate').optional().isDate(),
    body('nextFollowUpDate').optional().isDate(),
  ],
  validate,
  ctrl.updatePayment
);

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW ACTIONS
// POST /clients/:clientId/payments/:paymentId/send
// POST /clients/:clientId/payments/:paymentId/overdue
// POST /clients/:clientId/payments/:paymentId/dispute
// POST /clients/:clientId/payments/:paymentId/resolve-dispute
// POST /clients/:clientId/payments/:paymentId/approve
// POST /clients/:clientId/payments/:paymentId/cancel
// POST /clients/:clientId/payments/:paymentId/write-off
// POST /clients/:clientId/payments/:paymentId/follow-up
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  '/:paymentId/send',
  authorizeLevel(PAYMENT_MANAGE_MAX_LEVEL),
  [clientIdParam, paymentIdParam],
  validate,
  ctrl.markInvoiceSent
);

router.post(
  '/:paymentId/overdue',
  authorizeLevel(PAYMENT_MANAGE_MAX_LEVEL),
  [clientIdParam, paymentIdParam],
  validate,
  ctrl.markInvoiceOverdue
);

router.post(
  '/:paymentId/dispute',
  [
    clientIdParam,
    paymentIdParam,
    body('disputeReason').trim().notEmpty().withMessage('disputeReason is required'),
  ],
  validate,
  ctrl.raiseDispute
);

router.post(
  '/:paymentId/resolve-dispute',
  authorizeLevel(PAYMENT_MANAGE_MAX_LEVEL),
  [clientIdParam, paymentIdParam],
  validate,
  ctrl.resolveDispute
);

router.post(
  '/:paymentId/approve',
  authorizeLevel(PAYMENT_MANAGE_MAX_LEVEL),
  [clientIdParam, paymentIdParam],
  validate,
  ctrl.approvePayment
);

router.post(
  '/:paymentId/cancel',
  authorizeLevel(PAYMENT_MANAGE_MAX_LEVEL),
  [clientIdParam, paymentIdParam],
  validate,
  ctrl.cancelInvoice
);

router.post(
  '/:paymentId/write-off',
  authorizeLevel(CLIENT_MANAGE_MAX_LEVEL),
  [clientIdParam, paymentIdParam],
  validate,
  ctrl.writeOffInvoice
);

router.post(
  '/:paymentId/follow-up',
  [
    clientIdParam,
    paymentIdParam,
    body('nextFollowUpDate').optional().isDate(),
    body('internalNotes').optional().trim(),
  ],
  validate,
  ctrl.logFollowUp
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// DELETE /clients/:clientId/payments/:paymentId
// ─────────────────────────────────────────────────────────────────────────────

router.delete(
  '/:paymentId',
  authorizeLevel(CLIENT_MANAGE_MAX_LEVEL),
  [clientIdParam, paymentIdParam],
  validate,
  ctrl.deletePayment
);

module.exports = router;
