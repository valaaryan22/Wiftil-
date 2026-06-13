'use strict';

const { db } = require('../database/client');
const logger  = require('./logger');

/**
 * Write an audit log entry — never throws, so it never breaks the main flow.
 *
 * @param {object} opts
 * @param {object|null} opts.performedBy - req.user object (has id, firstName, lastName, roleName, roleLevel)
 * @param {string}      opts.action      - e.g. 'USER_CREATED'
 * @param {string}      opts.category    - e.g. 'USER', 'ROLE', 'LEAVE', 'AUTH'
 * @param {string}      opts.entity      - model name e.g. 'User'
 * @param {string|null} opts.entityId    - target record id
 * @param {string|null} opts.entityName  - snapshot of entity display name
 * @param {string|null} opts.description - human-readable summary
 * @param {string|null} opts.targetUserId   - if action affects a user
 * @param {string|null} opts.targetUserName - snapshot
 * @param {object|null} opts.oldValues   - before state
 * @param {object|null} opts.newValues   - after state
 * @param {object|null} opts.metadata    - extra context
 * @param {object|null} opts.req         - Express request (for IP / userAgent)
 * @param {string}      opts.status      - 'SUCCESS' | 'FAILED'
 */
async function writeAuditLog({
  performedBy     = null,
  action,
  category        = 'GENERAL',
  entity,
  entityId        = null,
  entityName      = null,
  description     = null,
  targetUserId    = null,
  targetUserName  = null,
  oldValues       = null,
  newValues       = null,
  metadata        = null,
  req             = null,
  status          = 'SUCCESS',
}) {
  try {
    // Strip sensitive fields from snapshots
    const sanitize = (obj) => {
      if (!obj) return null;
      const { password, ...safe } = obj;
      return safe;
    };

    await db.auditLog.create({
      data: {
        performedById:   performedBy?.id   || null,
        performedByName: performedBy
          ? `${performedBy.firstName} ${performedBy.lastName}`
          : null,
        performedByRole: performedBy?.roleName || null,
        action,
        category,
        description,
        entity,
        entityId,
        entityName,
        targetUserId,
        targetUserName,
        oldValues:  sanitize(oldValues),
        newValues:  sanitize(newValues),
        metadata,
        ipAddress:  req
          ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null)
          : null,
        userAgent:  req ? (req.headers['user-agent'] || null) : null,
        status,
      },
    });
  } catch (err) {
    logger.warn('AuditLog write failed (non-fatal):', err.message);
  }
}

module.exports = { writeAuditLog };
