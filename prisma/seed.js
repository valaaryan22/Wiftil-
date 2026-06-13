'use strict';

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }    = require('@prisma/adapter-pg');
const bcrypt = require('bcryptjs');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const SYSTEM_ROLES = [
  {
    name: 'BOSS',
    displayName: 'Boss / Owner',
    description: 'Full system access. Can manage all users, roles, and settings.',
    accessLevel: 5,
    isSystem: true,
    color: '#ef4444',
  },
  {
    name: 'MANAGER',
    displayName: 'Manager',
    description: 'Can manage Leaders and Employees. Can approve/reject leaves and add users.',
    accessLevel: 4,
    isSystem: true,
    color: '#f97316',
  },
  {
    name: 'SUPERVISOR',
    displayName: 'Supervisor',
    description: 'Mid-level role. Can supervise Teams and review leaves.',
    accessLevel: 3,
    isSystem: true,
    color: '#eab308',
  },
  {
    name: 'LEADER',
    displayName: 'Team Leader',
    description: 'Leads a team. Can review Employee leaves.',
    accessLevel: 2,
    isSystem: true,
    color: '#22c55e',
  },
  {
    name: 'EMPLOYEE',
    displayName: 'Employee',
    description: 'Standard employee access.',
    accessLevel: 1,
    isSystem: true,
    color: '#3b82f6',
  },
];

async function main() {
  console.log('🌱 Seeding system roles...');

  for (const roleData of SYSTEM_ROLES) {
    const role = await db.roleDefinition.upsert({
      where: { name: roleData.name },
      update: {
        displayName: roleData.displayName,
        description: roleData.description,
        accessLevel: roleData.accessLevel,
        color: roleData.color,
      },
      create: roleData,
    });
    console.log(`  ✅ Role "${role.displayName}" (Level ${role.accessLevel}) — ${role.id}`);
  }

  // Create a default BOSS user if none exists
  const bossRole = await db.roleDefinition.findUnique({ where: { name: 'BOSS' } });
  if (bossRole) {
    const existing = await db.user.findFirst({ where: { role: { name: 'BOSS' } } });
    if (!existing) {
      const hashed = await bcrypt.hash('Boss@12345', 12);
      const boss = await db.user.create({
        data: {
          email: 'boss@wiftil.com',
          password: hashed,
          firstName: 'System',
          lastName: 'Boss',
          roleId: bossRole.id,
          isActive: true,
          isEmailVerified: true,
          department: 'Administration',
          jobTitle: 'Owner',
        },
      });
      console.log(`  👑 Default BOSS user created — ${boss.email}`);
    } else {
      console.log(`  👑 BOSS user already exists — skipping`);
    }
  }

  console.log('\n✅ Seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
