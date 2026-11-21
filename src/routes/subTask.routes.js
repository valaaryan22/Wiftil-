'use strict';

const express    = require('express');
const router     = express.Router({ mergeParams: true }); // mergeParams to access :taskId
const ctrl       = require('../controllers/subTask.controller');
const { authenticate }   = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');

router.use(authenticate);

// ── SubTask CRUD ──────────────────────────────────────────────────────────────
router.post('/',    authorizeLevel(4), ctrl.createSubTask);    // Level ≤ 4 (TEAM_LEAD+) — NOT Employees
router.get('/',     ctrl.getSubTasks);
router.get('/:id',  ctrl.getSubTaskById);
router.patch('/:id', authorizeLevel(4), ctrl.updateSubTask);   // Level ≤ 4 only
router.delete('/:id', authorizeLevel(4), ctrl.deleteSubTask);  // Level ≤ 4 only

// ── Assignment & Workflow ─────────────────────────────────────────────────────
router.post('/:id/assign',      authorizeLevel(4), ctrl.assignSubTask);       // Level ≤ 4 → assigns Member(s)
router.post('/:id/self-assign', ctrl.selfAssignSubTask);                     // Any authenticated user can self-assign
router.patch('/:id/start',      ctrl.startSubTask);                            // Member starts (no min level — enforced in service)
router.post('/:id/submit',  ctrl.submitSubTask);                        // Member submits (no min level — enforced in service)
router.post('/:id/approve', authorizeLevel(4), ctrl.approveSubTask);  // Level ≤ 4 reviews
router.post('/:id/reject',  authorizeLevel(4), ctrl.rejectSubTask);   // Level ≤ 4 reviews

// ── Dependencies ──────────────────────────────────────────────────────────────
router.post('/:id/dependencies',                      authorizeLevel(4), ctrl.addDependency);     // Level ≤ 4 adds
router.delete('/:id/dependencies/:prerequisiteId',    authorizeLevel(4), ctrl.removeDependency);  // Level ≤ 4 removes

module.exports = router;
