'use strict';

// LeaveAllocation: Tracks yearly leave quota assigned to an employee
// Level 1/2/3 users can allocate leaves to their subordinates
module.exports = (sequelize, DataTypes) => {
  const LeaveAllocation = sequelize.define('LeaveAllocation', {
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
    allocatedById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'allocated_by_id',
      references: { model: 'users', key: 'id' },
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    annualDays: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
      field: 'annual_days',
    },
    sickDays: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
      field: 'sick_days',
    },
    unpaidDays: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
      field: 'unpaid_days',
    },
    emergencyDays: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
      field: 'emergency_days',
    },
    maternityDays: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
      field: 'maternity_days',
    },
    paternityDays: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
      field: 'paternity_days',
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
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
    tableName: 'leave_allocations',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['user_id'] },
      { fields: ['year'] },
      { unique: true, fields: ['user_id', 'year'], name: 'unique_user_year_allocation' },
    ],
  });

  LeaveAllocation.associate = function (models) {
    LeaveAllocation.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'employee',
    });
    LeaveAllocation.belongsTo(models.User, {
      foreignKey: 'allocated_by_id',
      as: 'allocatedBy',
    });
  };

  return LeaveAllocation;
};
