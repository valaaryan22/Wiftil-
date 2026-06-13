'use strict';

const { verifyAccessToken } = require('../utils/jwt');
const { db }                = require('../database/client');
const { errorResponse }     = require('../utils/response');
const { HTTP_STATUS }       = require('../constants');
const userCache             = require('../utils/userCache');

/**
 * authenticate — verifies the Bearer token and attaches user to req.user
 *
 * Performance: Uses a 60-second in-memory cache keyed by userId to avoid
 * a DB round-trip on every request. Cache is invalidated on role/status changes.
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, {
        statusCode: HTTP_STATUS.UNAUTHORIZED,
        message: 'Access token is required',
      });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      const message =
        err.name === 'TokenExpiredError'
          ? 'Access token has expired'
          : 'Invalid access token';
      return errorResponse(res, { statusCode: HTTP_STATUS.UNAUTHORIZED, message });
    }

    // ── Cache hit — skip DB entirely ──────────────────────────────────────────
    const cached = userCache.getUser(decoded.sub);
    if (cached) {
      req.user = cached;
      return next();
    }

    // ── Cache miss — fetch from DB and cache result ───────────────────────────
    const user = await db.user.findUnique({
      where: { id: decoded.sub },
      select: {
        id:              true,
        email:           true,
        firstName:       true,
        lastName:        true,
        isActive:        true,
        isEmailVerified: true,
        department:      true,
        jobTitle:        true,
        managerId:       true,
        deletedAt:       true,
        roleId:          true,
        role: {
          select: {
            id:          true,
            name:        true,
            displayName: true,
            accessLevel: true,
            color:       true,
          },
        },
      },
    });

    if (!user || user.deletedAt) {
      return errorResponse(res, {
        statusCode: HTTP_STATUS.UNAUTHORIZED,
        message: 'User account not found',
      });
    }

    if (!user.isActive) {
      return errorResponse(res, {
        statusCode: HTTP_STATUS.FORBIDDEN,
        message: 'Your account has been deactivated. Contact admin.',
      });
    }

    // Flatten role fields for convenience
    const enrichedUser = {
      ...user,
      roleName:  user.role.name,
      roleLevel: user.role.accessLevel,
      roleColor: user.role.color,
    };

    // Cache for 60 seconds
    userCache.setUser(decoded.sub, enrichedUser);

    req.user = enrichedUser;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { authenticate };
