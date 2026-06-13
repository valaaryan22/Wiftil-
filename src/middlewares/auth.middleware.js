'use strict';

const { verifyAccessToken } = require('../utils/jwt');
const { db }                = require('../database/client');
const { errorResponse }     = require('../utils/response');
const { HTTP_STATUS }       = require('../constants');

/**
 * authenticate — verifies the Bearer token and attaches user to req.user
 * req.user will include: id, email, firstName, lastName,
 *   roleId, roleName, roleLevel (accessLevel), isActive, etc.
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

    // Fetch user from DB — include dynamic role info
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

    // Flatten for convenience throughout the app
    req.user = {
      ...user,
      roleName:  user.role.name,
      roleLevel: user.role.accessLevel,
      roleColor: user.role.color,
    };

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { authenticate };
