'use strict';

/**
 * AWS RDS Setup Script
 * --------------------
 * 1. Connects to RDS as admin (no database selected)
 * 2. Creates the `wiftil` database if it doesn't exist
 * 3. Reconnects to `wiftil` and syncs all Sequelize models (creates tables)
 *
 * Run once: node scripts/setup-aws-db.js
 */

require('dotenv').config();
const { Sequelize } = require('sequelize');

const HOST = process.env.DB_HOST;
const PORT = parseInt(process.env.DB_PORT, 10) || 3306;
const USER = process.env.DB_USER;
const PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME || 'wiftil';

const DIALECT_OPTS = {
  connectTimeout: 30000,
  socketKeepAlive: true,
};

async function main() {
  // ── Step 1: Connect WITHOUT a database to create it ──────────────────────
  console.log(`\n🔌 Connecting to ${HOST}:${PORT} as '${USER}' (no DB selected)...`);
  const rootSeq = new Sequelize(null, USER, PASSWORD, {
    host: HOST, port: PORT, dialect: 'mysql', logging: false,
    dialectOptions: DIALECT_OPTS,
  });

  try {
    await rootSeq.authenticate();
    console.log('✅ Connected to RDS');
  } catch (err) {
    console.error('❌ Cannot connect to RDS:', err.message);
    console.error('\nCheck:\n  1. RDS instance is running\n  2. Security Group allows inbound port 3306 from your IP\n  3. DB_HOST / DB_USER / DB_PASSWORD are correct in .env');
    process.exit(1);
  }

  // ── Step 2: Create database ───────────────────────────────────────────────
  console.log(`\n🗄️  Creating database '${DB_NAME}' if it doesn't exist...`);
  await rootSeq.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
  );
  console.log(`✅ Database '${DB_NAME}' ready`);
  await rootSeq.close();

  // ── Step 3: Sync all models ───────────────────────────────────────────────
  console.log(`\n📦 Syncing Sequelize models to '${DB_NAME}'...`);
  const db = require('../src/models');

  try {
    await db.sequelize.authenticate();
    console.log(`✅ Connected to '${DB_NAME}'`);
  } catch (err) {
    console.error('❌ Cannot connect to database:', err.message);
    process.exit(1);
  }

  // force: false  → only CREATE missing tables, never DROP existing ones
  // alter: true   → update column types/sizes on existing tables safely
  await db.sequelize.sync({ force: false, alter: true });
  console.log('✅ All tables synced (created or altered as needed)');

  // ── Step 4: Seed default roles if RoleDefinition table is empty ──────────
  const roleCount = await db.RoleDefinition.count().catch(() => 0);
  if (roleCount === 0) {
    console.log('\n🌱 Seeding default roles...');
    await db.RoleDefinition.bulkCreate([
      { name: 'EMPLOYEE', displayName: 'Employee', accessLevel: 1, color: '#6B7280' },
      { name: 'LEADER', displayName: 'Team Leader', accessLevel: 2, color: '#3B82F6' },
      { name: 'SUPERVISOR', displayName: 'Supervisor', accessLevel: 3, color: '#8B5CF6' },
      { name: 'MANAGER', displayName: 'Manager', accessLevel: 4, color: '#F59E0B' },
      { name: 'BOSS', displayName: 'Boss', accessLevel: 5, color: '#EF4444' },
    ]);
    console.log('✅ Default roles seeded');
  } else {
    console.log(`ℹ️  Roles already exist (${roleCount} found), skipping seed`);
  }

  await db.sequelize.close();
  console.log('\n🎉 AWS RDS setup complete! You can now run: npm run dev\n');
}

main().catch(err => {
  console.error('\n💥 Setup failed:', err.message);
  process.exit(1);
});
