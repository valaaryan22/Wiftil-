'use strict';

/**
 * docketItem.routes.js
 * Routes for a single docket: /dockets/:docketId
 * Includes docket CRUD, publish, manager management, task linking, and nested ticket management.
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/docket.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { body, param, query } = require('express-validator');
const { PACKAGE_MANAGE_MAX_LEVEL } = require('../constants');

router.use(authenticate);

const docketIdParam = [param('docketId').isUUID().withMessage('Valid docketId required')];

// ─── All Dockets (top-level) ─────────────────────────────────────────────────

// GET /dockets  (list all dockets, with optional filters)
router.get(
  '/',
  [
    query('status').optional().isIn(['DRAFT', 'PUBLISHED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']),
    query('clientId').optional().isUUID(),
    query('docketType').optional().isIn(['RETAINER', 'PROJECT', 'AD_HOC', 'INTERNAL']),
  ],
  validate,
  ctrl.getAllDockets
);

// ─── Single Docket CRUD ─────────────────────────────────────────────────────

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
    body('status').optional().isIn(['DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']),
    body('startDate').optional({ nullable: true }).isISO8601(),
    body('endDate').optional({ nullable: true }).isISO8601(),
    body('packageId').optional({ nullable: true }).isUUID(),
  ],
  validate,
  ctrl.updateDocket
);

// DELETE /dockets/:docketId
router.delete('/:docketId', authorizeLevel(PACKAGE_MANAGE_MAX_LEVEL), docketIdParam, validate, ctrl.deleteDocket);

// ─── Publish ─────────────────────────────────────────────────────────────────

// POST /dockets/:docketId/publish  (DRAFT → PUBLISHED)
router.post(
  '/:docketId/publish',
  authorizeLevel(PACKAGE_MANAGE_MAX_LEVEL),
  docketIdParam,
  validate,
  ctrl.publishDocket
);

// ─── Docket Managers (/dockets/:docketId/managers) ───────────────────────────

// GET  /dockets/:docketId/managers
router.get('/:docketId/managers', docketIdParam, validate, ctrl.getDocketManagers);

// POST /dockets/:docketId/managers
router.post(
  '/:docketId/managers',
  authorizeLevel(PACKAGE_MANAGE_MAX_LEVEL),
  [
    ...docketIdParam,
    body('managerId').isUUID().withMessage('Valid managerId is required'),
    body('role').optional().isIn(['PRIMARY', 'SECONDARY', 'REVIEWER']),
  ],
  validate,
  ctrl.addDocketManager
);

// DELETE /dockets/:docketId/managers/:managerId
router.delete(
  '/:docketId/managers/:managerId',
  authorizeLevel(PACKAGE_MANAGE_MAX_LEVEL),
  [
    ...docketIdParam,
    param('managerId').isUUID().withMessage('Valid managerId required'),
  ],
  validate,
  ctrl.removeDocketManager
);

// ─── Task Linking (/dockets/:docketId/tasks/:taskId/link) ────────────────────

// POST   /dockets/:docketId/tasks/:taskId/link
router.post(
  '/:docketId/tasks/:taskId/link',
  authorizeLevel(PACKAGE_MANAGE_MAX_LEVEL),
  [
    ...docketIdParam,
    param('taskId').isUUID().withMessage('Valid taskId required'),
  ],
  validate,
  ctrl.linkTaskToDocket
);

// DELETE /dockets/:docketId/tasks/:taskId/link
router.delete(
  '/:docketId/tasks/:taskId/link',
  authorizeLevel(PACKAGE_MANAGE_MAX_LEVEL),
  [
    ...docketIdParam,
    param('taskId').isUUID().withMessage('Valid taskId required'),
  ],
  validate,
  ctrl.unlinkTaskFromDocket
);

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
