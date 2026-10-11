'use strict';

module.exports = (sequelize, DataTypes) => {
  const PerformanceIncrementPolicy = sequelize.define('PerformanceIncrementPolicy', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    minRating: {
      type: DataTypes.FLOAT,
      allowNull: false,
      field: 'min_rating',
    },
    maxRating: {
      type: DataTypes.FLOAT,
      allowNull: false,
      field: 'max_rating',
    },
    incrementPercentage: {
      type: DataTypes.FLOAT,
      allowNull: false,
      field: 'increment_percentage',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by_id',
      references: { model: 'users', key: 'id' },
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
    tableName: 'performance_increment_policies',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  PerformanceIncrementPolicy.associate = function (models) {
    PerformanceIncrementPolicy.belongsTo(models.User, { foreignKey: 'created_by_id', as: 'createdBy' });
  };

  return PerformanceIncrementPolicy;
};
