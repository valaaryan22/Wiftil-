'use strict';

const express = require('express');
const router = express.Router();

const incrementPolicyController = require('../controllers/incrementPolicy.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');

// All increment policy routes should typically be restricted to Boss/Admin (Level 1) or HR managers
router.use(authenticate);

// Apply level 2 or 1 for general access, maybe Level 1 for configuring policies
router.post('/policies', authorizeLevel(1), incrementPolicyController.createPolicy);
router.get('/policies', authorizeLevel(3), incrementPolicyController.listPolicies);
router.put('/policies/:id', authorizeLevel(1), incrementPolicyController.updatePolicy);
router.delete('/policies/:id', authorizeLevel(1), incrementPolicyController.deletePolicy);

// Endpoints for calculation, application and history
router.get('/calculate', authorizeLevel(2), incrementPolicyController.calculateIncrements);
router.post('/apply', authorizeLevel(2), incrementPolicyController.applyIncrement);
router.get('/history', authorizeLevel(2), incrementPolicyController.getIncrementHistory);

module.exports = router;
