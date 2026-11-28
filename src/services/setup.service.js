'use strict';

const { v4: uuidv4 } = require('uuid');
const db = require('../models');
const logger = require('../utils/logger');

const SYSTEM_ROLES = [
  { name: 'EMPLOYEE',   displayName: 'Employee',    accessLevel: 5, color: '#6B7280', isSystem: true, description: 'Regular team member' },
  { name: 'LEADER',     displayName: 'Team Leader', accessLevel: 4, color: '#3B82F6', isSystem: true, description: 'Leads a small team' },
  { name: 'SUPERVISOR', displayName: 'Supervisor',  accessLevel: 3, color: '#8B5CF6', isSystem: true, description: 'Oversees team leads' },
  { name: 'MANAGER',    displayName: 'Manager',     accessLevel: 2, color: '#F59E0B', isSystem: true, description: 'Manages supervisors' },
  { name: 'BOSS',       displayName: 'Boss',        accessLevel: 1, color: '#EF4444', isSystem: true, description: 'Top-level executive' },
];

async function getSetupStatus() {
  await db.sequelize.authenticate();

  const tables = await db.sequelize.getQueryInterface().showAllTables();
  let rolesCount = 0;
  let usersCount = 0;

  try {
    rolesCount = await db.RoleDefinition.count();
  } catch (_) {
    rolesCount = 0;
  }

  try {
    usersCount = await db.User.count();
  } catch (_) {
    usersCount = 0;
  }

  return {
    dbConnected: true,
    database: db.sequelize.config.database,
    tablesCount: Array.isArray(tables) ? tables.length : 0,
    rolesCount,
    usersCount,
    needsSync: !tables || tables.length === 0,
    needsSeed: rolesCount < SYSTEM_ROLES.length || usersCount === 0,
  };
}

/**
 * Safely syncs all Sequelize models (creates missing tables / alters columns without dropping data)
 * and seeds default system roles + initial Boss user if users table is empty.
 */
async function syncAndSeedDatabase({ alter = true, seedUsers = true } = {}) {
  await db.sequelize.authenticate();
  logger.info('[Setup] Database connection verified');

  let syncMode = alter ? 'alter' : 'create-missing';
  let syncWarning = null;

  try {
    await db.sequelize.sync({ force: false, alter: Boolean(alter) });
  } catch (err) {
    // Fallback if MySQL hits ER_TOO_MANY_KEYS (64 index limit) on alter
    if (alter && (err?.parent?.code === 'ER_TOO_MANY_KEYS' || err?.original?.code === 'ER_TOO_MANY_KEYS')) {
      logger.warn('[Setup] alter sync hit ER_TOO_MANY_KEYS, falling back to safe sync({ force: false })');
      syncWarning = 'alter skipped on existing tables due to MySQL 64-key limit; missing tables created safely';
      syncMode = 'create-missing-fallback';
      await db.sequelize.sync({ force: false });
    } else {
      throw err;
    }
  }

  const tables = await db.sequelize.getQueryInterface().showAllTables();

  // 1. Seed roles idempotently
  const roles = {};
  let rolesCreated = 0;
  for (const r of SYSTEM_ROLES) {
    const [role, created] = await db.RoleDefinition.findOrCreate({
      where: { name: r.name },
      defaults: { id: uuidv4(), ...r },
    });
    roles[r.name] = role;
    if (created) rolesCreated++;
  }

  // 2. Seed initial Boss user only if no users exist yet
  const existingUsers = await db.User.count();
  let bossCreated = false;
  let seededEmail = null;

  if (seedUsers && existingUsers === 0) {
    const bossEmail = process.env.SEED_BOSS_EMAIL || 'valaaryan22@gmail.com';
    const bossPassword = process.env.SEED_BOSS_PASSWORD || 'Aryan22@';

    await db.User.create({
      id: uuidv4(),
      email: bossEmail,
      password: bossPassword,
      firstName: 'Aryan',
      lastName: 'vala',
      roleId: roles['BOSS'].id,
      isActive: true,
      isEmailVerified: true,
      department: 'Executive',
      jobTitle: 'Chief Executive Officer',
      phone: '+91-9800000001',
    });

    bossCreated = true;
    seededEmail = bossEmail;
    logger.info(`[Setup] Seeded initial BOSS user: ${bossEmail}`);
  }

  return {
    dbConnected: true,
    database: db.sequelize.config.database,
    syncMode,
    syncWarning,
    tablesCount: Array.isArray(tables) ? tables.length : 0,
    rolesTotal: Object.keys(roles).length,
    rolesCreated,
    existingUsers,
    bossCreated,
    ...(seededEmail ? { seededBossEmail: seededEmail } : {}),
  };
}

module.exports = {
  getSetupStatus,
  syncAndSeedDatabase,
};
