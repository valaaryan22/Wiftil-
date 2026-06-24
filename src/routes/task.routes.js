'use strict';

const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/task.controller');
const { authenticate }   = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');

// All routes require authentication
router.use(authenticate);

// ── Stats / Dashboard ──────────────────────────────────────────────────────────
router.get('/stats', ctrl.getTaskStats);

// ── Task CRUD ─────────────────────────────────────────────────────────────────
router.post('/',    authorizeLevel(5), ctrl.createTask);      // Admin only
router.get('/',     ctrl.getTasks);                           // All (role-scoped)
router.get('/:id',  ctrl.getTaskById);
router.patch('/:id', authorizeLevel(5), ctrl.updateTask);     // Admin only
router.delete('/:id', authorizeLevel(5), ctrl.deleteTask);    // Admin only

// ── Task Workflow ─────────────────────────────────────────────────────────────
router.post('/:id/assign-manager',  authorizeLevel(5), ctrl.assignManager);  // Admin → Manager
router.post('/:id/accept',          authorizeLevel(4), ctrl.acceptTask);      // Manager
router.post('/:id/reject',          authorizeLevel(4), ctrl.rejectTask);      // Manager
router.post('/:id/assign-leads',    authorizeLevel(4), ctrl.assignTeamLeads); // Manager → Team Lead(s)
router.post('/:id/submit',          authorizeLevel(2), ctrl.submitTask);      // Team Lead
router.post('/:id/approve',         authorizeLevel(4), ctrl.approveTask);     // Manager
router.post('/:id/reopen',          authorizeLevel(4), ctrl.reopenTask);      // Manager or Admin

module.exports = router;
