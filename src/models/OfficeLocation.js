'use strict';

module.exports = (sequelize, DataTypes) => {
  const OfficeLocation = sequelize.define('OfficeLocation', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
      comment: 'Name of the office / location, e.g. Head Office, Branch 1',
    },
    address: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Readable office address',
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: false,
      comment: 'Latitude coordinate of the office center point',
    },
    longitude: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: false,
      comment: 'Longitude coordinate of the office center point',
    },
    radius: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 50,
      comment: 'Allowed geofence radius in meters around the office (default 50m)',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
      comment: 'Whether this office location is actively enforced for geofenced punching',
    },
    isDefault: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_default',
      comment: 'Whether this is the primary/default office location',
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by_id',
      references: { model: 'users', key: 'id' },
    },
  }, {
    tableName: 'office_locations',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['is_active'] },
    ],
  });

  OfficeLocation.associate = function (models) {
    OfficeLocation.belongsTo(models.User, { foreignKey: 'created_by_id', as: 'createdBy' });
  };

  return OfficeLocation;
};
