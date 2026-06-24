'use strict';

// Dynamic role definitions — admins can create custom roles with an access level (1–5)
module.exports = (sequelize, DataTypes) => {
  const RoleDefinition = sequelize.define('RoleDefinition', {
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
    displayName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'display_name',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    accessLevel: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'access_level',
    },
    isSystem: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_system',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    color: {
      type: DataTypes.STRING(20),
      allowNull: true,
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
    tableName: 'role_definitions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['access_level'] },
    ],
  });

  RoleDefinition.associate = function (models) {
    RoleDefinition.hasMany(models.User, {
      foreignKey: 'role_id',
      as: 'users',
    });
  };

  return RoleDefinition;
};
