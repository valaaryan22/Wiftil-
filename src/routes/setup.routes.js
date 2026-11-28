'use strict';

const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const setupService = require('../services/setup.service');
const { verifyAccessToken } = require('../utils/jwt');
const { successResponse, errorResponse } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Protects setup endpoints using either:
 *   1. `x-setup-key` header (or `key` query/body) matching SETUP_KEY / DB_SYNC_KEY / JWT_ACCESS_SECRET
 *   2. An authenticated BOSS (roleLevel === 1) Bearer JWT
 */
function requireSetupAccess(req, res, next) {
  const expectedKey = process.env.SETUP_KEY || process.env.DB_SYNC_KEY || process.env.JWT_ACCESS_SECRET;
  const providedKey = req.headers['x-setup-key'] || req.query.key || req.body?.key;

  if (expectedKey && providedKey && safeEqual(String(providedKey), String(expectedKey))) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = verifyAccessToken(authHeader.split(' ')[1]);
      if (decoded && Number(decoded.roleLevel) === 1) {
        req.user = { id: decoded.sub, ...decoded };
        return next();
      }
    } catch (_) {
      // Fall through to unauthorized response
    }
  }

  return errorResponse(res, {
    statusCode: HTTP_STATUS.UNAUTHORIZED,
    message: 'Valid x-setup-key header (or BOSS Bearer token) required',
  });
}

// GET /api/v1/setup/status
router.get('/status', requireSetupAccess, async (req, res, next) => {
  try {
    const status = await setupService.getSetupStatus();
    return successResponse(res, { message: 'Database setup status fetched', data: status });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/setup/sync
router.post('/sync', requireSetupAccess, async (req, res, next) => {
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
});

module.exports = router;
