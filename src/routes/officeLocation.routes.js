'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/officeLocation.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');

router.use(authenticate);

// Public / employee readable
router.get('/status', ctrl.getGeofenceStatus);
router.get('/active', ctrl.getActiveLocations);
router.post('/verify', ctrl.verifyLiveLocation);

// Manager / Admin routes (role level <= 3)
router.get('/', ctrl.getLocations);
router.post('/', authorizeLevel(3), ctrl.createLocation);
router.put('/:id', authorizeLevel(3), ctrl.updateLocation);
router.delete('/:id', authorizeLevel(3), ctrl.deleteLocation);

module.exports = router;
