'use strict';

const logger = require('../utils/logger');
const { HTTP_STATUS } = require('../constants');

/**
 * 404 handler — for unknown routes
 */
function notFoundHandler(req, res) {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
}

/**
 * Global error handler — catches all errors passed via next(err)
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;

  // Don't log expected authentication errors as "Unhandled error"
  if (statusCode !== HTTP_STATUS.UNAUTHORIZED && err.name !== 'JsonWebTokenError' && err.name !== 'TokenExpiredError') {
    logger.error('Unhandled error:', {
      message: err.message,
      stack:   process.env.NODE_ENV === 'development' ? err.stack : undefined,
      url:     req.originalUrl,
      method:  req.method,
    });
  }

  // Prisma known errors
  if (err.code === 'P2002') {
    return res.status(HTTP_STATUS.CONFLICT).json({
      success: false,
      message: 'A record with this value already exists',
      field:   err.meta?.target,
    });
  }

  if (err.code === 'P2025') {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Record not found',
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }

  // CORS error
  if (err.message?.includes('CORS')) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: err.message,
    });
  }


  const message    = statusCode < 500 ? err.message : 'Internal server error';

  return res.status(statusCode).json({ success: false, message });
}

module.exports = { notFoundHandler, errorHandler };
