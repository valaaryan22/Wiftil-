'use strict';

/**
 * Create the `attendance` table for the HRM Attendance module.
 * Run: node scripts/create-attendance-table.js
 */

require('dotenv').config();
const { db, connectDB } = require('../src/database/client');

async function run() {
  await connectDB();

  const queryInterface = db.sequelize.getQueryInterface();
  const DataTypes      = db.Sequelize.DataTypes;

  const tableExists = await db.sequelize.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'attendance'`,
    { type: db.sequelize.QueryTypes.SELECT }
  );

  if (tableExists[0].cnt > 0) {
    console.log('✅ attendance table already exists — skipping.');
    process.exit(0);
  }

  console.log('⏳ Creating attendance table…');

  await queryInterface.createTable('attendance', {
    id: {
      type:          DataTypes.UUID,
      defaultValue:  DataTypes.UUIDV4,
      primaryKey:    true,
      allowNull:     false,
    },
    user_id: {
      type:       DataTypes.UUID,
      allowNull:  false,
      references: { model: 'users', key: 'id' },
      onUpdate:   'CASCADE',
      onDelete:   'CASCADE',
    },
    date: {
      type:      DataTypes.DATEONLY,
      allowNull: false,
      comment:   'Calendar date YYYY-MM-DD',
    },
    punch_in: {
      type:      DataTypes.DATE,
      allowNull: true,
    },
    punch_out: {
      type:      DataTypes.DATE,
      allowNull: true,
    },
    working_hours: {
      type:         DataTypes.DECIMAL(5, 2),
      allowNull:    true,
      defaultValue: 0,
      comment:      'Computed on punch-out',
    },
    overtime_hours: {
      type:         DataTypes.DECIMAL(5, 2),
      allowNull:    false,
      defaultValue: 0,
      comment:      'Hours beyond standard 8h day',
    },
    status: {
      type:         DataTypes.ENUM('PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE', 'WEEKEND', 'HOLIDAY'),
      allowNull:    false,
      defaultValue: 'ABSENT',
    },
    notes: {
      type:      DataTypes.TEXT,
      allowNull: true,
    },
    marked_by_id: {
      type:       DataTypes.UUID,
      allowNull:  true,
      references: { model: 'users', key: 'id' },
      onUpdate:   'CASCADE',
      onDelete:   'SET NULL',
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

  // Unique constraint: one record per user per day
  await queryInterface.addIndex('attendance', ['user_id', 'date'], {
    unique: true,
    name:   'attendance_user_date_unique',
  });

  // Performance indexes
  await queryInterface.addIndex('attendance', ['date'],   { name: 'attendance_date_idx' });
  await queryInterface.addIndex('attendance', ['status'], { name: 'attendance_status_idx' });

  console.log('✅ attendance table created successfully with indexes.');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
