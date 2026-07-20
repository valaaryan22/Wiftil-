'use strict';

/**
 * docketItem.routes.js
 * Routes for a single docket: /dockets/:docketId
 * Includes docket CRUD and nested ticket management.
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/docket.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { body, param } = require('express-validator');
const { PACKAGE_MANAGE_MAX_LEVEL } = require('../constants');

router.use(authenticate);

const docketIdParam = [param('docketId').isUUID().withMessage('Valid docketId required')];

// GET    /dockets/:docketId
router.get('/:docketId', docketIdParam, validate, ctrl.getDocketById);

// PATCH  /dockets/:docketId
router.patch(
  '/:docketId',
  authorizeLevel(PACKAGE_MANAGE_MAX_LEVEL),
  [
    ...docketIdParam,
    body('title').optional().trim(),
    body('description').optional().trim(),
    body('docketType').optional().isIn(['RETAINER', 'PROJECT', 'AD_HOC', 'INTERNAL']),
    body('isTicketBased').optional().isBoolean(),
    body('status').optional().isIn(['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']),
    body('startDate').optional({ nullable: true }).isISO8601(),
    body('endDate').optional({ nullable: true }).isISO8601(),
    body('assignedManagerId').optional({ nullable: true }).isUUID(),
    body('packageId').optional({ nullable: true }).isUUID(),
  ],
  validate,
  ctrl.updateDocket
);

// DELETE /dockets/:docketId
router.delete('/:docketId', authorizeLevel(PACKAGE_MANAGE_MAX_LEVEL), docketIdParam, validate, ctrl.deleteDocket);

// ─── Tickets (/dockets/:docketId/tickets) ────────────────────────────────────

// GET  /dockets/:docketId/tickets
router.get('/:docketId/tickets', docketIdParam, validate, ctrl.getTicketsByDocket);

// POST /dockets/:docketId/tickets
router.post(
  '/:docketId/tickets',
  [
    ...docketIdParam,
    body('title').trim().notEmpty().withMessage('Ticket title is required'),
    body('description').optional().trim(),
    body('ticketType').optional().isIn(['SERVICE_DELIVERY', 'ADD_ON_REQUEST', 'BUG', 'CHANGE_REQUEST', 'APPROVAL']),
    body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    body('serviceId').optional({ nullable: true }).isUUID(),
    body('addOnId').optional({ nullable: true }).isUUID(),
    body('dueDate').optional({ nullable: true }).isISO8601(),
    body('assignedToId').optional({ nullable: true }).isUUID(),
  ],
  validate,
  ctrl.createTicket
);

// GET    /tickets/:ticketId
router.get('/tickets/:ticketId', [param('ticketId').isUUID()], validate, ctrl.getTicketById);

// PATCH  /tickets/:ticketId
router.patch(
  '/tickets/:ticketId',
  [
    param('ticketId').isUUID(),
    body('title').optional().trim(),
    body('description').optional().trim(),
    body('ticketType').optional().isIn(['SERVICE_DELIVERY', 'ADD_ON_REQUEST', 'BUG', 'CHANGE_REQUEST', 'APPROVAL']),
    body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    body('status').optional().isIn(['OPEN', 'IN_PROGRESS', 'PENDING_APPROVAL', 'RESOLVED', 'CLOSED', 'REJECTED']),
    body('serviceId').optional({ nullable: true }).isUUID(),
    body('addOnId').optional({ nullable: true }).isUUID(),
    body('taskId').optional({ nullable: true }).isUUID(),
    body('dueDate').optional({ nullable: true }).isISO8601(),
    body('assignedToId').optional({ nullable: true }).isUUID(),
    body('resolutionNote').optional().trim(),
  ],
  validate,
  ctrl.updateTicket
);

// DELETE /tickets/:ticketId
router.delete(
  '/tickets/:ticketId',
  authorizeLevel(PACKAGE_MANAGE_MAX_LEVEL),
  [param('ticketId').isUUID()],
  validate,
  ctrl.deleteTicket
);

module.exports = router;
