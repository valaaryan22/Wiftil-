'use strict';

const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/task.controller');
const taskChainCtrl = require('../controllers/taskChain.controller');
const { authenticate }   = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');

// All routes require authentication
router.use(authenticate);

// ── Stats / Dashboard ──────────────────────────────────────────────────────────
router.get('/stats', ctrl.getTaskStats);

// ── Task CRUD ─────────────────────────────────────────────────────────────────
router.post('/',    authorizeLevel(2), ctrl.createTask);      // BOSS/ADMIN only (level ≤ 2)
router.get('/',     ctrl.getTasks);                           // All (role-scoped)
router.get('/:id',  ctrl.getTaskById);
router.patch('/:id', authorizeLevel(2), ctrl.updateTask);     // BOSS/ADMIN only
router.delete('/:id', authorizeLevel(2), ctrl.deleteTask);    // BOSS/ADMIN only

// ── Task Workflow ─────────────────────────────────────────────────────────────
router.post('/:id/assign-manager',  authorizeLevel(2), ctrl.assignManager);  // BOSS/ADMIN → Manager
router.post('/:id/accept',          authorizeLevel(3), ctrl.acceptTask);      // Manager (level ≤ 3)
router.post('/:id/reject',          authorizeLevel(3), ctrl.rejectTask);      // Manager
router.post('/:id/assign-leads',    authorizeLevel(3), ctrl.assignTeamLeads); // Manager → Team Lead(s)
router.post('/:id/submit',          authorizeLevel(4), ctrl.submitTask);      // Team Lead (level ≤ 4)
router.post('/:id/approve',         authorizeLevel(3), ctrl.approveTask);     // Manager
router.post('/:id/reopen',          authorizeLevel(3), ctrl.reopenTask);      // Manager or Admin

// ── Apply Task Chain to Task / Ticket ─────────────────────────────────────────
router.post('/:taskId/apply-chain', authorizeLevel(4), taskChainCtrl.applyTaskChainToTask);

module.exports = router;
