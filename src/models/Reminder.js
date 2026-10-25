'use strict';

module.exports = (sequelize, DataTypes) => {
  const Reminder = sequelize.define('Reminder', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Title / subject of the reminder',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Detailed notes or checklist',
    },
    remindAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'remind_at',
      comment: 'Date & time when the reminder triggers / is scheduled',
    },
    priority: {
      type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
      allowNull: false,
      defaultValue: 'MEDIUM',
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'COMPLETED', 'DISMISSED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    creatorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'creator_id',
      references: { model: 'users', key: 'id' },
      comment: 'User who created the reminder',
    },
    bossId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'boss_id',
      references: { model: 'users', key: 'id' },
      comment: 'Boss / Supervisor / Manager associated with this reminder',
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'GENERAL',
      comment: 'GENERAL | TASK_FOLLOWUP | MEETING | DEADLINE | CLIENT | PERSONAL',
    },
    entityType: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'entity_type',
      comment: 'Optional linked entity: Task, SubTask, Docket, Client, etc.',
    },
    entityId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'entity_id',
      comment: 'Optional ID of linked entity',
    },
    isAllDay: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_all_day',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
    },
  }, {
    tableName: 'reminders',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['creator_id'] },
      { fields: ['boss_id'] },
      { fields: ['remind_at'] },
      { fields: ['status'] },
      { fields: ['priority'] },
    ],
  });

  Reminder.associate = function (models) {
    Reminder.belongsTo(models.User, { foreignKey: 'creator_id', as: 'creator', onDelete: 'CASCADE' });
    Reminder.belongsTo(models.User, { foreignKey: 'boss_id', as: 'boss', onDelete: 'SET NULL' });
  };

  return Reminder;
};
