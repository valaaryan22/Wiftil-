'use strict';

module.exports = (sequelize, DataTypes) => {
  const EmployeeSalary = sequelize.define('EmployeeSalary', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      references: { model: 'users', key: 'id' },
    },
    baseSalary: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'base_salary',
    },
    salaryDay: {
      // Day of month (1–31) on which salary is processed
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: 'salary_day',
      validate: { min: 1, max: 31 },
    },
    currency: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'INR',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    effectiveFrom: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'effective_from',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by_id',
      references: { model: 'users', key: 'id' },
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deleted_at',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at',
    },
  }, {
    tableName: 'employee_salaries',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    paranoid: true,
    deletedAt: 'deleted_at',
    indexes: [
      { fields: ['user_id'] },
      { fields: ['is_active'] },
    ],
  });

  EmployeeSalary.associate = function (models) {
    EmployeeSalary.belongsTo(models.User, { foreignKey: 'user_id', as: 'employee' });
    EmployeeSalary.belongsTo(models.User, { foreignKey: 'created_by_id', as: 'createdBy' });
    EmployeeSalary.hasMany(models.EmployeePayroll, { foreignKey: 'salary_config_id', as: 'payrolls' });
  };

  return EmployeeSalary;
};
