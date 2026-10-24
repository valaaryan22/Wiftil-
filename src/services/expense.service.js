'use strict';

const { Op } = require('sequelize');
const { db } = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const {
  HTTP_STATUS,
  AUDIT_CATEGORY,
  AUDIT_ACTION,
  EXPENSE_MANAGE_MAX_LEVEL,
  CLIENT_MANAGE_MAX_LEVEL,
} = require('../constants');
const bankSvc = require('./bankAccount.service');

// ── Helpers ───────────────────────────────────────────────────────────────────

function assertLevel(user, maxLevel, msg) {
  if (user.roleLevel > maxLevel) {
    const err = new Error(msg || `Access level ≤ ${maxLevel} required`);
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }
}

function notFound(msg) {
  const err = new Error(msg);
  err.statusCode = HTTP_STATUS.NOT_FOUND;
  return err;
}

function badRequest(msg) {
  const err = new Error(msg);
  err.statusCode = HTTP_STATUS.BAD_REQUEST;
  return err;
}

const EXPENSE_INCLUDE = [
  { model: db.ExpenseCategory, as: 'category',    attributes: ['id', 'name', 'colorCode'], required: false },
  { model: db.User,            as: 'recordedBy',  attributes: ['id', 'firstName', 'lastName'] },
  { model: db.User,            as: 'approvedBy',  attributes: ['id', 'firstName', 'lastName'], required: false },
  { model: db.Client,          as: 'client',      attributes: ['id', 'name', 'clientCode'], required: false },
  { model: db.BankAccount,     as: 'bankAccount', attributes: ['id', 'accountName', 'accountType'], required: false },
];

// ── Category CRUD ─────────────────────────────────────────────────────────────

async function getCategories({ includeInactive = false } = {}) {
  const where = {};
  if (!includeInactive) where.isActive = true;
  return db.ExpenseCategory.findAll({
    where,
    include: [{ model: db.User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'] }],
    order: [['name', 'ASC']],
  });
}

async function createCategory({ requestingUser, data, req }) {
  assertLevel(requestingUser, EXPENSE_MANAGE_MAX_LEVEL, 'Manager+ required to manage expense categories');
  const { name, description, colorCode } = data;

  if (!name?.trim()) throw badRequest('Category name is required');

  const existing = await db.ExpenseCategory.findOne({ where: { name: name.trim() } });
  if (existing) throw badRequest('Category with this name already exists');

  const cat = await db.ExpenseCategory.create({
    name: name.trim(), description, colorCode, createdById: requestingUser.id,
  });
  return cat;
}

async function updateCategory({ requestingUser, id, data, req }) {
  assertLevel(requestingUser, EXPENSE_MANAGE_MAX_LEVEL);
  const cat = await db.ExpenseCategory.findByPk(id);
  if (!cat) throw notFound('Category not found');
  await cat.update({ name: data.name, description: data.description, colorCode: data.colorCode, isActive: data.isActive });
  return cat;
}

// ── Expense CRUD ──────────────────────────────────────────────────────────────

async function getExpenses({
  page = 1, limit = 20, search, status, categoryId, clientId,
  fromDate, toDate, sortBy = 'expense_date', sortOrder = 'DESC',
  recordedById,
} = {}) {
  const where = {};

  if (status)     where.status     = status;
  if (categoryId) where.categoryId = categoryId;
  if (clientId)   where.clientId   = clientId;
  if (recordedById) where.recordedById = recordedById;

  if (fromDate || toDate) {
    where.expenseDate = {};
    if (fromDate) where.expenseDate[Op.gte] = fromDate;
    if (toDate)   where.expenseDate[Op.lte] = toDate;
  }

  if (search) {
    where[Op.or] = [
      { title:          { [Op.iLike]: `%${search}%` } },
      { vendorName:     { [Op.iLike]: `%${search}%` } },
      { expenseNumber:  { [Op.iLike]: `%${search}%` } },
      { referenceNumber:{ [Op.iLike]: `%${search}%` } },
    ];
  }

  const limitNum = parseInt(limit, 10) || 20;
  const pageNum = parseInt(page, 10) || 1;
  const offset = (pageNum - 1) * limitNum;
  const validSortFields = { expense_date: 'expense_date', created_at: 'created_at', total_amount: 'total_amount', title: 'title' };
  const orderField = validSortFields[sortBy] || 'expense_date';

  const { count, rows } = await db.Expense.findAndCountAll({
    where,
    include: EXPENSE_INCLUDE,
    order: [[orderField, sortOrder === 'ASC' ? 'ASC' : 'DESC']],
    limit: limitNum,
    offset,
  });

  return {
    expenses: rows,
    pagination: { total: count, page: pageNum, limit: limitNum, totalPages: Math.ceil(count / limitNum) },
  };
}

async function getExpenseById(id) {
  const expense = await db.Expense.findOne({
    where: { id, deletedAt: null },
    include: EXPENSE_INCLUDE,
  });
  if (!expense) throw notFound('Expense not found');
  return expense;
}

async function createExpense({ requestingUser, data, req }) {
  const {
    title, categoryId, clientId, bankAccountId, vendorName, description,
    status = 'DRAFT', paymentMode, amount, taxAmount, taxRate,
    expenseDate, referenceNumber, attachments, internalNotes, isBillable, currency,
  } = data;

  if (!title?.trim()) throw badRequest('Expense title is required');
  if (!amount || parseFloat(amount) < 0) throw badRequest('amount must be a non-negative number');
  if (!expenseDate) throw badRequest('expenseDate is required');

  const finalStatus = (requestingUser.roleLevel <= EXPENSE_MANAGE_MAX_LEVEL && ['APPROVED', 'PAID'].includes(status))
    ? 'APPROVED'
    : (['DRAFT', 'SUBMITTED'].includes(status) ? status : 'DRAFT');

  const cleanBankAccountId = (bankAccountId && bankAccountId !== 'none' && bankAccountId !== '') ? bankAccountId : null;
  const cleanCategoryId    = (categoryId && categoryId !== 'none' && categoryId !== '') ? categoryId : null;
  const cleanClientId      = (clientId && clientId !== 'none' && clientId !== '') ? clientId : null;

  const expense = await db.Expense.create({
    title: title.trim(),
    categoryId:      cleanCategoryId,
    clientId:        cleanClientId,
    bankAccountId:   cleanBankAccountId,
    vendorName:      vendorName      || null,
    description:     description     || null,
    status:          finalStatus,
    paymentMode:     paymentMode     || null,
    currency:        currency        || 'INR',
    amount:          parseFloat(amount),
    taxAmount:       parseFloat(taxAmount || 0),
    taxRate:         taxRate         ? parseFloat(taxRate) : null,
    expenseDate,
    referenceNumber: referenceNumber || null,
    attachments:     attachments     || null,
    internalNotes:   internalNotes   || null,
    isBillable:      !!isBillable,
    recordedById:    requestingUser.id,
    approvedById:    finalStatus === 'APPROVED' ? requestingUser.id : null,
    approvedAt:      finalStatus === 'APPROVED' ? new Date() : null,
  });

  // If approved upon creation and has a bank account, record debit in cashbook
  if (finalStatus === 'APPROVED' && expense.bankAccountId) {
    try {
      await bankSvc.recordExpenseInCashbook({ expense, requestingUser, req });
    } catch (bankErr) {
      console.error('[CreateExpense] Failed to record debit in cashbook:', bankErr);
    }
  }

  await writeAuditLog(req, {
    category: AUDIT_CATEGORY.SYSTEM,
    action:   AUDIT_ACTION.EXPENSE_CREATED,
    targetModel: 'Expense',
    targetId: expense.id,
    details: { title, amount: expense.amount, totalAmount: expense.totalAmount },
  });

  return expense.reload({ include: EXPENSE_INCLUDE });
}

async function updateExpense({ requestingUser, id, data, req }) {
  const expense = await getExpenseById(id);

  if (!['DRAFT', 'SUBMITTED'].includes(expense.status)) {
    throw badRequest('Only DRAFT or SUBMITTED expenses can be edited');
  }

  // Non-managers can only edit their own expenses
  if (requestingUser.roleLevel > EXPENSE_MANAGE_MAX_LEVEL && expense.recordedById !== requestingUser.id) {
    throw Object.assign(new Error('You can only edit your own expenses'), { statusCode: HTTP_STATUS.FORBIDDEN });
  }

  const allowedFields = [
    'title', 'categoryId', 'clientId', 'bankAccountId', 'vendorName', 'description',
    'paymentMode', 'amount', 'taxAmount', 'taxRate', 'expenseDate',
    'referenceNumber', 'attachments', 'internalNotes', 'isBillable', 'currency',
  ];
  const updates = {};
  allowedFields.forEach(f => { if (data[f] !== undefined) updates[f] = data[f]; });
  if (updates.amount) updates.amount = parseFloat(updates.amount);
  if (updates.taxAmount) updates.taxAmount = parseFloat(updates.taxAmount || 0);
  if ('bankAccountId' in updates) {
    updates.bankAccountId = (updates.bankAccountId && updates.bankAccountId !== 'none') ? updates.bankAccountId : null;
  }
  if ('categoryId' in updates) {
    updates.categoryId = (updates.categoryId && updates.categoryId !== 'none') ? updates.categoryId : null;
  }
  if ('clientId' in updates) {
    updates.clientId = (updates.clientId && updates.clientId !== 'none') ? updates.clientId : null;
  }

  await expense.update(updates);

  await writeAuditLog(req, {
    category: AUDIT_CATEGORY.SYSTEM,
    action:   AUDIT_ACTION.EXPENSE_UPDATED,
    targetModel: 'Expense',
    targetId: id,
    details: updates,
  });

  return expense.reload({ include: EXPENSE_INCLUDE });
}

async function submitExpense({ requestingUser, id, req }) {
  const expense = await getExpenseById(id);

  if (expense.status !== 'DRAFT') {
    throw badRequest('Only DRAFT expenses can be submitted for review');
  }

  if (requestingUser.roleLevel > EXPENSE_MANAGE_MAX_LEVEL && expense.recordedById !== requestingUser.id) {
    throw Object.assign(new Error('You can only submit your own expenses'), { statusCode: HTTP_STATUS.FORBIDDEN });
  }

  await expense.update({ status: 'SUBMITTED' });

  await writeAuditLog(req, {
    category: AUDIT_CATEGORY.SYSTEM,
    action:   AUDIT_ACTION.EXPENSE_SUBMITTED,
    targetModel: 'Expense',
    targetId: id,
    details: { expenseNumber: expense.expenseNumber },
  });

  return expense.reload({ include: EXPENSE_INCLUDE });
}

async function approveExpense({ requestingUser, id, req }) {
  assertLevel(requestingUser, EXPENSE_MANAGE_MAX_LEVEL, 'Manager+ required to approve expenses');
  const expense = await getExpenseById(id);

  if (!['SUBMITTED', 'DRAFT'].includes(expense.status)) {
    throw badRequest('Only DRAFT or SUBMITTED expenses can be approved');
  }

  await expense.update({
    status:     'APPROVED',
    approvedById: requestingUser.id,
    approvedAt:   new Date(),
  });

  // Auto-record debit in cashbook if bank account is set
  if (expense.bankAccountId) {
    await bankSvc.recordExpenseInCashbook({ expense, requestingUser, req });
  }

  await writeAuditLog(req, {
    category: AUDIT_CATEGORY.SYSTEM,
    action:   AUDIT_ACTION.EXPENSE_APPROVED,
    targetModel: 'Expense',
    targetId: id,
    details: { expenseNumber: expense.expenseNumber, totalAmount: expense.totalAmount },
  });

  return expense.reload({ include: EXPENSE_INCLUDE });
}

async function rejectExpense({ requestingUser, id, data, req }) {
  assertLevel(requestingUser, EXPENSE_MANAGE_MAX_LEVEL, 'Manager+ required to reject expenses');
  const expense = await getExpenseById(id);

  if (!['SUBMITTED', 'DRAFT'].includes(expense.status)) {
    throw badRequest('Only SUBMITTED or DRAFT expenses can be rejected');
  }

  await expense.update({
    status:         'REJECTED',
    rejectionReason: data?.rejectionReason || null,
  });

  await writeAuditLog(req, {
    category: AUDIT_CATEGORY.SYSTEM,
    action:   AUDIT_ACTION.EXPENSE_REJECTED,
    targetModel: 'Expense',
    targetId: id,
    details: { expenseNumber: expense.expenseNumber, rejectionReason: data?.rejectionReason },
  });

  return expense.reload({ include: EXPENSE_INCLUDE });
}

async function deleteExpense({ requestingUser, id, req }) {
  const expense = await getExpenseById(id);

  if (!['DRAFT', 'REJECTED'].includes(expense.status)) {
    throw badRequest('Only DRAFT or REJECTED expenses can be deleted');
  }

  if (requestingUser.roleLevel > EXPENSE_MANAGE_MAX_LEVEL && expense.recordedById !== requestingUser.id) {
    throw Object.assign(new Error('You can only delete your own expenses'), { statusCode: HTTP_STATUS.FORBIDDEN });
  }

  await expense.destroy();

  await writeAuditLog(req, {
    category: AUDIT_CATEGORY.SYSTEM,
    action:   AUDIT_ACTION.EXPENSE_DELETED,
    targetModel: 'Expense',
    targetId: id,
    details: { expenseNumber: expense.expenseNumber },
  });
}

async function getExpenseSummary({ fromDate, toDate, categoryId } = {}) {
  const where = { status: { [Op.in]: ['APPROVED', 'PAID'] } };

  if (fromDate || toDate) {
    where.expenseDate = {};
    if (fromDate) where.expenseDate[Op.gte] = fromDate;
    if (toDate)   where.expenseDate[Op.lte] = toDate;
  }
  if (categoryId) where.categoryId = categoryId;

  const expenses = await db.Expense.findAll({
    where,
    include: [
      { model: db.ExpenseCategory, as: 'category', attributes: ['id', 'name', 'colorCode'], required: false },
    ],
  });

  const totalAmount = expenses.reduce((s, e) => s + parseFloat(e.totalAmount || 0), 0);

  // Category-wise breakdown
  const byCategory = {};
  expenses.forEach(e => {
    const catName = e.category?.name || 'Uncategorized';
    const catId   = e.categoryId || 'none';
    if (!byCategory[catId]) {
      byCategory[catId] = {
        categoryId: catId,
        categoryName: catName,
        colorCode: e.category?.colorCode,
        total: 0,
        count: 0,
      };
    }
    byCategory[catId].total += parseFloat(e.totalAmount || 0);
    byCategory[catId].count++;
  });

  // Status counts
  const allStatuses = await db.Expense.findAll({
    attributes: ['status', [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count'],
      [db.sequelize.fn('SUM', db.sequelize.col('total_amount')), 'total']],
    group: ['status'],
    raw: true,
  });

  return {
    totalApprovedAmount: parseFloat(totalAmount.toFixed(2)),
    totalExpenses: expenses.length,
    byCategory: Object.values(byCategory).map(c => ({ ...c, total: parseFloat(c.total.toFixed(2)) })),
    byStatus: allStatuses.reduce((acc, s) => {
      acc[s.status] = { count: parseInt(s.count), total: parseFloat(s.total || 0) };
      return acc;
    }, {}),
  };
}

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  getExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  submitExpense,
  approveExpense,
  rejectExpense,
  deleteExpense,
  getExpenseSummary,
};
