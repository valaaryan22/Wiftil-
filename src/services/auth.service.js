'use strict';

const { Op }           = require('sequelize');
const { db }           = require('../database/client');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken, getRefreshTokenExpiry, getAccessTokenExpiry, parseDurationMs } = require('../utils/jwt');
const { writeAuditLog } = require('../utils/auditLog');
const { TOKEN_TYPES, HTTP_STATUS, AUDIT_CATEGORY, AUDIT_ACTION } = require('../constants');
const userCache         = require('../utils/userCache');
const logger            = require('../utils/logger');

const INCLUDE_ROLE = { model: db.RoleDefinition, as: 'role', attributes: ['id', 'name', 'displayName', 'accessLevel'] };

/**
 * Register a new user (self-registration — always gets the EMPLOYEE role)
 */
async function register({ email, password, firstName, lastName, department, jobTitle, phone }) {
  const existing = await db.User.findOne({ where: { email } });
  if (existing) {
    const err = new Error('Email already registered');
    err.statusCode = HTTP_STATUS.CONFLICT;
    throw err;
  }

  const employeeRole = await db.RoleDefinition.findOne({ where: { name: 'EMPLOYEE' } });
  if (!employeeRole) {
    const err = new Error('System roles not initialized. Please contact an administrator.');
    err.statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
    throw err;
  }

  // Password hashed via User model beforeCreate hook
  const user = await db.User.create({
    email, password, firstName, lastName,
    roleId: employeeRole.id, department, jobTitle, phone,
  });

  const safeUser = {
    id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
    department: user.department, jobTitle: user.jobTitle, isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt,
    role: { id: employeeRole.id, name: employeeRole.name, displayName: employeeRole.displayName, accessLevel: employeeRole.accessLevel },
  };

  await writeAuditLog({
    action: AUDIT_ACTION.USER_REGISTERED, category: AUDIT_CATEGORY.AUTH,
    entity: 'User', entityId: user.id, entityName: `${user.firstName} ${user.lastName}`,
    description: `New user self-registered: ${user.email}`,
    newValues: { email, role: employeeRole.name },
  });

  return safeUser;
}

/**
 * Login — returns access + refresh tokens
 */
async function login({ email, password, req }) {
  const user = await db.User.findOne({
    where: { email, deletedAt: null },
    include: [INCLUDE_ROLE],
    attributes: [
      'id', 'email', 'password', 'firstName', 'lastName', 'isActive', 'isEmailVerified',
      'department', 'jobTitle', 'managerId', 'profilePicture',
      'canAccessFinance', 'canAccessSalary', 'canAccessBanking',
    ],
  });

  if (!user) {
    const err = new Error('Invalid email or password');
    err.statusCode = HTTP_STATUS.UNAUTHORIZED;
    throw err;
  }

  if (!user.isActive) {
    const err = new Error('Account is deactivated. Contact admin.');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  const passwordMatch = await user.comparePassword(password);
  if (!passwordMatch) {
    const err = new Error('Invalid email or password');
    err.statusCode = HTTP_STATUS.UNAUTHORIZED;
    throw err;
  }

  const isFinanceUser = Boolean(user.canAccessFinance || (user.department && user.department.toLowerCase().includes('finance')));
  const tokenPayload = {
    sub:              user.id,
    email:            user.email,
    firstName:        user.firstName,
    lastName:         user.lastName,
    isActive:         user.isActive,
    isEmailVerified:  user.isEmailVerified,
    department:       user.department      || null,
    jobTitle:         user.jobTitle        || null,
    managerId:        user.managerId       || null,
    profilePicture:   user.profilePicture  || null,
    roleId:           user.role.id,
    roleName:         user.role.name,
    roleLevel:        user.role.accessLevel,
    roleDisplay:      user.role.displayName,
    roleColor:        user.role.color      || null,
    // Module permission flags
    canAccessFinance: isFinanceUser,
    canAccessSalary:  Boolean(user.canAccessSalary || isFinanceUser),
    canAccessBanking: Boolean(user.canAccessBanking || isFinanceUser),
  };

  const accessToken  = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken({ sub: user.id });

  await db.Token.create({
    userId:     user.id,
    token:      refreshToken,
    type:       TOKEN_TYPES.REFRESH,
    expiresAt:  getRefreshTokenExpiry(),
    deviceInfo: req?.headers['user-agent'],
    ipAddress:  req?.headers['x-forwarded-for'] || req?.socket?.remoteAddress,
  });

  const performedBy = { id: user.id, firstName: user.firstName, lastName: user.lastName, roleName: user.role.name };
  await writeAuditLog({
    performedBy, action: AUDIT_ACTION.USER_LOGGED_IN, category: AUDIT_CATEGORY.AUTH,
    entity: 'User', entityId: user.id,
    description: `User "${user.firstName} ${user.lastName}" logged in`, req,
  });

  const userJson = user.toJSON();
  const safeUser = {
    id:              userJson.id,
    email:           userJson.email,
    firstName:       userJson.firstName,
    lastName:        userJson.lastName,
    roleId:          userJson.roleId,
    isActive:        userJson.isActive,
    isEmailVerified: userJson.isEmailVerified,
    profilePicture:  userJson.profilePicture,
    phone:           userJson.phone,
    department:      userJson.department,
    jobTitle:        userJson.jobTitle,
    managerId:       userJson.managerId,
    createdAt:       userJson.createdAt,
    updatedAt:       userJson.updatedAt,
    role:            userJson.role,
  };
  return { user: safeUser, accessToken, refreshToken };
}

/**
 * Refresh tokens
 * — If the stored refresh token still has more time remaining than the
 *   access-token TTL (env: JWT_ACCESS_EXPIRES_IN), we reuse it instead
 *   of rotating. This avoids duplicate-insert race conditions and
 *   unnecessary token churn for rapid consecutive calls.
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

  const storedToken = await db.Token.findOne({
    where: { token: refreshToken },
    include: [{ model: db.User, as: 'user', include: [INCLUDE_ROLE] }],
  });

  if (!storedToken || storedToken.isRevoked || storedToken.expiresAt < new Date()) {
    logger.error('Refresh token validation failed', {
      tokenFound: !!storedToken,
      isRevoked: storedToken ? storedToken.isRevoked : null,
      expiresAt: storedToken ? storedToken.expiresAt : null,
      currentTime: new Date(),
      isExpired: storedToken ? storedToken.expiresAt < new Date() : null,
    });
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
  const isFinanceUser = Boolean(user.canAccessFinance || (user.department && user.department.toLowerCase().includes('finance')));
  const tokenPayload = {
    sub:              user.id,
    email:            user.email,
    firstName:        user.firstName,
    lastName:         user.lastName,
    isActive:         user.isActive,
    isEmailVerified:  user.isEmailVerified,
    department:       user.department      || null,
    jobTitle:         user.jobTitle        || null,
    managerId:        user.managerId       || null,
    profilePicture:   user.profilePicture  || null,
    roleId:           user.role.id,
    roleName:         user.role.name,
    roleLevel:        user.role.accessLevel,
    roleDisplay:      user.role.displayName,
    roleColor:        user.role.color      || null,
    // Module permission flags
    canAccessFinance: isFinanceUser,
    canAccessSalary:  Boolean(user.canAccessSalary || isFinanceUser),
    canAccessBanking: Boolean(user.canAccessBanking || isFinanceUser),
  };
  const newAccessToken = generateAccessToken(tokenPayload);

  // ── Reuse vs Rotate decision ──────────────────────────────────────────
  // If the stored refresh token has more time remaining than one full
  // access-token TTL, return it as-is (no DB write needed).
  const accessTtlMs    = parseDurationMs(process.env.JWT_ACCESS_EXPIRES_IN || '15m');
  const remainingMs    = new Date(storedToken.expiresAt).getTime() - Date.now();
  const shouldRotate   = remainingMs <= accessTtlMs;

  let outRefreshToken = refreshToken; // default: reuse

  if (shouldRotate) {
    // Revoke old token and issue a fresh one
    await storedToken.update({ isRevoked: true });
    outRefreshToken = generateRefreshToken({ sub: user.id });
    await db.Token.create({
      userId:     user.id,
      token:      outRefreshToken,
      type:       TOKEN_TYPES.REFRESH,
      expiresAt:  getRefreshTokenExpiry(),
      deviceInfo: req?.headers['user-agent'],
      ipAddress:  req?.headers['x-forwarded-for'] || req?.socket?.remoteAddress,
    });
  }

  await writeAuditLog({
    action: AUDIT_ACTION.TOKEN_REFRESHED, category: AUDIT_CATEGORY.AUTH,
    entity: 'Token', entityId: user.id,
    description: shouldRotate ? 'Access token refreshed — refresh token rotated' : 'Access token refreshed — refresh token reused',
    req,
  });

  return { accessToken: newAccessToken, refreshToken: outRefreshToken };
}

/**
 * Logout — revoke the refresh token
 */
async function logout({ refreshToken, userId }) {
  if (!refreshToken) return;
  await db.Token.update(
    { isRevoked: true },
    { where: { token: refreshToken, userId, isRevoked: false } }
  );
  const user = await db.User.findByPk(userId, { attributes: ['id', 'firstName', 'lastName'] });
  const userName = user ? `${user.firstName} ${user.lastName}`.trim() : null;
  await writeAuditLog({
    performedById: userId, performedByName: userName,
    action: AUDIT_ACTION.USER_LOGGED_OUT, category: AUDIT_CATEGORY.AUTH,
    entity: 'User', entityId: userId, entityName: userName,
    description: userName ? `User "${userName}" logged out` : 'User logged out',
  });
}

/**
 * Logout all sessions
 */
async function logoutAll({ userId }) {
  await db.Token.update(
    { isRevoked: true },
    { where: { userId, isRevoked: false, type: TOKEN_TYPES.REFRESH } }
  );
  const user = await db.User.findByPk(userId, { attributes: ['id', 'firstName', 'lastName'] });
  const userName = user ? `${user.firstName} ${user.lastName}`.trim() : null;
  await writeAuditLog({
    performedById: userId, performedByName: userName,
    action: AUDIT_ACTION.USER_LOGGED_OUT_ALL, category: AUDIT_CATEGORY.AUTH,
    entity: 'User', entityId: userId, entityName: userName,
    description: userName ? `User "${userName}" logged out of all devices` : 'User logged out of all devices',
  });
}

/**
 * Change password
 */
async function changePassword({ userId, currentPassword, newPassword }) {
  const user = await db.User.findByPk(userId);

  const match = await user.comparePassword(currentPassword);
  if (!match) {
    const err = new Error('Current password is incorrect');
    err.statusCode = HTTP_STATUS.BAD_REQUEST;
    throw err;
  }

  // Update will be hashed by beforeUpdate hook
  await user.update({ password: newPassword });
  userCache.invalidateUser(userId);

  await db.Token.update(
    { isRevoked: true },
    { where: { userId, isRevoked: false } }
  );

  const userName = `${user.firstName} ${user.lastName}`.trim();
  await writeAuditLog({
    performedById: userId, performedByName: userName,
    action: AUDIT_ACTION.PASSWORD_CHANGED, category: AUDIT_CATEGORY.AUTH,
    entity: 'User', entityId: userId, entityName: userName,
    description: `Password changed for "${userName}" — all sessions invalidated`,
  });
}

/**
 * Get current profile with latest DB permissions and role details
 */
async function getMe(userId) {
  const user = await db.User.findByPk(userId, {
    attributes: [
      'id', 'email', 'firstName', 'lastName', 'phone', 'department', 'jobTitle',
      'isActive', 'isEmailVerified', 'profilePicture', 'managerId',
      'canAccessFinance', 'canAccessSalary', 'canAccessBanking',
    ],
    include: [{
      model: db.RoleDefinition,
      as: 'role',
      attributes: ['id', 'name', 'displayName', 'accessLevel', 'color'],
    }],
  });
  if (!user) return null;
  const userJson = user.toJSON();
  const isFinanceUser = Boolean(userJson.canAccessFinance || (userJson.department && userJson.department.toLowerCase().includes('finance')));
  userJson.canAccessFinance = isFinanceUser;
  if (isFinanceUser) {
    userJson.canAccessSalary = true;
    userJson.canAccessBanking = true;
  }
  if (user.role) {
    userJson.roleLevel = user.role.accessLevel;
    userJson.roleName = user.role.name;
    userJson.roleDisplay = user.role.displayName;
    userJson.roleColor = user.role.color;
  }
  return userJson;
}

module.exports = { register, login, refreshTokens, logout, logoutAll, changePassword, getMe };
