'use strict';

/**
 * Seed script — creates system roles + sample users
 * Run: npm run db:seed
 *
 * NOTE: Do NOT pre-hash passwords here. The User model's beforeCreate hook
 * handles hashing automatically. Pre-hashing causes double-hashing.
 */

const db = require('./src/models');

async function seed() {
  try {
    console.log('Connecting to database...');
    await db.sequelize.authenticate();
    console.log('Database connected.');

    console.log('Syncing database...');
    await db.sequelize.sync({ force: true });
    console.log('Database synced (force: all tables recreated).');

    // ── Roles ──────────────────────────────────────────────────────────────────
    console.log('\nCreating system roles...');
    const createdRoles = await db.RoleDefinition.bulkCreate([
      { name: 'EMPLOYEE',  displayName: 'Employee',       description: 'Base role for all employees',       accessLevel: 1, isSystem: true },
      { name: 'TEAM_LEAD', displayName: 'Team Lead',      description: 'Leads a team and manages sub-tasks', accessLevel: 2, isSystem: true },
      { name: 'MANAGER',   displayName: 'Manager',        description: 'Manages projects and tasks',         accessLevel: 3, isSystem: true },
      { name: 'ADMIN',     displayName: 'Administrator',  description: 'System administrator',               accessLevel: 4, isSystem: true },
      { name: 'BOSS',      displayName: 'Boss',           description: 'Highest level — full access',        accessLevel: 5, isSystem: true, color: '#FFD700' },
    ], { returning: true });
    console.log(`  ✓ ${createdRoles.length} roles created`);

    const roleMap = Object.fromEntries(createdRoles.map(r => [r.name, r]));

    // ── Users — plain-text passwords, hook hashes them ─────────────────────────
    console.log('\nCreating sample users...');

    const boss = await db.User.create({
      email: 'boss@wiftil.local', password: 'Boss@12345',
      firstName: 'Alex', lastName: 'Boss',
      roleId: roleMap['BOSS'].id, isEmailVerified: true,
      jobTitle: 'CEO', department: 'Executive',
    });

    const admin = await db.User.create({
      email: 'admin@wiftil.local', password: 'Admin@123',
      firstName: 'System', lastName: 'Admin',
      roleId: roleMap['ADMIN'].id, isEmailVerified: true,
      jobTitle: 'Administrator', department: 'IT',
      managerId: boss.id,
    });

    const manager = await db.User.create({
      email: 'manager@wiftil.local', password: 'Manager@12345',
      firstName: 'Sarah', lastName: 'Manager',
      roleId: roleMap['MANAGER'].id, isEmailVerified: true,
      jobTitle: 'Engineering Manager', department: 'Engineering',
      managerId: boss.id,
    });

    const teamlead = await db.User.create({
      email: 'lead@wiftil.local', password: 'Lead@12345',
      firstName: 'Tom', lastName: 'Lead',
      roleId: roleMap['TEAM_LEAD'].id, isEmailVerified: true,
      jobTitle: 'Team Lead', department: 'Engineering',
      managerId: manager.id,
    });

    await db.User.create({
      email: 'employee@wiftil.local', password: 'Employee@12345',
      firstName: 'Jane', lastName: 'Smith',
      roleId: roleMap['EMPLOYEE'].id, isEmailVerified: true,
      jobTitle: 'Software Engineer', department: 'Engineering',
      managerId: teamlead.id,
    });

    console.log(`  ✓ 5 users created`);

    console.log('\n════════════════════════════════════════════════');
    console.log('  Seeding complete! Login credentials:');
    console.log('────────────────────────────────────────────────');
    console.log('  Boss:     boss@wiftil.local     / Boss@12345');
    console.log('  Admin:    admin@wiftil.local    / Admin@123');
    console.log('  Manager:  manager@wiftil.local  / Manager@12345');
    console.log('  Lead:     lead@wiftil.local     / Lead@12345');
    console.log('  Employee: employee@wiftil.local / Employee@12345');
    console.log('════════════════════════════════════════════════\n');

    process.exit(0);
  } catch (error) {
    console.error('\nSeeding failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

seed();
