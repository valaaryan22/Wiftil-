'use strict';

const { Op }            = require('sequelize');
const { db }            = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const { HTTP_STATUS, AUDIT_CATEGORY, AUDIT_ACTION } = require('../constants');
const userCache         = require('../utils/userCache');

const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');

const INCLUDE_ROLE = { model: db.RoleDefinition, as: 'role', attributes: ['id', 'name', 'displayName', 'accessLevel', 'color'] };

const USER_ATTRS = ['id', 'email', 'firstName', 'lastName', 'isActive', 'isEmailVerified',
  'department', 'jobTitle', 'phone', 'managerId', 'profilePicture', 'createdAt', 'updatedAt'];

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
  return u;
}

// ─── Services ─────────────────────────────────────────────────────────────────

async function inviteUser({ requestingUser, data, req }) {
  if (requestingUser.roleLevel < 4) {
    const err = new Error('Only Level-4+ users (Manager and above) can add new users');
    err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  const { email, password, firstName, lastName, roleId: rawRole, department, jobTitle, phone, managerId } = data;

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

  if (targetRole.accessLevel >= requestingUser.roleLevel) {
    const err = new Error(`You can only assign roles below your own level (${requestingUser.roleLevel})`);
    err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  const user = await db.User.create({
    email,
    password: password || `Wiftil@${Math.random().toString(36).slice(2, 10)}!`,
    firstName, lastName, roleId: targetRole.id,
    department, jobTitle, phone, managerId, isEmailVerified: false,
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

  if (requestingUser.roleLevel < 5) {
    if (requestingUser.roleLevel === 1) {
      userWhere.id = requestingUser.id;
    } else {
      roleWhere.accessLevel = { [Op.lt]: requestingUser.roleLevel };
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
  const canView = isSelf || requestingUser.roleLevel > user.role.accessLevel;
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
  const isHigher = requestingUser.roleLevel > target.role.accessLevel;
  if (!isSelf && !isHigher) {
    const err = new Error('Access denied'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  const allowedFields = ['firstName', 'lastName', 'phone', 'department', 'jobTitle', 'profilePicture'];
  const updateData = {};
  allowedFields.forEach((f) => { if (data[f] !== undefined) updateData[f] = data[f]; });

  await target.update(updateData);
  userCache.invalidateUser(id);

  const updated = await db.User.findByPk(id, { attributes: USER_ATTRS, include: [INCLUDE_ROLE] });

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
  if (requestingUser.roleLevel < 4) {
    const err = new Error('Level 4+ required to change user roles'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }
  if (id === requestingUser.id) {
    const err = new Error('Cannot change your own role'); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  const targetRole = await resolveRole(rawRole);
  if (!targetRole) {
    const err = new Error('Invalid role specified'); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }
  if (targetRole.accessLevel >= requestingUser.roleLevel) {
    const err = new Error(`You cannot assign a role at or above your own level (${requestingUser.roleLevel})`);
    err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  const target = await db.User.findOne({ where: { id, deletedAt: null }, attributes: USER_ATTRS, include: [INCLUDE_ROLE] });
  if (!target) {
    const err = new Error('User not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
  }
  if (target.role.accessLevel >= requestingUser.roleLevel) {
    const err = new Error('Access denied — target user has equal or higher access level');
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
  if (requestingUser.roleLevel < 4) {
    const err = new Error('Level 4+ required to activate/deactivate users'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }
  if (id === requestingUser.id) {
    const err = new Error('Cannot change your own status'); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  const target = await db.User.findOne({ where: { id, deletedAt: null }, attributes: USER_ATTRS, include: [INCLUDE_ROLE] });
  if (!target) {
    const err = new Error('User not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
  }
  if (requestingUser.roleLevel <= target.role.accessLevel) {
    const err = new Error('Access denied — cannot change status of user with equal or higher access level');
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
  if (requestingUser.roleLevel < 5) {
    const err = new Error('Only Level-5 (BOSS) can delete users'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
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

module.exports = { inviteUser, getAllUsers, getUserById, updateUser, updateUserRole, toggleUserStatus, deleteUser, getMyTeam };
