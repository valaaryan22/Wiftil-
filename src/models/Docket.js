'use strict';

/**
 * Docket — A project/engagement container linked to a client.
 *
 * docketType:   RETAINER | PROJECT | AD_HOC | INTERNAL
 * status:       PLANNING | ACTIVE | ON_HOLD | COMPLETED | CANCELLED
 * isTicketBased: true  → work is tracked via DocketTickets
 *                false → work is tracked via the existing Task system
 *
 * Docket code is auto-generated: DK-YYYYMMDD-XXXX
 */
module.exports = (sequelize, DataTypes) => {
  const Docket = sequelize.define('Docket', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    docketCode: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      field: 'docket_code',
    },
    clientId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'client_id',
      references: { model: 'clients', key: 'id' },
    },
    packageId: {
      // Optional — docket may exist outside any package
      type: DataTypes.UUID,
      allowNull: true,
      field: 'package_id',
      references: { model: 'client_packages', key: 'id' },
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    docketType: {
      type: DataTypes.ENUM('RETAINER', 'PROJECT', 'AD_HOC', 'INTERNAL'),
      allowNull: false,
      defaultValue: 'PROJECT',
      field: 'docket_type',
    },
    isTicketBased: {
      // true  → use DocketTicket system
      // false → use existing Task system
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_ticket_based',
    },
    status: {
      type: DataTypes.ENUM('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'PLANNING',
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'start_date',
    },
    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'end_date',
    },
    assignedManagerId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'assigned_manager_id',
      references: { model: 'users', key: 'id' },
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
    tableName: 'dockets',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    indexes: [
      { fields: ['client_id'] },
      { fields: ['package_id'] },
      { fields: ['status'] },
      { fields: ['is_ticket_based'] },
    ],
    hooks: {
      beforeValidate: async (docket) => {
        if (!docket.docketCode) {
          const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
          docket.docketCode = `DK-${dateStr}-${randomStr}`;
        }
      },
    },
  });

  Docket.associate = function (models) {
    Docket.belongsTo(models.Client, {
      foreignKey: 'client_id',
      as: 'client',
    });
    Docket.belongsTo(models.ClientPackage, {
      foreignKey: 'package_id',
      as: 'package',
    });
    Docket.belongsTo(models.User, {
      foreignKey: 'assigned_manager_id',
      as: 'assignedManager',
    });
    Docket.belongsTo(models.User, {
      foreignKey: 'created_by_id',
      as: 'createdBy',
    });
    Docket.hasMany(models.DocketTicket, {
      foreignKey: 'docket_id',
      as: 'tickets',
      onDelete: 'CASCADE',
    });
    Docket.hasMany(models.PackageAddOn, {
      foreignKey: 'docket_id',
      as: 'addOns',
    });
  };

  return Docket;
};
