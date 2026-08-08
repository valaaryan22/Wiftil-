const fs = require('fs');
const q = String.fromCharCode(39); // single quote

const model = q + 'use strict' + q + ';' + '\n' + '\n' +
  'module.exports = (sequelize, DataTypes) => {' + '\n' +
  '  const DateChangeRequest = sequelize.define(' + q + 'DateChangeRequest' + q + ', {' + '\n' +
  '    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },' + '\n' +
  '    entityType: { type: DataTypes.ENUM(' + q + 'Docket' + q + ', ' + q + 'Task' + q + ', ' + q + 'SubTask' + q + '), allowNull: false, field: ' + q + 'entity_type' + q + ' },' + '\n' +
  '    entityId: { type: DataTypes.UUID, allowNull: false, field: ' + q + 'entity_id' + q + ' },' + '\n' +
  '    requestedById: { type: DataTypes.UUID, allowNull: false, field: ' + q + 'requested_by_id' + q + ', references: { model: ' + q + 'users' + q + ', key: ' + q + 'id' + q + ' } },' + '\n' +
  '    requestedStartDate: { type: DataTypes.DATEONLY, allowNull: true, field: ' + q + 'requested_start_date' + q + ' },' + '\n' +
  '    requestedEndDate: { type: DataTypes.DATEONLY, allowNull: true, field: ' + q + 'requested_end_date' + q + ' },' + '\n' +
  '    currentStartDate: { type: DataTypes.DATEONLY, allowNull: true, field: ' + q + 'current_start_date' + q + ' },' + '\n' +
  '    currentEndDate: { type: DataTypes.DATEONLY, allowNull: true, field: ' + q + 'current_end_date' + q + ' },' + '\n' +
  '    status: { type: DataTypes.ENUM(' + q + 'PENDING' + q + ', ' + q + 'APPROVED' + q + ', ' + q + 'REJECTED' + q + '), allowNull: false, defaultValue: ' + q + 'PENDING' + q + ' },' + '\n' +
  '    reviewedById: { type: DataTypes.UUID, allowNull: true, field: ' + q + 'reviewed_by_id' + q + ', references: { model: ' + q + 'users' + q + ', key: ' + q + 'id' + q + ' } },' + '\n' +
  '    reviewComment: { type: DataTypes.TEXT, allowNull: true, field: ' + q + 'review_comment' + q + ' },' + '\n' +
  '    reviewedAt: { type: DataTypes.DATE, allowNull: true, field: ' + q + 'reviewed_at' + q + ' },' + '\n' +
  '  }, {' + '\n' +
  '    tableName: ' + q + 'date_change_requests' + q + ',' + '\n' +
  '    timestamps: true,' + '\n' +
  '    createdAt: ' + q + 'created_at' + q + ',' + '\n' +
  '    updatedAt: ' + q + 'updated_at' + q + ',' + '\n' +
  '    indexes: [{ fields: [' + q + 'entity_type' + q + ', ' + q + 'entity_id' + q + '] }, { fields: [' + q + 'requested_by_id' + q + '] }, { fields: [' + q + 'status' + q + '] }],' + '\n' +
  '  });' + '\n' +
  '  DateChangeRequest.associate = function (models) {' + '\n' +
  '    DateChangeRequest.belongsTo(models.User, { foreignKey: ' + q + 'requested_by_id' + q + ', as: ' + q + 'requestedBy' + q + ' });' + '\n' +
  '    DateChangeRequest.belongsTo(models.User, { foreignKey: ' + q + 'reviewed_by_id' + q + ', as: ' + q + 'reviewedBy' + q + ' });' + '\n' +
  '  };' + '\n' +
  '  return DateChangeRequest;' + '\n' +
  '};' + '\n';

fs.writeFileSync('src/models/DateChangeRequest.js', model);
console.log('Model written OK');
