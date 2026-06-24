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
 * authorizeLevel(minLevel) — allows any role with accessLevel >= minLevel
 *
 * Usage:
 *   router.get('/reports', authenticate, authorizeLevel(4), handler)
 *   This allows level 4 (MANAGER) and above (BOSS=5) but not below
 */
function authorizeLevel(minLevel) {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, { statusCode: HTTP_STATUS.UNAUTHORIZED, message: 'Authentication required' });
    }

    if ((req.user.roleLevel || 0) < minLevel) {
      return errorResponse(res, {
        statusCode: HTTP_STATUS.FORBIDDEN,
        message: `Access denied. Minimum access level required: ${minLevel} (your level: ${req.user.roleLevel || 0})`,
      });
    }

    next();
  };
}

/**
 * authorizeSelfOrLevel(minLevel) — allows a user to access their OWN resource,
 * OR users with accessLevel >= minLevel
 *
 * Usage:
 *   router.get('/users/:id', authenticate, authorizeSelfOrLevel(2), handler)
 */
function authorizeSelfOrLevel(minLevel) {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, { statusCode: HTTP_STATUS.UNAUTHORIZED, message: 'Authentication required' });
    }

    const isSelf     = req.user.id === req.params.id;
    const hasLevel   = (req.user.roleLevel || 0) >= minLevel;

    if (isSelf || hasLevel) return next();

    return errorResponse(res, { statusCode: HTTP_STATUS.FORBIDDEN, message: 'Access denied' });
  };
}

/**
 * @deprecated Use authorizeLevel() instead.
 * Kept for backward-compat with older route files that still reference authorizeMinRole.
 * Maps old role names to their access levels using the system role mapping.
 */
const LEGACY_LEVEL_MAP = { BOSS: 5, MANAGER: 4, SUPERVISOR: 3, LEADER: 2, EMPLOYEE: 1 };

function authorizeMinRole(minRoleName) {
  const minLevel = LEGACY_LEVEL_MAP[minRoleName] || 1;
  return authorizeLevel(minLevel);
}

/**
 * @deprecated Use authorizeSelfOrLevel() instead.
 */
function authorizeSelfOrRole(minRoleName) {
  const minLevel = LEGACY_LEVEL_MAP[minRoleName] || 1;
  return authorizeSelfOrLevel(minLevel);
}

module.exports = {
  authorize,
  authorizeLevel,
  authorizeSelfOrLevel,
  // Legacy aliases
  authorizeMinRole,
  authorizeSelfOrRole,
};
