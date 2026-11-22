'use strict';

module.exports = (sequelize, DataTypes) => {
  const EmployeePayroll = sequelize.define('EmployeePayroll', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    employeeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'employee_id',
      references: { model: 'users', key: 'id' },
    },
    salaryConfigId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'salary_config_id',
      references: { model: 'employee_salaries', key: 'id' },
    },
    baseSalary: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'base_salary',
    },
    incentiveAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'incentive_amount',
    },
    deductionAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'deduction_amount',
    },
    netSalary: {
      // Computed: baseSalary + incentiveAmount - deductionAmount
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'net_salary',
    },
    payrollMonth: {
      // e.g. "2026-08"
      type: DataTypes.STRING(7),
      allowNull: false,
      field: 'payroll_month',
    },
    salaryDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'salary_date',
    },
    status: {
      type: DataTypes.ENUM('DRAFT', 'APPROVED', 'PAID', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'DRAFT',
    },
    paidAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'paid_at',
    },
    paidById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'paid_by_id',
      references: { model: 'users', key: 'id' },
    },
    paymentMode: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'payment_mode',
    },
    referenceNumber: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'reference_number',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    currency: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'INR',
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
    tableName: 'employee_payroll',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    paranoid: true,
    deletedAt: 'deleted_at',
    indexes: [
      { fields: ['employee_id'] },
      { fields: ['payroll_month'] },
      { fields: ['status'] },
    ],
  });

  EmployeePayroll.associate = function (models) {
    EmployeePayroll.belongsTo(models.User, { foreignKey: 'employee_id', as: 'employee' });
    EmployeePayroll.belongsTo(models.EmployeeSalary, { foreignKey: 'salary_config_id', as: 'salaryConfig' });
    EmployeePayroll.belongsTo(models.User, { foreignKey: 'paid_by_id', as: 'paidBy' });
    EmployeePayroll.belongsTo(models.User, { foreignKey: 'created_by_id', as: 'createdBy' });
  };

  return EmployeePayroll;
};
