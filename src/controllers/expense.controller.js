'use strict';

const svc = require('../services/expense.service');
const { successResponse } = require('../utils/response');

// ── Categories ────────────────────────────────────────────────────────────────

const getCategories = async (req, res, next) => {
  try {
    const data = await svc.getCategories({ includeInactive: req.query.includeInactive === 'true' });
    successResponse(res, { data: { categories: data } });
  } catch (e) { next(e); }
};

const createCategory = async (req, res, next) => {
  try {
    const data = await svc.createCategory({ requestingUser: req.user, data: req.body, req });
    successResponse(res, { statusCode: 201, message: 'Category created', data: { category: data } });
  } catch (e) { next(e); }
};

const updateCategory = async (req, res, next) => {
  try {
    const data = await svc.updateCategory({ requestingUser: req.user, id: req.params.categoryId, data: req.body, req });
    successResponse(res, { message: 'Category updated', data: { category: data } });
  } catch (e) { next(e); }
};

// ── Expenses ──────────────────────────────────────────────────────────────────

const getExpenses = async (req, res, next) => {
  try {
    const result = await svc.getExpenses({ ...req.query });
    successResponse(res, { data: result });
  } catch (e) { next(e); }
};

const getExpenseSummary = async (req, res, next) => {
  try {
    const data = await svc.getExpenseSummary({ ...req.query });
    successResponse(res, { data: { summary: data } });
  } catch (e) { next(e); }
};

const getExpenseById = async (req, res, next) => {
  try {
    const data = await svc.getExpenseById(req.params.expenseId);
    successResponse(res, { data: { expense: data } });
  } catch (e) { next(e); }
};

const createExpense = async (req, res, next) => {
  try {
    const data = await svc.createExpense({ requestingUser: req.user, data: req.body, req });
    successResponse(res, { statusCode: 201, message: 'Expense created', data: { expense: data } });
  } catch (e) { next(e); }
};

const updateExpense = async (req, res, next) => {
  try {
    const data = await svc.updateExpense({ requestingUser: req.user, id: req.params.expenseId, data: req.body, req });
    successResponse(res, { message: 'Expense updated', data: { expense: data } });
  } catch (e) { next(e); }
};

const submitExpense = async (req, res, next) => {
  try {
    const data = await svc.submitExpense({ requestingUser: req.user, id: req.params.expenseId, req });
    successResponse(res, { message: 'Expense submitted for review', data: { expense: data } });
  } catch (e) { next(e); }
};

const approveExpense = async (req, res, next) => {
  try {
    const data = await svc.approveExpense({ requestingUser: req.user, id: req.params.expenseId, req });
    successResponse(res, { message: 'Expense approved', data: { expense: data } });
  } catch (e) { next(e); }
};

const rejectExpense = async (req, res, next) => {
  try {
    const data = await svc.rejectExpense({ requestingUser: req.user, id: req.params.expenseId, data: req.body, req });
    successResponse(res, { message: 'Expense rejected', data: { expense: data } });
  } catch (e) { next(e); }
};

const deleteExpense = async (req, res, next) => {
  try {
    await svc.deleteExpense({ requestingUser: req.user, id: req.params.expenseId, req });
    successResponse(res, { message: 'Expense deleted' });
  } catch (e) { next(e); }
};

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  getExpenses,
  getExpenseSummary,
  getExpenseById,
  createExpense,
  updateExpense,
  submitExpense,
  approveExpense,
  rejectExpense,
  deleteExpense,
};
