'use strict';

// Comments on tasks or sub-tasks with @mention support (mentions stored as JSON string)
module.exports = (sequelize, DataTypes) => {
  const TaskComment = sequelize.define('TaskComment', {
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
    authorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'author_id',
      references: { model: 'users', key: 'id' },
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    mentions: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
      comment: 'Array of user IDs @mentioned in this comment',
    },
    editedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'edited_at',
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
    tableName: 'task_comments',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['task_id'] },
      { fields: ['sub_task_id'] },
    ],
  });

  TaskComment.associate = function (models) {
    TaskComment.belongsTo(models.Task, {
      foreignKey: 'task_id',
      as: 'task',
      onDelete: 'CASCADE',
    });
    TaskComment.belongsTo(models.SubTask, {
      foreignKey: 'sub_task_id',
      as: 'subTask',
      onDelete: 'CASCADE',
    });
    TaskComment.belongsTo(models.User, {
      foreignKey: 'author_id',
      as: 'author',
    });
  };

  return TaskComment;
};
