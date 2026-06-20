'use strict';

// Many-to-many: SubTask assigned to one or more Members with % contribution
module.exports = (sequelize, DataTypes) => {
  const SubTaskAssignment = sequelize.define('SubTaskAssignment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    subTaskId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'sub_task_id',
      references: { model: 'sub_tasks', key: 'id' },
    },
    memberId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'member_id',
      references: { model: 'users', key: 'id' },
    },
    contribution: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 100,
      comment: 'Percentage contribution (0-100)',
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
    tableName: 'sub_task_assignments',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['sub_task_id', 'member_id'] },
      { fields: ['sub_task_id'] },
      { fields: ['member_id'] },
    ],
  });

  SubTaskAssignment.associate = function (models) {
    SubTaskAssignment.belongsTo(models.SubTask, {
      foreignKey: 'sub_task_id',
      as: 'subTask',
      onDelete: 'CASCADE',
    });
    SubTaskAssignment.belongsTo(models.User, {
      foreignKey: 'member_id',
      as: 'member',
    });
    SubTaskAssignment.belongsTo(models.User, {
      foreignKey: 'assigned_by_id',
      as: 'assignedBy',
    });
  };

  return SubTaskAssignment;
};
