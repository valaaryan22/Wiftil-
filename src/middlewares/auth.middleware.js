'use strict';

const { verifyAccessToken } = require('../utils/jwt');
const { db }                = require('../database/client');
const { errorResponse }     = require('../utils/response');
const { HTTP_STATUS }       = require('../constants');
const userCache             = require('../utils/userCache');

/**
 * authenticate — verifies the Bearer token and attaches user to req.user
 *
 * Performance strategy (fastest → slowest):
 *   1. Cache hit  → 0ms   — return cached user object, extend TTL (sliding window)
 *   2. JWT claims → 0ms   — build req.user from signed JWT claims (no DB call)
 *   3. DB fallback → ~300ms — only for old tokens that lack embedded claims
 *
 * Security: JWT signature is always verified by jsonwebtoken before any claims
 * are trusted. Cache is explicitly invalidated on role/status/password changes.
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

    // ── Step 1: Verify JWT signature (synchronous, ~0.1ms) ───────────────────
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

    // ── Step 2: Cache hit (sliding TTL) ──────────────────────────────────────
    // On a hit we reset the TTL so active users never expire from cache.
    const cached = userCache.getUser(decoded.sub);
    if (cached) {
      userCache.refreshTTL(decoded.sub); // sliding window — reset expiry
      req.user = cached;
      return next();
    }

    // ── Step 3: Build user from JWT claims — NO DB call needed ───────────────
    // The JWT payload already carries roleName, roleLevel, email, and isActive
    // (embedded at login/refresh in auth.service.js). Since the signature was
    // verified above, these claims are cryptographically trusted.
    if (
      decoded.roleName  !== undefined &&
      decoded.roleLevel !== undefined &&
      decoded.isActive  !== undefined
    ) {
      // Reject deactivated users without a DB call
      if (!decoded.isActive) {
        return errorResponse(res, {
          statusCode: HTTP_STATUS.FORBIDDEN,
          message: 'Your account has been deactivated. Contact admin.',
        });
      }

      const claimsUser = {
        id:              decoded.sub,
        email:           decoded.email,
        firstName:       decoded.firstName  || '',
        lastName:        decoded.lastName   || '',
        isActive:        decoded.isActive,
        isEmailVerified: decoded.isEmailVerified !== undefined ? decoded.isEmailVerified : true,
        department:      decoded.department  || null,
        jobTitle:        decoded.jobTitle    || null,
        managerId:       decoded.managerId   || null,
        roleId:          decoded.roleId      || null,
        profilePicture:  decoded.profilePicture || null,
        roleName:        decoded.roleName,
        roleLevel:       decoded.roleLevel,
        roleColor:       decoded.roleColor   || null,
        role: {
          id:          decoded.roleId       || null,
          name:        decoded.roleName,
          displayName: decoded.roleDisplay  || decoded.roleName,
          accessLevel: decoded.roleLevel,
          color:       decoded.roleColor    || null,
        },
      };

      // Warm the cache so subsequent requests (Step 2) are instant
      userCache.setUser(decoded.sub, claimsUser);
      req.user = claimsUser;
      return next();
    }

    // ── Step 4: DB fallback — only for legacy tokens without embedded claims ──
    // This path is hit only once per user session until their token expires.
    const user = await db.User.findOne({
      where: { id: decoded.sub, deletedAt: null },
      attributes: [
        'id', 'email', 'firstName', 'lastName', 'isActive', 'isEmailVerified',
        'department', 'jobTitle', 'managerId', 'deletedAt', 'roleId', 'profilePicture',
      ],
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

    const plainUser    = user.toJSON();
    const enrichedUser = {
      ...plainUser,
      roleName:  plainUser.role.name,
      roleLevel: plainUser.role.accessLevel,
      roleColor: plainUser.role.color,
    };

    userCache.setUser(decoded.sub, enrichedUser);
    req.user = enrichedUser;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { authenticate };
