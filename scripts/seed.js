'use strict';

/**
 * Wiftil Seed Script
 * ------------------
 * Creates realistic demo data across all tables.
 * Safe to re-run — skips user/task seed if users already exist.
 *
 * Run: node scripts/seed.js
 */

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const db = require('../src/models');

const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const daysAgo     = (n) => daysFromNow(-n);

// ─── Sub-task titles per parent task ─────────────────────────────────────────
const SUBTASK_MAP = {
  'Build Authentication Microservice': [
    'JWT token generation & validation',
    'Refresh token rotation logic',
    'Email verification flow',
  ],
  'Redesign Dashboard UI': [
    'Wireframes & design system tokens',
    'Dashboard chart components',
  ],
  'Mobile App v2.0 Release': [
    'Push notifications module',
    'Offline mode with local storage',
    'Biometric authentication',
  ],
  'Set Up CI/CD Pipeline': [
    'GitHub Actions workflow',
    'Docker build & ECR push',
  ],
  'Frontend Performance Optimization': [
    'Code splitting & lazy loading',
    'Image optimization pipeline',
  ],
  'API Documentation': [
    'Swagger setup & auth endpoint docs',
  ],
};

function subTaskStatus(taskStatus, index) {
  if (taskStatus === 'COMPLETED')      return 'FINAL_APPROVED';
  if (taskStatus === 'MANAGER_REVIEW') return index === 0 ? 'FINAL_APPROVED' : 'TEAM_LEAD_APPROVED';
  if (taskStatus === 'IN_PROGRESS')    return index === 0 ? 'IN_PROGRESS' : 'ASSIGNED';
  if (taskStatus === 'ASSIGNED')       return 'ASSIGNED';
  return 'CREATED';
}

// ─────────────────────────────────────────────────────────────────────────────
async function seed() {
  await db.sequelize.authenticate();
  console.log('✅ Connected to database\n');

  // ── 1. Roles ──────────────────────────────────────────────────────────────
  console.log('🌱 Seeding roles...');
  const roleRows = [
    { name: 'EMPLOYEE',   displayName: 'Employee',    accessLevel: 5, color: '#6B7280', isSystem: true, description: 'Regular team member' },
    { name: 'LEADER',     displayName: 'Team Leader', accessLevel: 4, color: '#3B82F6', isSystem: true, description: 'Leads a small team' },
    { name: 'SUPERVISOR', displayName: 'Supervisor',  accessLevel: 3, color: '#8B5CF6', isSystem: true, description: 'Oversees team leads' },
    { name: 'MANAGER',    displayName: 'Manager',     accessLevel: 2, color: '#F59E0B', isSystem: true, description: 'Manages supervisors' },
    { name: 'BOSS',       displayName: 'Boss',        accessLevel: 1, color: '#EF4444', isSystem: true, description: 'Top-level executive' },
  ];
  const roles = {};
  for (const r of roleRows) {
    const [role] = await db.RoleDefinition.findOrCreate({ where: { name: r.name }, defaults: { id: uuidv4(), ...r } });
    roles[r.name] = role;
  }
  console.log('   ✔ Roles ready\n');

  // ── Guard: skip if users already exist ────────────────────────────────────
  const existingUsers = await db.User.count();
  if (existingUsers > 0) {
    console.log(`ℹ️  Users already exist (${existingUsers}). Skipping user/task seed.\n`);
    console.log('🎉 Done — database already has data!\n');
    await db.sequelize.close();
    return;
  }

  // ── 2. Users ──────────────────────────────────────────────────────────────
  console.log('🌱 Seeding users...');

  // Boss
  const bossId = uuidv4();
  await db.User.create({
    id: bossId, email: 'valaaryan22@gmail.com', password: 'Aryan22@',
    firstName: 'Aryan', lastName: 'vala', roleId: roles['BOSS'].id,
    isActive: true, isEmailVerified: true,
    department: 'Executive', jobTitle: 'Chief Executive Officer', phone: '+91-9800000001',
  });


  console.log('   ✔ 1 user created (Boss)\n');

  await db.sequelize.close();

  console.log('════════════════════════════════════════════════════════════════');
  console.log('🎉 Database seeded successfully!\n');
  console.log('📋 Login credentials:');
  console.log('');
  console.log('   Role        Email                           Password');
  console.log('   ─────────── ─────────────────────────────── ────────────');
  console.log('   Boss      → valaaryan22@gmail.com           Aryan22@');
  console.log('════════════════════════════════════════════════════════════════\n');
}

seed().catch(err => {
  console.error('\n💥 Seed failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
