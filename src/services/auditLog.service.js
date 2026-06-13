'use strict';

const { db } = require('../database/client');
const { HTTP_STATUS } = require('../constants');

const LOG_SELECT = {
  id: true,
  performedById: true,
  performedByName: true,
  performedByRole: true,
  action: true,
  category: true,
  description: true,
  entity: true,
  entityId: true,
  entityName: true,
  targetUserId: true,
  targetUserName: true,
  oldValues: true,
  newValues: true,
  metadata: true,
  ipAddress: true,
  userAgent: true,
  status: true,
  createdAt: true,
};

/**
 * Query audit logs with flexible filters.
 * Level 5: all logs
 * Level 4: logs where performedById or targetUserId is one of their team
 * Level 1–3: only their own logs
 */
async function getAuditLogs({
  requestingUser,
  page = 1,
  limit = 50,
  action,
  category,
  entity,
  performedById,
  targetUserId,
  status,
  dateFrom,
  dateTo,
  search,
}) {
  page  = parseInt(page);
  limit = Math.min(parseInt(limit), 200); // cap at 200

  const where = {};

  // Scope based on access level
  if (requestingUser.roleLevel < 4) {
    // Can only see their own activity
    where.performedById = requestingUser.id;
  } else if (requestingUser.roleLevel === 4) {
    // MANAGER: can see their own + logs for users they manage
    // For simplicity: show logs where performedById is in their subordinate tree
    const subordinates = await db.user.findMany({
      where: { managerId: requestingUser.id, deletedAt: null },
      select: { id: true },
    });
    const ids = [requestingUser.id, ...subordinates.map((u) => u.id)];
    where.OR = [
      { performedById: { in: ids } },
      { targetUserId:  { in: ids } },
    ];
  }
  // Level 5: no restriction

  // Apply filters (override scope for privileged users)
  if (action)        where.action   = { contains: action, mode: 'insensitive' };
  if (category)      where.category = category;
  if (entity)        where.entity   = entity;
  if (status)        where.status   = status;
  if (performedById && requestingUser.roleLevel >= 4) where.performedById = performedById;
  if (targetUserId  && requestingUser.roleLevel >= 4) where.targetUserId  = targetUserId;

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo)   where.createdAt.lte = new Date(dateTo);
  }

  if (search) {
    const searchClause = [
      { description:     { contains: search, mode: 'insensitive' } },
      { performedByName: { contains: search, mode: 'insensitive' } },
      { targetUserName:  { contains: search, mode: 'insensitive' } },
      { action:          { contains: search, mode: 'insensitive' } },
      { entityName:      { contains: search, mode: 'insensitive' } },
    ];
    // Merge with existing OR or add new
    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: searchClause }];
      delete where.OR;
    } else {
      where.OR = searchClause;
    }
  }

  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      select: LOG_SELECT,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    db.auditLog.count({ where }),
  ]);

  return { logs, total };
}

/**
 * Get a single audit log by ID
 */
async function getAuditLogById({ id, requestingUser }) {
  const log = await db.auditLog.findUnique({ where: { id }, select: LOG_SELECT });

  if (!log) {
    const err = new Error('Audit log not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  // Enforce access: non-BOSS can only see their own logs unless they are MANAGER
  if (requestingUser.roleLevel < 4 && log.performedById !== requestingUser.id) {
    const err = new Error('Access denied');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  return log;
}

/**
 * Get audit log summary stats (Level 4+)
 */
async function getAuditStats({ requestingUser, dateFrom, dateTo }) {
  if (requestingUser.roleLevel < 4) {
    const err = new Error('Level 4+ required to view audit statistics');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  const dateFilter = {};
  if (dateFrom || dateTo) {
    dateFilter.createdAt = {};
    if (dateFrom) dateFilter.createdAt.gte = new Date(dateFrom);
    if (dateTo)   dateFilter.createdAt.lte = new Date(dateTo);
  }

  const [
    totalLogs,
    byCategory,
    byStatus,
    recentActions,
  ] = await Promise.all([
    db.auditLog.count({ where: dateFilter }),
    db.auditLog.groupBy({
      by: ['category'],
      where: dateFilter,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),
    db.auditLog.groupBy({
      by: ['status'],
      where: dateFilter,
      _count: { id: true },
    }),
    db.auditLog.findMany({
      where: dateFilter,
      select: { action: true, createdAt: true, performedByName: true, description: true, status: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  return {
    totalLogs,
    byCategory: byCategory.map((c) => ({ category: c.category, count: c._count.id })),
    byStatus:   byStatus.map((s)   => ({ status:   s.status,   count: s._count.id })),
    recentActions,
  };
}

module.exports = { getAuditLogs, getAuditLogById, getAuditStats };
