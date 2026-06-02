'use strict';

const rateLimit = require('express-rate-limit');
const { HTTP_STATUS } = require('../constants');

const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'); // 15 min
const maxGlobal = parseInt(process.env.RATE_LIMIT_MAX || '100');
const maxAuth   = parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10');

/**
 * Global rate limiter — applied to all routes
 */
const globalRateLimiter = rateLimit({
  windowMs,
  max: maxGlobal,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
    statusCode: HTTP_STATUS.TOO_MANY_REQUESTS,
  },
});

/**
 * Auth route limiter — stricter limit for login/register/refresh
 */
const authRateLimiter = rateLimit({
  windowMs,
  max: maxAuth,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again in 15 minutes.',
    statusCode: HTTP_STATUS.TOO_MANY_REQUESTS,
  },
  skipSuccessfulRequests: true, // only count failed attempts
});

module.exports = { globalRateLimiter, authRateLimiter };
