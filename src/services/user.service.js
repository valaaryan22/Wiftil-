'use strict';

const { db } = require('../database/client');
const { ROLE_WEIGHT, HTTP_STATUS } = require('../constants');
const { writeAuditLog } = require('../utils/auditLog');

const USER_SELECT = {
  id: true, email: true, firstName: true, lastName: true,
  role: true, isActive: true, isEmailVerified: true,
  department: true, jobTitle: true, phone: true,
  managerId: true, profilePicture: true, createdAt: true, updatedAt: true,
};

/**
 * Get all users (BOSS: all, MANAGER: LEADER + EMPLOYEE, LEADER: EMPLOYEE only)
 */
async function getAllUsers({ requestingUser, page = 1, limit = 20, role, department, search }) {
  const where = { deletedAt: null };
  const requestingWeight = ROLE_WEIGHT[requestingUser.role];

  // Role-based data scoping
  if (requestingUser.role === 'MANAGER') {
    where.role = { in: ['LEADER', 'EMPLOYEE'] };
  } else if (requestingUser.role === 'LEADER') {
    where.role = 'EMPLOYEE';
  } else if (requestingUser.role === 'EMPLOYEE') {
    // Employees can only see themselves
    where.id = requestingUser.id;
  }

  if (role) where.role = role;
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

  // Only allow if requester has higher or equal role, or is viewing themselves
  const isSelf = requestingUser.id === id;
  const canView = isSelf || ROLE_WEIGHT[requestingUser.role] > ROLE_WEIGHT[user.role];

  if (!canView) {
    const err = new Error('Access denied');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  return user;
}

/**
 * Update own profile or by higher-role admin
 */
async function updateUser({ id, requestingUser, data }) {
  const target = await db.user.findUnique({ where: { id, deletedAt: null } });
  if (!target) {
    const err = new Error('User not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  const isSelf   = requestingUser.id === id;
  const isHigher = ROLE_WEIGHT[requestingUser.role] > ROLE_WEIGHT[target.role];

  if (!isSelf && !isHigher) {
    const err = new Error('Access denied');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  const allowedFields = ['firstName', 'lastName', 'phone', 'department', 'jobTitle', 'profilePicture'];
  const updateData = {};
  allowedFields.forEach((f) => { if (data[f] !== undefined) updateData[f] = data[f]; });

  const updated = await db.user.update({ where: { id }, data: updateData, select: USER_SELECT });

  await writeAuditLog({
    userId: requestingUser.id,
    action: 'USER_UPDATED',
    entity: 'User',
    entityId: id,
    oldValues: target,
    newValues: updateData,
  });

  return updated;
}

/**
 * Assign role (BOSS only for promoting to MANAGER+; MANAGER can assign LEADER/EMPLOYEE)
 */
async function updateUserRole({ id, requestingUser, role }) {
  if (ROLE_WEIGHT[requestingUser.role] <= ROLE_WEIGHT[role]) {
    const err = new Error('You cannot assign a role equal to or higher than your own');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  const target = await db.user.findUnique({ where: { id, deletedAt: null } });
  if (!target) {
    const err = new Error('User not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  if (id === requestingUser.id) {
    const err = new Error('Cannot change your own role');
    err.statusCode = HTTP_STATUS.BAD_REQUEST;
    throw err;
  }

  const updated = await db.user.update({ where: { id }, data: { role }, select: USER_SELECT });

  await writeAuditLog({
    userId: requestingUser.id,
    action: 'ROLE_UPDATED',
    entity: 'User',
    entityId: id,
    oldValues: { role: target.role },
    newValues: { role },
  });

  return updated;
}

/**
 * Activate / Deactivate a user (BOSS and MANAGER)
 */
async function toggleUserStatus({ id, requestingUser, isActive }) {
  const target = await db.user.findUnique({ where: { id, deletedAt: null } });
  if (!target) {
    const err = new Error('User not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  if (id === requestingUser.id) {
    const err = new Error('Cannot change your own status');
    err.statusCode = HTTP_STATUS.BAD_REQUEST;
    throw err;
  }

  if (ROLE_WEIGHT[requestingUser.role] <= ROLE_WEIGHT[target.role]) {
    const err = new Error('Access denied');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  const updated = await db.user.update({ where: { id }, data: { isActive }, select: USER_SELECT });

  await writeAuditLog({
    userId: requestingUser.id,
    action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
    entity: 'User',
    entityId: id,
  });

  return updated;
}

/**
 * Soft delete user (BOSS only)
 */
async function deleteUser({ id, requestingUser }) {
  if (requestingUser.role !== 'BOSS') {
    const err = new Error('Only BOSS can delete users');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  if (id === requestingUser.id) {
    const err = new Error('Cannot delete yourself');
    err.statusCode = HTTP_STATUS.BAD_REQUEST;
    throw err;
  }

  const target = await db.user.findUnique({ where: { id, deletedAt: null } });
  if (!target) {
    const err = new Error('User not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  await db.user.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });

  await writeAuditLog({
    userId: requestingUser.id,
    action: 'USER_DELETED',
    entity: 'User',
    entityId: id,
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
  getAllUsers,
  getUserById,
  updateUser,
  updateUserRole,
  toggleUserStatus,
  deleteUser,
  getMyTeam,
};
