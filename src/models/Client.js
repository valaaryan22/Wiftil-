'use strict';

module.exports = (sequelize, DataTypes) => {
  const Client = sequelize.define('Client', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    clientCode: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      field: 'client_code',
    },
    accountOwnerId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'account_owner_id',
      references: { model: 'users', key: 'id' },
    },
    primaryContactName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'primary_contact_name',
    },
    phone: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    whatsappNumber: {
      type: DataTypes.STRING(30),
      allowNull: true,
      field: 'whatsapp_number',
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      validate: { isEmail: true },
    },
    billingDate: {
      type: DataTypes.INTEGER, // e.g. day of the month 1-31
      allowNull: true,
      field: 'billing_date',
      validate: { min: 1, max: 31 },
    },
    industry: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    website: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    gst: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    joinedDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'joined_date',
    },
    locationPreference: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'location_preference',
    },
    leadSource: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'lead_source',
    },
    referralSource: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'referral_source',
    },
    preferredLanguage: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'preferred_language',
    },
    preferredChannel: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'preferred_channel', // e.g., 'WhatsApp + Email'
    },
    internalTags: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'internal_tags',
    },
    socialMediaLinks: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'social_media_links',
    },
    logo: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    brandDna: {
      // Client DNA / Brand Knowledge Base
      // Structure:
      // {
      //   brandColors: [ { name: "Signature Orange", hex: "#F26522" }, ... ],
      //   toneOfVoice: "Assured, expert, calm, patient-friendly, premium, outcome-led.",
      //   visualRules: "Keep layouts clean, use orange for CTA emphasis...",
      //   dos: ["Lead with treatment outcome or trust signal", ...],
      //   donts: ["Avoid cluttered compositions", ...]
      // }
      type: DataTypes.JSON,
      allowNull: true,
      field: 'brand_dna',
      defaultValue: null,
    },

    // ── Client Overview / Scoring Fields (Admin-set) ────────────────────────
    loyaltyScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'loyalty_score',
      comment: 'Admin-set loyalty score 0-100',
      validate: { min: 0, max: 100 },
    },
    healthScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'health_score',
      comment: 'Admin-set or manually overridden health score 0-100',
      validate: { min: 0, max: 100 },
    },
    relationshipStatus: {
      type: DataTypes.ENUM('NEW', 'GROWING', 'TRUSTED_PARTNER', 'AT_RISK', 'CHURNED'),
      allowNull: true,
      field: 'relationship_status',
      defaultValue: 'NEW',
      comment: 'Admin-set relationship tier label',
    },
    clientLevel: {
      /**
       * Client tier — set by admin to reflect the client's service tier.
       *   BASIC    — entry-level client
       *   STANDARD — mid-tier client
       *   PREMIUM  — high-value / priority client
       */
      type: DataTypes.ENUM('BASIC', 'STANDARD', 'PREMIUM'),
      allowNull: true,
      defaultValue: null,
      field: 'client_level',
      comment: 'Admin-set client tier: BASIC | STANDARD | PREMIUM',
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'created_by_id',
      references: { model: 'users', key: 'id' },
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deleted_at',
    },
  }, {
    tableName: 'clients',
    timestamps: true,
    paranoid: true, // handles soft deletes automatically mapping to deletedAt if configured or we can manually handle it
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    hooks: {
      beforeValidate: async (client) => {
        if (!client.clientCode) {
          // generate auto client code e.g. CL-YYYYMMDD-XXXX
          const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
          client.clientCode = `CL-${dateStr}-${randomStr}`;
        }
      }
    }
  });

  Client.associate = function(models) {
    Client.belongsTo(models.User, {
      foreignKey: 'account_owner_id',
      as: 'accountOwner',
    });
    Client.belongsTo(models.User, {
      foreignKey: 'created_by_id',
      as: 'createdBy',
    });
    Client.hasMany(models.ClientContact, {
      foreignKey: 'client_id',
      as: 'contacts',
    });
    Client.hasMany(models.ClientCommunicationLog, {
      foreignKey: 'client_id',
      as: 'communicationLogs',
    });
    Client.hasMany(models.ClientPackage, {
      foreignKey: 'client_id',
      as: 'packages',
    });
    Client.hasMany(models.Docket, {
      foreignKey: 'client_id',
      as: 'dockets',
    });
    Client.hasMany(models.ClientDocument, {
      foreignKey: 'client_id',
      as: 'documents',
    });
    Client.hasMany(models.ClientPayment, {
      foreignKey: 'client_id',
      as: 'payments',
    });
    Client.hasMany(models.ClientRisk, {
      foreignKey: 'client_id',
      as: 'risks',
    });
  };

  return Client;
};
