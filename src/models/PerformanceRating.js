'use strict';

// Performance rating — either:
//   SUBTASK : Manager rates a Member on a completed Sub-task  (5 criteria, each 1–10)
//   DIRECT  : Boss/Admin rates a Manager or Team Lead directly (no sub-task required)
module.exports = (sequelize, DataTypes) => {
  const PerformanceRating = sequelize.define('PerformanceRating', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    // NULL when ratingType = 'DIRECT'
    subTaskId: {
      type: DataTypes.UUID,
      allowNull: true,
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
    // 'SUBTASK' = Manager rates Member on a sub-task
    // 'DIRECT'  = Boss rates a Manager/TeamLead directly
    ratingType: {
      type: DataTypes.ENUM('SUBTASK', 'DIRECT'),
      allowNull: false,
      defaultValue: 'SUBTASK',
      field: 'rating_type',
    },
    // For DIRECT ratings: free-form period label e.g. "Q2 2026"
    periodLabel: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'period_label',
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
    // For SUBTASK ratings with multiple members: raw avg × (contribution / 100)
    // For SUBTASK ratings with a single member (100%): same as raw avg
    // For DIRECT ratings: straight average of the 5 criteria
    overall: {
      type: DataTypes.FLOAT,
      allowNull: false,
      comment: 'Weighted average: raw_avg × (contribution/100) for sub-task multi-member ratings',
    },
    // Member contribution % at time of rating (100 if sole member or DIRECT)
    contributionPct: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 100,
      field: 'contribution_pct',
      comment: 'SubTaskAssignment.contribution at rating time (always 100 for DIRECT)',
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
      // Unique: one rating per (subTask, ratedUser) — partial for SUBTASK type
      { fields: ['sub_task_id', 'rated_user_id'] },
      { fields: ['rated_user_id'] },
      { fields: ['sub_task_id'] },
      { fields: ['rating_type'] },
    ],
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
