'use strict';

/**
 * ClientPackage — A retainer plan sold to a client on a billing cycle.
 *
 * packageType:  BASIC | STANDARD | PREMIUM | CUSTOM
 * billingCycle: MONTHLY | QUARTERLY | ANNUAL
 * status:       ACTIVE | PAUSED | CANCELLED | EXPIRED
 *
 * Pricing Model:
 *   basePrice is a CALCULATED SNAPSHOT — it is NOT entered manually.
 *   It is auto-updated by the service layer whenever PackageService rows
 *   (the services linked to this package) are created, updated, or deleted.
 *   Formula: SUM( quantity × effectiveUnitPrice ) for all isIncluded=true services,
 *   where effectiveUnitPrice = PackageService.unitPrice ?? ServiceCatalog.defaultPrice.
 */
module.exports = (sequelize, DataTypes) => {
  const ClientPackage = sequelize.define('ClientPackage', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    clientId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'client_id',
      references: { model: 'clients', key: 'id' },
    },
    name: {
      // e.g. "Premium Growth Partner Retainer"
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    packageType: {
      type: DataTypes.ENUM('BASIC', 'STANDARD', 'PREMIUM', 'CUSTOM'),
      allowNull: false,
      defaultValue: 'CUSTOM',
      field: 'package_type',
    },
    billingCycle: {
      type: DataTypes.ENUM('MONTHLY', 'QUARTERLY', 'ANNUAL'),
      allowNull: false,
      defaultValue: 'MONTHLY',
      field: 'billing_cycle',
    },
    basePrice: {
      // AUTO-CALCULATED SNAPSHOT — do NOT accept from user input.
      // Recalculated by _recalcPackageBasePrice() whenever services change.
      // = SUM( quantity × effectiveUnitPrice ) for all isIncluded=true PackageService rows.
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'base_price',
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'start_date',
    },
    endDate: {
      // null = ongoing retainer
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'end_date',
    },
    renewalDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'renewal_date',
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    whatWeDo: {
      // HTML string from rich text editor (TipTap / React-Quill)
      // e.g. "<p>Plan monthly campaigns...</p><p>Produce creative assets...</p>"
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'what_we_do',
    },
    whatWeDoNot: {
      // HTML string from rich text editor
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'what_we_do_not',
    },
    moderationScope: {
      // HTML string from rich text editor — displayed as a formatted table/list
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'moderation_scope',
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'created_by_id',
      references: { model: 'users', key: 'id' },
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deleted_at',
    },
  }, {
    tableName: 'client_packages',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    indexes: [
      { fields: ['client_id'] },
      { fields: ['status'] },
    ],
  });

  ClientPackage.associate = function (models) {
    ClientPackage.belongsTo(models.Client, {
      foreignKey: 'client_id',
      as: 'client',
    });
    ClientPackage.belongsTo(models.User, {
      foreignKey: 'created_by_id',
      as: 'createdBy',
    });
    ClientPackage.hasMany(models.PackageService, {
      foreignKey: 'package_id',
      as: 'services',
      onDelete: 'CASCADE',
    });
    ClientPackage.hasMany(models.PackageAddOn, {
      foreignKey: 'package_id',
      as: 'addOns',
      onDelete: 'CASCADE',
    });
    ClientPackage.hasMany(models.Docket, {
      foreignKey: 'package_id',
      as: 'dockets',
    });
  };

  return ClientPackage;
};
