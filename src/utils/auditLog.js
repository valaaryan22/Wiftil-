'use strict';

const { db }   = require('../database/client');
const logger   = require('./logger');

async function writeAuditLog({
  performedBy = null, action, category = 'GENERAL', entity, entityId = null,
  entityName = null, description = null, targetUserId = null, targetUserName = null,
  oldValues = null, newValues = null, metadata = null, req = null, status = 'SUCCESS',
}) {
  try {
    const sanitize = (obj) => { if (!obj) return null; const { password, ...safe } = obj; return safe; };

    await db.AuditLog.create({
      performedById:   performedBy?.id || null,
      performedByName: performedBy ? `${performedBy.firstName} ${performedBy.lastName}` : null,
      performedByRole: performedBy?.roleName || null,
      action, category, description, entity, entityId, entityName,
      targetUserId, targetUserName,
      oldValues: sanitize(oldValues), newValues: sanitize(newValues), metadata,
      ipAddress: req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null) : null,
      userAgent:  req ? (req.headers['user-agent'] || null) : null,
      status,
    });
  } catch (err) {
    logger.warn('AuditLog write failed (non-fatal):', err.message);
  }
}

module.exports = { writeAuditLog };
