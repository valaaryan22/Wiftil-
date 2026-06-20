'use strict';

const { Op, fn, col, literal } = require('sequelize');
const { db }            = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const { HTTP_STATUS, AUDIT_CATEGORY, AUDIT_ACTION } = require('../constants');

const LOG_ATTRS = [
  'id', 'performedById', 'performedByName', 'performedByRole',
  'action', 'category', 'description', 'entity', 'entityId', 'entityName',
  'targetUserId', 'targetUserName', 'oldValues', 'newValues', 'metadata',
  'ipAddress', 'userAgent', 'status', 'createdAt',
];

async function getAuditLogs({ requestingUser, page = 1, limit = 50, action, category, entity, performedById, targetUserId, status, dateFrom, dateTo, search }) {
  page  = parseInt(page);
  limit = Math.min(parseInt(limit), 200);

  const where = {};

  if (requestingUser.roleLevel < 4) {
    where.performedById = requestingUser.id;
  } else if (requestingUser.roleLevel === 4) {
    const subordinates = await db.User.findAll({
      where: { managerId: requestingUser.id, deletedAt: null },
      attributes: ['id'],
    });
    const ids = [requestingUser.id, ...subordinates.map(u => u.id)];
    where[Op.or] = [
      { performedById: { [Op.in]: ids } },
      { targetUserId:  { [Op.in]: ids } },
    ];
  }

  if (action)   where.action   = { [Op.like]: `%${action}%` };
  if (category) where.category = category;
  if (entity)   where.entity   = entity;
  if (status)   where.status   = status;
  if (performedById && requestingUser.roleLevel >= 4) where.performedById = performedById;
  if (targetUserId  && requestingUser.roleLevel >= 4) where.targetUserId  = targetUserId;

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt[Op.gte] = new Date(dateFrom);
    if (dateTo)   where.createdAt[Op.lte] = new Date(dateTo);
  }

  if (search) {
    const searchClause = {
      [Op.or]: [
        { description:     { [Op.like]: `%${search}%` } },
        { performedByName: { [Op.like]: `%${search}%` } },
        { targetUserName:  { [Op.like]: `%${search}%` } },
        { action:          { [Op.like]: `%${search}%` } },
        { entityName:      { [Op.like]: `%${search}%` } },
      ],
    };
    if (where[Op.or]) {
      where[Op.and] = [{ [Op.or]: where[Op.or] }, searchClause];
      delete where[Op.or];
    } else {
      Object.assign(where, searchClause);
    }
  }

  const [total, logs] = await Promise.all([
    db.AuditLog.count({ where }),
    db.AuditLog.findAll({
      where, attributes: LOG_ATTRS,
      order: [['createdAt', 'DESC']],
      offset: (page - 1) * limit, limit,
    }),
  ]);

  return { logs, total };
}

async function getAuditLogById({ id, requestingUser }) {
  const log = await db.AuditLog.findByPk(id, { attributes: LOG_ATTRS });
  if (!log) {
    const err = new Error('Audit log not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
  }
  if (requestingUser.roleLevel < 4 && log.performedById !== requestingUser.id) {
    const err = new Error('Access denied'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }
  return log;
}

async function getAuditStats({ requestingUser, dateFrom, dateTo }) {
  if (requestingUser.roleLevel < 4) {
    const err = new Error('Level 4+ required to view audit statistics'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  const where = {};
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt[Op.gte] = new Date(dateFrom);
    if (dateTo)   where.createdAt[Op.lte] = new Date(dateTo);
  }

  const [totalLogs, byCategory, byStatus, recentActions] = await Promise.all([
    db.AuditLog.count({ where }),
    db.AuditLog.findAll({
      where,
      attributes: ['category', [fn('COUNT', col('id')), 'count']],
      group: ['category'],
      order: [[literal('count'), 'DESC']],
      raw: true,
    }),
    db.AuditLog.findAll({
      where,
      attributes: ['status', [fn('COUNT', col('id')), 'count']],
      group: ['status'],
      raw: true,
    }),
    db.AuditLog.findAll({
      where,
      attributes: ['action', 'createdAt', 'performedByName', 'description', 'status'],
      order: [['createdAt', 'DESC']],
      limit: 10,
    }),
  ]);

  return {
    totalLogs,
    byCategory: byCategory.map(c => ({ category: c.category, count: parseInt(c.count) })),
    byStatus:   byStatus.map(s   => ({ status:   s.status,   count: parseInt(s.count) })),
    recentActions,
  };
}

module.exports = { getAuditLogs, getAuditLogById, getAuditStats };
