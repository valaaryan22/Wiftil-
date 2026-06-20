'use strict';

// File attachments on tasks or sub-tasks
module.exports = (sequelize, DataTypes) => {
  const TaskAttachment = sequelize.define('TaskAttachment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    taskId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'task_id',
      references: { model: 'tasks', key: 'id' },
    },
    subTaskId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'sub_task_id',
      references: { model: 'sub_tasks', key: 'id' },
    },
    uploadedById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'uploaded_by_id',
      references: { model: 'users', key: 'id' },
    },
    fileName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'file_name',
    },
    fileUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'file_url',
    },
    fileSize: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'file_size',
    },
    mimeType: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'mime_type',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
  }, {
    tableName: 'task_attachments',
    timestamps: false,
    indexes: [
      { fields: ['task_id'] },
      { fields: ['sub_task_id'] },
    ],
  });

  TaskAttachment.associate = function (models) {
    TaskAttachment.belongsTo(models.Task, {
      foreignKey: 'task_id',
      as: 'task',
      onDelete: 'CASCADE',
    });
    TaskAttachment.belongsTo(models.SubTask, {
      foreignKey: 'sub_task_id',
      as: 'subTask',
      onDelete: 'CASCADE',
    });
    TaskAttachment.belongsTo(models.User, {
      foreignKey: 'uploaded_by_id',
      as: 'uploadedBy',
    });
  };

  return TaskAttachment;
};
