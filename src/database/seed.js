'use strict';

/**
 * Seed script — creates initial BOSS user + sample hierarchy
 * Run: npm run db:seed
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db, connectDB, disconnectDB } = require('./client');
const logger = require('../utils/logger');

const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');

async function seed() {
  logger.info('🌱 Starting database seed...');

  const bossPassword   = await bcrypt.hash('Boss@12345', ROUNDS);
  const managerPassword = await bcrypt.hash('Manager@12345', ROUNDS);
  const leaderPassword  = await bcrypt.hash('Leader@12345', ROUNDS);
  const employeePassword = await bcrypt.hash('Employee@12345', ROUNDS);

  // Boss
  const boss = await db.user.upsert({
    where: { email: 'boss@wiftil.com' },
    update: {},
    create: {
      email: 'boss@wiftil.com',
      password: bossPassword,
      firstName: 'Alex',
      lastName: 'Boss',
      role: 'BOSS',
      isEmailVerified: true,
      jobTitle: 'CEO',
      department: 'Executive',
    },
  });

  // Manager
  const manager = await db.user.upsert({
    where: { email: 'manager@wiftil.com' },
    update: {},
    create: {
      email: 'manager@wiftil.com',
      password: managerPassword,
      firstName: 'Sarah',
      lastName: 'Manager',
      role: 'MANAGER',
      isEmailVerified: true,
      jobTitle: 'Engineering Manager',
      department: 'Engineering',
      managerId: boss.id,
    },
  });

  // Leader
  const leader = await db.user.upsert({
    where: { email: 'leader@wiftil.com' },
    update: {},
    create: {
      email: 'leader@wiftil.com',
      password: leaderPassword,
      firstName: 'Tom',
      lastName: 'Leader',
      role: 'LEADER',
      isEmailVerified: true,
      jobTitle: 'Team Lead',
      department: 'Engineering',
      managerId: manager.id,
    },
  });

  // Employee
  await db.user.upsert({
    where: { email: 'employee@wiftil.com' },
    update: {},
    create: {
      email: 'employee@wiftil.com',
      password: employeePassword,
      firstName: 'Jane',
      lastName: 'Employee',
      role: 'EMPLOYEE',
      isEmailVerified: true,
      jobTitle: 'Software Engineer',
      department: 'Engineering',
      managerId: leader.id,
    },
  });

  logger.info('✅ Seed complete!');
  logger.info('──────────────────────────────────────────────');
  logger.info('Boss:     boss@wiftil.com     / Boss@12345');
  logger.info('Manager:  manager@wiftil.com  / Manager@12345');
  logger.info('Leader:   leader@wiftil.com   / Leader@12345');
  logger.info('Employee: employee@wiftil.com / Employee@12345');
  logger.info('──────────────────────────────────────────────');
}

async function main() {
  await connectDB();
  await seed();
  await disconnectDB();
}

main().catch((e) => {
  logger.error('Seed failed:', e);
  process.exit(1);
});
