'use strict';

/**
 * VendorPerformance — Records delivery evaluation, timeline adherence, quality and reliability history.
 *
 * deliveryTimeline:
 *   EARLY | ON_TIME | SLIGHTLY_DELAYED | SEVERELY_DELAYED
 *
 * costAdherence:
 *   WITHIN_BUDGET | UNDER_BUDGET | OVER_BUDGET
 */
module.exports = (sequelize, DataTypes) => {
  const VendorPerformance = sequelize.define('VendorPerformance', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    vendorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'vendor_id',
      references: { model: 'vendors', key: 'id' },
    },
    projectName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'project_name',
    },
    taskId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'task_id',
      references: { model: 'tasks', key: 'id' },
    },
    docketId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'docket_id',
      references: { model: 'dockets', key: 'id' },
    },
    reviewTitle: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'review_title',
      comment: 'Summary of the work evaluated',
    },
    deliveryTimeline: {
      type: DataTypes.ENUM('EARLY', 'ON_TIME', 'SLIGHTLY_DELAYED', 'SEVERELY_DELAYED'),
      allowNull: false,
      defaultValue: 'ON_TIME',
      field: 'delivery_timeline',
    },
    qualityRating: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
      field: 'quality_rating',
      validate: { min: 1, max: 5 },
    },
    timelinessRating: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
      field: 'timeliness_rating',
      validate: { min: 1, max: 5 },
    },
    communicationRating: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
      field: 'communication_rating',
      validate: { min: 1, max: 5 },
    },
    costRating: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
      field: 'cost_rating',
      validate: { min: 1, max: 5 },
    },
    overallScore: {
      type: DataTypes.FLOAT,
      allowNull: false,
      field: 'overall_score',
      validate: { min: 1, max: 5 },
    },
    plannedDays: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'planned_days',
    },
    actualDays: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'actual_days',
    },
    costAdherence: {
      type: DataTypes.ENUM('WITHIN_BUDGET', 'UNDER_BUDGET', 'OVER_BUDGET'),
      allowNull: false,
      defaultValue: 'WITHIN_BUDGET',
      field: 'cost_adherence',
    },
    billedAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      field: 'billed_amount',
    },
    feedback: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    reviewedById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'reviewed_by_id',
      references: { model: 'users', key: 'id' },
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deleted_at',
    },
  }, {
    tableName: 'vendor_performances',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
  });

  VendorPerformance.associate = (models) => {
    VendorPerformance.belongsTo(models.Vendor, {
      as: 'vendor',
      foreignKey: 'vendorId',
    });

    VendorPerformance.belongsTo(models.User, {
      as: 'reviewer',
      foreignKey: 'reviewedById',
    });

    VendorPerformance.belongsTo(models.Task, {
      as: 'task',
      foreignKey: 'taskId',
    });

    VendorPerformance.belongsTo(models.Docket, {
      as: 'docket',
      foreignKey: 'docketId',
    });
  };

  return VendorPerformance;
};
