'use strict';

const jwt = require('jsonwebtoken');

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXP     = process.env.JWT_ACCESS_EXPIRES_IN  || '15m';
const REFRESH_EXP    = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

/**
 * Generate an Access Token (short-lived)
 */
function generateAccessToken(payload) {
  return jwt.sign(payload, ACCESS_SECRET, {
    expiresIn: ACCESS_EXP,
    algorithm: 'HS256',
    issuer: 'wiftil-api',
    audience: 'wiftil-client',
  });
}

/**
 * Generate a Refresh Token (long-lived)
 */
function generateRefreshToken(payload) {
  return jwt.sign(payload, REFRESH_SECRET, {
    expiresIn: REFRESH_EXP,
    algorithm: 'HS256',
    issuer: 'wiftil-api',
    audience: 'wiftil-client',
  });
}

/**
 * Verify an Access Token
 */
function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET, {
    algorithms: ['HS256'],
    issuer: 'wiftil-api',
    audience: 'wiftil-client',
  });
}

/**
 * Verify a Refresh Token
 */
function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET, {
    algorithms: ['HS256'],
    issuer: 'wiftil-api',
    audience: 'wiftil-client',
  });
}

/**
 * Parse expiry string to milliseconds (for DB storage)
 */
function parseDurationMs(duration) {
  const unit = duration.slice(-1);
  const value = parseInt(duration);
  const map = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  return value * (map[unit] || 1000);
}

function getAccessTokenExpiry() {
  return new Date(Date.now() + parseDurationMs(ACCESS_EXP));
}

function getRefreshTokenExpiry() {
  return new Date(Date.now() + parseDurationMs(REFRESH_EXP));
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  getAccessTokenExpiry,
  getRefreshTokenExpiry,
  parseDurationMs,
};
