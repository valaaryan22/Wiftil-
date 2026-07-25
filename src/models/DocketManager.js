'use strict';

/**
 * DocketManager — Many-to-many: Docket assigned to multiple managers.
 *
 * role: PRIMARY | SECONDARY | REVIEWER
 *
 * Managers at level 2 (ADMIN), 3 (MANAGER), or 4 (TEAM_LEAD) can be assigned.
 * Unique constraint on (docket_id, manager_id) prevents duplicate assignments.
 */
module.exports = (sequelize, DataTypes) => {
  const DocketManager = sequelize.define('DocketManager', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    docketId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'docket_id',
      references: { model: 'dockets', key: 'id' },
    },
    managerId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'manager_id',
      references: { model: 'users', key: 'id' },
    },
    role: {
      type: DataTypes.ENUM('PRIMARY', 'SECONDARY', 'REVIEWER'),
      allowNull: false,
      defaultValue: 'PRIMARY',
    },
    assignedById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'assigned_by_id',
      references: { model: 'users', key: 'id' },
    },
    assignedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'assigned_at',
    },
  }, {
    tableName: 'docket_managers',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['docket_id', 'manager_id'] },
      { fields: ['docket_id'] },
      { fields: ['manager_id'] },
    ],
  });

  DocketManager.associate = function (models) {
    DocketManager.belongsTo(models.Docket, {
      foreignKey: 'docket_id',
      as: 'docket',
      onDelete: 'CASCADE',
    });
    DocketManager.belongsTo(models.User, {
      foreignKey: 'manager_id',
      as: 'manager',
    });
    DocketManager.belongsTo(models.User, {
      foreignKey: 'assigned_by_id',
      as: 'assignedBy',
    });
  };

  return DocketManager;
};
