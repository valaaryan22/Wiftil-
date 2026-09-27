'use strict';

// Attendance statuses:
//   PRESENT     — employee was present (punchIn + punchOut recorded)
//   ABSENT      — no record / manually marked absent
//   HALF_DAY    — worked less than half of standard hours (< 4h)
//   ON_LEAVE    — approved leave covers this day
//   WEEKEND     — Saturday / Sunday
//   HOLIDAY     — public holiday
module.exports = (sequelize, DataTypes) => {
  const Attendance = sequelize.define('Attendance', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      references: { model: 'users', key: 'id' },
    },
    date: {
      // Calendar date of attendance — YYYY-MM-DD
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    punchIn: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'punch_in',
    },
    punchOut: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'punch_out',
    },
    workingHours: {
      // Computed on punch-out: (punchOut - punchIn) in decimal hours
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      defaultValue: 0,
      field: 'working_hours',
    },
    overtimeHours: {
      // hours beyond STANDARD_WORK_HOURS (8h)
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'overtime_hours',
    },
    status: {
      type: DataTypes.ENUM('PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE', 'WEEKEND', 'HOLIDAY'),
      allowNull: false,
      defaultValue: 'ABSENT',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    markedById: {
      // If attendance was manually set by an admin
      type: DataTypes.UUID,
      allowNull: true,
      field: 'marked_by_id',
      references: { model: 'users', key: 'id' },
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at',
    },
  }, {
    tableName: 'attendance',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['user_id', 'date'], name: 'attendance_user_date_unique' },
      { fields: ['date'] },
      { fields: ['status'] },
    ],
  });

  Attendance.associate = function (models) {
    Attendance.belongsTo(models.User, { foreignKey: 'user_id', as: 'employee' });
    Attendance.belongsTo(models.User, { foreignKey: 'marked_by_id', as: 'markedBy' });
  };

  return Attendance;
};
