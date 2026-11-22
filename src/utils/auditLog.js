'use strict';

const { db }   = require('../database/client');
const logger   = require('./logger');

/**
 * Internal audit-log write — always non-blocking.
 * Supports both signatures:
 *   writeAuditLog({ performedBy, action, category, entity, entityId, entityName, description, ... })
 *   writeAuditLog(req, { category, action, targetModel, targetId, details, ... })
 */
async function writeAuditLog(arg1, arg2) {
  let opts = {};
  let req = null;

  if (arg2 && typeof arg2 === 'object') {
    req = arg1;
    opts = { ...arg2 };
  } else if (arg1 && typeof arg1 === 'object') {
    opts = { ...arg1 };
    req = opts.req || null;
  }

  const {
    performedBy = req?.user || null,
    action = opts.action,
    category = opts.category || 'GENERAL',
    entity = opts.entity || opts.targetModel,
    entityId = opts.entityId || opts.targetId || null,
    entityName = opts.entityName || null,
    description = opts.description || null,
    targetUserId = opts.targetUserId || null,
    targetUserName = opts.targetUserName || null,
    oldValues = opts.oldValues || null,
    newValues = opts.newValues || opts.details || null,
    metadata = opts.metadata || null,
    status = opts.status || 'SUCCESS',
  } = opts;

  if (!action) {
    logger.warn('AuditLog write skipped: missing action');
    return;
  }

  const sanitize = (obj) => { if (!obj) return null; const { password, ...safe } = obj; return safe; };

  let performedByName = opts.performedByName || null;
  if (!performedByName && performedBy) {
    if (performedBy.firstName || performedBy.lastName) {
      performedByName = `${performedBy.firstName || ''} ${performedBy.lastName || ''}`.trim() || null;
    } else if (performedBy.name) {
      performedByName = performedBy.name;
    }
  }

  // Fire-and-forget: schedule the DB write on the next event-loop tick
  // so it never adds latency to the HTTP response.
  setImmediate(() => {
    db.AuditLog.create({
      performedById:   performedBy?.id || null,
      performedByName,
      performedByRole: performedBy?.roleName || performedBy?.role?.name || null,
      action,
      category,
      description,
      entity: entity || 'GENERAL',
      entityId,
      entityName,
      targetUserId,
      targetUserName,
      oldValues: sanitize(oldValues),
      newValues: sanitize(newValues),
      metadata,
      ipAddress: req ? (req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || null) : null,
      userAgent:  req ? (req.headers?.['user-agent'] || null) : null,
      status,
    }).catch((err) => logger.warn('AuditLog write failed (non-fatal):', err.message));
  });
}

module.exports = { writeAuditLog };
