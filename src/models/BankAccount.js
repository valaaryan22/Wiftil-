'use strict';

/**
 * BankAccount — Represents a company bank account, cash account, or digital wallet.
 *
 * accountType:
 *   SAVINGS        — Savings bank account
 *   CURRENT        — Current / business account
 *   CASH           — Physical cash ledger
 *   DIGITAL_WALLET — UPI wallet, Paytm, etc.
 *   CREDIT_CARD    — Company credit card
 */
module.exports = (sequelize, DataTypes) => {
  const BankAccount = sequelize.define('BankAccount', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    accountName: {
      // Display name: "HDFC Business Account", "Office Cash", "PhonePe Wallet"
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'account_name',
    },
    accountNumber: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'account_number',
    },
    bankName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'bank_name',
    },
    ifscCode: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'ifsc_code',
    },
    accountType: {
      type: DataTypes.ENUM('SAVINGS', 'CURRENT', 'CASH', 'DIGITAL_WALLET', 'CREDIT_CARD'),
      allowNull: false,
      defaultValue: 'CURRENT',
      field: 'account_type',
    },
    currency: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'INR',
    },
    openingBalance: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'opening_balance',
      comment: 'Starting balance when account was added to the system',
    },
    currentBalance: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'current_balance',
      comment: 'Running balance — auto-updated on each transaction',
    },
    isDefault: {
      // Mark one account as the default for receiving payments
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_default',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    colorCode: {
      // For UI card color: "#6c5ce7"
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'color_code',
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
    tableName: 'bank_accounts',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    indexes: [
      { fields: ['account_type'] },
      { fields: ['is_active'] },
      { fields: ['is_default'] },
    ],
  });

  BankAccount.associate = function (models) {
    BankAccount.hasMany(models.BankTransaction, {
      foreignKey: 'bank_account_id',
      as: 'transactions',
      onDelete: 'CASCADE',
    });
    BankAccount.hasMany(models.Expense, {
      foreignKey: 'bank_account_id',
      as: 'expenses',
    });
    BankAccount.belongsTo(models.User, {
      foreignKey: 'created_by_id',
      as: 'createdBy',
    });
  };

  return BankAccount;
};
