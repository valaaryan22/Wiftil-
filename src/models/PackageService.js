'use strict';

/**
 * PackageService — Services included (or explicitly excluded) in a ClientPackage.
 *
 * frequency: MONTHLY | WEEKLY | ALWAYS_ON | ON_DEMAND | PER_CYCLE
 * isIncluded: true = included in package, false = not in this package (informational)
 */
module.exports = (sequelize, DataTypes) => {
  const PackageService = sequelize.define('PackageService', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    packageId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'package_id',
      references: { model: 'client_packages', key: 'id' },
    },
    serviceId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'service_id',
      references: { model: 'service_catalog', key: 'id' },
    },
    quantity: {
      // e.g. 12 (for 12 short videos per month)
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    scope: {
      // Human-readable scope string e.g. "24 creatives", "2 pages"
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    frequency: {
      type: DataTypes.ENUM('MONTHLY', 'WEEKLY', 'ALWAYS_ON', 'ON_DEMAND', 'PER_CYCLE'),
      allowNull: true,
      defaultValue: 'MONTHLY',
    },
    ownerLabel: {
      // Team or pod name that owns/delivers this service e.g. "Design Pod", "Web Pod", "Client IT"
      type: DataTypes.STRING(150),
      allowNull: true,
      field: 'owner_label',
    },
    isIncluded: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_included',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    tableName: 'package_services',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['package_id'] },
      { fields: ['service_id'] },
    ],
  });

  PackageService.associate = function (models) {
    PackageService.belongsTo(models.ClientPackage, {
      foreignKey: 'package_id',
      as: 'package',
    });
    PackageService.belongsTo(models.ServiceCatalog, {
      foreignKey: 'service_id',
      as: 'service',
    });
  };

  return PackageService;
};
