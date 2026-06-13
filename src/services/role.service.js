'use strict';

const { db }           = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const { HTTP_STATUS, AUDIT_CATEGORY, AUDIT_ACTION } = require('../constants');

const ROLE_SELECT = {
  id: true, name: true, displayName: true, description: true,
  accessLevel: true, isSystem: true, isActive: true, color: true,
  createdAt: true, updatedAt: true,
  _count: { select: { users: true } },
};

/**
 * Get all role definitions
 */
async function getAllRoles({ includeInactive = false } = {}) {
  const where = includeInactive ? {} : { isActive: true };
  return db.roleDefinition.findMany({
    where,
    select: ROLE_SELECT,
    orderBy: { accessLevel: 'desc' },
  });
}

/**
 * Get role by ID
 */
async function getRoleById(id) {
  const role = await db.roleDefinition.findUnique({ where: { id }, select: ROLE_SELECT });
  if (!role) {
    const err = new Error('Role not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }
  return role;
}

/**
 * Create a new custom role (BOSS only — accessLevel 5)
 */
async function createRole({ requestingUser, name, displayName, description, accessLevel, color }) {
  // Only BOSS (level 5) can create roles
  if (requestingUser.roleLevel < 5) {
    const err = new Error('Only level-5 admins (BOSS) can create roles');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  // Cannot create a role with higher or equal level than yourself
  if (accessLevel >= requestingUser.roleLevel) {
    const err = new Error('Cannot create a role with access level equal to or higher than your own');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  // Name must be uppercase + no spaces
  const normalizedName = name.toUpperCase().replace(/\s+/g, '_');

  const existing = await db.roleDefinition.findUnique({ where: { name: normalizedName } });
  if (existing) {
    const err = new Error(`Role name "${normalizedName}" already exists`);
    err.statusCode = HTTP_STATUS.CONFLICT;
    throw err;
  }

  const role = await db.roleDefinition.create({
    data: { name: normalizedName, displayName, description, accessLevel, color, isSystem: false },
    select: ROLE_SELECT,
  });

  await writeAuditLog({
    performedBy:  requestingUser,
    action:       AUDIT_ACTION.ROLE_CREATED,
    category:     AUDIT_CATEGORY.ROLE,
    entity:       'RoleDefinition',
    entityId:     role.id,
    entityName:   role.displayName,
    description:  `Created new role "${role.displayName}" (Level ${role.accessLevel})`,
    newValues:    { name: role.name, displayName, accessLevel, color },
  });

  return role;
}

/**
 * Update a role (BOSS only)
 */
async function updateRole({ requestingUser, id, displayName, description, accessLevel, color, isActive }) {
  if (requestingUser.roleLevel < 5) {
    const err = new Error('Only level-5 admins (BOSS) can update roles');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  const existing = await db.roleDefinition.findUnique({ where: { id }, select: ROLE_SELECT });
  if (!existing) {
    const err = new Error('Role not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  if (existing.isSystem && accessLevel !== undefined) {
    const err = new Error('Cannot change access level of system roles');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  const updateData = {};
  if (displayName  !== undefined) updateData.displayName  = displayName;
  if (description  !== undefined) updateData.description  = description;
  if (color        !== undefined) updateData.color        = color;
  if (isActive     !== undefined) updateData.isActive     = isActive;
  if (accessLevel  !== undefined && !existing.isSystem) updateData.accessLevel = accessLevel;

  const updated = await db.roleDefinition.update({ where: { id }, data: updateData, select: ROLE_SELECT });

  await writeAuditLog({
    performedBy:  requestingUser,
    action:       AUDIT_ACTION.ROLE_UPDATED,
    category:     AUDIT_CATEGORY.ROLE,
    entity:       'RoleDefinition',
    entityId:     id,
    entityName:   updated.displayName,
    description:  `Updated role "${updated.displayName}"`,
    oldValues:    existing,
    newValues:    updateData,
  });

  return updated;
}

/**
 * Delete a custom role (BOSS only; cannot delete system roles or roles in use)
 */
async function deleteRole({ requestingUser, id }) {
  if (requestingUser.roleLevel < 5) {
    const err = new Error('Only level-5 admins (BOSS) can delete roles');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  const existing = await db.roleDefinition.findUnique({
    where: { id },
    select: { ...ROLE_SELECT, users: { select: { id: true }, take: 1 } },
  });

  if (!existing) {
    const err = new Error('Role not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  if (existing.isSystem) {
    const err = new Error('System roles cannot be deleted');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  if (existing._count.users > 0) {
    const err = new Error(`Cannot delete role — ${existing._count.users} user(s) are assigned to it. Reassign them first.`);
    err.statusCode = HTTP_STATUS.CONFLICT;
    throw err;
  }

  await db.roleDefinition.delete({ where: { id } });

  await writeAuditLog({
    performedBy:  requestingUser,
    action:       AUDIT_ACTION.ROLE_DELETED,
    category:     AUDIT_CATEGORY.ROLE,
    entity:       'RoleDefinition',
    entityId:     id,
    entityName:   existing.displayName,
    description:  `Deleted role "${existing.displayName}" (Level ${existing.accessLevel})`,
    oldValues:    existing,
  });
}

module.exports = { getAllRoles, getRoleById, createRole, updateRole, deleteRole };
