'use strict';

// Dependency: subTaskId cannot start until prerequisiteId is FINAL_APPROVED
module.exports = (sequelize, DataTypes) => {
  const SubTaskDependency = sequelize.define('SubTaskDependency', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    subTaskId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'sub_task_id',
      comment: 'The blocked task',
      references: { model: 'sub_tasks', key: 'id' },
    },
    prerequisiteId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'prerequisite_id',
      comment: 'Must be approved first',
      references: { model: 'sub_tasks', key: 'id' },
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
  }, {
    tableName: 'sub_task_dependencies',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['sub_task_id', 'prerequisite_id'] },
    ],
  });

  SubTaskDependency.associate = function (models) {
    SubTaskDependency.belongsTo(models.SubTask, {
      foreignKey: 'sub_task_id',
      as: 'subTask',
      onDelete: 'CASCADE',
    });
    SubTaskDependency.belongsTo(models.SubTask, {
      foreignKey: 'prerequisite_id',
      as: 'prerequisite',
      onDelete: 'CASCADE',
    });
  };

  return SubTaskDependency;
};
