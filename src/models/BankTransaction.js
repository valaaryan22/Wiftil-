'use strict';

/**
 * BankTransaction — Every debit/credit entry in a bank account's ledger.
 * This is the cashbook line item — each transaction updates BankAccount.currentBalance.
 *
 * transactionType:
 *   CREDIT — Money coming in (payment received, advance, etc.)
 *   DEBIT  — Money going out (expense, salary, vendor payment, etc.)
 *
 * source — Where did this transaction originate?
 *   INVOICE_PAYMENT  — From a client payment recorded
 *   EXPENSE          — From an expense record
 *   PAYROLL          — From a payroll run
 *   ADVANCE          — Client advance received
 *   MANUAL           — Manually entered by accountant
 *   TRANSFER         — Account-to-account transfer
 *   ADJUSTMENT       — Balance correction
 */
module.exports = (sequelize, DataTypes) => {
  const BankTransaction = sequelize.define('BankTransaction', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    // ── Foreign Keys ──────────────────────────────────────────────────────────
    bankAccountId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'bank_account_id',
      references: { model: 'bank_accounts', key: 'id' },
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'created_by_id',
      references: { model: 'users', key: 'id' },
    },

    // ── Source Linkage (polymorphic) ──────────────────────────────────────────
    source: {
      type: DataTypes.ENUM(
        'INVOICE_PAYMENT', 'EXPENSE', 'PAYROLL',
        'ADVANCE', 'MANUAL', 'TRANSFER', 'ADJUSTMENT'
      ),
      allowNull: false,
      defaultValue: 'MANUAL',
    },
    sourceId: {
      // UUID of the source record (ClientPayment.id, Expense.id, etc.)
      type: DataTypes.UUID,
      allowNull: true,
      field: 'source_id',
      comment: 'FK to source record (ClientPayment, Expense, etc.) — polymorphic',
    },

    // ── Transaction Details ───────────────────────────────────────────────────
    transactionType: {
      type: DataTypes.ENUM('CREDIT', 'DEBIT'),
      allowNull: false,
      field: 'transaction_type',
    },
    amount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      comment: 'Absolute transaction amount (always positive)',
    },
    runningBalance: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      field: 'running_balance',
      comment: 'Account balance AFTER this transaction',
    },
    currency: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'INR',
    },
    transactionDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'transaction_date',
    },
    paymentMode: {
      type: DataTypes.ENUM(
        'BANK_TRANSFER', 'UPI', 'CHEQUE', 'CASH',
        'CARD', 'NEFT', 'RTGS', 'IMPS', 'OTHER'
      ),
      allowNull: true,
      field: 'payment_mode',
    },
    referenceNumber: {
      // UTR / Cheque number / UPI ref / Transaction ID
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'reference_number',
    },

    // ── Description ───────────────────────────────────────────────────────────
    purpose: {
      // Short label: "Payment received from ABC Pvt Ltd", "Office rent - Aug"
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    narration: {
      // Long description / bank statement narration
      type: DataTypes.TEXT,
      allowNull: true,
    },
    clientId: {
      // Optional: which client this credit/debit relates to (for reporting)
      type: DataTypes.UUID,
      allowNull: true,
      field: 'client_id',
      references: { model: 'clients', key: 'id' },
    },

    // ── Reconciliation ────────────────────────────────────────────────────────
    isReconciled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_reconciled',
    },
    reconciledAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reconciled_at',
    },
  }, {
    tableName: 'bank_transactions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['bank_account_id'] },
      { fields: ['transaction_date'] },
      { fields: ['source'] },
      { fields: ['source_id'] },
      { fields: ['client_id'] },
      { fields: ['transaction_type'] },
    ],
  });

  BankTransaction.associate = function (models) {
    BankTransaction.belongsTo(models.BankAccount, {
      foreignKey: 'bank_account_id',
      as: 'bankAccount',
    });
    BankTransaction.belongsTo(models.User, {
      foreignKey: 'created_by_id',
      as: 'createdBy',
    });
    BankTransaction.belongsTo(models.Client, {
      foreignKey: 'client_id',
      as: 'client',
    });
  };

  return BankTransaction;
};
