'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/dateChangeRequest.controller');
const { authenticate }   = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');

router.use(authenticate);

// GET  /date-change-requests?entityType=Task&entityId=...&status=PENDING
// Managers see all; level > 3 users see only their own.
router.get('/', ctrl.getDateChangeRequests);

// POST /date-change-requests/:id/approve  (manager only)
router.post('/:id/approve', authorizeLevel(3), ctrl.approveDateChange);

// POST /date-change-requests/:id/reject   (manager only)
router.post('/:id/reject',  authorizeLevel(3), ctrl.rejectDateChange);

module.exports = router;
