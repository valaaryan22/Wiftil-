'use strict';

const { Op }            = require('sequelize');
const { db }            = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const { HTTP_STATUS, AUDIT_CATEGORY, AUDIT_ACTION } = require('../constants');
const userCache         = require('../utils/userCache');

const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');

const INCLUDE_ROLE = { model: db.RoleDefinition, as: 'role', attributes: ['id', 'name', 'displayName', 'accessLevel', 'color'] };

const USER_ATTRS = ['id', 'email', 'firstName', 'lastName', 'isActive', 'isEmailVerified',
  'department', 'jobTitle', 'phone', 'managerId', 'profilePicture',
  'canAccessFinance', 'canAccessSalary', 'canAccessBanking', 'createdAt', 'updatedAt'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveRole(roleIdOrName) {
  if (!roleIdOrName) return null;
  let role = await db.RoleDefinition.findByPk(roleIdOrName);
  if (role) return role;
  const normalized = roleIdOrName.toUpperCase().replace(/\s+/g, '_');
  return db.RoleDefinition.findOne({ where: { name: normalized } });
}

function formatUser(user) {
  const u = user.toJSON ? user.toJSON() : { ...user };
  delete u.password;
  delete u.deletedAt;
  const isFinance = Boolean(u.canAccessFinance || (u.department && String(u.department).toLowerCase().includes('finance')));
  u.canAccessFinance = isFinance;
  if (isFinance) {
    u.canAccessSalary = true;
    u.canAccessBanking = true;
  }
  return u;
}

// ─── Services ─────────────────────────────────────────────────────────────────

async function inviteUser({ requestingUser, data, req }) {
  // Level <= 3 (MANAGER and above) can invite users
  if (requestingUser.roleLevel > 3) {
    const err = new Error('Only Manager level and above (level ≤ 3) can add new users');
    err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  const { email, password, firstName, lastName, roleId: rawRole, department, jobTitle, phone, managerId, profilePicture,
    canAccessFinance, canAccessSalary, canAccessBanking } = data;

  const existing = await db.User.findOne({ where: { email } });
  if (existing) {
    const err = new Error('Email already registered');
    err.statusCode = HTTP_STATUS.CONFLICT; throw err;
  }

  const targetRole = await resolveRole(rawRole);
  if (!targetRole) {
    const err = new Error('Invalid role specified');
    err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  // Cannot assign a role with equal or higher authority (lower or equal number)
  if (targetRole.accessLevel <= requestingUser.roleLevel) {
    const err = new Error(`You can only assign roles with lower authority than your own (your level: ${requestingUser.roleLevel})`);
    err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  // Department & Permissions logic
  const isFinanceDept = Boolean(department && String(department).toLowerCase().includes('finance'));
  const finalDept = department && String(department).trim() ? String(department).trim() : null;
  const isTargetBoss = targetRole.accessLevel === 1;
  const grantFinance = isFinanceDept || canAccessFinance === true || canAccessFinance === 'true' || isTargetBoss;
  const grantSalary  = grantFinance || canAccessSalary === true || canAccessSalary === 'true' || isTargetBoss;
  const grantBanking = grantFinance || canAccessBanking === true || canAccessBanking === 'true' || isTargetBoss;

  const user = await db.User.create({
    email,
    password: password || `Wiftil@${Math.random().toString(36).slice(2, 10)}!`,
    firstName, lastName, roleId: targetRole.id,
    department: finalDept, jobTitle, phone, managerId, isEmailVerified: false,
    profilePicture,
    canAccessFinance: grantFinance,
    canAccessSalary:  grantSalary,
    canAccessBanking: grantBanking,
  });

  const created = await db.User.findByPk(user.id, { attributes: USER_ATTRS, include: [INCLUDE_ROLE] });
  const result  = formatUser(created);

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.USER_CREATED, category: AUDIT_CATEGORY.USER,
    entity: 'User', entityId: user.id, entityName: `${user.firstName} ${user.lastName}`,
    targetUserId: user.id, targetUserName: `${user.firstName} ${user.lastName}`,
    description: `Created new user "${user.firstName} ${user.lastName}" <${user.email}> with role "${targetRole.displayName}"`,
    newValues: { email, firstName, lastName, role: targetRole.name, department, jobTitle },
    req,
  });

  return result;
}

async function getAllUsers({ requestingUser, page = 1, limit = 20, roleId, department, search }) {
  page  = parseInt(page);
  limit = parseInt(limit);

  const userWhere = { deletedAt: null };
  const roleWhere = {};

  // BOSS (level 1) can see all users; level 1 employees can only see themselves
  if (requestingUser.roleLevel > 1) {
    if (requestingUser.roleLevel >= 5) {
      // Employee: only see themselves
      userWhere.id = requestingUser.id;
    } else {
      // Others: only see users with less authority (higher level number)
      roleWhere.accessLevel = { [Op.gt]: requestingUser.roleLevel };
    }
  }

  if (roleId) userWhere.roleId = roleId;
  if (department) userWhere.department = { [Op.like]: `%${department}%` };
  if (search) {
    userWhere[Op.or] = [
      { firstName: { [Op.like]: `%${search}%` } },
      { lastName:  { [Op.like]: `%${search}%` } },
      { email:     { [Op.like]: `%${search}%` } },
    ];
  }

  const { count: total, rows: users } = await db.User.findAndCountAll({
    where: userWhere,
    attributes: USER_ATTRS,
    include: [{ ...INCLUDE_ROLE, where: Object.keys(roleWhere).length ? roleWhere : undefined, required: Object.keys(roleWhere).length > 0 }],
    offset: (page - 1) * limit,
    limit,
    order: [['createdAt', 'DESC']],
    distinct: true,
  });

  return { users: users.map(formatUser), total };
}

async function getUserById({ id, requestingUser }) {
  const user = await db.User.findOne({
    where: { id, deletedAt: null },
    attributes: USER_ATTRS,
    include: [INCLUDE_ROLE],
  });
  if (!user) {
    const err = new Error('User not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
  }

  const isSelf  = requestingUser.id === id;
  // Can view if self, or if requester has higher authority (lower level number)
  const canView = isSelf || requestingUser.roleLevel < user.role.accessLevel;
  if (!canView) {
    const err = new Error('Access denied'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  return formatUser(user);
}

async function updateUser({ id, requestingUser, data, req }) {
  const target = await db.User.findOne({ where: { id, deletedAt: null }, attributes: USER_ATTRS, include: [INCLUDE_ROLE] });
  if (!target) {
    const err = new Error('User not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
  }

  const isSelf   = requestingUser.id === id;
  const isHigher = requestingUser.roleLevel < target.role.accessLevel;
  if (!isSelf && !isHigher) {
    const err = new Error('Access denied'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  const allowedFields = ['firstName', 'lastName', 'phone', 'department', 'jobTitle', 'profilePicture'];
  const updateData = {};
  allowedFields.forEach((f) => {
    if (data[f] !== undefined) {
      if (f === 'department') {
        updateData.department = data.department && String(data.department).trim() ? String(data.department).trim() : null;
      } else {
        updateData[f] = data[f];
      }
    }
  });

  // Permission flags can only be set by higher-authority users or Admin/Boss (level <= 2)
  if (!isSelf && (requestingUser.roleLevel <= 2 || isHigher)) {
    const deptToCheck = updateData.department !== undefined ? updateData.department : target.department;
    const isFinanceDept = Boolean(deptToCheck && String(deptToCheck).toLowerCase().includes('finance'));

    if (isFinanceDept) {
      // If department is Finance, auto-grant finance permissions
      updateData.canAccessFinance = true;
      updateData.canAccessSalary  = true;
      updateData.canAccessBanking = true;
    } else {
      if (data.canAccessFinance !== undefined) {
        updateData.canAccessFinance = data.canAccessFinance === true || data.canAccessFinance === 'true';
      }
      if (data.canAccessSalary !== undefined) {
        updateData.canAccessSalary = data.canAccessSalary === true || data.canAccessSalary === 'true';
      }
      if (data.canAccessBanking !== undefined) {
        updateData.canAccessBanking = data.canAccessBanking === true || data.canAccessBanking === 'true';
      }
    }
  } else if (updateData.department && String(updateData.department).toLowerCase().includes('finance')) {
    // Even if self or not setting permissions directly, assigning to Finance department grants finance access
    updateData.canAccessFinance = true;
    updateData.canAccessSalary  = true;
    updateData.canAccessBanking = true;
  }

  await target.update(updateData);
  userCache.invalidateUser(id);

  const updated = await db.User.findByPk(id, { attributes: USER_ATTRS, include: [INCLUDE_ROLE] });
  const formattedUpdated = formatUser(updated);
  userCache.setUser(id, formattedUpdated);

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.USER_UPDATED, category: AUDIT_CATEGORY.USER,
    entity: 'User', entityId: id, entityName: `${target.firstName} ${target.lastName}`,
    targetUserId: id, targetUserName: `${target.firstName} ${target.lastName}`,
    description: `Updated profile of "${target.firstName} ${target.lastName}"`,
    oldValues: target.toJSON(), newValues: updateData, req,
  });

  return formatUser(updated);
}

async function updateUserRole({ id, requestingUser, roleId: rawRole, req }) {
  // Level <= 3 (MANAGER+) required to change user roles
  if (requestingUser.roleLevel > 3) {
    const err = new Error('Manager level or above (level ≤ 3) required to change user roles'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }
  if (id === requestingUser.id) {
    const err = new Error('Cannot change your own role'); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  const targetRole = await resolveRole(rawRole);
  if (!targetRole) {
    const err = new Error('Invalid role specified'); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }
  // Cannot assign a role with equal or higher authority
  if (targetRole.accessLevel <= requestingUser.roleLevel) {
    const err = new Error(`You cannot assign a role with equal or higher authority than your own (your level: ${requestingUser.roleLevel})`);
    err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  const target = await db.User.findOne({ where: { id, deletedAt: null }, attributes: USER_ATTRS, include: [INCLUDE_ROLE] });
  if (!target) {
    const err = new Error('User not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
  }
  // Target user must have less authority (higher level number) than requester
  if (target.role.accessLevel <= requestingUser.roleLevel) {
    const err = new Error('Access denied — target user has equal or higher authority');
    err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  await target.update({ roleId: targetRole.id });
  userCache.invalidateUser(id);

  const updated = await db.User.findByPk(id, { attributes: USER_ATTRS, include: [INCLUDE_ROLE] });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.USER_ROLE_UPDATED, category: AUDIT_CATEGORY.USER,
    entity: 'User', entityId: id, entityName: `${target.firstName} ${target.lastName}`,
    targetUserId: id, targetUserName: `${target.firstName} ${target.lastName}`,
    description: `Changed role from "${target.role.displayName}" to "${targetRole.displayName}"`,
    oldValues: { roleId: target.role.id, roleName: target.role.name },
    newValues: { roleId: targetRole.id, roleName: targetRole.name }, req,
  });

  return formatUser(updated);
}

async function toggleUserStatus({ id, requestingUser, isActive, req }) {
  // Level <= 3 (MANAGER+) required to activate/deactivate users
  if (requestingUser.roleLevel > 3) {
    const err = new Error('Manager level or above (level ≤ 3) required to activate/deactivate users'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }
  if (id === requestingUser.id) {
    const err = new Error('Cannot change your own status'); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  const target = await db.User.findOne({ where: { id, deletedAt: null }, attributes: USER_ATTRS, include: [INCLUDE_ROLE] });
  if (!target) {
    const err = new Error('User not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
  }
  // Requester must have more authority (lower level number) than the target
  if (requestingUser.roleLevel >= target.role.accessLevel) {
    const err = new Error('Access denied — cannot change status of user with equal or higher authority');
    err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  await target.update({ isActive });
  userCache.invalidateUser(id);

  const updated = await db.User.findByPk(id, { attributes: USER_ATTRS, include: [INCLUDE_ROLE] });

  await writeAuditLog({
    performedBy: requestingUser, action: isActive ? AUDIT_ACTION.USER_ACTIVATED : AUDIT_ACTION.USER_DEACTIVATED,
    category: AUDIT_CATEGORY.USER, entity: 'User', entityId: id,
    entityName: `${target.firstName} ${target.lastName}`,
    targetUserId: id, targetUserName: `${target.firstName} ${target.lastName}`,
    description: `${isActive ? 'Activated' : 'Deactivated'} user "${target.firstName} ${target.lastName}"`,
    oldValues: { isActive: target.isActive }, newValues: { isActive }, req,
  });

  return formatUser(updated);
}

async function deleteUser({ id, requestingUser, req }) {
  // Level <= 2 (ADMIN/BOSS) can delete users
  if (requestingUser.roleLevel > 2) {
    const err = new Error('Only BOSS or ADMIN (level ≤ 2) can delete users'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }
  if (id === requestingUser.id) {
    const err = new Error('Cannot delete yourself'); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  const target = await db.User.findOne({ where: { id, deletedAt: null }, attributes: USER_ATTRS, include: [INCLUDE_ROLE] });
  if (!target) {
    const err = new Error('User not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
  }

  await target.update({ deletedAt: new Date(), isActive: false });
  userCache.invalidateUser(id);

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.USER_DELETED, category: AUDIT_CATEGORY.USER,
    entity: 'User', entityId: id, entityName: `${target.firstName} ${target.lastName}`,
    targetUserId: id, targetUserName: `${target.firstName} ${target.lastName}`,
    description: `Soft-deleted user "${target.firstName} ${target.lastName}" <${target.email}>`,
    oldValues: { email: target.email, roleName: target.role.name }, req,
  });
}

async function getMyTeam({ requestingUser }) {
  const users = await db.User.findAll({
    where: { managerId: requestingUser.id, deletedAt: null },
    attributes: USER_ATTRS,
    include: [INCLUDE_ROLE],
  });
  return users.map(formatUser);
}

async function updateUserPassword({ id, requestingUser, password, req }) {
  // Level <= 3 (BOSS, ADMIN, MANAGER) required to update passwords
  if (requestingUser.roleLevel > 3) {
    const err = new Error('Manager level or above (level ≤ 3) required to update passwords');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  const target = await db.User.findOne({
    where: { id, deletedAt: null },
    include: [INCLUDE_ROLE],
  });
  if (!target) {
    const err = new Error('User not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  // Update password (User model beforeUpdate hook hashes it with bcrypt)
  await target.update({ password });
  userCache.invalidateUser(id);

  // Invalidate any active refresh tokens for the target user
  await db.Token.update(
    { isRevoked: true },
    { where: { userId: id, isRevoked: false } }
  );

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.PASSWORD_CHANGED || 'PASSWORD_CHANGED',
    category: AUDIT_CATEGORY.USER || 'USER',
    entity: 'User',
    entityId: id,
    entityName: `${target.firstName} ${target.lastName}`,
    targetUserId: id,
    targetUserName: `${target.firstName} ${target.lastName}`,
    description: `Password updated for "${target.firstName} ${target.lastName}" <${target.email}> by ${requestingUser.firstName} ${requestingUser.lastName}`,
    req,
  });

  return formatUser(target);
}

module.exports = { inviteUser, getAllUsers, getUserById, updateUser, updateUserRole, toggleUserStatus, deleteUser, getMyTeam, updateUserPassword };
