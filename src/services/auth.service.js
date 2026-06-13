'use strict';

const bcrypt = require('bcryptjs');
const { db } = require('../database/client');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken, getRefreshTokenExpiry } = require('../utils/jwt');
const { writeAuditLog } = require('../utils/auditLog');
const { TOKEN_TYPES, HTTP_STATUS, AUDIT_CATEGORY, AUDIT_ACTION } = require('../constants');

const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');

/**
 * Register a new user (self-registration — always gets the EMPLOYEE role)
 */
async function register({ email, password, firstName, lastName, department, jobTitle, phone }) {
  // Check email uniqueness
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    const err = new Error('Email already registered');
    err.statusCode = HTTP_STATUS.CONFLICT;
    throw err;
  }

  // Self-registration always gets the lowest system role (EMPLOYEE)
  const employeeRole = await db.roleDefinition.findUnique({ where: { name: 'EMPLOYEE' } });
  if (!employeeRole) {
    const err = new Error('System roles not initialized. Please contact an administrator.');
    err.statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
    throw err;
  }

  const hashed = await bcrypt.hash(password, ROUNDS);

  const user = await db.user.create({
    data: { email, password: hashed, firstName, lastName, roleId: employeeRole.id, department, jobTitle, phone },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      department: true, jobTitle: true, isEmailVerified: true, createdAt: true,
      role: { select: { id: true, name: true, displayName: true, accessLevel: true } },
    },
  });

  await writeAuditLog({
    action:      AUDIT_ACTION.USER_REGISTERED,
    category:    AUDIT_CATEGORY.AUTH,
    entity:      'User',
    entityId:    user.id,
    entityName:  `${user.firstName} ${user.lastName}`,
    description: `New user self-registered: ${user.email}`,
    newValues:   { email, role: employeeRole.name },
  });

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
      isActive: true, isEmailVerified: true, deletedAt: true, department: true, jobTitle: true,
      role: { select: { id: true, name: true, displayName: true, accessLevel: true } },
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

  // Include roleLevel in token payload so middleware can do quick checks
  const tokenPayload = {
    sub:       user.id,
    email:     user.email,
    roleName:  user.role.name,
    roleLevel: user.role.accessLevel,
  };

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

  const performedBy = { id: user.id, firstName: user.firstName, lastName: user.lastName, roleName: user.role.name };
  await writeAuditLog({
    performedBy,
    action:      AUDIT_ACTION.USER_LOGGED_IN,
    category:    AUDIT_CATEGORY.AUTH,
    entity:      'User',
    entityId:    user.id,
    description: `User "${user.firstName} ${user.lastName}" logged in`,
    req,
  });

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

  await writeAuditLog({
    action:    AUDIT_ACTION.TOKEN_REFRESHED,
    category:  AUDIT_CATEGORY.AUTH,
    entity:    'Token',
    entityId:  user.id,
    description: 'Access token refreshed',
    req,
  });

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

  await writeAuditLog({
    action:      AUDIT_ACTION.USER_LOGGED_OUT,
    category:    AUDIT_CATEGORY.AUTH,
    entity:      'User',
    entityId:    userId,
    description: 'User logged out',
  });
}

/**
 * Logout all sessions — revoke ALL refresh tokens for a user
 */
async function logoutAll({ userId }) {
  await db.token.updateMany({
    where: { userId, isRevoked: false, type: TOKEN_TYPES.REFRESH },
    data:  { isRevoked: true },
  });

  await writeAuditLog({
    action:      AUDIT_ACTION.USER_LOGGED_OUT_ALL,
    category:    AUDIT_CATEGORY.AUTH,
    entity:      'User',
    entityId:    userId,
    description: 'User logged out of all devices',
  });
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

  await writeAuditLog({
    action:      AUDIT_ACTION.PASSWORD_CHANGED,
    category:    AUDIT_CATEGORY.AUTH,
    entity:      'User',
    entityId:    userId,
    description: 'Password changed — all sessions invalidated',
  });
}

module.exports = { register, login, refreshTokens, logout, logoutAll, changePassword };
