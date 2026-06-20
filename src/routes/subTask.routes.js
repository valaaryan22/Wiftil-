'use strict';

const express    = require('express');
const router     = express.Router({ mergeParams: true }); // mergeParams to access :taskId
const ctrl       = require('../controllers/subTask.controller');
const { authenticate }   = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');

router.use(authenticate);

// ── SubTask CRUD ──────────────────────────────────────────────────────────────
router.post('/',    authorizeLevel(2), ctrl.createSubTask);    // Level 2+ (Leader/Supervisor/Manager/Boss) — NOT Members
router.get('/',     ctrl.getSubTasks);
router.get('/:id',  ctrl.getSubTaskById);
router.patch('/:id', authorizeLevel(2), ctrl.updateSubTask);   // Level 2+ only
router.delete('/:id', authorizeLevel(2), ctrl.deleteSubTask);  // Level 2+ only

// ── Assignment & Workflow ─────────────────────────────────────────────────────
router.post('/:id/assign',  authorizeLevel(2), ctrl.assignSubTask);   // Level 2+ → assigns Member(s)
router.patch('/:id/start',  ctrl.startSubTask);                        // Member starts (no min level — enforced in service)
router.post('/:id/submit',  ctrl.submitSubTask);                        // Member submits (no min level — enforced in service)
router.post('/:id/approve', authorizeLevel(2), ctrl.approveSubTask);  // Level 2+ reviews
router.post('/:id/reject',  authorizeLevel(2), ctrl.rejectSubTask);   // Level 2+ reviews

// ── Dependencies ──────────────────────────────────────────────────────────────
router.post('/:id/dependencies',                      authorizeLevel(2), ctrl.addDependency);     // Level 2+ adds
router.delete('/:id/dependencies/:prerequisiteId',    authorizeLevel(2), ctrl.removeDependency);  // Level 2+ removes

module.exports = router;
