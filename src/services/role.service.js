'use strict';

const { Op }            = require('sequelize');
const { db }            = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const { HTTP_STATUS, AUDIT_CATEGORY, AUDIT_ACTION } = require('../constants');
const apiCache          = require('../utils/apiCache');

const ROLE_ATTRS = ['id', 'name', 'displayName', 'description', 'accessLevel', 'isSystem', 'isActive', 'color', 'createdAt', 'updatedAt'];

// ─── Cache key ────────────────────────────────────────────────────────────────
const CACHE_KEY_ALL   = 'roles:all';
const CACHE_KEY_ACTIVE = 'roles:active';

function roleCacheKey(includeInactive) {
  return includeInactive ? CACHE_KEY_ALL : CACHE_KEY_ACTIVE;
}

function invalidateRoleCache() {
  apiCache.del(CACHE_KEY_ALL);
  apiCache.del(CACHE_KEY_ACTIVE);
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * getAllRoles — previously ran N separate User.count() queries (one per role).
 * Now: single JOIN query to get all roles + user counts in ONE round-trip.
 * Cached for 5 minutes (roles almost never change).
 */
async function getAllRoles({ includeInactive = false } = {}) {
  return apiCache.getOrSet(roleCacheKey(includeInactive), apiCache.TTL.ROLES, async () => {
    const where = includeInactive ? {} : { isActive: true };

    // Single query: LEFT JOIN users, GROUP BY role → gets count in one round-trip
    const roles = await db.RoleDefinition.findAll({
      where,
      attributes: [
        ...ROLE_ATTRS,
        // Subquery count — avoids a separate findAll + N count queries
        [
          db.sequelize.literal(
            '(SELECT COUNT(*) FROM `users` WHERE `users`.`role_id` = `RoleDefinition`.`id` AND `users`.`deleted_at` IS NULL)'
          ),
          'userCount',
        ],
      ],
      order: [['accessLevel', 'DESC']],
    });

    return roles.map(r => {
      const json = r.toJSON();
      return { ...json, _count: { users: parseInt(json.userCount || 0) } };
    });
  });
}

async function getRoleById(id) {
  const role = await db.RoleDefinition.findByPk(id, { attributes: ROLE_ATTRS });
  if (!role) {
    const err = new Error('Role not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
  }
  const userCount = await db.User.count({ where: { roleId: id } });
  return { ...role.toJSON(), _count: { users: userCount } };
}

async function createRole({ requestingUser, name, displayName, description, accessLevel, color }) {
  if (requestingUser.roleLevel < 5) {
    const err = new Error('Only level-5 admins (BOSS) can create roles'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }
  if (accessLevel >= requestingUser.roleLevel) {
    const err = new Error('Cannot create a role with access level equal to or higher than your own');
    err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  const normalizedName = name.toUpperCase().replace(/\s+/g, '_');
  const existing = await db.RoleDefinition.findOne({ where: { name: normalizedName } });
  if (existing) {
    const err = new Error(`Role name "${normalizedName}" already exists`); err.statusCode = HTTP_STATUS.CONFLICT; throw err;
  }

  const role = await db.RoleDefinition.create({ name: normalizedName, displayName, description, accessLevel, color, isSystem: false });
  invalidateRoleCache();

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.ROLE_CREATED, category: AUDIT_CATEGORY.ROLE,
    entity: 'RoleDefinition', entityId: role.id, entityName: role.displayName,
    description: `Created new role "${role.displayName}" (Level ${role.accessLevel})`,
    newValues: { name: role.name, displayName, accessLevel, color },
  });

  return getRoleById(role.id);
}

async function updateRole({ requestingUser, id, displayName, description, accessLevel, color, isActive }) {
  if (requestingUser.roleLevel < 5) {
    const err = new Error('Only level-5 admins (BOSS) can update roles'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  const existing = await db.RoleDefinition.findByPk(id, { attributes: ROLE_ATTRS });
  if (!existing) {
    const err = new Error('Role not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
  }
  if (existing.isSystem && accessLevel !== undefined) {
    const err = new Error('Cannot change access level of system roles'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  const updateData = {};
  if (displayName !== undefined) updateData.displayName = displayName;
  if (description !== undefined) updateData.description = description;
  if (color       !== undefined) updateData.color       = color;
  if (isActive    !== undefined) updateData.isActive    = isActive;
  if (accessLevel !== undefined && !existing.isSystem) updateData.accessLevel = accessLevel;

  await existing.update(updateData);
  invalidateRoleCache();

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.ROLE_UPDATED, category: AUDIT_CATEGORY.ROLE,
    entity: 'RoleDefinition', entityId: id, entityName: existing.displayName,
    description: `Updated role "${existing.displayName}"`,
    oldValues: existing.toJSON(), newValues: updateData,
  });

  return getRoleById(id);
}

async function deleteRole({ requestingUser, id }) {
  if (requestingUser.roleLevel < 5) {
    const err = new Error('Only level-5 admins (BOSS) can delete roles'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  const existing = await db.RoleDefinition.findByPk(id, { attributes: ROLE_ATTRS });
  if (!existing) {
    const err = new Error('Role not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
  }
  if (existing.isSystem) {
    const err = new Error('System roles cannot be deleted'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  const userCount = await db.User.count({ where: { roleId: id } });
  if (userCount > 0) {
    const err = new Error(`Cannot delete role — ${userCount} user(s) are assigned to it. Reassign them first.`);
    err.statusCode = HTTP_STATUS.CONFLICT; throw err;
  }

  await existing.destroy();
  invalidateRoleCache();

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.ROLE_DELETED, category: AUDIT_CATEGORY.ROLE,
    entity: 'RoleDefinition', entityId: id, entityName: existing.displayName,
    description: `Deleted role "${existing.displayName}" (Level ${existing.accessLevel})`,
    oldValues: existing.toJSON(),
  });
}

module.exports = { getAllRoles, getRoleById, createRole, updateRole, deleteRole };
