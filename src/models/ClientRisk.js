'use strict';

/**
 * ClientRisk — Tracks risks associated with a client.
 * Used in the "Risk & Billing Watch" section of the Client Overview.
 *
 * severity:  info | warning | danger
 * category:  BILLING | OPERATIONAL | RELATIONSHIP | DELIVERY | OTHER
 */
module.exports = (sequelize, DataTypes) => {
  const ClientRisk = sequelize.define('ClientRisk', {
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
    createdById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'created_by_id',
      references: { model: 'users', key: 'id' },
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Short title of the risk e.g. "Founder-led approval bottleneck"',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Detailed description of the risk',
    },
    severity: {
      type: DataTypes.ENUM('info', 'warning', 'danger'),
      allowNull: false,
      defaultValue: 'warning',
      comment: 'Visual severity level shown in the UI',
    },
    category: {
      type: DataTypes.ENUM('BILLING', 'OPERATIONAL', 'RELATIONSHIP', 'DELIVERY', 'OTHER'),
      allowNull: false,
      defaultValue: 'OTHER',
      comment: 'Category of risk for filtering',
    },
    isResolved: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_resolved',
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'resolved_at',
    },
    resolvedById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'resolved_by_id',
      references: { model: 'users', key: 'id' },
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deleted_at',
    },
  }, {
    tableName: 'client_risks',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    indexes: [
      { fields: ['client_id'] },
      { fields: ['severity'] },
      { fields: ['is_resolved'] },
      { fields: ['category'] },
    ],
  });

  ClientRisk.associate = function (models) {
    ClientRisk.belongsTo(models.Client, {
      foreignKey: 'client_id',
      as: 'client',
    });
    ClientRisk.belongsTo(models.User, {
      foreignKey: 'created_by_id',
      as: 'createdBy',
    });
    ClientRisk.belongsTo(models.User, {
      foreignKey: 'resolved_by_id',
      as: 'resolvedBy',
    });
  };

  return ClientRisk;
};
