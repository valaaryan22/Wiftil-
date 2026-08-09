'use strict';

const svc = require('../services/bankAccount.service');
const { successResponse } = require('../utils/response');

// ── Bank Accounts ─────────────────────────────────────────────────────────────

const getBankAccounts = async (req, res, next) => {
  try {
    const data = await svc.getBankAccounts({ includeInactive: req.query.includeInactive === 'true' });
    successResponse(res, { data: { accounts: data } });
  } catch (e) { next(e); }
};

const getAccountSummary = async (req, res, next) => {
  try {
    const data = await svc.getAccountSummary();
    successResponse(res, { data: { summary: data } });
  } catch (e) { next(e); }
};

const getBankAccountById = async (req, res, next) => {
  try {
    const data = await svc.getBankAccountById(req.params.accountId);
    successResponse(res, { data: { account: data } });
  } catch (e) { next(e); }
};

const createBankAccount = async (req, res, next) => {
  try {
    const data = await svc.createBankAccount({ requestingUser: req.user, data: req.body, req });
    successResponse(res, { statusCode: 201, message: 'Bank account created', data: { account: data } });
  } catch (e) { next(e); }
};

const updateBankAccount = async (req, res, next) => {
  try {
    const data = await svc.updateBankAccount({ requestingUser: req.user, id: req.params.accountId, data: req.body, req });
    successResponse(res, { message: 'Bank account updated', data: { account: data } });
  } catch (e) { next(e); }
};

const deleteBankAccount = async (req, res, next) => {
  try {
    await svc.deleteBankAccount({ requestingUser: req.user, id: req.params.accountId, req });
    successResponse(res, { message: 'Bank account deleted' });
  } catch (e) { next(e); }
};

// ── Transactions ──────────────────────────────────────────────────────────────

const getTransactions = async (req, res, next) => {
  try {
    const result = await svc.getTransactions({ bankAccountId: req.params.accountId, ...req.query });
    successResponse(res, { data: result });
  } catch (e) { next(e); }
};

const addTransaction = async (req, res, next) => {
  try {
    const data = await svc.addTransaction({
      requestingUser: req.user,
      bankAccountId: req.params.accountId,
      data: req.body,
      req,
    });
    successResponse(res, { statusCode: 201, message: 'Transaction recorded', data: { transaction: data } });
  } catch (e) { next(e); }
};

module.exports = {
  getBankAccounts,
  getAccountSummary,
  getBankAccountById,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  getTransactions,
  addTransaction,
};
