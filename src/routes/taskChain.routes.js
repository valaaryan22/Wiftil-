'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/taskChain.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');

// All routes require authentication
router.use(authenticate);

// ── Task Chains CRUD ──────────────────────────────────────────────────────────
router.get('/', ctrl.getTaskChains);
router.get('/:id', ctrl.getTaskChainById);
router.post('/', authorizeLevel(4), ctrl.createTaskChain);
router.put('/:id', authorizeLevel(4), ctrl.updateTaskChain);
router.delete('/:id', authorizeLevel(4), ctrl.deleteTaskChain);

// ── Apply Chain to Task ───────────────────────────────────────────────────────
router.post('/:id/apply/:taskId', authorizeLevel(4), ctrl.applyTaskChainToTask);
router.post('/apply-to-task', authorizeLevel(4), ctrl.applyTaskChainToTask);

module.exports = router;
