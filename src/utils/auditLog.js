'use strict';

const { db } = require('../database/client');
const logger  = require('./logger');

/**
 * Write an audit log entry — never throws, so it never breaks the main flow
 */
async function writeAuditLog({ userId = null, action, entity, entityId = null, oldValues = null, newValues = null, req = null }) {
  try {
    await db.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        oldValues,
        newValues,
        ipAddress: req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress) : null,
        userAgent: req ? req.headers['user-agent'] : null,
      },
    });
  } catch (err) {
    logger.warn('AuditLog write failed (non-fatal):', err.message);
  }
}

module.exports = { writeAuditLog };
