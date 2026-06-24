'use strict';

const auditLogService = require('../services/auditLog.service');
const { successResponse, paginatedResponse } = require('../utils/response');

async function getAuditLogs(req, res, next) {
  try {
    const {
      page = 1, limit = 50,
      action, category, entity,
      performedById, targetUserId,
      status, dateFrom, dateTo, search,
    } = req.query;

    const { logs, total } = await auditLogService.getAuditLogs({
      requestingUser: req.user,
      page, limit, action, category, entity,
      performedById, targetUserId,
      status, dateFrom, dateTo, search,
    });

    return paginatedResponse(res, { data: logs, total, page, limit, message: 'Audit logs fetched' });
  } catch (err) {
    next(err);
  }
}

async function getAuditLogById(req, res, next) {
  try {
    const log = await auditLogService.getAuditLogById({ id: req.params.id, requestingUser: req.user });
    return successResponse(res, { message: 'Audit log fetched', data: { log } });
  } catch (err) {
    next(err);
  }
}

async function getAuditStats(req, res, next) {
  try {
    const { dateFrom, dateTo } = req.query;
    const stats = await auditLogService.getAuditStats({ requestingUser: req.user, dateFrom, dateTo });
    return successResponse(res, { message: 'Audit stats fetched', data: { stats } });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAuditLogs, getAuditLogById, getAuditStats };
