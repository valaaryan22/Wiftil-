'use strict';

const reportsService = require('../services/reports.service');
const { successResponse } = require('../utils/response');

async function getExecutiveKpis(req, res, next) {
  try {
    const { period, dateFrom, dateTo } = req.query;
    const kpis = await reportsService.getExecutiveKpis({ period, dateFrom, dateTo });
    return successResponse(res, {
      message: 'Executive KPI scorecard fetched successfully',
      data: kpis,
    });
  } catch (err) {
    next(err);
  }
}

async function getFinanceReport(req, res, next) {
  try {
    const { period, dateFrom, dateTo } = req.query;
    const report = await reportsService.getFinanceReport({ period, dateFrom, dateTo });
    return successResponse(res, {
      message: 'Finance management report fetched successfully',
      data: report,
    });
  } catch (err) {
    next(err);
  }
}

async function getOperationsReport(req, res, next) {
  try {
    const { period, dateFrom, dateTo } = req.query;
    const report = await reportsService.getOperationsReport({ period, dateFrom, dateTo });
    return successResponse(res, {
      message: 'Operations & productivity report fetched successfully',
      data: report,
    });
  } catch (err) {
    next(err);
  }
}

async function getHrReport(req, res, next) {
  try {
    const { period, dateFrom, dateTo } = req.query;
    const report = await reportsService.getHrReport({ period, dateFrom, dateTo });
    return successResponse(res, {
      message: 'HR, attendance & payroll report fetched successfully',
      data: report,
    });
  } catch (err) {
    next(err);
  }
}

async function getCrmReport(req, res, next) {
  try {
    const { period, dateFrom, dateTo } = req.query;
    const report = await reportsService.getCrmReport({ period, dateFrom, dateTo });
    return successResponse(res, {
      message: 'CRM & pipeline report fetched successfully',
      data: report,
    });
  } catch (err) {
    next(err);
  }
}

async function getDailyActivitySummary(req, res, next) {
  try {
    const { date } = req.query;
    const report = await reportsService.getDailyActivitySummary({ date });
    return successResponse(res, {
      message: 'Daily activity summary fetched successfully',
      data: report,
    });
  } catch (err) {
    next(err);
  }
}

async function getTimelineReport(req, res, next) {
  try {
    const { period, dateFrom, dateTo } = req.query;
    const report = await reportsService.getTimelineReport({ period, dateFrom, dateTo });
    return successResponse(res, {
      message: 'Timeline & project progress report fetched successfully',
      data: report,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getExecutiveKpis,
  getFinanceReport,
  getOperationsReport,
  getHrReport,
  getCrmReport,
  getDailyActivitySummary,
  getTimelineReport,
};
