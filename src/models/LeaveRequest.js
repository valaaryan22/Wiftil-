'use strict';

// Leave types: ANNUAL | SICK | UNPAID | EMERGENCY | MATERNITY | PATERNITY
// Leave statuses: PENDING | APPROVED | REJECTED | CANCELLED
module.exports = (sequelize, DataTypes) => {
  const LeaveRequest = sequelize.define('LeaveRequest', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    requesterId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'requester_id',
      references: { model: 'users', key: 'id' },
    },
    reviewerId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'reviewer_id',
      references: { model: 'users', key: 'id' },
    },
    leaveType: {
      type: DataTypes.ENUM('ANNUAL', 'SICK', 'UNPAID', 'EMERGENCY', 'MATERNITY', 'PATERNITY'),
      allowNull: false,
      field: 'leave_type',
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'start_date',
    },
    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'end_date',
    },
    totalDays: {
      type: DataTypes.FLOAT,
      allowNull: false,
      field: 'total_days',
    },
    halfDayType: {
      type: DataTypes.ENUM('FIRST_HALF', 'SECOND_HALF'),
      allowNull: true,
      field: 'half_day_type',
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    reviewComment: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'review_comment',
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reviewed_at',
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
    tableName: 'leave_requests',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['requester_id'] },
      { fields: ['status'] },
    ],
  });

  LeaveRequest.associate = function (models) {
    LeaveRequest.belongsTo(models.User, {
      foreignKey: 'requester_id',
      as: 'requester',
      onDelete: 'CASCADE',
    });
    LeaveRequest.belongsTo(models.User, {
      foreignKey: 'reviewer_id',
      as: 'reviewer',
    });
  };

  return LeaveRequest;
};
