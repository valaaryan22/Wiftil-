'use strict';

// Performance rating — Manager rates Member(s) on a completed Sub-task (5 criteria, each 1–10)
module.exports = (sequelize, DataTypes) => {
  const PerformanceRating = sequelize.define('PerformanceRating', {
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
    ratedUserId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'rated_user_id',
      references: { model: 'users', key: 'id' },
    },
    ratedById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'rated_by_id',
      references: { model: 'users', key: 'id' },
    },
    quality: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1, max: 10 },
    },
    timeliness: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1, max: 10 },
    },
    communication: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1, max: 10 },
    },
    accuracy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1, max: 10 },
    },
    ownership: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1, max: 10 },
    },
    overall: {
      type: DataTypes.FLOAT,
      allowNull: false,
      comment: 'Auto-calculated average of the 5 criteria',
    },
    comments: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ratedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'rated_at',
    },
  }, {
    tableName: 'performance_ratings',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['sub_task_id', 'rated_user_id'] },
      { fields: ['rated_user_id'] },
      { fields: ['sub_task_id'] },
    ],
    hooks: {
      beforeCreate: (rating) => {
        const { quality, timeliness, communication, accuracy, ownership } = rating;
        rating.overall = parseFloat(
          ((quality + timeliness + communication + accuracy + ownership) / 5).toFixed(2)
        );
      },
      beforeUpdate: (rating) => {
        const { quality, timeliness, communication, accuracy, ownership } = rating;
        rating.overall = parseFloat(
          ((quality + timeliness + communication + accuracy + ownership) / 5).toFixed(2)
        );
      },
    },
  });

  PerformanceRating.associate = function (models) {
    PerformanceRating.belongsTo(models.SubTask, {
      foreignKey: 'sub_task_id',
      as: 'subTask',
      onDelete: 'CASCADE',
    });
    PerformanceRating.belongsTo(models.User, {
      foreignKey: 'rated_user_id',
      as: 'ratedUser',
    });
    PerformanceRating.belongsTo(models.User, {
      foreignKey: 'rated_by_id',
      as: 'ratedBy',
    });
  };

  return PerformanceRating;
};
