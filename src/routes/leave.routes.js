'use strict';

const express = require('express');
const router  = express.Router();

const leaveController = require('../controllers/leave.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeMinRole } = require('../middlewares/authorize.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { createLeaveValidator, reviewLeaveValidator, paginationValidator } = require('../validators');

// All leave routes require authentication
router.use(authenticate);

// POST /leaves — any authenticated user can apply
router.post('/', createLeaveValidator, validate, leaveController.createLeave);

// GET /leaves/my — own leaves
router.get('/my', paginationValidator, validate, leaveController.getMyLeaves);

// GET /leaves — all (scoped by role)
router.get('/', authorizeMinRole('LEADER'), paginationValidator, validate, leaveController.getLeaves);

// PATCH /leaves/:id/review — LEADER+ can review
router.patch('/:id/review', authorizeMinRole('LEADER'), reviewLeaveValidator, validate, leaveController.reviewLeave);

// PATCH /leaves/:id/cancel — own pending leave
router.patch('/:id/cancel', leaveController.cancelLeave);

module.exports = router;
