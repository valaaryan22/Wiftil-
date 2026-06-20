'use strict';

// Audit log — tracks all important actions in the system
module.exports = (sequelize, DataTypes) => {
  const AuditLog = sequelize.define('AuditLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    performedById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'performed_by_id',
      references: { model: 'users', key: 'id' },
    },
    performedByName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'performed_by_name',
    },
    performedByRole: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'performed_by_role',
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'GENERAL',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    entity: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    entityId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'entity_id',
    },
    entityName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'entity_name',
    },
    targetUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'target_user_id',
      references: { model: 'users', key: 'id' },
    },
    targetUserName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'target_user_name',
    },
    oldValues: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'old_values',
    },
    newValues: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'new_values',
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'ip_address',
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'user_agent',
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'SUCCESS',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
  }, {
    tableName: 'audit_logs',
    timestamps: false,
    indexes: [
      { fields: ['performed_by_id'] },
      { fields: ['target_user_id'] },
      { fields: ['entity', 'entity_id'] },
      { fields: ['action'] },
      { fields: ['category'] },
      { fields: ['created_at'] },
    ],
  });

  AuditLog.associate = function (models) {
    AuditLog.belongsTo(models.User, {
      foreignKey: 'performed_by_id',
      as: 'performedBy',
      onDelete: 'SET NULL',
    });
    AuditLog.belongsTo(models.User, {
      foreignKey: 'target_user_id',
      as: 'targetUser',
      onDelete: 'SET NULL',
    });
  };

  return AuditLog;
};
