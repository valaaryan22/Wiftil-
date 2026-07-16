'use strict';

module.exports = (sequelize, DataTypes) => {
  const ClientCommunicationLog = sequelize.define('ClientCommunicationLog', {
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
    // Title / subject of the communication
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    // Type of communication
    channel: {
      type: DataTypes.ENUM('Call', 'Meeting', 'Email', 'WhatsApp', 'Other'),
      allowNull: false,
    },
    // The internal user who was contacted FROM our side
    loggedById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'logged_by_id',
      references: { model: 'users', key: 'id' },
    },
    // The client-side contact person (from client_contacts table) — optional
    contactPersonId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'contact_person_id',
      references: { model: 'client_contacts', key: 'id' },
    },
    // When the communication happened
    communicatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'communicated_at',
    },
    // What was discussed
    summary: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    // What needs to happen next
    nextAction: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'next_action',
    },
    // When to follow up
    followUpDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'follow_up_date',
    },
    // Whether follow-up is done
    followUpDone: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'follow_up_done',
    },
    // Optional attachment URL (Cloudinary)
    attachmentUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'attachment_url',
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deleted_at',
    },
  }, {
    tableName: 'client_communication_logs',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    indexes: [
      { fields: ['client_id'] },
      { fields: ['communicated_at'] },
      { fields: ['follow_up_date'] },
    ],
  });

  ClientCommunicationLog.associate = function (models) {
    ClientCommunicationLog.belongsTo(models.Client, {
      foreignKey: 'client_id',
      as: 'client',
    });
    ClientCommunicationLog.belongsTo(models.User, {
      foreignKey: 'logged_by_id',
      as: 'loggedBy',
    });
    ClientCommunicationLog.belongsTo(models.ClientContact, {
      foreignKey: 'contact_person_id',
      as: 'contactPerson',
    });
  };

  return ClientCommunicationLog;
};
