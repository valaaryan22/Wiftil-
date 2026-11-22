'use strict';

module.exports = (sequelize, DataTypes) => {
  const ClientContact = sequelize.define('ClientContact', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    clientId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'client_id',
      references: { model: 'clients', key: 'id' },
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    jobTitle: {
      type: DataTypes.STRING(150),
      allowNull: true,
      field: 'job_title',
    },
    department: {
      type: DataTypes.STRING(100),
      allowNull: true,
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
    // badges: e.g. ["Primary", "Decision Maker", "Approver"]
    badges: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
    },
    preferredChannel: {
      type: DataTypes.ENUM('Email', 'Phone', 'WhatsApp', 'Meeting', 'Other'),
      allowNull: true,
      field: 'preferred_channel',
    },
    // Stakeholder type: e.g. "Internal", "External", "Partner"
    stakeholderType: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'stakeholder_type',
    },
    relationshipNote: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'relationship_note',
    },
    lastContactedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_contacted_at',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
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
    tableName: 'client_contacts',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    indexes: [
      { fields: ['client_id'] },
    ],
  });

  ClientContact.associate = function (models) {
    ClientContact.belongsTo(models.Client, {
      foreignKey: 'client_id',
      as: 'client',
    });
    ClientContact.belongsTo(models.User, {
      foreignKey: 'created_by_id',
      as: 'createdBy',
    });
  };

  return ClientContact;
};
