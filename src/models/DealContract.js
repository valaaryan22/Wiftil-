'use strict';

/**
 * DealContract — Commercial proposals, agreements, and deal-related draft contracts.
 *
 * type:
 *   PROPOSAL, AGREEMENT, NDA, SOW, SERVICE_CONTRACT, RETAINER
 *
 * status:
 *   DRAFT, SHARED_WITH_CLIENT, IN_REVIEW, ACCEPTED, SIGNED, REJECTED, EXPIRED
 */
module.exports = (sequelize, DataTypes) => {
  const DealContract = sequelize.define('DealContract', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    contractNumber: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'contract_number',
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('PROPOSAL', 'AGREEMENT', 'NDA', 'SOW', 'SERVICE_CONTRACT', 'RETAINER'),
      allowNull: false,
      defaultValue: 'PROPOSAL',
    },
    status: {
      type: DataTypes.ENUM('DRAFT', 'SHARED_WITH_CLIENT', 'IN_REVIEW', 'ACCEPTED', 'SIGNED', 'REJECTED', 'EXPIRED'),
      allowNull: false,
      defaultValue: 'DRAFT',
    },
    dealId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'deal_id',
      references: { model: 'crm_deals', key: 'id' },
    },
    leadId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'lead_id',
      references: { model: 'crm_leads', key: 'id' },
    },
    clientId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'client_id',
      references: { model: 'clients', key: 'id' },
    },
    contractValue: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0.00,
      field: 'contract_value',
    },
    currency: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'INR',
    },
    validUntil: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'valid_until',
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'start_date',
    },
    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'end_date',
    },
    fileUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'file_url',
    },
    fileName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'file_name',
    },
    termsAndConditions: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'terms_and_conditions',
    },
    scopeOfWork: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'scope_of_work',
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
  }, {
    tableName: 'crm_contracts',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
  });

  DealContract.associate = (models) => {
    DealContract.belongsTo(models.Deal, {
      as: 'deal',
      foreignKey: 'dealId',
    });

    DealContract.belongsTo(models.Lead, {
      as: 'lead',
      foreignKey: 'leadId',
    });

    DealContract.belongsTo(models.Client, {
      as: 'client',
      foreignKey: 'clientId',
    });

    DealContract.belongsTo(models.User, {
      as: 'creator',
      foreignKey: 'createdById',
    });
  };

  return DealContract;
};
