'use strict';

const salaryService = require('../services/salary.service');
const { successResponse, paginatedResponse } = require('../utils/response');

async function getSalaryConfig(req, res, next) {
  try {
    const config = await salaryService.getSalaryConfigForUser(req.params.userId);
    return successResponse(res, { message: 'Salary config fetched', data: { config } });
  } catch (err) { next(err); }
}

async function listSalaryConfigs(req, res, next) {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const { configs, total } = await salaryService.getAllSalaryConfigs({ page, limit, search });
    return paginatedResponse(res, { data: configs, total, page, limit, message: 'Salary configs fetched' });
  } catch (err) { next(err); }
}

async function upsertSalaryConfig(req, res, next) {
  try {
    const config = await salaryService.upsertSalaryConfig({
      requestingUser: req.user, userId: req.params.userId, data: req.body, req,
    });
    return successResponse(res, { statusCode: 201, message: 'Salary config saved', data: { config } });
  } catch (err) { next(err); }
}

async function listPayroll(req, res, next) {
  try {
    const { page = 1, limit = 20, month, employeeId, status } = req.query;
    const { payrolls, total } = await salaryService.getPayrollList({
      requestingUser: req.user, page, limit, month, employeeId, status,
    });
    return paginatedResponse(res, { data: payrolls, total, page, limit, message: 'Payroll list fetched' });
  } catch (err) { next(err); }
}

async function getPayroll(req, res, next) {
  try {
    const payroll = await salaryService.getPayrollById(req.params.id);
    if (!payroll) {
      return successResponse(res, { statusCode: 404, message: 'Payroll not found', data: null });
    }
    return successResponse(res, { message: 'Payroll fetched', data: { payroll } });
  } catch (err) { next(err); }
}

async function approvePayroll(req, res, next) {
  try {
    const payroll = await salaryService.approvePayroll({
      requestingUser: req.user, payrollId: req.params.id, req,
    });
    return successResponse(res, { message: 'Payroll approved', data: { payroll } });
  } catch (err) { next(err); }
}

async function markPaid(req, res, next) {
  try {
    const payroll = await salaryService.markPaid({
      requestingUser: req.user, payrollId: req.params.id, data: req.body, req,
    });
    return successResponse(res, { message: 'Payroll marked as paid', data: { payroll } });
  } catch (err) { next(err); }
}

async function addIncentive(req, res, next) {
  try {
    const payroll = await salaryService.addIncentive({
      requestingUser: req.user, payrollId: req.params.id, data: req.body, req,
    });
    return successResponse(res, { message: 'Incentive/deduction added', data: { payroll } });
  } catch (err) { next(err); }
}

async function cancelPayroll(req, res, next) {
  try {
    const payroll = await salaryService.cancelPayroll({
      requestingUser: req.user, payrollId: req.params.id, req,
    });
    return successResponse(res, { message: 'Payroll cancelled', data: { payroll } });
  } catch (err) { next(err); }
}

async function manualGenerate(req, res, next) {
  try {
    const { db } = require('../database/client');
    const systemUser = await db.User.findOne({ where: { roleLevel: 1, deletedAt: null }, attributes: ['id'] });
    if (!systemUser) return successResponse(res, { statusCode: 400, message: 'No admin user found', data: null });

    const day = parseInt(req.body.day) || new Date().getDate();
    const result = await salaryService.generatePayrollForDay(day, systemUser.id);
    return successResponse(res, { message: 'Payroll generation triggered', data: result });
  } catch (err) { next(err); }
}

async function createPayroll(req, res, next) {
  try {
    const payroll = await salaryService.createPayrollManually({
      requestingUser: req.user, data: req.body, req,
    });
    return successResponse(res, { statusCode: 201, message: 'Payroll invoice created as DRAFT', data: { payroll } });
  } catch (err) { next(err); }
}

module.exports = {
  getSalaryConfig,
  listSalaryConfigs,
  upsertSalaryConfig,
  listPayroll,
  getPayroll,
  approvePayroll,
  markPaid,
  addIncentive,
  cancelPayroll,
  manualGenerate,
  createPayroll,
};
