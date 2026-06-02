'use strict';

const { verifyAccessToken } = require('../utils/jwt');
const { db } = require('../database/client');
const { errorResponse } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

/**
 * authenticate — verifies the Bearer token and attaches user to req.user
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

    // Fetch user from DB — ensures they still exist and are active
    const user = await db.user.findUnique({
      where: { id: decoded.sub },
      select: {
        id:              true,
        email:           true,
        firstName:       true,
        lastName:        true,
        role:            true,
        isActive:        true,
        isEmailVerified: true,
        department:      true,
        jobTitle:        true,
        managerId:       true,
        deletedAt:       true,
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

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { authenticate };
