'use strict';

const { Op, fn, col, literal } = require('sequelize');
const { db } = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const {
  HTTP_STATUS,
  AUDIT_CATEGORY,
  AUDIT_ACTION,
  FINANCE_MANAGE_MAX_LEVEL,
  BANK_MANAGE_MAX_LEVEL,
} = require('../constants');

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

// ── Bank Account CRUD ─────────────────────────────────────────────────────────

async function createBankAccount({ requestingUser, data, req }) {
  assertLevel(requestingUser, BANK_MANAGE_MAX_LEVEL, 'Admin+ required to manage bank accounts');

  const {
    accountName, accountNumber, bankName, ifscCode,
    accountType, currency, openingBalance, isDefault,
    description, colorCode,
  } = data;

  // If setting as default, unset all others first
  if (isDefault) {
    await db.BankAccount.update({ isDefault: false }, { where: {} });
  }

  const account = await db.BankAccount.create({
    accountName,
    accountNumber:  accountNumber  || null,
    bankName:       bankName       || null,
    ifscCode:       ifscCode       || null,
    accountType:    accountType    || 'CURRENT',
    currency:       currency       || 'INR',
    openingBalance: parseFloat(openingBalance || 0),
    currentBalance: parseFloat(openingBalance || 0), // starts equal to opening
    isDefault:      !!isDefault,
    description:    description    || null,
    colorCode:      colorCode      || null,
    createdById:    requestingUser.id,
  });

  await writeAuditLog(req, {
    category: AUDIT_CATEGORY.SYSTEM,
    action:   AUDIT_ACTION.BANK_ACCOUNT_CREATED,
    targetModel: 'BankAccount',
    targetId: account.id,
    details: { accountName, accountType },
  });

  return account;
}

async function getBankAccounts({ includeInactive = false } = {}) {
  const where = {};
  if (!includeInactive) where.isActive = true;

  return db.BankAccount.findAll({
    where,
    include: [
      { model: db.User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'] },
    ],
    order: [['is_default', 'DESC'], ['account_name', 'ASC']],
  });
}

async function getBankAccountById(id) {
  const account = await db.BankAccount.findOne({
    where: { id, deletedAt: null },
    include: [
      { model: db.User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'] },
    ],
  });
  if (!account) throw notFound('Bank account not found');
  return account;
}

async function updateBankAccount({ requestingUser, id, data, req }) {
  assertLevel(requestingUser, BANK_MANAGE_MAX_LEVEL, 'Admin+ required to manage bank accounts');
  const account = await getBankAccountById(id);

  const allowedFields = ['accountName', 'accountNumber', 'bankName', 'ifscCode', 'description', 'colorCode', 'isActive'];
  const updates = {};
  allowedFields.forEach(f => { if (data[f] !== undefined) updates[f] = data[f]; });

  if (data.isDefault === true) {
    await db.BankAccount.update({ isDefault: false }, { where: {} });
    updates.isDefault = true;
  }

  await account.update(updates);

  await writeAuditLog(req, {
    category: AUDIT_CATEGORY.SYSTEM,
    action:   AUDIT_ACTION.BANK_ACCOUNT_UPDATED,
    targetModel: 'BankAccount',
    targetId: id,
    details: updates,
  });

  return account.reload();
}

async function deleteBankAccount({ requestingUser, id, req }) {
  assertLevel(requestingUser, BANK_MANAGE_MAX_LEVEL, 'Admin+ required to delete bank accounts');
  const account = await getBankAccountById(id);

  // Check if there are any transactions
  const txCount = await db.BankTransaction.count({ where: { bankAccountId: id } });
  if (txCount > 0) {
    throw badRequest('Cannot delete account with existing transactions. Deactivate it instead.');
  }

  await account.destroy();

  await writeAuditLog(req, {
    category: AUDIT_CATEGORY.SYSTEM,
    action:   AUDIT_ACTION.BANK_ACCOUNT_DELETED,
    targetModel: 'BankAccount',
    targetId: id,
    details: { accountName: account.accountName },
  });
}

// ── Bank Transactions ─────────────────────────────────────────────────────────

async function getTransactions({
  bankAccountId, page = 1, limit = 50,
  fromDate, toDate, transactionType, source,
  search,
}) {
  const where = { bankAccountId };

  if (transactionType) where.transactionType = transactionType;
  if (source)         where.source           = source;

  if (fromDate || toDate) {
    where.transactionDate = {};
    if (fromDate) where.transactionDate[Op.gte] = fromDate;
    if (toDate)   where.transactionDate[Op.lte] = toDate;
  }

  if (search) {
    where[Op.or] = [
      { purpose:   { [Op.iLike]: `%${search}%` } },
      { narration: { [Op.iLike]: `%${search}%` } },
      { referenceNumber: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const limitNum = parseInt(limit, 10) || 50;
  const pageNum = parseInt(page, 10) || 1;
  const offset = (pageNum - 1) * limitNum;

  const { count, rows } = await db.BankTransaction.findAndCountAll({
    where,
    include: [
      { model: db.User,   as: 'createdBy', attributes: ['id', 'firstName', 'lastName'] },
      { model: db.Client, as: 'client',    attributes: ['id', 'name', 'clientCode'], required: false },
    ],
    order: [['transaction_date', 'DESC'], ['created_at', 'DESC']],
    limit: limitNum,
    offset,
  });

  return {
    transactions: rows,
    pagination: { total: count, page: pageNum, limit: limitNum, totalPages: Math.ceil(count / limitNum) },
  };
}

async function addTransaction({ requestingUser, bankAccountId, data, req }) {
  assertLevel(requestingUser, FINANCE_MANAGE_MAX_LEVEL, 'Manager+ required to record transactions');

  const account = await getBankAccountById(bankAccountId);

  const {
    transactionType, amount, transactionDate, paymentMode,
    referenceNumber, purpose, narration, clientId,
    source = 'MANUAL', sourceId,
  } = data;

  if (!transactionType || !['CREDIT', 'DEBIT'].includes(transactionType)) {
    throw badRequest('transactionType must be CREDIT or DEBIT');
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    throw badRequest('amount must be a positive number');
  }

  // Compute new running balance
  const currentBalance = parseFloat(account.currentBalance);
  const newBalance = transactionType === 'CREDIT'
    ? parseFloat((currentBalance + parsedAmount).toFixed(2))
    : parseFloat((currentBalance - parsedAmount).toFixed(2));

  // Create transaction
  const tx = await db.BankTransaction.create({
    bankAccountId,
    createdById:     requestingUser.id,
    source,
    sourceId:        sourceId   || null,
    transactionType,
    amount:          parsedAmount,
    runningBalance:  newBalance,
    currency:        account.currency,
    transactionDate: transactionDate || new Date(),
    paymentMode:     paymentMode    || null,
    referenceNumber: referenceNumber || null,
    purpose:         purpose        || null,
    narration:       narration      || null,
    clientId:        clientId       || null,
  });

  // Update account balance
  await account.update({ currentBalance: newBalance });

  await writeAuditLog(req, {
    category: AUDIT_CATEGORY.SYSTEM,
    action:   AUDIT_ACTION.BANK_TRANSACTION_ADDED,
    targetModel: 'BankTransaction',
    targetId: tx.id,
    details: { transactionType, amount: parsedAmount, bankAccountId },
  });

  return tx;
}

/**
 * Auto-called after a client payment is confirmed.
 * Creates a CREDIT transaction entry in the specified bank account.
 */
async function recordPaymentInCashbook({ bankAccountId, clientPayment, requestingUser, req }) {
  if (!bankAccountId) return null; // No account specified — skip

  const account = await db.BankAccount.findOne({ where: { id: bankAccountId, isActive: true, deletedAt: null } });
  if (!account) return null;

  const parsedAmount = parseFloat(clientPayment.amount || 0);
  const currentBalance = parseFloat(account.currentBalance);
  const newBalance = parseFloat((currentBalance + parsedAmount).toFixed(2));

  const tx = await db.BankTransaction.create({
    bankAccountId,
    createdById:     requestingUser?.id || clientPayment.collectedById || clientPayment.createdById,
    source:          clientPayment.paymentType === 'ADVANCE' ? 'ADVANCE' : 'INVOICE_PAYMENT',
    sourceId:        clientPayment.id,
    transactionType: 'CREDIT',
    amount:          parsedAmount,
    runningBalance:  newBalance,
    currency:        clientPayment.currency || 'INR',
    transactionDate: clientPayment.paidDate || new Date(),
    paymentMode:     clientPayment.paymentMode || null,
    referenceNumber: clientPayment.referenceNumber || null,
    purpose:         `Payment received — ${clientPayment.invoiceNumber || clientPayment.id}`,
    clientId:        clientPayment.clientId || null,
  });

  await account.update({ currentBalance: newBalance });

  return tx;
}

/**
 * Auto-called after an expense is approved/paid.
 * Creates a DEBIT transaction entry in the specified bank account.
 */
async function recordExpenseInCashbook({ expense, requestingUser, req }) {
  if (!expense.bankAccountId) return null;

  const account = await db.BankAccount.findOne({ where: { id: expense.bankAccountId, isActive: true, deletedAt: null } });
  if (!account) return null;

  const parsedAmount = parseFloat(expense.totalAmount || expense.amount || 0);
  const currentBalance = parseFloat(account.currentBalance);
  const newBalance = parseFloat((currentBalance - parsedAmount).toFixed(2));

  const tx = await db.BankTransaction.create({
    bankAccountId:   expense.bankAccountId,
    createdById:     requestingUser?.id || expense.approvedById,
    source:          'EXPENSE',
    sourceId:        expense.id,
    transactionType: 'DEBIT',
    amount:          parsedAmount,
    runningBalance:  newBalance,
    currency:        expense.currency || 'INR',
    transactionDate: expense.expenseDate || new Date(),
    paymentMode:     expense.paymentMode || null,
    referenceNumber: expense.referenceNumber || null,
    purpose:         `Expense: ${expense.title} — ${expense.expenseNumber || ''}`,
    clientId:        expense.clientId || null,
  });

  await account.update({ currentBalance: newBalance });

  return tx;
}

async function getAccountSummary() {
  const accounts = await db.BankAccount.findAll({
    where: { isActive: true, deletedAt: null },
    attributes: ['id', 'accountName', 'accountType', 'currentBalance', 'currency', 'isDefault', 'colorCode'],
    order: [['is_default', 'DESC'], ['account_type', 'ASC']],
  });

  const totalBalance = accounts.reduce((sum, a) => sum + parseFloat(a.currentBalance || 0), 0);

  return { accounts, totalBalance: parseFloat(totalBalance.toFixed(2)) };
}

module.exports = {
  createBankAccount,
  getBankAccounts,
  getBankAccountById,
  updateBankAccount,
  deleteBankAccount,
  getTransactions,
  addTransaction,
  recordPaymentInCashbook,
  recordExpenseInCashbook,
  getAccountSummary,
};
