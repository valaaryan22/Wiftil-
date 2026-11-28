'use strict';

const express = require('express');
const router = express.Router();
const setupService = require('../services/setup.service');
const { successResponse } = require('../utils/response');

// GET /api/v1/setup/status
router.get('/status', async (req, res, next) => {
  try {
    const status = await setupService.getSetupStatus();
    return successResponse(res, { message: 'Database setup status fetched', data: status });
  } catch (err) {
    next(err);
  }
});

async function handleSync(req, res, next) {
  try {
    const alter = req.body?.alter !== undefined ? Boolean(req.body.alter) : true;
    const seedUsers = req.body?.seedUsers !== undefined ? Boolean(req.body.seedUsers) : true;
    const result = await setupService.syncAndSeedDatabase({ alter, seedUsers });
    return successResponse(res, {
      message: 'Database synced and seeded successfully',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

// GET & POST /api/v1/setup/sync
router.get('/sync', handleSync);
router.post('/sync', handleSync);

module.exports = router;
