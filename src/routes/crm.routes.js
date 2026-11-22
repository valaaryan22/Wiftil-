'use strict';

const express = require('express');
const router  = express.Router();

const crmController    = require('../controllers/crm.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');
const { validate }     = require('../middlewares/validate.middleware');
const { body, param, query } = require('express-validator');
const { CRM_MANAGE_MAX_LEVEL } = require('../constants');

// All CRM routes require authentication and level <= 3 (MANAGER+)
router.use(authenticate);
router.use(authorizeLevel(CRM_MANAGE_MAX_LEVEL));

// ── Overall Metrics ──────────────────────────────────────────────────────────
router.get('/metrics', crmController.getCrmMetrics);

// ── 1. LEADS ─────────────────────────────────────────────────────────────────
router.get(
  '/leads',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().isString(),
    query('status').optional().isString(),
    query('source').optional().isString(),
    query('priority').optional().isString(),
    query('assignedToId').optional().isUUID(),
    validate,
  ],
  crmController.getLeads
);

router.get('/leads/:id', [param('id').isUUID(), validate], crmController.getLeadById);

router.post(
  '/leads',
  [
    body('title').isString().notEmpty().withMessage('Lead title is required'),
    body('contactName').isString().notEmpty().withMessage('Contact name is required'),
    body('companyName').optional().isString(),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Valid email required'),
    body('phone').optional().isString(),
    body('source').optional().isIn(['WEBSITE', 'REFERRAL', 'LINKEDIN', 'COLD_OUTREACH', 'INBOUND_CALL', 'OTHER']),
    body('status').optional().isIn(['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'CONVERTED', 'LOST', 'DISQUALIFIED']),
    body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
    body('estimatedValue').optional().isNumeric(),
    body('currency').optional().isString(),
    body('assignedToId').optional().isUUID(),
    body('notes').optional().isString(),
    body('tags').optional().isArray(),
    validate,
  ],
  crmController.createLead
);

router.put(
  '/leads/:id',
  [
    param('id').isUUID(),
    body('title').optional().isString().notEmpty(),
    body('contactName').optional().isString().notEmpty(),
    body('companyName').optional().isString(),
    body('email').optional({ checkFalsy: true }).isEmail(),
    body('phone').optional().isString(),
    body('source').optional().isIn(['WEBSITE', 'REFERRAL', 'LINKEDIN', 'COLD_OUTREACH', 'INBOUND_CALL', 'OTHER']),
    body('status').optional().isIn(['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'CONVERTED', 'LOST', 'DISQUALIFIED']),
    body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
    body('estimatedValue').optional().isNumeric(),
    body('currency').optional().isString(),
    body('assignedToId').optional().isUUID(),
    body('notes').optional().isString(),
    body('tags').optional().isArray(),
    body('lostReason').optional().isString(),
    validate,
  ],
  crmController.updateLead
);

router.delete('/leads/:id', [param('id').isUUID(), validate], crmController.deleteLead);

router.post(
  '/leads/:id/convert',
  [
    param('id').isUUID(),
    body('dealName').optional().isString(),
    body('dealValue').optional().isNumeric(),
    body('expectedCloseDate').optional().isISO8601(),
    body('createClient').optional().isBoolean(),
    validate,
  ],
  crmController.convertLead
);

// ── 2. DEALS ─────────────────────────────────────────────────────────────────
router.get(
  '/deals',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().isString(),
    query('stage').optional().isString(),
    query('ownerId').optional().isUUID(),
    query('clientId').optional().isUUID(),
    validate,
  ],
  crmController.getDeals
);

router.get('/deals/:id', [param('id').isUUID(), validate], crmController.getDealById);

router.post(
  '/deals',
  [
    body('dealName').isString().notEmpty().withMessage('Deal name is required'),
    body('leadId').optional().isUUID(),
    body('clientId').optional().isUUID(),
    body('companyName').optional().isString(),
    body('contactName').optional().isString(),
    body('contactEmail').optional({ checkFalsy: true }).isEmail(),
    body('contactPhone').optional().isString(),
    body('stage').optional().isIn(['DISCOVERY', 'PROPOSAL_SHARED', 'NEGOTIATION', 'CONTRACT_SENT', 'WON', 'LOST']),
    body('probability').optional().isInt({ min: 0, max: 100 }),
    body('dealValue').optional().isNumeric(),
    body('currency').optional().isString(),
    body('pipeline').optional().isString(),
    body('expectedCloseDate').optional().isISO8601(),
    body('ownerId').optional().isUUID(),
    body('notes').optional().isString(),
    validate,
  ],
  crmController.createDeal
);

router.put(
  '/deals/:id',
  [
    param('id').isUUID(),
    body('dealName').optional().isString().notEmpty(),
    body('companyName').optional().isString(),
    body('contactName').optional().isString(),
    body('contactEmail').optional({ checkFalsy: true }).isEmail(),
    body('contactPhone').optional().isString(),
    body('clientId').optional().isUUID(),
    body('stage').optional().isIn(['DISCOVERY', 'PROPOSAL_SHARED', 'NEGOTIATION', 'CONTRACT_SENT', 'WON', 'LOST']),
    body('probability').optional().isInt({ min: 0, max: 100 }),
    body('dealValue').optional().isNumeric(),
    body('currency').optional().isString(),
    body('pipeline').optional().isString(),
    body('expectedCloseDate').optional().isISO8601(),
    body('ownerId').optional().isUUID(),
    body('notes').optional().isString(),
    body('lostReason').optional().isString(),
    validate,
  ],
  crmController.updateDeal
);

router.delete('/deals/:id', [param('id').isUUID(), validate], crmController.deleteDeal);

// ── 3. ACTIVITIES / FOLLOW-UPS / MEETINGS ────────────────────────────────────
router.get(
  '/activities',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('type').optional().isString(),
    query('status').optional().isString(),
    query('leadId').optional().isUUID(),
    query('dealId').optional().isUUID(),
    query('clientId').optional().isUUID(),
    query('assignedToId').optional().isUUID(),
    query('fromDate').optional().isISO8601(),
    query('toDate').optional().isISO8601(),
    validate,
  ],
  crmController.getActivities
);

router.get('/activities/:id', [param('id').isUUID(), validate], crmController.getActivityById);

router.post(
  '/activities',
  [
    body('title').isString().notEmpty().withMessage('Title is required'),
    body('type').optional().isIn(['CALL', 'MEETING', 'FOLLOW_UP', 'EMAIL', 'REMINDER', 'TASK']),
    body('description').optional().isString(),
    body('scheduledAt').isISO8601().withMessage('Valid scheduledAt date required'),
    body('durationMinutes').optional().isInt({ min: 5, max: 480 }),
    body('status').optional().isIn(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'OVERDUE']),
    body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH']),
    body('leadId').optional().isUUID(),
    body('dealId').optional().isUUID(),
    body('clientId').optional().isUUID(),
    body('assignedToId').optional().isUUID(),
    body('outcomeNotes').optional().isString(),
    body('nextFollowUpDate').optional().isISO8601(),
    body('meetingLink').optional().isString(),
    validate,
  ],
  crmController.createActivity
);

router.put(
  '/activities/:id',
  [
    param('id').isUUID(),
    body('title').optional().isString().notEmpty(),
    body('type').optional().isIn(['CALL', 'MEETING', 'FOLLOW_UP', 'EMAIL', 'REMINDER', 'TASK']),
    body('description').optional().isString(),
    body('scheduledAt').optional().isISO8601(),
    body('durationMinutes').optional().isInt({ min: 5, max: 480 }),
    body('status').optional().isIn(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'OVERDUE']),
    body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH']),
    body('leadId').optional().isUUID(),
    body('dealId').optional().isUUID(),
    body('clientId').optional().isUUID(),
    body('assignedToId').optional().isUUID(),
    body('outcomeNotes').optional().isString(),
    body('nextFollowUpDate').optional().isISO8601(),
    body('meetingLink').optional().isString(),
    validate,
  ],
  crmController.updateActivity
);

router.delete('/activities/:id', [param('id').isUUID(), validate], crmController.deleteActivity);

// ── 4. CONTRACTS & PROPOSALS ─────────────────────────────────────────────────
router.get(
  '/contracts',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('dealId').optional().isUUID(),
    query('leadId').optional().isUUID(),
    query('clientId').optional().isUUID(),
    query('type').optional().isString(),
    query('status').optional().isString(),
    validate,
  ],
  crmController.getContracts
);

router.get('/contracts/:id', [param('id').isUUID(), validate], crmController.getContractById);

router.post(
  '/contracts',
  [
    body('title').isString().notEmpty().withMessage('Contract title is required'),
    body('contractNumber').optional().isString(),
    body('type').optional().isIn(['PROPOSAL', 'AGREEMENT', 'NDA', 'SOW', 'SERVICE_CONTRACT', 'RETAINER']),
    body('status').optional().isIn(['DRAFT', 'SHARED_WITH_CLIENT', 'IN_REVIEW', 'ACCEPTED', 'SIGNED', 'REJECTED', 'EXPIRED']),
    body('dealId').optional().isUUID(),
    body('leadId').optional().isUUID(),
    body('clientId').optional().isUUID(),
    body('contractValue').optional().isNumeric(),
    body('currency').optional().isString(),
    body('validUntil').optional().isISO8601(),
    body('startDate').optional().isISO8601(),
    body('endDate').optional().isISO8601(),
    body('fileUrl').optional().isString(),
    body('fileName').optional().isString(),
    body('termsAndConditions').optional().isString(),
    body('scopeOfWork').optional().isString(),
    validate,
  ],
  crmController.createContract
);

router.put(
  '/contracts/:id',
  [
    param('id').isUUID(),
    body('title').optional().isString().notEmpty(),
    body('type').optional().isIn(['PROPOSAL', 'AGREEMENT', 'NDA', 'SOW', 'SERVICE_CONTRACT', 'RETAINER']),
    body('status').optional().isIn(['DRAFT', 'SHARED_WITH_CLIENT', 'IN_REVIEW', 'ACCEPTED', 'SIGNED', 'REJECTED', 'EXPIRED']),
    body('dealId').optional().isUUID(),
    body('leadId').optional().isUUID(),
    body('clientId').optional().isUUID(),
    body('contractValue').optional().isNumeric(),
    body('currency').optional().isString(),
    body('validUntil').optional().isISO8601(),
    body('startDate').optional().isISO8601(),
    body('endDate').optional().isISO8601(),
    body('fileUrl').optional().isString(),
    body('fileName').optional().isString(),
    body('termsAndConditions').optional().isString(),
    body('scopeOfWork').optional().isString(),
    validate,
  ],
  crmController.updateContract
);

router.delete('/contracts/:id', [param('id').isUUID(), validate], crmController.deleteContract);

module.exports = router;
