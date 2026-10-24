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
  search, includeNonBank = true,
}) {
  const limitNum = parseInt(limit, 10) || 50;
  const pageNum = parseInt(page, 10) || 1;
  const offset = (pageNum - 1) * limitNum;

  // 1. If specifically querying non-bank expenses
  if (bankAccountId === 'non-bank') {
    const expWhere = {
      bankAccountId: null,
      deletedAt: null,
    };
    if (fromDate || toDate) {
      expWhere.expenseDate = {};
      if (fromDate) expWhere.expenseDate[Op.gte] = fromDate;
      if (toDate)   expWhere.expenseDate[Op.lte] = toDate;
    }
    if (search) {
      expWhere[Op.or] = [
        { title:           { [Op.like]: `%${search}%` } },
        { vendorName:      { [Op.like]: `%${search}%` } },
        { referenceNumber: { [Op.like]: `%${search}%` } },
        { description:     { [Op.like]: `%${search}%` } },
      ];
    }
    const { count, rows: expRows } = await db.Expense.findAndCountAll({
      where: expWhere,
      include: [
        { model: db.User,   as: 'recordedBy', attributes: ['id', 'firstName', 'lastName'], required: false },
        { model: db.Client, as: 'client',     attributes: ['id', 'name', 'clientCode'], required: false },
      ],
      order: [['expense_date', 'DESC'], ['created_at', 'DESC']],
      limit: limitNum,
      offset,
    });

    const expTxs = expRows.map(e => ({
      id: `exp-${e.id}`,
      bankAccountId: null,
      bankAccount: { id: 'non-bank', accountName: 'Cash / Direct Expense', accountType: 'CASH', colorCode: '#64748b', currency: e.currency || 'INR' },
      transactionType: 'DEBIT',
      amount: parseFloat(e.totalAmount || e.amount || 0),
      runningBalance: null,
      currency: e.currency || 'INR',
      transactionDate: e.expenseDate,
      source: 'EXPENSE',
      sourceId: e.id,
      paymentMode: e.paymentMode || 'CASH',
      referenceNumber: e.referenceNumber || e.expenseNumber,
      purpose: `Expense: ${e.title}${e.vendorName ? ` (${e.vendorName})` : ''}`,
      narration: e.description,
      isReconciled: false,
      isNonBankExpense: true,
      expenseStatus: e.status,
      createdBy: e.recordedBy || null,
      client: e.client || null,
      createdAt: e.createdAt,
    }));

    return {
      transactions: expTxs,
      pagination: { total: count, page: pageNum, limit: limitNum, totalPages: Math.ceil(count / limitNum) },
    };
  }

  // 2. Standard bank transactions query
  const where = {};
  if (bankAccountId && bankAccountId !== 'all') {
    where.bankAccountId = bankAccountId;
  }

  if (transactionType) where.transactionType = transactionType;
  if (source)         where.source           = source;

  if (fromDate || toDate) {
    where.transactionDate = {};
    if (fromDate) where.transactionDate[Op.gte] = fromDate;
    if (toDate)   where.transactionDate[Op.lte] = toDate;
  }

  if (search) {
    where[Op.or] = [
      { purpose:   { [Op.like]: `%${search}%` } },
      { narration: { [Op.like]: `%${search}%` } },
      { referenceNumber: { [Op.like]: `%${search}%` } },
    ];
  }

  const { count: txCount, rows: txRows } = await db.BankTransaction.findAndCountAll({
    where,
    include: [
      { model: db.User,   as: 'createdBy', attributes: ['id', 'firstName', 'lastName'] },
      { model: db.Client, as: 'client',    attributes: ['id', 'name', 'clientCode'], required: false },
      { model: db.BankAccount, as: 'bankAccount', attributes: ['id', 'accountName', 'accountType', 'colorCode', 'currency'], required: false },
    ],
    order: [['transaction_date', 'DESC'], ['created_at', 'DESC']],
    limit: (!bankAccountId || bankAccountId === 'all') ? 100 : limitNum,
    offset: (!bankAccountId || bankAccountId === 'all') ? 0 : offset,
  });

  // 3. When viewing "all", also include non-bank expenses (expenses without bank account)
  if ((!bankAccountId || bankAccountId === 'all') && includeNonBank && transactionType !== 'CREDIT' && (!source || source === 'EXPENSE')) {
    const expWhere = {
      bankAccountId: null,
      deletedAt: null,
    };
    if (fromDate || toDate) {
      expWhere.expenseDate = {};
      if (fromDate) expWhere.expenseDate[Op.gte] = fromDate;
      if (toDate)   expWhere.expenseDate[Op.lte] = toDate;
    }
    if (search) {
      expWhere[Op.or] = [
        { title:           { [Op.like]: `%${search}%` } },
        { vendorName:      { [Op.like]: `%${search}%` } },
        { referenceNumber: { [Op.like]: `%${search}%` } },
        { description:     { [Op.like]: `%${search}%` } },
      ];
    }
    const expRows = await db.Expense.findAll({
      where: expWhere,
      include: [
        { model: db.User,   as: 'recordedBy', attributes: ['id', 'firstName', 'lastName'], required: false },
        { model: db.Client, as: 'client',     attributes: ['id', 'name', 'clientCode'], required: false },
      ],
      order: [['expense_date', 'DESC'], ['created_at', 'DESC']],
      limit: 100,
    });

    const expTxs = expRows.map(e => ({
      id: `exp-${e.id}`,
      bankAccountId: null,
      bankAccount: { id: 'non-bank', accountName: 'Cash / Direct Expense', accountType: 'CASH', colorCode: '#64748b', currency: e.currency || 'INR' },
      transactionType: 'DEBIT',
      amount: parseFloat(e.totalAmount || e.amount || 0),
      runningBalance: null,
      currency: e.currency || 'INR',
      transactionDate: e.expenseDate,
      source: 'EXPENSE',
      sourceId: e.id,
      paymentMode: e.paymentMode || 'CASH',
      referenceNumber: e.referenceNumber || e.expenseNumber,
      purpose: `Expense: ${e.title}${e.vendorName ? ` (${e.vendorName})` : ''}`,
      narration: e.description,
      isReconciled: false,
      isNonBankExpense: true,
      expenseStatus: e.status,
      createdBy: e.recordedBy || null,
      client: e.client || null,
      createdAt: e.createdAt,
    }));

    // Merge & sort chronologically
    const merged = [...txRows, ...expTxs].sort((a, b) => {
      const dateA = new Date(a.transactionDate).getTime();
      const dateB = new Date(b.transactionDate).getTime();
      return dateB - dateA;
    });

    const totalCount = merged.length;
    const paginated = merged.slice(offset, offset + limitNum);

    return {
      transactions: paginated,
      pagination: { total: totalCount, page: pageNum, limit: limitNum, totalPages: Math.ceil(totalCount / limitNum) || 1 },
    };
  }

  return {
    transactions: txRows,
    pagination: { total: txCount, page: pageNum, limit: limitNum, totalPages: Math.ceil(txCount / limitNum) || 1 },
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
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfMonthStr = startOfMonth.toISOString().slice(0, 10);

  // 1. Bank Accounts
  const accounts = await db.BankAccount.findAll({
    where: { isActive: true, deletedAt: null },
    attributes: ['id', 'accountName', 'accountType', 'accountNumber', 'bankName', 'currentBalance', 'currency', 'isDefault', 'colorCode'],
    order: [['is_default', 'DESC'], ['account_type', 'ASC']],
  });
  const totalBalance = accounts.reduce((sum, a) => sum + parseFloat(a.currentBalance || 0), 0);

  // 2. Collected Money (From Client Payments)
  const [collectedAgg] = await db.sequelize.query(`
    SELECT
      COALESCE(SUM(paid_amount), 0) AS total_collected_all_time,
      COALESCE(SUM(CASE WHEN payment_type = 'INVOICE' THEN paid_amount ELSE 0 END), 0) AS invoice_collected,
      COALESCE(SUM(CASE WHEN payment_type = 'ADVANCE' THEN paid_amount ELSE 0 END), 0) AS advance_collected,
      COALESCE(SUM(CASE WHEN payment_type = 'PAYMENT' THEN paid_amount ELSE 0 END), 0) AS direct_payment_collected,
      COALESCE(SUM(CASE WHEN COALESCE(paid_date, invoice_date, created_at) >= :startOfMonth THEN paid_amount ELSE 0 END), 0) AS collected_this_month,
      COUNT(CASE WHEN paid_amount > 0 THEN 1 ELSE NULL END) AS collections_count
    FROM client_payments
    WHERE deleted_at IS NULL AND paid_amount > 0
  `, {
    replacements: { startOfMonth: startOfMonthStr },
    type: db.sequelize.QueryTypes.SELECT,
  });

  // Collections by Payment Mode
  const collectionsByMode = await db.sequelize.query(`
    SELECT
      COALESCE(payment_mode, 'OTHER') AS mode,
      COALESCE(SUM(paid_amount), 0) AS total,
      COUNT(*) AS count
    FROM client_payments
    WHERE deleted_at IS NULL AND paid_amount > 0
    GROUP BY payment_mode
    ORDER BY total DESC
  `, { type: db.sequelize.QueryTypes.SELECT });

  // Recent Collections
  const recentCollections = await db.ClientPayment.findAll({
    where: {
      deletedAt: null,
      paidAmount: { [Op.gt]: 0 },
    },
    attributes: [
      'id', 'invoiceNumber', 'paymentType', 'paymentMode', 'paidAmount',
      'totalAmount', 'paidDate', 'invoiceDate', 'currency', 'referenceNumber', 'internalNotes'
    ],
    include: [{ model: db.Client, as: 'client', attributes: ['id', 'name', 'clientCode'], required: false }],
    order: [['paid_date', 'DESC'], ['created_at', 'DESC']],
    limit: 20,
  });

  // 3. Salaries (Employee Payroll)
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [salaryAgg] = await db.sequelize.query(`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'PAID' THEN net_salary ELSE 0 END), 0) AS total_salary_paid_all_time,
      COALESCE(SUM(CASE WHEN status = 'PAID' AND payroll_month = :currentMonth THEN net_salary ELSE 0 END), 0) AS salary_paid_this_month,
      COALESCE(SUM(CASE WHEN status = 'APPROVED' THEN net_salary ELSE 0 END), 0) AS salary_approved_pending,
      COALESCE(SUM(CASE WHEN status = 'DRAFT' THEN net_salary ELSE 0 END), 0) AS salary_draft,
      COUNT(CASE WHEN status = 'PAID' THEN 1 ELSE NULL END) AS paid_count
    FROM employee_payroll
    WHERE deleted_at IS NULL
  `, {
    replacements: { currentMonth: currentMonthStr },
    type: db.sequelize.QueryTypes.SELECT,
  });

  // Recent Salaries
  const recentSalaries = await db.EmployeePayroll.findAll({
    where: {
      deletedAt: null,
      status: { [Op.in]: ['PAID', 'APPROVED'] },
    },
    attributes: [
      'id', 'netSalary', 'baseSalary', 'deductionAmount', 'incentiveAmount',
      'payrollMonth', 'salaryDate', 'status',
      ['payment_mode', 'paymentMethod'],
      ['reference_number', 'paymentReference'],
      'paymentMode', 'referenceNumber',
      'paidAt'
    ],
    include: [{
      model: db.User,
      as: 'employee',
      attributes: ['id', 'firstName', 'lastName', 'email', 'department', 'jobTitle', 'profilePicture'],
      required: false,
    }],
    order: [['paid_at', 'DESC'], ['created_at', 'DESC']],
    limit: 20,
  });

  // 4. Expenses
  const [expenseAgg] = await db.sequelize.query(`
    SELECT
      COALESCE(SUM(CASE WHEN status IN ('APPROVED', 'PAID') THEN total_amount ELSE 0 END), 0) AS total_expenses_all_time,
      COALESCE(SUM(CASE WHEN status IN ('APPROVED', 'PAID') AND expense_date >= :startOfMonth THEN total_amount ELSE 0 END), 0) AS expenses_this_month,
      COALESCE(SUM(CASE WHEN status = 'PAID' THEN total_amount ELSE 0 END), 0) AS expenses_paid,
      COUNT(CASE WHEN status IN ('APPROVED', 'PAID') THEN 1 ELSE NULL END) AS expense_count
    FROM expenses
    WHERE deleted_at IS NULL
  `, {
    replacements: { startOfMonth: startOfMonthStr },
    type: db.sequelize.QueryTypes.SELECT,
  });

  // Expenses by Category
  const expensesByCategory = await db.sequelize.query(`
    SELECT
      c.name AS categoryName,
      c.color_code AS colorCode,
      COALESCE(SUM(e.total_amount), 0) AS total,
      COUNT(e.id) AS count
    FROM expenses e
    LEFT JOIN expense_categories c ON e.category_id = c.id
    WHERE e.deleted_at IS NULL AND e.status IN ('APPROVED', 'PAID')
    GROUP BY c.id, c.name, c.color_code
    ORDER BY total DESC
    LIMIT 8
  `, { type: db.sequelize.QueryTypes.SELECT });

  // Recent Expenses
  const recentExpenses = await db.Expense.findAll({
    where: {
      deletedAt: null,
      status: { [Op.in]: ['APPROVED', 'PAID'] },
    },
    attributes: ['id', 'title', 'totalAmount', 'expenseDate', 'status', 'paymentMode', 'vendorName'],
    include: [
      { model: db.ExpenseCategory, as: 'category', attributes: ['id', 'name', 'colorCode'], required: false },
      { model: db.BankAccount, as: 'bankAccount', attributes: ['id', 'accountName', 'accountType'], required: false },
    ],
    order: [['expense_date', 'DESC'], ['created_at', 'DESC']],
    limit: 20,
  });

  // 5. Consolidated Cashflow
  const totalCollectedAllTime = parseFloat(collectedAgg?.total_collected_all_time || 0);
  const totalCollectedThisMonth = parseFloat(collectedAgg?.collected_this_month || 0);

  const totalSalaryPaidAllTime = parseFloat(salaryAgg?.total_salary_paid_all_time || 0);
  const salaryPaidThisMonth = parseFloat(salaryAgg?.salary_paid_this_month || 0);

  const totalExpensesAllTime = parseFloat(expenseAgg?.total_expenses_all_time || 0);
  const expensesThisMonth = parseFloat(expenseAgg?.expenses_this_month || 0);

  const totalOutflowsAllTime = parseFloat((totalExpensesAllTime + totalSalaryPaidAllTime).toFixed(2));
  const totalOutflowsThisMonth = parseFloat((expensesThisMonth + salaryPaidThisMonth).toFixed(2));

  const netCashflowAllTime = parseFloat((totalCollectedAllTime - totalOutflowsAllTime).toFixed(2));
  const netCashflowThisMonth = parseFloat((totalCollectedThisMonth - totalOutflowsThisMonth).toFixed(2));

  return {
    accounts,
    totalBalance: parseFloat(totalBalance.toFixed(2)),
    collectedSummary: {
      totalCollectedAllTime,
      totalCollectedThisMonth,
      invoiceCollected: parseFloat(collectedAgg?.invoice_collected || 0),
      advanceCollected: parseFloat(collectedAgg?.advance_collected || 0),
      directPaymentCollected: parseFloat(collectedAgg?.direct_payment_collected || 0),
      collectionsCount: parseInt(collectedAgg?.collections_count || 0),
      byMode: collectionsByMode.map(m => ({
        mode: m.mode,
        total: parseFloat(m.total || 0),
        count: parseInt(m.count || 0),
      })),
      recentCollections,
    },
    salarySummary: {
      totalSalaryPaidAllTime,
      salaryPaidThisMonth,
      salaryApprovedPending: parseFloat(salaryAgg?.salary_approved_pending || 0),
      salaryDraft: parseFloat(salaryAgg?.salary_draft || 0),
      paidCount: parseInt(salaryAgg?.paid_count || 0),
      currentMonth: currentMonthStr,
      recentSalaries,
    },
    expenseSummary: {
      totalExpensesAllTime,
      expensesThisMonth,
      expensesPaid: parseFloat(expenseAgg?.expenses_paid || 0),
      expenseCount: parseInt(expenseAgg?.expense_count || 0),
      byCategory: expensesByCategory.map(c => ({
        categoryName: c.categoryName || 'General',
        colorCode: c.colorCode || '#6c5ce7',
        total: parseFloat(c.total || 0),
        count: parseInt(c.count || 0),
      })),
      recentExpenses,
    },
    cashflowOverview: {
      totalInflowsAllTime: totalCollectedAllTime,
      totalOutflowsAllTime,
      netCashflowAllTime,
      totalInflowsThisMonth: totalCollectedThisMonth,
      totalOutflowsThisMonth,
      netCashflowThisMonth,
      liquidBankBalance: parseFloat(totalBalance.toFixed(2)),
    },
  };
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
