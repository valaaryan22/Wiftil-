'use strict';

/**
 * Create the `leave_allocations` table and add `half_day_type` to `leave_requests`.
 * Run: node scripts/create-leave-allocation-table.js
 */

require('dotenv').config();
const { db, connectDB } = require('../src/database/client');

async function run() {
  await connectDB();

  const queryInterface = db.sequelize.getQueryInterface();
  const DataTypes      = db.Sequelize.DataTypes;

  // ── 1. leave_allocations table ───────────────────────────────────────────────
  const allocExists = await db.sequelize.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'leave_allocations'`,
    { type: db.sequelize.QueryTypes.SELECT }
  );

  if (allocExists[0].cnt > 0) {
    console.log('✅ leave_allocations table already exists — skipping creation.');
  } else {
    console.log('⏳ Creating leave_allocations table…');

    await queryInterface.createTable('leave_allocations', {
      id: {
        type:         DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey:   true,
        allowNull:    false,
      },
      user_id: {
        type:       DataTypes.UUID,
        allowNull:  false,
        references: { model: 'users', key: 'id' },
        onUpdate:   'CASCADE',
        onDelete:   'CASCADE',
      },
      allocated_by_id: {
        type:       DataTypes.UUID,
        allowNull:  false,
        references: { model: 'users', key: 'id' },
        onUpdate:   'CASCADE',
        onDelete:   'CASCADE',
      },
      year: {
        type:      DataTypes.INTEGER,
        allowNull: false,
      },
      annual_days: {
        type:         DataTypes.FLOAT,
        allowNull:    false,
        defaultValue: 0,
      },
      sick_days: {
        type:         DataTypes.FLOAT,
        allowNull:    false,
        defaultValue: 0,
      },
      unpaid_days: {
        type:         DataTypes.FLOAT,
        allowNull:    false,
        defaultValue: 0,
      },
      emergency_days: {
        type:         DataTypes.FLOAT,
        allowNull:    false,
        defaultValue: 0,
      },
      maternity_days: {
        type:         DataTypes.FLOAT,
        allowNull:    false,
        defaultValue: 0,
      },
      paternity_days: {
        type:         DataTypes.FLOAT,
        allowNull:    false,
        defaultValue: 0,
      },
      note: {
        type:      DataTypes.TEXT,
        allowNull: true,
      },
      created_at: {
        type:         DataTypes.DATE,
        allowNull:    false,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type:         DataTypes.DATE,
        allowNull:    false,
        defaultValue: DataTypes.NOW,
      },
    });

    // Unique: one allocation per user per year
    await queryInterface.addIndex('leave_allocations', ['user_id', 'year'], {
      unique: true,
      name:   'unique_user_year_allocation',
    });

    // Performance indexes
    await queryInterface.addIndex('leave_allocations', ['user_id'], { name: 'la_user_id_idx' });
    await queryInterface.addIndex('leave_allocations', ['year'],    { name: 'la_year_idx' });

    console.log('✅ leave_allocations table created successfully.');
  }

  // ── 2. Add half_day_type column to leave_requests (if missing) ───────────────
  const lrColumns = await queryInterface.describeTable('leave_requests');

  if (lrColumns.half_day_type) {
    console.log('✅ half_day_type column already exists on leave_requests — skipping.');
  } else {
    console.log('⏳ Adding half_day_type column to leave_requests…');
    await queryInterface.addColumn('leave_requests', 'half_day_type', {
      type:         DataTypes.ENUM('FIRST_HALF', 'SECOND_HALF'),
      allowNull:    true,
      defaultValue: null,
      after:        'total_days',
    });
    console.log('✅ half_day_type column added to leave_requests.');
  }

  // ── 3. Ensure total_days is FLOAT (not INT) on leave_requests ────────────────
  if (lrColumns.total_days && lrColumns.total_days.type === 'INT') {
    console.log('⏳ Changing total_days column from INT to FLOAT on leave_requests…');
    await queryInterface.changeColumn('leave_requests', 'total_days', {
      type:      DataTypes.FLOAT,
      allowNull: false,
    });
    console.log('✅ total_days changed to FLOAT.');
  } else {
    console.log('✅ total_days already FLOAT — skipping.');
  }

  console.log('\n🎉 All migrations completed successfully!');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
