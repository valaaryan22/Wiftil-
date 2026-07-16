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
  };

  return Client;
};
