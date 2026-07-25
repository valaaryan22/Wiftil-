'use strict';

// SubTask statuses: CREATED | ASSIGNED | LOCKED | AVAILABLE | IN_PROGRESS | SUBMITTED
//                  | TEAM_LEAD_REVIEW | TEAM_LEAD_APPROVED | TEAM_LEAD_REJECTED
//                  | MANAGER_REVIEW | FINAL_APPROVED | REOPENED
module.exports = (sequelize, DataTypes) => {
  const SubTask = sequelize.define('SubTask', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    taskId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'task_id',
      references: { model: 'tasks', key: 'id' },
    },
    docketId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'docket_id',
      references: { model: 'dockets', key: 'id' },
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    priority: {
      type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
      allowNull: false,
      defaultValue: 'MEDIUM',
    },
    status: {
      type: DataTypes.ENUM(
        'CREATED', 'ASSIGNED', 'LOCKED', 'AVAILABLE',
        'IN_PROGRESS', 'SUBMITTED', 'TEAM_LEAD_REVIEW',
        'TEAM_LEAD_APPROVED', 'TEAM_LEAD_REJECTED',
        'MANAGER_REVIEW', 'FINAL_APPROVED', 'REOPENED'
      ),
      allowNull: false,
      defaultValue: 'CREATED',
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'start_date',
    },
    dueDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'due_date',
    },
    estimatedHours: {
      type: DataTypes.FLOAT,
      allowNull: true,
      field: 'estimated_hours',
    },
    actualHours: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
      field: 'actual_hours',
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'started_at',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
    },
    submittedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'submitted_at',
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'created_by_id',
      references: { model: 'users', key: 'id' },
    },
    reviewedById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'reviewed_by_id',
      references: { model: 'users', key: 'id' },
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reviewed_at',
    },
    reviewComment: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'review_comment',
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
    tableName: 'sub_tasks',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['task_id'] },
      { fields: ['status'] },
      { fields: ['due_date'] },
      { fields: ['docket_id'] },
    ],
  });

  SubTask.associate = function (models) {
    SubTask.belongsTo(models.Task, {
      foreignKey: 'task_id',
      as: 'task',
      onDelete: 'CASCADE',
    });
    SubTask.belongsTo(models.Docket, {
      foreignKey: 'docket_id',
      as: 'docket',
    });
    SubTask.belongsTo(models.User, {
      foreignKey: 'created_by_id',
      as: 'createdBy',
    });
    SubTask.belongsTo(models.User, {
      foreignKey: 'reviewed_by_id',
      as: 'reviewedBy',
    });
    SubTask.hasMany(models.SubTaskAssignment, {
      foreignKey: 'sub_task_id',
      as: 'assignments',
      onDelete: 'CASCADE',
    });
    SubTask.hasMany(models.SubTaskDependency, {
      foreignKey: 'sub_task_id',
      as: 'dependencies',
      onDelete: 'CASCADE',
    });
    SubTask.hasMany(models.SubTaskDependency, {
      foreignKey: 'prerequisite_id',
      as: 'dependents',
      onDelete: 'CASCADE',
    });
    SubTask.hasMany(models.PerformanceRating, {
      foreignKey: 'sub_task_id',
      as: 'ratings',
      onDelete: 'CASCADE',
    });
    SubTask.hasMany(models.TaskComment, {
      foreignKey: 'sub_task_id',
      as: 'comments',
      onDelete: 'CASCADE',
    });
    SubTask.hasMany(models.TaskAttachment, {
      foreignKey: 'sub_task_id',
      as: 'attachments',
      onDelete: 'CASCADE',
    });
  };

  return SubTask;
};
