'use strict';

/**
 * Lead — Pre-Sales Inquiry / Opportunity Entry.
 *
 * source:
 *   WEBSITE, REFERRAL, LINKEDIN, COLD_OUTREACH, INBOUND_CALL, OTHER
 *
 * status:
 *   NEW, CONTACTED, QUALIFIED, PROPOSAL_SENT, CONVERTED, LOST, DISQUALIFIED
 *
 * priority:
 *   LOW, MEDIUM, HIGH, URGENT
 */
module.exports = (sequelize, DataTypes) => {
  const Lead = sequelize.define('Lead', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    leadCode: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      field: 'lead_code',
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    contactName: {
      type: DataTypes.STRING(150),
      allowNull: false,
      field: 'contact_name',
    },
    companyName: {
      type: DataTypes.STRING(150),
      allowNull: true,
      field: 'company_name',
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: true,
      validate: { isEmail: true },
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    source: {
      type: DataTypes.ENUM('WEBSITE', 'REFERRAL', 'LINKEDIN', 'COLD_OUTREACH', 'INBOUND_CALL', 'OTHER'),
      allowNull: false,
      defaultValue: 'WEBSITE',
    },
    status: {
      type: DataTypes.ENUM('NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'CONVERTED', 'LOST', 'DISQUALIFIED'),
      allowNull: false,
      defaultValue: 'NEW',
    },
    priority: {
      type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT'),
      allowNull: false,
      defaultValue: 'MEDIUM',
    },
    estimatedValue: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0.00,
      field: 'estimated_value',
    },
    currency: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'INR',
    },
    assignedToId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'assigned_to_id',
      references: { model: 'users', key: 'id' },
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    tags: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      get() {
        const val = this.getDataValue('tags');
        if (typeof val === 'string') {
          try { return JSON.parse(val); } catch { return []; }
        }
        return val || [];
      },
      set(val) {
        if (val && typeof val === 'object') {
          this.setDataValue('tags', JSON.stringify(val));
        } else {
          this.setDataValue('tags', val);
        }
      }
    },
    convertedDealId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'converted_deal_id',
    },
    convertedClientId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'converted_client_id',
      references: { model: 'clients', key: 'id' },
    },
    convertedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'converted_at',
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
    tableName: 'crm_leads',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
  });

  Lead.associate = (models) => {
    Lead.belongsTo(models.User, {
      as: 'assignedTo',
      foreignKey: 'assignedToId',
    });

    Lead.belongsTo(models.User, {
      as: 'creator',
      foreignKey: 'createdById',
    });

    Lead.belongsTo(models.Client, {
      as: 'convertedClient',
      foreignKey: 'convertedClientId',
    });

    Lead.hasMany(models.CrmActivity, {
      as: 'activities',
      foreignKey: 'leadId',
    });

    Lead.hasMany(models.DealContract, {
      as: 'contracts',
      foreignKey: 'leadId',
    });
  };

  return Lead;
};
