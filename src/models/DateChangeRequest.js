'use strict';

module.exports = (sequelize, DataTypes) => {
  const DateChangeRequest = sequelize.define('DateChangeRequest', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    entityType: { type: DataTypes.ENUM('Docket', 'Task', 'SubTask'), allowNull: false, field: 'entity_type' },
    entityId: { type: DataTypes.UUID, allowNull: false, field: 'entity_id' },
    requestedById: { type: DataTypes.UUID, allowNull: false, field: 'requested_by_id', references: { model: 'users', key: 'id' } },
    requestedStartDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'requested_start_date' },
    requestedEndDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'requested_end_date' },
    currentStartDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'current_start_date' },
    currentEndDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'current_end_date' },
    status: { type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'), allowNull: false, defaultValue: 'PENDING' },
    reviewedById: { type: DataTypes.UUID, allowNull: true, field: 'reviewed_by_id', references: { model: 'users', key: 'id' } },
    reviewComment: { type: DataTypes.TEXT, allowNull: true, field: 'review_comment' },
    reviewedAt: { type: DataTypes.DATE, allowNull: true, field: 'reviewed_at' },
  }, {
    tableName: 'date_change_requests',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [{ fields: ['entity_type', 'entity_id'] }, { fields: ['requested_by_id'] }, { fields: ['status'] }],
  });
  DateChangeRequest.associate = function (models) {
    DateChangeRequest.belongsTo(models.User, { foreignKey: 'requested_by_id', as: 'requestedBy' });
    DateChangeRequest.belongsTo(models.User, { foreignKey: 'reviewed_by_id', as: 'reviewedBy' });
  };
  return DateChangeRequest;
};
