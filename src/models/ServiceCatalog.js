'use strict';

/**
 * ServiceCatalog — Master list of all services the agency can deliver.
 * Services are referenced by PackageService (included in a package)
 * and PackageAddOn (charged on top of a package).
 *
 * Categories: DESIGN | MARKETING | ADVERTISING | TECHNICAL | CONTENT | OTHER
 */
module.exports = (sequelize, DataTypes) => {
  const ServiceCatalog = sequelize.define('ServiceCatalog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    category: {
      type: DataTypes.ENUM('DESIGN', 'MARKETING', 'ADVERTISING', 'TECHNICAL', 'CONTENT', 'OTHER'),
      allowNull: false,
      defaultValue: 'OTHER',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    unit: {
      // e.g. "per video", "per page", "per month", "per campaign"
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    defaultPrice: {
      // Standard price for this service (can be overridden in PackageAddOn)
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      field: 'default_price',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'created_by_id',
      references: { model: 'users', key: 'id' },
    },
  }, {
    tableName: 'service_catalog',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['category'] },
      { fields: ['is_active'] },
    ],
  });

  ServiceCatalog.associate = function (models) {
    ServiceCatalog.belongsTo(models.User, {
      foreignKey: 'created_by_id',
      as: 'createdBy',
    });
    ServiceCatalog.hasMany(models.PackageService, {
      foreignKey: 'service_id',
      as: 'packageInclusions',
    });
    ServiceCatalog.hasMany(models.PackageAddOn, {
      foreignKey: 'service_id',
      as: 'addOnUsages',
    });
    ServiceCatalog.hasMany(models.DocketTicket, {
      foreignKey: 'service_id',
      as: 'tickets',
    });
  };

  return ServiceCatalog;
};
