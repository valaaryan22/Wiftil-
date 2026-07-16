'use strict';

const { HTTP_STATUS } = require('../constants');
const { errorResponse } = require('../utils/response');

/**
 * authorize(...roleNames) — checks if req.user has one of the required role names
 *
 * Usage:
 *   router.get('/admin', authenticate, authorize('BOSS', 'MANAGER'), handler)
 */
function authorize(...allowedRoleNames) {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, { statusCode: HTTP_STATUS.UNAUTHORIZED, message: 'Authentication required' });
    }

    if (!allowedRoleNames.includes(req.user.roleName)) {
      return errorResponse(res, {
        statusCode: HTTP_STATUS.FORBIDDEN,
        message: `Access denied. Required role(s): ${allowedRoleNames.join(', ')}`,
      });
    }

    next();
  };
}

/**
 * authorizeLevel(maxLevel) — allows any role with accessLevel <= maxLevel
 *
 * IMPORTANT: In the new level system, LOWER number = MORE authority.
 *   BOSS = 1, ADMIN = 2, MANAGER = 3, TEAM_LEAD = 4, EMPLOYEE = 5+
 *
 * Usage:
 *   router.get('/boss-only',    authenticate, authorizeLevel(1), handler)  // BOSS only
 *   router.get('/admin-plus',   authenticate, authorizeLevel(2), handler)  // BOSS + ADMIN
 *   router.get('/manager-plus', authenticate, authorizeLevel(3), handler)  // BOSS + ADMIN + MANAGER
 */
function authorizeLevel(maxLevel) {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, { statusCode: HTTP_STATUS.UNAUTHORIZED, message: 'Authentication required' });
    }

    const userLevel = req.user.roleLevel || 999;
    if (userLevel > maxLevel) {
      return errorResponse(res, {
        statusCode: HTTP_STATUS.FORBIDDEN,
        message: `Access denied. Required access level ≤ ${maxLevel} (your level: ${userLevel})`,
      });
    }

    next();
  };
}

/**
 * authorizeSelfOrLevel(maxLevel) — allows a user to access their OWN resource,
 * OR users with accessLevel <= maxLevel
 *
 * Usage:
 *   router.get('/users/:id', authenticate, authorizeSelfOrLevel(3), handler)
 */
function authorizeSelfOrLevel(maxLevel) {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, { statusCode: HTTP_STATUS.UNAUTHORIZED, message: 'Authentication required' });
    }

    const isSelf   = req.user.id === req.params.id;
    const hasLevel = (req.user.roleLevel || 999) <= maxLevel;

    if (isSelf || hasLevel) return next();

    return errorResponse(res, { statusCode: HTTP_STATUS.FORBIDDEN, message: 'Access denied' });
  };
}

/**
 * @deprecated Use authorizeLevel() instead.
 * Kept for backward-compat with older route files that still reference authorizeMinRole.
 * Maps role names to their NEW access levels (BOSS=1 = highest, EMPLOYEE=5).
 */
const LEGACY_LEVEL_MAP = { BOSS: 1, ADMIN: 2, MANAGER: 3, TEAM_LEAD: 4, EMPLOYEE: 5 };

function authorizeMinRole(roleName) {
  const maxLevel = LEGACY_LEVEL_MAP[roleName] || 5;
  return authorizeLevel(maxLevel);
}

/**
 * @deprecated Use authorizeSelfOrLevel() instead.
 */
function authorizeSelfOrRole(roleName) {
  const maxLevel = LEGACY_LEVEL_MAP[roleName] || 5;
  return authorizeSelfOrLevel(maxLevel);
}

module.exports = {
  authorize,
  authorizeLevel,
  authorizeSelfOrLevel,
  // Legacy aliases
  authorizeMinRole,
  authorizeSelfOrRole,
};
