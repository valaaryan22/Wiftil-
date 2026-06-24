'use strict';

/**
 * migrate-performance-ratings.js
 *
 * One-time migration to extend performance_ratings table:
 *   1. Make sub_task_id nullable (to support DIRECT ratings)
 *   2. Add rating_type ENUM('SUBTASK','DIRECT') NOT NULL DEFAULT 'SUBTASK'
 *   3. Add period_label VARCHAR(100) NULL
 *   4. Add contribution_pct FLOAT NOT NULL DEFAULT 100
 *
 * Run once: node migrate-performance-ratings.js
 */

require('dotenv').config();
const { db } = require('./src/database/client');

async function migrate() {
  const qi = db.sequelize.getQueryInterface();
  const DataTypes = db.Sequelize.DataTypes;

  console.log('🔄 Starting performance_ratings migration...');

  try {
    await db.sequelize.authenticate();
    console.log('✅ DB connected');

    // 1. Make sub_task_id nullable
    await qi.changeColumn('performance_ratings', 'sub_task_id', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'sub_tasks', key: 'id' },
    }).catch(e => console.log('ℹ️  sub_task_id already nullable or error:', e.message));

    // 2. Add rating_type column (if not exists)
    await qi.addColumn('performance_ratings', 'rating_type',
      { type: DataTypes.ENUM('SUBTASK', 'DIRECT'), allowNull: false, defaultValue: 'SUBTASK' }
    ).catch(e => console.log('ℹ️  rating_type already exists or error:', e.message));

    // 3. Add period_label column (if not exists)
    await qi.addColumn('performance_ratings', 'period_label',
      { type: DataTypes.STRING(100), allowNull: true }
    ).catch(e => console.log('ℹ️  period_label already exists or error:', e.message));

    // 4. Add contribution_pct column (if not exists)
    await qi.addColumn('performance_ratings', 'contribution_pct',
      { type: DataTypes.FLOAT, allowNull: false, defaultValue: 100 }
    ).catch(e => console.log('ℹ️  contribution_pct already exists or error:', e.message));

    // 5. Backfill existing SUBTASK ratings with contribution_pct = 100
    await db.sequelize.query(
      `UPDATE performance_ratings SET contribution_pct = 100 WHERE contribution_pct IS NULL`
    ).catch(e => console.log('ℹ️  Backfill skipped:', e.message));

    console.log('✅ Migration complete!');
    console.log('\nNew columns added to performance_ratings:');
    console.log('  - rating_type   ENUM(SUBTASK, DIRECT) DEFAULT SUBTASK');
    console.log('  - period_label  VARCHAR(100) NULL');
    console.log('  - contribution_pct FLOAT DEFAULT 100');
    console.log('  - sub_task_id is now nullable');

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await db.sequelize.close();
  }
}

migrate();
