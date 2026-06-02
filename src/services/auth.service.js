'use strict';

const bcrypt = require('bcryptjs');
const { db } = require('../database/client');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken, getRefreshTokenExpiry } = require('../utils/jwt');
const { writeAuditLog } = require('../utils/auditLog');
const { TOKEN_TYPES, HTTP_STATUS } = require('../constants');

const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');

/**
 * Register a new user
 */
async function register({ email, password, firstName, lastName, role = 'EMPLOYEE', department, jobTitle, phone, managerId }) {
  // Check email uniqueness
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    const err = new Error('Email already registered');
    err.statusCode = HTTP_STATUS.CONFLICT;
    throw err;
  }

  const hashed = await bcrypt.hash(password, ROUNDS);

  const user = await db.user.create({
    data: { email, password: hashed, firstName, lastName, role, department, jobTitle, phone, managerId },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      role: true, department: true, jobTitle: true, isEmailVerified: true, createdAt: true,
    },
  });

  await writeAuditLog({ userId: user.id, action: 'USER_REGISTERED', entity: 'User', entityId: user.id, newValues: { email, role } });

  return user;
}

/**
 * Login — returns access + refresh tokens
 */
async function login({ email, password, req }) {
  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true, email: true, password: true, firstName: true, lastName: true,
      role: true, isActive: true, isEmailVerified: true, deletedAt: true, department: true, jobTitle: true,
    },
  });

  if (!user || user.deletedAt) {
    const err = new Error('Invalid email or password');
    err.statusCode = HTTP_STATUS.UNAUTHORIZED;
    throw err;
  }

  if (!user.isActive) {
    const err = new Error('Account is deactivated. Contact admin.');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    const err = new Error('Invalid email or password');
    err.statusCode = HTTP_STATUS.UNAUTHORIZED;
    throw err;
  }

  const tokenPayload = { sub: user.id, email: user.email, role: user.role };

  const accessToken  = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  // Store refresh token in DB
  await db.token.create({
    data: {
      userId:    user.id,
      token:     refreshToken,
      type:      TOKEN_TYPES.REFRESH,
      expiresAt: getRefreshTokenExpiry(),
      deviceInfo: req?.headers['user-agent'],
      ipAddress:  req?.headers['x-forwarded-for'] || req?.socket?.remoteAddress,
    },
  });

  await writeAuditLog({ userId: user.id, action: 'USER_LOGGED_IN', entity: 'User', entityId: user.id, req });

  const { password: _, ...safeUser } = user;

  return { user: safeUser, accessToken, refreshToken };
}

/**
 * Refresh tokens — returns new access + refresh token pair (rotation)
 */
async function refreshTokens({ refreshToken, req }) {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    const err = new Error('Invalid or expired refresh token');
    err.statusCode = HTTP_STATUS.UNAUTHORIZED;
    throw err;
  }

  // Verify token exists in DB and is not revoked
  const storedToken = await db.token.findUnique({
    where: { token: refreshToken },
    include: { user: { select: { id: true, email: true, role: true, isActive: true, deletedAt: true } } },
  });

  if (!storedToken || storedToken.isRevoked || storedToken.expiresAt < new Date()) {
    const err = new Error('Refresh token is invalid or has been revoked');
    err.statusCode = HTTP_STATUS.UNAUTHORIZED;
    throw err;
  }

  if (!storedToken.user.isActive || storedToken.user.deletedAt) {
    const err = new Error('User account is no longer active');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  const { user } = storedToken;

  // Rotate: revoke old, issue new
  await db.token.update({ where: { id: storedToken.id }, data: { isRevoked: true } });

  const tokenPayload = { sub: user.id, email: user.email, role: user.role };
  const newAccessToken  = generateAccessToken(tokenPayload);
  const newRefreshToken = generateRefreshToken(tokenPayload);

  await db.token.create({
    data: {
      userId:    user.id,
      token:     newRefreshToken,
      type:      TOKEN_TYPES.REFRESH,
      expiresAt: getRefreshTokenExpiry(),
      deviceInfo: req?.headers['user-agent'],
      ipAddress:  req?.headers['x-forwarded-for'] || req?.socket?.remoteAddress,
    },
  });

  await writeAuditLog({ userId: user.id, action: 'TOKEN_REFRESHED', entity: 'Token', req });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

/**
 * Logout — revoke the refresh token
 */
async function logout({ refreshToken, userId }) {
  if (!refreshToken) return;

  await db.token.updateMany({
    where: { token: refreshToken, userId, isRevoked: false },
    data:  { isRevoked: true },
  });

  await writeAuditLog({ userId, action: 'USER_LOGGED_OUT', entity: 'User', entityId: userId });
}

/**
 * Logout all sessions — revoke ALL refresh tokens for a user
 */
async function logoutAll({ userId }) {
  await db.token.updateMany({
    where: { userId, isRevoked: false, type: TOKEN_TYPES.REFRESH },
    data:  { isRevoked: true },
  });

  await writeAuditLog({ userId, action: 'USER_LOGGED_OUT_ALL', entity: 'User', entityId: userId });
}

/**
 * Change password
 */
async function changePassword({ userId, currentPassword, newPassword }) {
  const user = await db.user.findUnique({ where: { id: userId } });

  const match = await bcrypt.compare(currentPassword, user.password);
  if (!match) {
    const err = new Error('Current password is incorrect');
    err.statusCode = HTTP_STATUS.BAD_REQUEST;
    throw err;
  }

  const hashed = await bcrypt.hash(newPassword, ROUNDS);
  await db.user.update({ where: { id: userId }, data: { password: hashed } });

  // Revoke all refresh tokens (force re-login everywhere)
  await db.token.updateMany({
    where: { userId, isRevoked: false },
    data:  { isRevoked: true },
  });

  await writeAuditLog({ userId, action: 'PASSWORD_CHANGED', entity: 'User', entityId: userId });
}

module.exports = { register, login, refreshTokens, logout, logoutAll, changePassword };
