'use strict';

const { Op } = require('sequelize');
const { db } = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const {
  HTTP_STATUS,
  AUDIT_CATEGORY,
  AUDIT_ACTION,
  CLIENT_MANAGE_MAX_LEVEL,
} = require('../constants');

function assertLevel(user, maxLevel, msg) {
  if (user.roleLevel > maxLevel) {
    const err = new Error(msg || `Access level ≤ ${maxLevel} required`);
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }
}

const DOC_INCLUDE = [
  { model: db.User, as: 'uploadedBy', attributes: ['id', 'firstName', 'lastName'] },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Derive fileType from the fileName extension if not supplied explicitly.
 * e.g. "report.pdf" → "PDF"
 */
function deriveFileType(fileName, provided) {
  if (provided) return provided.toUpperCase();
  const ext = (fileName || '').split('.').pop();
  return ext ? ext.toUpperCase() : null;
}

// ─────────────────────────────────────────────────────────────────────────────

async function createDocument({ requestingUser, clientId, data, req }) {
  const client = await db.Client.findOne({ where: { id: clientId, deletedAt: null } });
  if (!client) {
    const err = new Error('Client not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  const {
    fileName, filePath, description,
    category, relatedTo, system,
    fileType, fileSize, accessType,
  } = data;

  const doc = await db.ClientDocument.create({
    clientId,
    uploadedById: requestingUser.id,
    fileName,
    filePath,
    description,
    category,
    relatedTo,
    system,
    fileType: deriveFileType(fileName, fileType),
    fileSize,
    accessType: accessType || 'Shared',
  });

  const full = await db.ClientDocument.findByPk(doc.id, { include: DOC_INCLUDE });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.CLIENT_UPDATED,
    category: AUDIT_CATEGORY.CLIENT,
    entity: 'ClientDocument',
    entityId: doc.id,
    entityName: doc.fileName,
    description: `Added document "${doc.fileName}" (${doc.category}) for client "${client.name}"`,
    newValues: doc.toJSON(),
    req,
  });

  return full;
}

async function getDocuments({
  requestingUser, clientId,
  page = 1, limit = 20,
  search, category, relatedTo, system, accessType, sortBy, sortOrder,
}) {
  page  = parseInt(page)  || 1;
  limit = parseInt(limit) || 20;

  const where = { clientId, deletedAt: null };

  if (category)   where.category   = category;
  if (relatedTo)  where.relatedTo  = relatedTo;
  if (system)     where.system     = system;
  if (accessType) where.accessType = accessType;

  if (search) {
    where[Op.or] = [
      { fileName:    { [Op.like]: `%${search}%` } },
      { description: { [Op.like]: `%${search}%` } },
      { category:    { [Op.like]: `%${search}%` } },
      { relatedTo:   { [Op.like]: `%${search}%` } },
    ];
  }

  // Sortable columns whitelist
  const SORT_COLS = ['fileName', 'category', 'accessType', 'created_at', 'file_size'];
  const col       = SORT_COLS.includes(sortBy) ? sortBy : 'created_at';
  const dir       = sortOrder === 'ASC' ? 'ASC' : 'DESC';

  const { count: total, rows: documents } = await db.ClientDocument.findAndCountAll({
    where,
    include: DOC_INCLUDE,
    offset: (page - 1) * limit,
    limit,
    order: [[col, dir]],
    distinct: true,
  });

  return { documents, total, page, limit };
}

async function getDocumentById({ clientId, docId }) {
  const doc = await db.ClientDocument.findOne({
    where: { id: docId, clientId, deletedAt: null },
    include: DOC_INCLUDE,
  });
  if (!doc) {
    const err = new Error('Document not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }
  return doc;
}

async function updateDocument({ requestingUser, clientId, docId, data, req }) {
  const doc = await db.ClientDocument.findOne({ where: { id: docId, clientId, deletedAt: null } });
  if (!doc) {
    const err = new Error('Document not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  // Only the uploader or MANAGER+ can edit
  if (doc.uploadedById !== requestingUser.id) {
    assertLevel(requestingUser, CLIENT_MANAGE_MAX_LEVEL, 'Only Manager level or above can edit other\'s documents');
  }

  const oldValues = doc.toJSON();

  const updateFields = [
    'fileName', 'filePath', 'description', 'category',
    'relatedTo', 'system', 'fileType', 'fileSize', 'accessType',
  ];

  updateFields.forEach(field => {
    if (data[field] !== undefined) doc[field] = data[field];
  });

  // Re-derive fileType if fileName changed and fileType not explicitly given
  if (data.fileName && !data.fileType) {
    doc.fileType = deriveFileType(doc.fileName, null);
  }

  await doc.save();

  const full = await db.ClientDocument.findByPk(doc.id, { include: DOC_INCLUDE });

  const client = await db.Client.findByPk(clientId, { attributes: ['id', 'name'] });
  const clientName = client?.name || 'client';

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.CLIENT_UPDATED,
    category: AUDIT_CATEGORY.CLIENT,
    entity: 'ClientDocument',
    entityId: doc.id,
    entityName: doc.fileName,
    description: `Updated document "${doc.fileName}" for client "${clientName}"`,
    oldValues,
    newValues: full.toJSON(),
    req,
  });

  return full;
}

async function deleteDocument({ requestingUser, clientId, docId, req }) {
  // MANAGER+ required to delete
  assertLevel(requestingUser, CLIENT_MANAGE_MAX_LEVEL, 'Only Manager level or above can delete documents');

  const doc = await db.ClientDocument.findOne({ where: { id: docId, clientId, deletedAt: null } });
  if (!doc) {
    const err = new Error('Document not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  await doc.update({ deletedAt: new Date() });

  const client = await db.Client.findByPk(clientId, { attributes: ['id', 'name'] });
  const clientName = client?.name || 'client';

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.CLIENT_UPDATED,
    category: AUDIT_CATEGORY.CLIENT,
    entity: 'ClientDocument',
    entityId: doc.id,
    entityName: doc.fileName,
    description: `Deleted document "${doc.fileName}" from client "${clientName}"`,
    req,
  });
}

module.exports = {
  createDocument,
  getDocuments,
  getDocumentById,
  updateDocument,
  deleteDocument,
};
