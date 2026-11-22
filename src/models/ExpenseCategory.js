'use strict';

/**
 * ExpenseCategory — Lookup table for classifying operational expenses.
 * Examples: Office Supplies, Software/SaaS, Travel, Marketing, Utilities, etc.
 */
module.exports = (sequelize, DataTypes) => {
  const ExpenseCategory = sequelize.define('ExpenseCategory', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    colorCode: {
      // Hex color for UI badge e.g. "#6c5ce7"
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'color_code',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'created_by_id',
      references: { model: 'users', key: 'id' },
    },
  }, {
    tableName: 'expense_categories',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['is_active'] },
    ],
  });

  ExpenseCategory.associate = function (models) {
    ExpenseCategory.hasMany(models.Expense, {
      foreignKey: 'category_id',
      as: 'expenses',
    });
    ExpenseCategory.belongsTo(models.User, {
      foreignKey: 'created_by_id',
      as: 'createdBy',
    });
  };

  return ExpenseCategory;
};
