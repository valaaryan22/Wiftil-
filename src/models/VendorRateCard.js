'use strict';

/**
 * VendorRateCard — Master service rates and package pricing for external vendors / collaborators.
 *
 * pricingModel:
 *   PER_UNIT    — Per item/asset (e.g. per reel, per banner)
 *   PER_HOUR    — Hourly rate
 *   PER_DAY     — Day rate / shoot rate
 *   PER_MONTH   — Monthly recurring retainer
 *   PER_PROJECT — Entire project fixed price
 *   FIXED       — Fixed cost deliverable
 */
module.exports = (sequelize, DataTypes) => {
  const VendorRateCard = sequelize.define('VendorRateCard', {
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
    serviceTitle: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'service_title',
      comment: 'e.g. 30s Short-Form Video Editing, UI/UX Wireframing',
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'e.g. Video, Design, Copywriting, Web Development',
    },
    pricingModel: {
      type: DataTypes.ENUM('PER_UNIT', 'PER_HOUR', 'PER_DAY', 'PER_MONTH', 'PER_PROJECT', 'FIXED'),
      allowNull: false,
      defaultValue: 'PER_UNIT',
      field: 'pricing_model',
    },
    baseRate: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      field: 'base_rate',
    },
    currency: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'INR',
    },
    minTurnaroundTime: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'min_turnaround_time',
      comment: 'e.g. 24 Hours, 3 Days, 1 Week',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Deliverable details, number of revisions included, specific tool requirements',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by_id',
      references: { model: 'users', key: 'id' },
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deleted_at',
    },
  }, {
    tableName: 'vendor_rate_cards',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
  });

  VendorRateCard.associate = (models) => {
    VendorRateCard.belongsTo(models.Vendor, {
      as: 'vendor',
      foreignKey: 'vendorId',
    });

    VendorRateCard.belongsTo(models.User, {
      as: 'creator',
      foreignKey: 'createdById',
    });
  };

  return VendorRateCard;
};
