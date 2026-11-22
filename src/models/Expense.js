'use strict';

/**
 * Expense — Records every operational/business expense.
 *
 * status:
 *   DRAFT     — Being entered, not yet submitted
 *   SUBMITTED — Submitted for review/approval
 *   APPROVED  — Approved by manager
 *   REJECTED  — Rejected
 *   PAID      — Payment has been made/confirmed
 *
 * paymentMode:
 *   BANK_TRANSFER | UPI | CASH | CHEQUE | CARD | OTHER
 */
module.exports = (sequelize, DataTypes) => {
  const Expense = sequelize.define('Expense', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    // ── Foreign Keys ──────────────────────────────────────────────────────────
    clientId: {
      // Optional: link expense to a client (billable expense)
      type: DataTypes.UUID,
      allowNull: true,
      field: 'client_id',
      references: { model: 'clients', key: 'id' },
      comment: 'If expense is billable to a specific client',
    },
    categoryId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'category_id',
      references: { model: 'expense_categories', key: 'id' },
    },
    bankAccountId: {
      // Which bank/cash account was debited
      type: DataTypes.UUID,
      allowNull: true,
      field: 'bank_account_id',
      references: { model: 'bank_accounts', key: 'id' },
    },
    recordedById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'recorded_by_id',
      references: { model: 'users', key: 'id' },
    },
    approvedById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'approved_by_id',
      references: { model: 'users', key: 'id' },
    },

    // ── Identifiers ───────────────────────────────────────────────────────────
    expenseNumber: {
      // Auto-generated: EXP-202508-A3F9
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
      field: 'expense_number',
    },

    // ── Details ───────────────────────────────────────────────────────────────
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    vendorName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'vendor_name',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isBillable: {
      // Is this expense billable to the client?
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_billable',
    },

    // ── Classification ────────────────────────────────────────────────────────
    status: {
      type: DataTypes.ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID'),
      allowNull: false,
      defaultValue: 'DRAFT',
    },
    paymentMode: {
      type: DataTypes.ENUM('BANK_TRANSFER', 'UPI', 'CASH', 'CHEQUE', 'CARD', 'OTHER'),
      allowNull: true,
      field: 'payment_mode',
    },

    // ── Amounts ───────────────────────────────────────────────────────────────
    currency: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'INR',
    },
    amount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      comment: 'Pre-tax amount',
    },
    taxAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'tax_amount',
    },
    taxRate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      field: 'tax_rate',
      comment: 'GST / tax % e.g. 18.00',
    },
    totalAmount: {
      // amount + taxAmount (computed & stored)
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'total_amount',
    },

    // ── Dates ─────────────────────────────────────────────────────────────────
    expenseDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'expense_date',
      comment: 'Date the expense was incurred',
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'approved_at',
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'rejection_reason',
    },

    // ── References & Attachments ──────────────────────────────────────────────
    referenceNumber: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'reference_number',
      comment: 'Receipt number / invoice number from vendor',
    },
    attachments: {
      // Array of { fileName, filePath }
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Receipt / bill attachments',
    },
    internalNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'internal_notes',
    },

    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deleted_at',
    },
  }, {
    tableName: 'expenses',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    indexes: [
      { fields: ['client_id'] },
      { fields: ['category_id'] },
      { fields: ['status'] },
      { fields: ['expense_date'] },
      { fields: ['recorded_by_id'] },
    ],
    hooks: {
      beforeValidate: (expense) => {
        // Auto-generate expense number
        if (!expense.expenseNumber) {
          const ym = new Date().toISOString().slice(0, 7).replace('-', '');
          const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
          expense.expenseNumber = `EXP-${ym}-${rand}`;
        }
        // Auto-compute totalAmount
        const base = parseFloat(expense.amount || 0);
        const tax  = parseFloat(expense.taxAmount || 0);
        expense.totalAmount = parseFloat((base + tax).toFixed(2));
      },
    },
  });

  Expense.associate = function (models) {
    Expense.belongsTo(models.Client, {
      foreignKey: 'client_id',
      as: 'client',
    });
    Expense.belongsTo(models.ExpenseCategory, {
      foreignKey: 'category_id',
      as: 'category',
    });
    Expense.belongsTo(models.BankAccount, {
      foreignKey: 'bank_account_id',
      as: 'bankAccount',
    });
    Expense.belongsTo(models.User, {
      foreignKey: 'recorded_by_id',
      as: 'recordedBy',
    });
    Expense.belongsTo(models.User, {
      foreignKey: 'approved_by_id',
      as: 'approvedBy',
    });
  };

  return Expense;
};
