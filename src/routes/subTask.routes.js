'use strict';

const express    = require('express');
const router     = express.Router({ mergeParams: true }); // mergeParams to access :taskId
const ctrl       = require('../controllers/subTask.controller');
const { authenticate }   = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');

router.use(authenticate);

// ── SubTask CRUD ──────────────────────────────────────────────────────────────
router.post('/',    authorizeLevel(2), ctrl.createSubTask);    // Team Lead
router.get('/',     ctrl.getSubTasks);
router.get('/:id',  ctrl.getSubTaskById);
router.patch('/:id', authorizeLevel(2), ctrl.updateSubTask);   // Team Lead
router.delete('/:id', authorizeLevel(2), ctrl.deleteSubTask);  // Team Lead

// ── Assignment & Workflow ─────────────────────────────────────────────────────
router.post('/:id/assign',  authorizeLevel(2), ctrl.assignSubTask);   // Team Lead → Member(s)
router.patch('/:id/start',  ctrl.startSubTask);                        // Member starts
router.post('/:id/submit',  ctrl.submitSubTask);                        // Member submits
router.post('/:id/approve', authorizeLevel(2), ctrl.approveSubTask);  // Team Lead
router.post('/:id/reject',  authorizeLevel(2), ctrl.rejectSubTask);   // Team Lead

// ── Dependencies ──────────────────────────────────────────────────────────────
router.post('/:id/dependencies',                      authorizeLevel(2), ctrl.addDependency);     // add
router.delete('/:id/dependencies/:prerequisiteId',    authorizeLevel(2), ctrl.removeDependency);  // remove

module.exports = router;
