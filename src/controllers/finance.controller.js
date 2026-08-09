'use strict';

const svc = require('../services/finance.service');
const { successResponse } = require('../utils/response');

const getFinanceDashboard = async (req, res, next) => {
  try {
    const data = await svc.getFinanceDashboard();
    successResponse(res, { data: { dashboard: data } });
  } catch (e) { next(e); }
};

const getAllInvoices = async (req, res, next) => {
  try {
    const result = await svc.getAllInvoices({ ...req.query });
    successResponse(res, { data: result });
  } catch (e) { next(e); }
};

const getReceivables = async (req, res, next) => {
  try {
    const data = await svc.getReceivables({ clientId: req.query.clientId });
    successResponse(res, { data: { receivables: data } });
  } catch (e) { next(e); }
};

const getBillingConfig = async (req, res, next) => {
  try {
    const data = await svc.getBillingConfig(req.params.clientId);
    successResponse(res, { data: { billingConfig: data } });
  } catch (e) { next(e); }
};

const upsertBillingConfig = async (req, res, next) => {
  try {
    const data = await svc.upsertBillingConfig({
      requestingUser: req.user,
      clientId: req.params.clientId,
      data: req.body,
      req,
    });
    successResponse(res, { message: 'Billing configuration saved', data: { billingConfig: data } });
  } catch (e) { next(e); }
};

const generateDueInvoices = async (req, res, next) => {
  try {
    const data = await svc.generateDueInvoices({ requestingUser: req.user, req });
    successResponse(res, { message: `Generated ${data.totalGenerated} invoice(s)`, data });
  } catch (e) { next(e); }
};

module.exports = {
  getFinanceDashboard,
  getAllInvoices,
  getReceivables,
  getBillingConfig,
  upsertBillingConfig,
  generateDueInvoices,
};
