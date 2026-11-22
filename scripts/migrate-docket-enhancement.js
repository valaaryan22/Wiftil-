'use strict';

/**
 * Migration: Docket Enhancement
 * 
 * 1. Update dockets status enum: add DRAFT & PUBLISHED, remove PLANNING
 * 2. Add published_at and published_by_id to dockets
 * 3. Migrate assigned_manager_id to docket_managers table
 * 4. Create docket_managers table
 * 5. Drop assigned_manager_id from dockets
 * 6. Add docket_id to tasks and sub_tasks
 *
 * Run: node scripts/migrate-docket-enhancement.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Sequelize } = require('sequelize');

const env = process.env.NODE_ENV || 'development';
const config = require(path.join(__dirname, '..', 'src', 'config', 'sequelize.js'))[env];

const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  {
    host: config.host,
    port: config.port,
    dialect: config.dialect,
    logging: console.log,
  }
);

async function up() {
  const qi = sequelize.getQueryInterface();

  console.log('\n🚀 Starting Docket Enhancement Migration...\n');

  // ── Step 1: Update status enum ──────────────────────────────────────────────
  console.log('Step 1: Updating dockets status enum...');

  // Add DRAFT and PUBLISHED to the enum (MySQL)
  try {
    await sequelize.query(`ALTER TABLE dockets MODIFY COLUMN status ENUM('DRAFT', 'PUBLISHED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT';`);
    console.log('  ✅ Updated status enum in MySQL');
  } catch (e) {
    console.log('  ⚠️  Could not update status enum:', e.message);
  }

  // Migrate PLANNING → DRAFT
  try {
    const [result] = await sequelize.query(`UPDATE dockets SET status = 'DRAFT' WHERE status = 'PLANNING';`);
    console.log(`  ✅ Migrated PLANNING dockets to DRAFT`);
  } catch (e) {
    console.log(`  ⚠️  Migration to DRAFT failed:`, e.message);
  }

  // ── Step 2: Add published_at and published_by_id columns ────────────────────
  console.log('\nStep 2: Adding published_at and published_by_id columns...');

  try {
    await qi.addColumn('dockets', 'published_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    console.log('  ✅ Added published_at');
  } catch (e) {
    console.log('  ⚠️  published_at may already exist:', e.message);
  }

  try {
    await qi.addColumn('dockets', 'published_by_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    });
    console.log('  ✅ Added published_by_id');
  } catch (e) {
    console.log('  ⚠️  published_by_id may already exist:', e.message);
  }

  // ── Step 3: Create docket_managers table ────────────────────────────────────
  console.log('\nStep 3: Creating docket_managers table...');

  try {
    await qi.createTable('docket_managers', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      docket_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'dockets', key: 'id' },
        onDelete: 'CASCADE',
      },
      manager_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      role: {
        type: Sequelize.ENUM('PRIMARY', 'SECONDARY', 'REVIEWER'),
        allowNull: false,
        defaultValue: 'PRIMARY',
      },
      assigned_by_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      assigned_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });
    console.log('  ✅ Created docket_managers table');

    // Add unique index
    await qi.addIndex('docket_managers', ['docket_id', 'manager_id'], { unique: true });
    await qi.addIndex('docket_managers', ['docket_id']);
    await qi.addIndex('docket_managers', ['manager_id']);
    console.log('  ✅ Added indexes on docket_managers');
  } catch (e) {
    console.log('  ⚠️  docket_managers table may already exist:', e.message);
  }

  // ── Step 4: Migrate assigned_manager_id data ───────────────────────────────
  console.log('\nStep 4: Migrating assigned_manager_id data...');

  try {
    // Check if the column exists
    const [cols] = await sequelize.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'dockets' AND column_name = 'assigned_manager_id';`
    );

    if (cols.length > 0) {
      // Move existing assigned_manager_id to docket_managers (MySQL)
      const [migrated] = await sequelize.query(`
        INSERT IGNORE INTO docket_managers (id, docket_id, manager_id, role, assigned_by_id, assigned_at)
        SELECT 
          UUID(),
          d.id,
          d.assigned_manager_id,
          'PRIMARY',
          d.created_by_id,
          d.created_at
        FROM dockets d
        WHERE d.assigned_manager_id IS NOT NULL
          AND d.deleted_at IS NULL;
      `);
      console.log(`  ✅ Migrated manager assignments`);

      // Drop the old column
      await qi.removeColumn('dockets', 'assigned_manager_id');
      console.log('  ✅ Dropped assigned_manager_id column');
    } else {
      console.log('  ⚠️  assigned_manager_id column does not exist (already migrated)');
    }
  } catch (e) {
    console.log('  ⚠️  Migration of assigned_manager_id failed:', e.message);
  }

  // ── Step 5: Add docket_id to tasks ─────────────────────────────────────────
  console.log('\nStep 5: Adding docket_id to tasks...');

  try {
    await qi.addColumn('tasks', 'docket_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'dockets', key: 'id' },
    });
    await qi.addIndex('tasks', ['docket_id']);
    console.log('  ✅ Added docket_id to tasks');
  } catch (e) {
    console.log('  ⚠️  docket_id may already exist in tasks:', e.message);
  }

  // ── Step 6: Add docket_id to sub_tasks ─────────────────────────────────────
  console.log('\nStep 6: Adding docket_id to sub_tasks...');

  try {
    await qi.addColumn('sub_tasks', 'docket_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'dockets', key: 'id' },
    });
    await qi.addIndex('sub_tasks', ['docket_id']);
    console.log('  ✅ Added docket_id to sub_tasks');
  } catch (e) {
    console.log('  ⚠️  docket_id may already exist in sub_tasks:', e.message);
  }

  console.log('\n✅ Docket Enhancement Migration Complete!\n');
}

async function main() {
  try {
    await sequelize.authenticate();
    console.log('📦 Database connected');
    await up();
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

main();
