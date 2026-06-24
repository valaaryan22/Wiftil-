'use strict';

// Many-to-many: Task assigned to one or more Team Leads by Manager
module.exports = (sequelize, DataTypes) => {
  const TaskAssignment = sequelize.define('TaskAssignment', {
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
    teamLeadId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'team_lead_id',
      references: { model: 'users', key: 'id' },
    },
    assignedById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'assigned_by_id',
      references: { model: 'users', key: 'id' },
    },
    assignedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'assigned_at',
    },
  }, {
    tableName: 'task_assignments',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['task_id', 'team_lead_id'] },
      { fields: ['task_id'] },
      { fields: ['team_lead_id'] },
    ],
  });

  TaskAssignment.associate = function (models) {
    TaskAssignment.belongsTo(models.Task, {
      foreignKey: 'task_id',
      as: 'task',
      onDelete: 'CASCADE',
    });
    TaskAssignment.belongsTo(models.User, {
      foreignKey: 'team_lead_id',
      as: 'teamLead',
    });
    TaskAssignment.belongsTo(models.User, {
      foreignKey: 'assigned_by_id',
      as: 'assignedBy',
    });
  };

  return TaskAssignment;
};
