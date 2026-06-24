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
    const user = await db.User.findOne({
      where: { id: decoded.sub, deletedAt: null },
      attributes: ['id', 'email', 'firstName', 'lastName', 'isActive', 'isEmailVerified', 'department', 'jobTitle', 'managerId', 'deletedAt', 'roleId', 'profilePicture'],
      include: [{
        model: db.RoleDefinition, as: 'role',
        attributes: ['id', 'name', 'displayName', 'accessLevel', 'color'],
      }],
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
    const plainUser = user.toJSON();
    const enrichedUser = {
      ...plainUser,
      roleName:  plainUser.role.name,
      roleLevel: plainUser.role.accessLevel,
      roleColor: plainUser.role.color,
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
