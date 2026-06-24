'use strict';

const { db }   = require('../database/client');
const logger   = require('./logger');

/**
 * Internal audit-log write — always non-blocking.
 * Any callers that still `await` it are safe because the function is async,
 * but the actual DB insert never holds up the HTTP response.
 */
async function writeAuditLog({
  performedBy = null, action, category = 'GENERAL', entity, entityId = null,
  entityName = null, description = null, targetUserId = null, targetUserName = null,
  oldValues = null, newValues = null, metadata = null, req = null, status = 'SUCCESS',
}) {
  const sanitize = (obj) => { if (!obj) return null; const { password, ...safe } = obj; return safe; };

  // Fire-and-forget: schedule the DB write on the next event-loop tick
  // so it never adds latency to the HTTP response.
  setImmediate(() => {
    db.AuditLog.create({
      performedById:   performedBy?.id || null,
      performedByName: performedBy ? `${performedBy.firstName} ${performedBy.lastName}` : null,
      performedByRole: performedBy?.roleName || null,
      action, category, description, entity, entityId, entityName,
      targetUserId, targetUserName,
      oldValues: sanitize(oldValues), newValues: sanitize(newValues), metadata,
      ipAddress: req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null) : null,
      userAgent:  req ? (req.headers['user-agent'] || null) : null,
      status,
    }).catch((err) => logger.warn('AuditLog write failed (non-fatal):', err.message));
  });
}

module.exports = { writeAuditLog };

