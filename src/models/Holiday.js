'use strict';

module.exports = (sequelize, DataTypes) => {
  const Holiday = sequelize.define('Holiday', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Name of the holiday, e.g. Republic Day, Diwali, New Year',
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      comment: 'Date of the holiday (YYYY-MM-DD)',
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Year of holiday (e.g. 2026) for fast yearly filtering',
    },
    type: {
      type: DataTypes.ENUM('PUBLIC', 'OPTIONAL', 'COMPANY'),
      allowNull: false,
      defaultValue: 'PUBLIC',
      comment: 'PUBLIC = Mandatory holiday, OPTIONAL = Restricted/optional, COMPANY = Company specific',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Notes or description about the observance',
    },
    isRecurring: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_recurring',
      comment: 'Whether this holiday recurs annually on the same day/month',
    },
    applicableFor: {
      type: DataTypes.ENUM('ALL', 'REMOTE_ONLY', 'OFFICE_ONLY'),
      allowNull: false,
      defaultValue: 'ALL',
      field: 'applicable_for',
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by_id',
      references: { model: 'users', key: 'id' },
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'INACTIVE'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
  }, {
    tableName: 'holidays',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['year'] },
      { fields: ['date'] },
      { fields: ['type'] },
      { fields: ['status'] },
    ],
  });

  Holiday.associate = (models) => {
    Holiday.belongsTo(models.User, {
      foreignKey: 'created_by_id',
      as: 'creator',
    });
  };

  return Holiday;
};
