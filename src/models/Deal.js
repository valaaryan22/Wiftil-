'use strict';

/**
 * Deal — Commercial Opportunity & Negotiation Tracking.
 *
 * stage:
 *   DISCOVERY, PROPOSAL_SHARED, NEGOTIATION, CONTRACT_SENT, WON, LOST
 */
module.exports = (sequelize, DataTypes) => {
  const Deal = sequelize.define('Deal', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    dealCode: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      field: 'deal_code',
    },
    dealName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'deal_name',
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
    companyName: {
      type: DataTypes.STRING(150),
      allowNull: true,
      field: 'company_name',
    },
    contactName: {
      type: DataTypes.STRING(150),
      allowNull: true,
      field: 'contact_name',
    },
    contactEmail: {
      type: DataTypes.STRING(150),
      allowNull: true,
      field: 'contact_email',
    },
    contactPhone: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'contact_phone',
    },
    stage: {
      type: DataTypes.ENUM('DISCOVERY', 'PROPOSAL_SHARED', 'NEGOTIATION', 'CONTRACT_SENT', 'WON', 'LOST'),
      allowNull: false,
      defaultValue: 'DISCOVERY',
    },
    probability: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 20,
      comment: 'Win probability percentage 0-100',
    },
    dealValue: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0.00,
      field: 'deal_value',
    },
    currency: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'INR',
    },
    pipeline: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'Standard Sales Pipeline',
    },
    expectedCloseDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'expected_close_date',
    },
    actualCloseDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'actual_close_date',
    },
    ownerId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'owner_id',
      references: { model: 'users', key: 'id' },
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    lostReason: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'lost_reason',
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
    tableName: 'crm_deals',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
  });

  Deal.associate = (models) => {
    Deal.belongsTo(models.Lead, {
      as: 'lead',
      foreignKey: 'leadId',
    });

    Deal.belongsTo(models.Client, {
      as: 'client',
      foreignKey: 'clientId',
    });

    Deal.belongsTo(models.User, {
      as: 'owner',
      foreignKey: 'ownerId',
    });

    Deal.belongsTo(models.User, {
      as: 'creator',
      foreignKey: 'createdById',
    });

    Deal.hasMany(models.CrmActivity, {
      as: 'activities',
      foreignKey: 'dealId',
    });

    Deal.hasMany(models.DealContract, {
      as: 'contracts',
      foreignKey: 'dealId',
    });
  };

  return Deal;
};
