'use strict';

const { ROLE_WEIGHT, HTTP_STATUS } = require('../constants');
const { errorResponse } = require('../utils/response');

/**
 * authorize(...roles) — checks if req.user has one of the required roles
 *
 * Usage:
 *   router.get('/admin', authenticate, authorize('BOSS', 'MANAGER'), handler)
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, {
        statusCode: HTTP_STATUS.UNAUTHORIZED,
        message: 'Authentication required',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return errorResponse(res, {
        statusCode: HTTP_STATUS.FORBIDDEN,
        message: `Access denied. Required role(s): ${allowedRoles.join(', ')}`,
      });
    }

    next();
  };
}

/**
 * authorizeMinRole(minRole) — allows a role and anything above it
 *
 * Usage:
 *   router.get('/reports', authenticate, authorizeMinRole('MANAGER'), handler)
 *   This allows MANAGER, BOSS but NOT LEADER or EMPLOYEE
 */
function authorizeMinRole(minRole) {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, {
        statusCode: HTTP_STATUS.UNAUTHORIZED,
        message: 'Authentication required',
      });
    }

    const userWeight = ROLE_WEIGHT[req.user.role] || 0;
    const minWeight  = ROLE_WEIGHT[minRole] || 0;

    if (userWeight < minWeight) {
      return errorResponse(res, {
        statusCode: HTTP_STATUS.FORBIDDEN,
        message: `Access denied. Minimum required role: ${minRole}`,
      });
    }

    next();
  };
}

/**
 * authorizeSelfOrRole — allows a user to access their OWN resource, OR users with enough role
 *
 * Usage:
 *   router.get('/users/:id', authenticate, authorizeSelfOrRole('MANAGER'), handler)
 */
function authorizeSelfOrRole(minRole) {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, {
        statusCode: HTTP_STATUS.UNAUTHORIZED,
        message: 'Authentication required',
      });
    }

    const isSelf = req.user.id === req.params.id;
    const userWeight = ROLE_WEIGHT[req.user.role] || 0;
    const minWeight  = ROLE_WEIGHT[minRole] || 0;

    if (isSelf || userWeight >= minWeight) {
      return next();
    }

    return errorResponse(res, {
      statusCode: HTTP_STATUS.FORBIDDEN,
      message: 'Access denied',
    });
  };
}

module.exports = { authorize, authorizeMinRole, authorizeSelfOrRole };
