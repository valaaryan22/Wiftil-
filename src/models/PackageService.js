'use strict';

/**
 * PackageService — Services included (or explicitly excluded) in a ClientPackage.
 *
 * frequency: MONTHLY | WEEKLY | ALWAYS_ON | ON_DEMAND | PER_CYCLE
 * isIncluded: true = included in package, false = not in this package (informational)
 *
 * Pricing:
 *   unitPrice  — overrides ServiceCatalog.defaultPrice for this specific package line (optional).
 *   lineTotal  — VIRTUAL: quantity × unitPrice (not stored, computed at read time).
 *   The package's basePrice snapshot is recalculated by the service layer whenever
 *   PackageService rows are created, updated, or deleted.
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
    unitPrice: {
      // Overrides ServiceCatalog.defaultPrice for this package line.
      // If null, the service's defaultPrice is used for basePrice calculation.
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      field: 'unit_price',
    },
    lineTotal: {
      // VIRTUAL — quantity × unitPrice (or ServiceCatalog.defaultPrice if unitPrice is null)
      // Not stored in DB; resolved by the service layer / application code.
      type: DataTypes.VIRTUAL,
      get() {
        const qty = this.getDataValue('quantity') || 0;
        const price = parseFloat(this.getDataValue('unitPrice') || 0);
        return parseFloat((qty * price).toFixed(2));
      },
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
