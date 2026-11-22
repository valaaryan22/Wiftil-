'use strict';

/**
 * Migration: Client Overview Enhancement
 * - Adds loyalty_score, health_score, relationship_status to clients table
 * - Creates client_risks table
 *
 * Run: node scripts/migrate-client-overview.js
 */

require('dotenv').config();
const { sequelize } = require('../src/models');

async function migrate() {
  const query = sequelize.getQueryInterface();

  console.log('🚀 Starting Client Overview migration...\n');

  // ─── 1. Add new columns to clients table ────────────────────────────────────
  console.log('📋 Step 1: Adding scoring columns to `clients` table...');

  const clientsDesc = await sequelize.query(
    "DESCRIBE clients",
    { type: sequelize.QueryTypes.SELECT }
  );
  const existingClientCols = clientsDesc.map(r => r.Field);

  if (!existingClientCols.includes('loyalty_score')) {
    await sequelize.query(`ALTER TABLE clients ADD COLUMN loyalty_score INT NULL CHECK (loyalty_score >= 0 AND loyalty_score <= 100) COMMENT 'Admin-set loyalty score 0-100'`);
    console.log('  ✅ Added loyalty_score');
  } else {
    console.log('  ⏭️  loyalty_score already exists');
  }

  if (!existingClientCols.includes('health_score')) {
    await sequelize.query(`ALTER TABLE clients ADD COLUMN health_score INT NULL CHECK (health_score >= 0 AND health_score <= 100) COMMENT 'Admin-set health score 0-100'`);
    console.log('  ✅ Added health_score');
  } else {
    console.log('  ⏭️  health_score already exists');
  }

  if (!existingClientCols.includes('relationship_status')) {
    await sequelize.query(`ALTER TABLE clients ADD COLUMN relationship_status ENUM('NEW','GROWING','TRUSTED_PARTNER','AT_RISK','CHURNED') NULL DEFAULT 'NEW' COMMENT 'Admin-set relationship tier'`);
    console.log('  ✅ Added relationship_status');
  } else {
    console.log('  ⏭️  relationship_status already exists');
  }

  // ─── 2. Create client_risks table ───────────────────────────────────────────
  console.log('\n📋 Step 2: Creating `client_risks` table...');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS client_risks (
      id                CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      client_id         CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      created_by_id     CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      resolved_by_id    CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
      title             VARCHAR(255) NOT NULL,
      description       TEXT         NULL,
      severity          ENUM('info','warning','danger') NOT NULL DEFAULT 'warning',
      category          ENUM('BILLING','OPERATIONAL','RELATIONSHIP','DELIVERY','OTHER') NOT NULL DEFAULT 'OTHER',
      is_resolved       TINYINT(1)   NOT NULL DEFAULT 0,
      resolved_at       DATETIME     NULL,
      created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at        DATETIME     NULL,
      PRIMARY KEY (id),
      CONSTRAINT fk_cr_client     FOREIGN KEY (client_id)      REFERENCES clients (id) ON DELETE CASCADE,
      CONSTRAINT fk_cr_created_by FOREIGN KEY (created_by_id)  REFERENCES users   (id),
      CONSTRAINT fk_cr_resolved   FOREIGN KEY (resolved_by_id) REFERENCES users   (id),
      INDEX idx_cr_client   (client_id),
      INDEX idx_cr_severity (severity),
      INDEX idx_cr_resolved (is_resolved),
      INDEX idx_cr_category (category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('  ✅ client_risks table ready');

  console.log('\n✅ Client Overview migration completed successfully!\n');
  process.exit(0);
}

migrate().catch(err => {
  console.error('\n❌ Migration failed:', err.message);
  console.error(err);
  process.exit(1);
});
