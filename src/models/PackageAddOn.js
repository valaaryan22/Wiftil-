'use strict';

/**
 * PackageAddOn — Extra services requested by a client on top of their base package.
 *
 * Flow: REQUESTED → APPROVED / REJECTED → DELIVERED → BILLED
 *
 * Either serviceId (from catalog) OR customDescription is used.
 * docketId links this add-on to the docket that triggered it (optional).
 */
module.exports = (sequelize, DataTypes) => {
  const PackageAddOn = sequelize.define('PackageAddOn', {
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
      // Null if it's a fully custom add-on not in the catalog
      type: DataTypes.UUID,
      allowNull: true,
      field: 'service_id',
      references: { model: 'service_catalog', key: 'id' },
    },
    docketId: {
      // Which docket raised this add-on (optional)
      type: DataTypes.UUID,
      allowNull: true,
      field: 'docket_id',
      references: { model: 'dockets', key: 'id' },
    },
    customDescription: {
      // Used when serviceId is null (fully bespoke add-on)
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'custom_description',
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 1,
    },
    unitPrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      field: 'unit_price',
    },
    totalPrice: {
      // Calculated: quantity * unitPrice (or overridden manually)
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      field: 'total_price',
    },
    status: {
      type: DataTypes.ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'DELIVERED', 'BILLED'),
      allowNull: false,
      defaultValue: 'REQUESTED',
    },
    requestedAt: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'requested_at',
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'approved_at',
    },
    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'delivered_at',
    },
    billedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'billed_at',
    },
    requestedById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'requested_by_id',
      references: { model: 'users', key: 'id' },
    },
    approvedById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'approved_by_id',
      references: { model: 'users', key: 'id' },
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'rejection_reason',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    tableName: 'package_add_ons',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['package_id'] },
      { fields: ['status'] },
      { fields: ['docket_id'] },
    ],
  });

  PackageAddOn.associate = function (models) {
    PackageAddOn.belongsTo(models.ClientPackage, {
      foreignKey: 'package_id',
      as: 'package',
    });
    PackageAddOn.belongsTo(models.ServiceCatalog, {
      foreignKey: 'service_id',
      as: 'service',
    });
    PackageAddOn.belongsTo(models.Docket, {
      foreignKey: 'docket_id',
      as: 'docket',
    });
    PackageAddOn.belongsTo(models.User, {
      foreignKey: 'requested_by_id',
      as: 'requestedBy',
    });
    PackageAddOn.belongsTo(models.User, {
      foreignKey: 'approved_by_id',
      as: 'approvedBy',
    });
    PackageAddOn.hasMany(models.DocketTicket, {
      foreignKey: 'add_on_id',
      as: 'tickets',
    });
  };

  return PackageAddOn;
};
