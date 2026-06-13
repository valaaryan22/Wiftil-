'use strict';

const bcrypt = require('bcryptjs');
const { db }            = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const { HTTP_STATUS, AUDIT_CATEGORY, AUDIT_ACTION } = require('../constants');
const userCache         = require('../utils/userCache');


const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');

const USER_SELECT = {
  id: true, email: true, firstName: true, lastName: true,
  isActive: true, isEmailVerified: true,
  department: true, jobTitle: true, phone: true,
  managerId: true, profilePicture: true,
  createdAt: true, updatedAt: true,
  role: {
    select: { id: true, name: true, displayName: true, accessLevel: true, color: true },
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve roleId from either a roleId (UUID) or roleName string.
 * Returns the full RoleDefinition record.
 */
async function resolveRole(roleIdOrName) {
  if (!roleIdOrName) return null;

  // Try UUID lookup first
  const byId = await db.roleDefinition.findUnique({ where: { id: roleIdOrName } });
  if (byId) return byId;

  // Fallback to name lookup (case-insensitive normalised)
  const normalized = roleIdOrName.toUpperCase().replace(/\s+/g, '_');
  const byName = await db.roleDefinition.findUnique({ where: { name: normalized } });
  return byName || null;
}

// ─── Services ─────────────────────────────────────────────────────────────────

/**
 * Invite / create a new user (MANAGER+ — accessLevel 4+)
 * This is the admin-invite path, distinct from self-registration.
 */
async function inviteUser({ requestingUser, data, req }) {
  if (requestingUser.roleLevel < 4) {
    const err = new Error('Only Level-4+ users (Manager and above) can add new users');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  const { email, password, firstName, lastName, roleId: rawRole, department, jobTitle, phone, managerId } = data;

  // Check uniqueness
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    const err = new Error('Email already registered');
    err.statusCode = HTTP_STATUS.CONFLICT;
    throw err;
  }

  // Resolve the target role
  const targetRole = await resolveRole(rawRole);
  if (!targetRole) {
    const err = new Error('Invalid role specified');
    err.statusCode = HTTP_STATUS.BAD_REQUEST;
    throw err;
  }

  // Manager can only assign roles BELOW their own level
  if (targetRole.accessLevel >= requestingUser.roleLevel) {
    const err = new Error(`You can only assign roles below your own level (${requestingUser.roleLevel})`);
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  const hashed = await bcrypt.hash(password || `Wiftil@${Math.random().toString(36).slice(2, 10)}!`, ROUNDS);

  const user = await db.user.create({
    data: {
      email, password: hashed, firstName, lastName,
      roleId: targetRole.id,
      department, jobTitle, phone, managerId,
      isEmailVerified: false,
    },
    select: USER_SELECT,
  });

  await writeAuditLog({
    performedBy:   requestingUser,
    action:        AUDIT_ACTION.USER_CREATED,
    category:      AUDIT_CATEGORY.USER,
    entity:        'User',
    entityId:      user.id,
    entityName:    `${user.firstName} ${user.lastName}`,
    targetUserId:  user.id,
    targetUserName: `${user.firstName} ${user.lastName}`,
    description:   `Created new user "${user.firstName} ${user.lastName}" <${user.email}> with role "${targetRole.displayName}" (Level ${targetRole.accessLevel})`,
    newValues:     { email, firstName, lastName, role: targetRole.name, department, jobTitle },
    req,
  });

  return user;
}

/**
 * Get all users (scoped by role level)
 * Level 5 (BOSS): all users
 * Level 4 (MANAGER): users with level < 4
 * Level 3 (SUPERVISOR): users with level < 3
 * Level 2 (LEADER): users with level < 2
 * Level 1 (EMPLOYEE): only themselves
 */
async function getAllUsers({ requestingUser, page = 1, limit = 20, roleId, department, search }) {
  page  = parseInt(page);
  limit = parseInt(limit);

  const where = { deletedAt: null };

  // Scope by access level
  if (requestingUser.roleLevel < 5) {
    if (requestingUser.roleLevel === 1) {
      where.id = requestingUser.id;
    } else {
      // Only show users with LOWER access level
      where.role = { accessLevel: { lt: requestingUser.roleLevel } };
    }
  }

  if (roleId) where.roleId = roleId;
  if (department) where.department = { contains: department, mode: 'insensitive' };
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName:  { contains: search, mode: 'insensitive' } },
      { email:     { contains: search, mode: 'insensitive' } },
    ];
  }

  const skip = (page - 1) * limit;
  const [users, total] = await Promise.all([
    db.user.findMany({ where, select: USER_SELECT, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    db.user.count({ where }),
  ]);

  return { users, total };
}

/**
 * Get single user by ID (with access scoping)
 */
async function getUserById({ id, requestingUser }) {
  const user = await db.user.findUnique({ where: { id, deletedAt: null }, select: USER_SELECT });
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  const isSelf   = requestingUser.id === id;
  const canView  = isSelf || requestingUser.roleLevel > user.role.accessLevel;

  if (!canView) {
    const err = new Error('Access denied');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  return user;
}

/**
 * Update own profile or by higher-level admin
 */
async function updateUser({ id, requestingUser, data, req }) {
  const target = await db.user.findUnique({ where: { id, deletedAt: null }, select: USER_SELECT });
  if (!target) {
    const err = new Error('User not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  const isSelf   = requestingUser.id === id;
  const isHigher = requestingUser.roleLevel > target.role.accessLevel;

  if (!isSelf && !isHigher) {
    const err = new Error('Access denied');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  const allowedFields = ['firstName', 'lastName', 'phone', 'department', 'jobTitle', 'profilePicture'];
  const updateData = {};
  allowedFields.forEach((f) => { if (data[f] !== undefined) updateData[f] = data[f]; });

  const updated = await db.user.update({ where: { id }, data: updateData, select: USER_SELECT });
  userCache.invalidateUser(id); // evict stale cache


  await writeAuditLog({
    performedBy:   requestingUser,
    action:        AUDIT_ACTION.USER_UPDATED,
    category:      AUDIT_CATEGORY.USER,
    entity:        'User',
    entityId:      id,
    entityName:    `${target.firstName} ${target.lastName}`,
    targetUserId:  id,
    targetUserName: `${target.firstName} ${target.lastName}`,
    description:   `Updated profile of "${target.firstName} ${target.lastName}"`,
    oldValues:     target,
    newValues:     updateData,
    req,
  });

  return updated;
}

/**
 * Assign role — target role must be BELOW requester's level
 */
async function updateUserRole({ id, requestingUser, roleId: rawRole, req }) {
  // Level 4+ (MANAGER+) can change roles
  if (requestingUser.roleLevel < 4) {
    const err = new Error('Level 4+ required to change user roles');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  if (id === requestingUser.id) {
    const err = new Error('Cannot change your own role');
    err.statusCode = HTTP_STATUS.BAD_REQUEST;
    throw err;
  }

  const targetRole = await resolveRole(rawRole);
  if (!targetRole) {
    const err = new Error('Invalid role specified');
    err.statusCode = HTTP_STATUS.BAD_REQUEST;
    throw err;
  }

  // Cannot assign a role >= your own level
  if (targetRole.accessLevel >= requestingUser.roleLevel) {
    const err = new Error(`You cannot assign a role at or above your own level (${requestingUser.roleLevel})`);
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  const target = await db.user.findUnique({ where: { id, deletedAt: null }, select: USER_SELECT });
  if (!target) {
    const err = new Error('User not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  // Cannot change role of someone at same or higher level
  if (target.role.accessLevel >= requestingUser.roleLevel) {
    const err = new Error('Access denied — target user has equal or higher access level');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  const updated = await db.user.update({
    where: { id },
    data:  { roleId: targetRole.id },
    select: USER_SELECT,
  });
  userCache.invalidateUser(id); // role changed — evict stale cache


  await writeAuditLog({
    performedBy:    requestingUser,
    action:         AUDIT_ACTION.USER_ROLE_UPDATED,
    category:       AUDIT_CATEGORY.USER,
    entity:         'User',
    entityId:       id,
    entityName:     `${target.firstName} ${target.lastName}`,
    targetUserId:   id,
    targetUserName: `${target.firstName} ${target.lastName}`,
    description:    `Changed role of "${target.firstName} ${target.lastName}" from "${target.role.displayName}" to "${targetRole.displayName}"`,
    oldValues:      { roleId: target.role.id, roleName: target.role.name, roleLevel: target.role.accessLevel },
    newValues:      { roleId: targetRole.id, roleName: targetRole.name, roleLevel: targetRole.accessLevel },
    req,
  });

  return updated;
}

/**
 * Activate / Deactivate a user (Level 4+ — MANAGER+)
 */
async function toggleUserStatus({ id, requestingUser, isActive, req }) {
  if (requestingUser.roleLevel < 4) {
    const err = new Error('Level 4+ required to activate/deactivate users');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  if (id === requestingUser.id) {
    const err = new Error('Cannot change your own status');
    err.statusCode = HTTP_STATUS.BAD_REQUEST;
    throw err;
  }

  const target = await db.user.findUnique({ where: { id, deletedAt: null }, select: USER_SELECT });
  if (!target) {
    const err = new Error('User not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  if (requestingUser.roleLevel <= target.role.accessLevel) {
    const err = new Error('Access denied — cannot change status of user with equal or higher access level');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  const updated = await db.user.update({ where: { id }, data: { isActive }, select: USER_SELECT });
  userCache.invalidateUser(id); // status changed — evict stale cache


  await writeAuditLog({
    performedBy:    requestingUser,
    action:         isActive ? AUDIT_ACTION.USER_ACTIVATED : AUDIT_ACTION.USER_DEACTIVATED,
    category:       AUDIT_CATEGORY.USER,
    entity:         'User',
    entityId:       id,
    entityName:     `${target.firstName} ${target.lastName}`,
    targetUserId:   id,
    targetUserName: `${target.firstName} ${target.lastName}`,
    description:    `${isActive ? 'Activated' : 'Deactivated'} user "${target.firstName} ${target.lastName}"`,
    oldValues:      { isActive: target.isActive },
    newValues:      { isActive },
    req,
  });

  return updated;
}

/**
 * Soft delete user (Level 5 — BOSS only)
 */
async function deleteUser({ id, requestingUser, req }) {
  if (requestingUser.roleLevel < 5) {
    const err = new Error('Only Level-5 (BOSS) can delete users');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  if (id === requestingUser.id) {
    const err = new Error('Cannot delete yourself');
    err.statusCode = HTTP_STATUS.BAD_REQUEST;
    throw err;
  }

  const target = await db.user.findUnique({ where: { id, deletedAt: null }, select: USER_SELECT });
  if (!target) {
    const err = new Error('User not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  await db.user.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  userCache.invalidateUser(id); // deleted — evict stale cache


  await writeAuditLog({
    performedBy:    requestingUser,
    action:         AUDIT_ACTION.USER_DELETED,
    category:       AUDIT_CATEGORY.USER,
    entity:         'User',
    entityId:       id,
    entityName:     `${target.firstName} ${target.lastName}`,
    targetUserId:   id,
    targetUserName: `${target.firstName} ${target.lastName}`,
    description:    `Soft-deleted user "${target.firstName} ${target.lastName}" <${target.email}>`,
    oldValues:      { email: target.email, roleName: target.role.name },
    req,
  });
}

/**
 * Get my team (direct subordinates)
 */
async function getMyTeam({ requestingUser }) {
  const subordinates = await db.user.findMany({
    where: { managerId: requestingUser.id, deletedAt: null },
    select: USER_SELECT,
  });
  return subordinates;
}

module.exports = {
  inviteUser,
  getAllUsers,
  getUserById,
  updateUser,
  updateUserRole,
  toggleUserStatus,
  deleteUser,
  getMyTeam,
};
