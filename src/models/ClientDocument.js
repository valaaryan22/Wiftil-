'use strict';

/**
 * ClientDocument — stores a reference to a local file path for a client.
 * No file is uploaded to cloud storage; only the file path is stored.
 *
 * Fields:
 *   fileName       — display name of the document (e.g. "2026 MSA.pdf")
 *   filePath       — absolute or relative local path to the file
 *   description    — optional freetext description
 *   category       — e.g. Contract, Invoice, Brand Kit, Content Plan
 *   relatedTo      — which functional area e.g. Commercial, Billing, Services
 *   system         — which system context e.g. Internal, External, Shared
 *   fileType       — derived from filePath extension or provided (PDF, DOCX…)
 *   fileSize       — size in bytes (optional, can be populated client-side)
 *   accessType     — Shared | Restricted | Confidential
 *   clientId       — FK → clients
 *   uploadedById   — FK → users (who registered this document)
 */
module.exports = (sequelize, DataTypes) => {
  const ClientDocument = sequelize.define('ClientDocument', {
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
    uploadedById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'uploaded_by_id',
      references: { model: 'users', key: 'id' },
    },
    fileName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'file_name',
      comment: 'Human-readable display name of the document',
    },
    filePath: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'file_path',
      comment: 'Local filesystem path — no cloud storage',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Optional description of the document contents',
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'e.g. Contract, Invoice, Brand Kit, Content Plan, NDA, Proposal',
    },
    relatedTo: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'related_to',
      comment: 'Functional area this document belongs to e.g. Commercial, Billing, Services, Communication',
    },
    system: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'System or context label e.g. Internal, External, Shared, CRM',
    },
    fileType: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'file_type',
      comment: 'Extension / MIME short-type e.g. PDF, DOCX, XLSX, PNG',
    },
    fileSize: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'file_size',
      comment: 'File size in bytes (informational, not enforced server-side)',
    },
    accessType: {
      type: DataTypes.ENUM('Shared', 'Restricted', 'Confidential'),
      allowNull: false,
      defaultValue: 'Shared',
      field: 'access_type',
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deleted_at',
    },
  }, {
    tableName: 'client_documents',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    indexes: [
      { fields: ['client_id'] },
      { fields: ['uploaded_by_id'] },
      { fields: ['category'] },
      { fields: ['access_type'] },
    ],
  });

  ClientDocument.associate = function (models) {
    ClientDocument.belongsTo(models.Client, {
      foreignKey: 'client_id',
      as: 'client',
    });
    ClientDocument.belongsTo(models.User, {
      foreignKey: 'uploaded_by_id',
      as: 'uploadedBy',
    });
  };

  return ClientDocument;
};
