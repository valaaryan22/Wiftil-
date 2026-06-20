'use strict';

// Notification types: TASK_ASSIGNED | TASK_ACCEPTED | TASK_REJECTED | TASK_SUBMITTED
//                   | TASK_APPROVED | TASK_REOPENED | TASK_DUE_SOON | TASK_OVERDUE
//                   | SUBTASK_ASSIGNED | SUBTASK_SUBMITTED | SUBTASK_APPROVED
//                   | SUBTASK_REJECTED | DEPENDENCY_UNLOCKED | RATING_SUBMITTED | MENTION
module.exports = (sequelize, DataTypes) => {
  const Notification = sequelize.define('Notification', {
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
    type: {
      type: DataTypes.ENUM(
        'TASK_ASSIGNED', 'TASK_ACCEPTED', 'TASK_REJECTED', 'TASK_SUBMITTED',
        'TASK_APPROVED', 'TASK_REOPENED', 'TASK_DUE_SOON', 'TASK_OVERDUE',
        'SUBTASK_ASSIGNED', 'SUBTASK_SUBMITTED', 'SUBTASK_APPROVED',
        'SUBTASK_REJECTED', 'DEPENDENCY_UNLOCKED', 'RATING_SUBMITTED', 'MENTION'
      ),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    entityType: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'entity_type',
      comment: '"Task" | "SubTask"',
    },
    entityId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'entity_id',
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_read',
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'read_at',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
  }, {
    tableName: 'notifications',
    timestamps: false,
    indexes: [
      { fields: ['user_id', 'is_read'] },
      { fields: ['created_at'] },
    ],
  });

  Notification.associate = function (models) {
    Notification.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE',
    });
  };

  return Notification;
};
