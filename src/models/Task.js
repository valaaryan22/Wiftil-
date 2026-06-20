'use strict';

// Task priorities: LOW | MEDIUM | HIGH | CRITICAL
// Task statuses: CREATED | ASSIGNED | ACCEPTED | REJECTED | IN_PROGRESS | SUBMITTED | MANAGER_REVIEW | MANAGER_APPROVED | COMPLETED | REOPENED
module.exports = (sequelize, DataTypes) => {
  const Task = sequelize.define('Task', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
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
        'CREATED', 'ASSIGNED', 'ACCEPTED', 'REJECTED',
        'IN_PROGRESS', 'SUBMITTED', 'MANAGER_REVIEW',
        'MANAGER_APPROVED', 'COMPLETED', 'REOPENED'
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
    completionPercent: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
      field: 'completion_percent',
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'created_by_id',
      references: { model: 'users', key: 'id' },
    },
    managerId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'manager_id',
      references: { model: 'users', key: 'id' },
    },
    managerRemark: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'manager_remark',
    },
    managerActionAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'manager_action_at',
    },
    submittedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'submitted_at',
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'approved_at',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deleted_at',
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
    tableName: 'tasks',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['status'] },
      { fields: ['manager_id'] },
      { fields: ['created_by_id'] },
      { fields: ['due_date'] },
    ],
  });

  Task.associate = function (models) {
    Task.belongsTo(models.User, {
      foreignKey: 'created_by_id',
      as: 'createdBy',
    });
    Task.belongsTo(models.User, {
      foreignKey: 'manager_id',
      as: 'manager',
    });
    Task.hasMany(models.TaskAssignment, {
      foreignKey: 'task_id',
      as: 'assignments',
      onDelete: 'CASCADE',
    });
    Task.hasMany(models.SubTask, {
      foreignKey: 'task_id',
      as: 'subTasks',
      onDelete: 'CASCADE',
    });
    Task.hasMany(models.TaskComment, {
      foreignKey: 'task_id',
      as: 'comments',
      onDelete: 'CASCADE',
    });
    Task.hasMany(models.TaskAttachment, {
      foreignKey: 'task_id',
      as: 'attachments',
      onDelete: 'CASCADE',
    });
  };

  return Task;
};
