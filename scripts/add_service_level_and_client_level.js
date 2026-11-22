/**
 * Migration: add_service_level_and_client_level
 *
 * Adds:
 *   1. service_catalog.service_level  — ENUM('BL-1','BL-2','BL-3','SL-1','SL-2','SL-3','PL-1','PL-2','PL-3','UL-1')
 *   2. clients.client_level           — ENUM('BASIC','STANDARD','PREMIUM')
 *   3. package_services.unit_price    — DECIMAL(12,2) NULL
 *
 * Usage:
 *   node scripts/add_service_level_and_client_level.js
 *
 * Safe to run multiple times — uses IF NOT EXISTS / column existence checks.
 */

'use strict';

require('dotenv').config();
const { sequelize } = require('../src/models');

async function main() {
  const q = sequelize.getQueryInterface();
  const dialect = sequelize.getDialect(); // 'postgres' | 'mysql' | 'sqlite'

  console.log(`\n🔧  Running migration on dialect: ${dialect}\n`);

  // ── 1. service_catalog.service_level ─────────────────────────────────────────

  await withColumnGuard(q, 'service_catalog', 'service_level', async () => {
    if (dialect === 'postgres') {
      // Create the ENUM type first (idempotent)
      await sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE "enum_service_catalog_service_level"
            AS ENUM('BL-1','BL-2','BL-3','SL-1','SL-2','SL-3','PL-1','PL-2','PL-3','UL-1');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
      await sequelize.query(`
        ALTER TABLE service_catalog
          ADD COLUMN service_level "enum_service_catalog_service_level" NULL DEFAULT NULL;
      `);
    } else {
      // MySQL / MariaDB
      await sequelize.query(`
        ALTER TABLE service_catalog
          ADD COLUMN service_level ENUM('BL-1','BL-2','BL-3','SL-1','SL-2','SL-3','PL-1','PL-2','PL-3','UL-1')
          NULL DEFAULT NULL
          AFTER category;
      `);
    }
    console.log('  ✅  service_catalog.service_level added');
  });

  // ── 2. clients.client_level ───────────────────────────────────────────────────

  await withColumnGuard(q, 'clients', 'client_level', async () => {
    if (dialect === 'postgres') {
      await sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE "enum_clients_client_level"
            AS ENUM('BASIC','STANDARD','PREMIUM');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
      await sequelize.query(`
        ALTER TABLE clients
          ADD COLUMN client_level "enum_clients_client_level" NULL DEFAULT NULL;
      `);
    } else {
      await sequelize.query(`
        ALTER TABLE clients
          ADD COLUMN client_level ENUM('BASIC','STANDARD','PREMIUM')
          NULL DEFAULT NULL
          AFTER relationship_status;
      `);
    }
    console.log('  ✅  clients.client_level added');
  });

  // ── 3. package_services.unit_price ───────────────────────────────────────────

  await withColumnGuard(q, 'package_services', 'unit_price', async () => {
    await sequelize.query(`
      ALTER TABLE package_services
        ADD COLUMN unit_price DECIMAL(12,2) NULL DEFAULT NULL
        ${dialect !== 'postgres' ? 'AFTER owner_label' : ''};
    `);
    console.log('  ✅  package_services.unit_price added');
  });

  console.log('\n✅  Migration complete.\n');
}

/**
 * Runs fn only if the column does NOT already exist on the table.
 * Prevents duplicate-column errors on re-runs.
 */
async function withColumnGuard(q, tableName, columnName, fn) {
  try {
    const desc = await q.describeTable(tableName);
    if (desc[columnName]) {
      console.log(`  ⏭️   ${tableName}.${columnName} already exists — skipped`);
      return;
    }
    await fn();
  } catch (err) {
    console.error(`  ❌  Error processing ${tableName}.${columnName}:`, err.message);
    throw err;
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
