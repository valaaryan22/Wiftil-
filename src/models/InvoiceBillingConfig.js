'use strict';

/**
 * InvoiceBillingConfig — Per-client recurring billing configuration.
 *
 * This stores when and how often to auto-generate invoices for a client.
 * The scheduler/trigger reads this table and creates DRAFT invoices on due dates.
 *
 * billingFrequency:
 *   MONTHLY   — Generate every month on billingDay
 *   QUARTERLY — Generate every 3 months on billingDay
 *   ANNUAL    — Generate once a year on billingDay
 */
module.exports = (sequelize, DataTypes) => {
  const InvoiceBillingConfig = sequelize.define('InvoiceBillingConfig', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    clientId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true, // One config per client
      field: 'client_id',
      references: { model: 'clients', key: 'id' },
    },
    packageId: {
      // Default package to bill (can be overridden during generation)
      type: DataTypes.UUID,
      allowNull: true,
      field: 'package_id',
      references: { model: 'client_packages', key: 'id' },
    },

    // ── Billing Schedule ──────────────────────────────────────────────────────
    billingDay: {
      // Day of month to generate invoice: 1-28 (safe for all months)
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'billing_day',
      validate: { min: 1, max: 28 },
      comment: 'Day of month for invoice generation (1-28)',
    },
    billingFrequency: {
      type: DataTypes.ENUM('MONTHLY', 'QUARTERLY', 'ANNUAL'),
      allowNull: false,
      defaultValue: 'MONTHLY',
      field: 'billing_frequency',
    },
    isAutoGenerate: {
      // If false, the system only reminds — doesn't create drafts automatically
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_auto_generate',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },

    // ── Tracking ──────────────────────────────────────────────────────────────
    lastGeneratedAt: {
      // Timestamp of last auto-invoice generation
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_generated_at',
    },
    nextDueAt: {
      // Computed next invoice generation date
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'next_due_at',
    },

    // ── Invoice Defaults ──────────────────────────────────────────────────────
    defaultTaxRate: {
      // GST % to apply on auto-generated invoices
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      field: 'default_tax_rate',
      comment: 'Default GST/tax rate for auto-generated invoices e.g. 18.00',
    },
    defaultDueDays: {
      // How many days after invoice date is payment due?
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 15,
      field: 'default_due_days',
      comment: 'Payment due = invoiceDate + defaultDueDays',
    },
    includeAddOns: {
      // Auto-include approved+delivered add-ons in the invoice
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'include_add_ons',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Default notes/description for auto-generated invoices',
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'created_by_id',
      references: { model: 'users', key: 'id' },
    },
  }, {
    tableName: 'invoice_billing_configs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['client_id'] },
      { fields: ['is_active'] },
      { fields: ['next_due_at'] },
      { fields: ['billing_day'] },
    ],
  });

  InvoiceBillingConfig.associate = function (models) {
    InvoiceBillingConfig.belongsTo(models.Client, {
      foreignKey: 'client_id',
      as: 'client',
    });
    InvoiceBillingConfig.belongsTo(models.ClientPackage, {
      foreignKey: 'package_id',
      as: 'package',
    });
    InvoiceBillingConfig.belongsTo(models.User, {
      foreignKey: 'created_by_id',
      as: 'createdBy',
    });
  };

  return InvoiceBillingConfig;
};
