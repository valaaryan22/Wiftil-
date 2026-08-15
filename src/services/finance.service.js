'use strict';

const { Op, fn, col, literal } = require('sequelize');
const { db } = require('../database/client');
const { HTTP_STATUS, FINANCE_MANAGE_MAX_LEVEL, BILLING_CONFIG_MAX_LEVEL, AUDIT_CATEGORY, AUDIT_ACTION } = require('../constants');
const { writeAuditLog } = require('../utils/auditLog');

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

// ── Finance Dashboard KPIs ────────────────────────────────────────────────────

async function getFinanceDashboard() {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0);

  // Invoice aggregates (all time)
  const [invoiceAgg] = await db.sequelize.query(`
    SELECT
      SUM(CASE WHEN payment_type = 'INVOICE' THEN 1 ELSE 0 END)                                    AS total_invoices,
      COALESCE(SUM(CASE WHEN payment_type = 'INVOICE' THEN total_amount ELSE 0 END), 0)              AS total_invoiced,
      COALESCE(SUM(CASE WHEN payment_type = 'INVOICE' THEN paid_amount ELSE 0 END), 0)              AS total_collected,
      COALESCE(SUM(CASE WHEN payment_type = 'INVOICE'
        AND invoice_status = 'APPROVED'
        AND payment_status NOT IN ('PAID', 'WRITTEN_OFF') THEN balance_amount ELSE 0 END), 0)                            AS total_outstanding,
      COALESCE(SUM(CASE WHEN payment_type = 'INVOICE'
        AND payment_status = 'OVERDUE' THEN balance_amount ELSE 0 END), 0)                                               AS total_overdue,
      SUM(CASE WHEN payment_type = 'INVOICE' AND invoice_status = 'DRAFT' THEN 1 ELSE 0 END)       AS draft_count,
      SUM(CASE WHEN payment_type = 'INVOICE' AND invoice_status = 'UNDER_REVIEW' THEN 1 ELSE 0 END) AS under_review_count,
      SUM(CASE WHEN payment_type = 'INVOICE' AND invoice_status = 'APPROVED'
        AND payment_status = 'UNPAID' THEN 1 ELSE 0 END)                                                     AS pending_payment_count,
      SUM(CASE WHEN payment_type = 'INVOICE' AND payment_status = 'PARTIALLY_PAID' THEN 1 ELSE 0 END) AS partial_count,
      SUM(CASE WHEN payment_type = 'INVOICE' AND payment_status = 'PAID' THEN 1 ELSE 0 END)        AS paid_count
    FROM client_payments
    WHERE deleted_at IS NULL
  `, { type: db.sequelize.QueryTypes.SELECT });

  // This month revenue
  const [thisMonthAgg] = await db.sequelize.query(`
    SELECT
      COALESCE(SUM(CASE WHEN payment_type = 'INVOICE' THEN total_amount ELSE 0 END), 0)  AS invoiced,
      COALESCE(SUM(CASE WHEN payment_type = 'INVOICE' THEN paid_amount ELSE 0 END), 0)  AS collected
    FROM client_payments
    WHERE deleted_at IS NULL AND invoice_date >= :start
  `, {
    replacements: { start: thisMonthStart.toISOString().slice(0, 10) },
    type: db.sequelize.QueryTypes.SELECT,
  });

  // Last month revenue
  const [lastMonthAgg] = await db.sequelize.query(`
    SELECT COALESCE(SUM(CASE WHEN payment_type = 'INVOICE' THEN total_amount ELSE 0 END), 0) AS invoiced
    FROM client_payments
    WHERE deleted_at IS NULL AND invoice_date >= :start AND invoice_date <= :end
  `, {
    replacements: {
      start: lastMonthStart.toISOString().slice(0, 10),
      end:   lastMonthEnd.toISOString().slice(0, 10),
    },
    type: db.sequelize.QueryTypes.SELECT,
  });

  // Monthly revenue trend (last 6 months)
  const monthlyTrend = await db.sequelize.query(`
    SELECT
      DATE_FORMAT(invoice_date, '%Y-%m') AS month,
      COALESCE(SUM(total_amount), 0)   AS invoiced,
      COALESCE(SUM(paid_amount), 0)    AS collected
    FROM client_payments
    WHERE deleted_at IS NULL
      AND payment_type = 'INVOICE'
      AND invoice_date >= NOW() - INTERVAL 6 MONTH
    GROUP BY DATE_FORMAT(invoice_date, '%Y-%m')
    ORDER BY month ASC
  `, { type: db.sequelize.QueryTypes.SELECT });

  // Top overdue clients
  const overdueClients = await db.ClientPayment.findAll({
    where: {
      paymentType:  'INVOICE',
      paymentStatus: 'OVERDUE',
      deletedAt:    null,
    },
    attributes: ['clientId', [fn('SUM', col('balance_amount')), 'overdueAmount'],
      [fn('COUNT', col('ClientPayment.id')), 'invoiceCount']],
    include: [{ model: db.Client, as: 'client', attributes: ['id', 'name', 'clientCode'] }],
    group: ['clientId', 'client.id'],
    order: [[literal('`overdueAmount`'), 'DESC']],
    limit: 5,
    raw: false,
  });

  // Expense summary this month
  const [expenseAgg] = await db.sequelize.query(`
    SELECT COALESCE(SUM(total_amount), 0) AS total_expenses
    FROM expenses
    WHERE deleted_at IS NULL
      AND status IN ('APPROVED', 'PAID')
      AND expense_date >= :start
  `, {
    replacements: { start: thisMonthStart.toISOString().slice(0, 10) },
    type: db.sequelize.QueryTypes.SELECT,
  });

  // Bank account balances
  const bankAccounts = await db.BankAccount.findAll({
    where: { isActive: true, deletedAt: null },
    attributes: ['id', 'accountName', 'accountType', 'currentBalance', 'currency', 'colorCode'],
    order: [['is_default', 'DESC']],
  });

  const totalBankBalance = bankAccounts.reduce((s, a) => s + parseFloat(a.currentBalance || 0), 0);

  // Payroll summary — this month
  const payrollMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const payrollRows = await db.sequelize.query(`
    SELECT
      status,
      COUNT(*) AS cnt,
      COALESCE(SUM(net_salary), 0) AS total_net
    FROM employee_payroll
    WHERE deleted_at IS NULL AND payroll_month = :month
    GROUP BY status
  `, {
    replacements: { month: payrollMonth },
    type: db.sequelize.QueryTypes.SELECT,
  });

  const payrollByStatus = {};
  let payrollTotalPaid = 0;
  let payrollTotalDraft = 0;
  let payrollTotalApproved = 0;
  let payrollHeadcount = 0;

  for (const row of payrollRows) {
    payrollByStatus[row.status] = {
      count: parseInt(row.cnt || 0),
      total: parseFloat(row.total_net || 0),
    };
    if (row.status === 'PAID')     { payrollTotalPaid     = parseFloat(row.total_net || 0); payrollHeadcount += parseInt(row.cnt || 0); }
    if (row.status === 'DRAFT')    { payrollTotalDraft    = parseFloat(row.total_net || 0); payrollHeadcount += parseInt(row.cnt || 0); }
    if (row.status === 'APPROVED') { payrollTotalApproved = parseFloat(row.total_net || 0); payrollHeadcount += parseInt(row.cnt || 0); }
  }

  return {
    allTime: {
      totalInvoices:       parseInt(invoiceAgg.total_invoices || 0),
      totalInvoiced:       parseFloat(invoiceAgg.total_invoiced || 0),
      totalCollected:      parseFloat(invoiceAgg.total_collected || 0),
      totalOutstanding:    parseFloat(invoiceAgg.total_outstanding || 0),
      totalOverdue:        parseFloat(invoiceAgg.total_overdue || 0),
      draftCount:          parseInt(invoiceAgg.draft_count || 0),
      underReviewCount:    parseInt(invoiceAgg.under_review_count || 0),
      pendingPaymentCount: parseInt(invoiceAgg.pending_payment_count || 0),
      partiallyPaidCount:  parseInt(invoiceAgg.partial_count || 0),
      paidCount:           parseInt(invoiceAgg.paid_count || 0),
    },
    thisMonth: {
      invoiced:  parseFloat(thisMonthAgg?.invoiced  || 0),
      collected: parseFloat(thisMonthAgg?.collected || 0),
      expenses:  parseFloat(expenseAgg?.total_expenses || 0),
      netCashFlow: parseFloat((parseFloat(thisMonthAgg?.collected || 0) - parseFloat(expenseAgg?.total_expenses || 0)).toFixed(2)),
    },
    lastMonth: {
      invoiced: parseFloat(lastMonthAgg?.invoiced || 0),
    },
    monthlyTrend,
    overdueClients: overdueClients.map(oc => ({
      client:        oc.client,
      overdueAmount: parseFloat(oc.get('overdueAmount') || 0),
      invoiceCount:  parseInt(oc.get('invoiceCount') || 0),
    })),
    bankSummary: {
      accounts:     bankAccounts,
      totalBalance: parseFloat(totalBankBalance.toFixed(2)),
    },
    payrollSummary: {
      month: payrollMonth,
      headcount: payrollHeadcount,
      totalPaid:     payrollTotalPaid,
      totalApproved: payrollTotalApproved,
      totalDraft:    payrollTotalDraft,
      byStatus: payrollByStatus,
    },
  };
}

// ── Global Invoice List ───────────────────────────────────────────────────────

async function getAllInvoices({
  page = 1, limit = 20, search, invoiceStatus, paymentStatus,
  clientId, fromDate, toDate, sortBy = 'invoice_date', sortOrder = 'DESC',
}) {
  const where = { paymentType: 'INVOICE', deletedAt: null };

  if (invoiceStatus) where.invoiceStatus = invoiceStatus;
  if (paymentStatus) where.paymentStatus = paymentStatus;
  if (clientId)      where.clientId      = clientId;

  if (fromDate || toDate) {
    where.invoiceDate = {};
    if (fromDate) where.invoiceDate[Op.gte] = fromDate;
    if (toDate)   where.invoiceDate[Op.lte] = toDate;
  }

  if (search) {
    where[Op.or] = [
      { invoiceNumber: { [Op.like]: `%${search}%` } },
      { description:   { [Op.like]: `%${search}%` } },
    ];
  }

  const validFields = { invoice_date: 'invoiceDate', due_date: 'dueDate', total_amount: 'totalAmount', created_at: 'createdAt' };
  const orderField  = validFields[sortBy] || 'invoiceDate';

  const limitNum = parseInt(limit, 10) || 20;
  const pageNum = parseInt(page, 10) || 1;
  const offset = (pageNum - 1) * limitNum;

  const { count, rows } = await db.ClientPayment.findAndCountAll({
    where,
    include: [
      { model: db.Client, as: 'client', attributes: ['id', 'name', 'clientCode', 'logo'] },
      { model: db.ClientPackage, as: 'package', attributes: ['id', 'name', 'packageType'], required: false },
      { model: db.User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'] },
      { model: db.User, as: 'reviewedBy', attributes: ['id', 'firstName', 'lastName'], required: false },
      { model: db.User, as: 'invoiceApprovedBy', attributes: ['id', 'firstName', 'lastName'], required: false },
    ],
    order: [[orderField, sortOrder === 'ASC' ? 'ASC' : 'DESC']],
    limit: limitNum,
    offset,
  });

  return {
    invoices: rows,
    pagination: { total: count, page: pageNum, limit: limitNum, totalPages: Math.ceil(count / limitNum) },
  };
}

// ── Receivables & Aging ───────────────────────────────────────────────────────

async function getReceivables({ clientId } = {}) {
  const where = {
    paymentType:  'INVOICE',
    invoiceStatus: 'APPROVED',
    paymentStatus: { [Op.in]: ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE'] },
    deletedAt:    null,
  };
  if (clientId) where.clientId = clientId;

  const invoices = await db.ClientPayment.findAll({
    where,
    include: [
      { model: db.Client, as: 'client', attributes: ['id', 'name', 'clientCode', 'logo'] },
      { model: db.ClientPackage, as: 'package', attributes: ['id', 'name'], required: false },
    ],
    order: [['due_date', 'ASC']],
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build aging buckets
  const aging = {
    current:   { label: 'Not Yet Due',    invoices: [], total: 0 },
    bucket1:   { label: '1-30 Days',      invoices: [], total: 0 },
    bucket2:   { label: '31-60 Days',     invoices: [], total: 0 },
    bucket3:   { label: '61-90 Days',     invoices: [], total: 0 },
    bucket4:   { label: '91+ Days',       invoices: [], total: 0 },
  };

  let totalOutstanding = 0;

  invoices.forEach(inv => {
    const balance = parseFloat(inv.balanceAmount || 0);
    totalOutstanding += balance;

    const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
    const daysOverdue = dueDate ? Math.floor((today - dueDate) / (1000 * 60 * 60 * 24)) : 0;

    inv.dataValues.daysOverdue = Math.max(0, daysOverdue);

    if (!dueDate || daysOverdue <= 0) {
      aging.current.invoices.push(inv);
      aging.current.total += balance;
    } else if (daysOverdue <= 30) {
      aging.bucket1.invoices.push(inv);
      aging.bucket1.total += balance;
    } else if (daysOverdue <= 60) {
      aging.bucket2.invoices.push(inv);
      aging.bucket2.total += balance;
    } else if (daysOverdue <= 90) {
      aging.bucket3.invoices.push(inv);
      aging.bucket3.total += balance;
    } else {
      aging.bucket4.invoices.push(inv);
      aging.bucket4.total += balance;
    }
  });

  // Client-wise outstanding
  const clientMap = {};
  invoices.forEach(inv => {
    const cid = inv.clientId;
    if (!clientMap[cid]) {
      clientMap[cid] = {
        client:         inv.client,
        outstanding:    0,
        invoiceCount:   0,
        oldestDueDate:  null,
        maxDaysOverdue: 0,
      };
    }
    clientMap[cid].outstanding  += parseFloat(inv.balanceAmount || 0);
    clientMap[cid].invoiceCount += 1;
    clientMap[cid].maxDaysOverdue = Math.max(clientMap[cid].maxDaysOverdue, inv.dataValues.daysOverdue || 0);
  });

  return {
    totalOutstanding: parseFloat(totalOutstanding.toFixed(2)),
    aging: Object.fromEntries(
      Object.entries(aging).map(([k, v]) => [k, { ...v, total: parseFloat(v.total.toFixed(2)) }])
    ),
    byClient: Object.values(clientMap).map(c => ({
      ...c,
      outstanding: parseFloat(c.outstanding.toFixed(2)),
    })).sort((a, b) => b.outstanding - a.outstanding),
    invoices,
  };
}

// ── Billing Configuration ─────────────────────────────────────────────────────

async function getBillingConfig(clientId) {
  return db.InvoiceBillingConfig.findOne({
    where: { clientId },
    include: [
      { model: db.Client, as: 'client', attributes: ['id', 'name', 'clientCode'] },
      { model: db.ClientPackage, as: 'package', attributes: ['id', 'name', 'basePrice', 'billingCycle'], required: false },
    ],
  });
}

async function upsertBillingConfig({ requestingUser, clientId, data, req }) {
  assertLevel(requestingUser, BILLING_CONFIG_MAX_LEVEL, 'Manager+ required to configure billing');

  const client = await db.Client.findOne({ where: { id: clientId, deletedAt: null } });
  if (!client) throw notFound('Client not found');

  const {
    billingDay, billingFrequency, isAutoGenerate, packageId,
    defaultTaxRate, defaultDueDays, includeAddOns, notes, isActive,
  } = data;

  const [config, created] = await db.InvoiceBillingConfig.findOrCreate({
    where: { clientId },
    defaults: {
      clientId, billingDay, billingFrequency: billingFrequency || 'MONTHLY',
      isAutoGenerate: isAutoGenerate !== false,
      packageId: packageId || null,
      defaultTaxRate: defaultTaxRate ? parseFloat(defaultTaxRate) : null,
      defaultDueDays: parseInt(defaultDueDays || 15),
      includeAddOns: includeAddOns !== false,
      notes: notes || null,
      isActive: isActive !== false,
      createdById: requestingUser.id,
    },
  });

  if (!created) {
    await config.update({
      billingDay:      billingDay      !== undefined ? billingDay : config.billingDay,
      billingFrequency: billingFrequency || config.billingFrequency,
      isAutoGenerate:  isAutoGenerate  !== undefined ? isAutoGenerate : config.isAutoGenerate,
      packageId:       packageId       !== undefined ? packageId : config.packageId,
      defaultTaxRate:  defaultTaxRate  !== undefined ? parseFloat(defaultTaxRate || 0) : config.defaultTaxRate,
      defaultDueDays:  defaultDueDays  !== undefined ? parseInt(defaultDueDays) : config.defaultDueDays,
      includeAddOns:   includeAddOns   !== undefined ? includeAddOns : config.includeAddOns,
      notes:           notes           !== undefined ? notes : config.notes,
      isActive:        isActive        !== undefined ? isActive : config.isActive,
    });
  }

  await writeAuditLog(req, {
    category: AUDIT_CATEGORY.SYSTEM,
    action:   created ? AUDIT_ACTION.BILLING_CONFIG_CREATED : AUDIT_ACTION.BILLING_CONFIG_UPDATED,
    targetModel: 'InvoiceBillingConfig',
    targetId: config.id,
    details: { clientId, billingDay, billingFrequency },
  });

  return config.reload({ include: [
    { model: db.Client, as: 'client', attributes: ['id', 'name'] },
  ]});
}

// ── Manual Invoice Creation ───────────────────────────────────────────────────

async function createInvoice({ requestingUser, data, req }) {
  const {
    clientId, packageId, addOnIds = [], amount, taxRate, taxAmount,
    discountAmount, penaltyAmount, invoiceDate, dueDate,
    description, internalNotes, currency = 'INR',
  } = data;

  const client = await db.Client.findOne({ where: { id: clientId, deletedAt: null } });
  if (!client) throw notFound('Client not found');

  // Build line items
  const lineItems = [];
  let baseAmount = parseFloat(amount || 0);

  if (packageId) {
    const pkg = await db.ClientPackage.findOne({ where: { id: packageId } });
    if (pkg) {
      lineItems.push({
        description: `${pkg.name} — Retainer`,
        quantity:    1,
        unitPrice:   parseFloat(pkg.basePrice || 0),
        amount:      parseFloat(pkg.basePrice || 0),
      });
      // If no amount provided, use package base price
      if (!amount) baseAmount = parseFloat(pkg.basePrice || 0);
    }
  }

  if (addOnIds && addOnIds.length > 0) {
    const addOns = await db.PackageAddOn.findAll({
      where: { id: { [Op.in]: addOnIds } },
      include: [{ model: db.ServiceCatalog, as: 'service', attributes: ['name'], required: false }],
    });
    for (const addOn of addOns) {
      const addonAmount = parseFloat(addOn.totalPrice || addOn.unitPrice || 0);
      lineItems.push({
        description: addOn.service?.name || addOn.customDescription || 'Add-on',
        quantity:    addOn.quantity || 1,
        unitPrice:   parseFloat(addOn.unitPrice || 0),
        amount:      addonAmount,
      });
      if (!packageId && !amount) baseAmount += addonAmount;
    }
  }

  const computedTaxRate = parseFloat(taxRate || 0);
  const computedTax = taxAmount !== undefined
    ? parseFloat(taxAmount)
    : parseFloat(((baseAmount * computedTaxRate) / 100).toFixed(2));

  const invoice = await db.ClientPayment.create({
    clientId,
    packageId:     packageId || null,
    createdById:   requestingUser.id,
    paymentType:   'INVOICE',
    invoiceStatus: 'DRAFT',
    paymentStatus: 'UNPAID',
    status:        'DRAFT',
    invoiceDate:   invoiceDate || new Date().toISOString().slice(0, 10),
    dueDate:       dueDate || null,
    amount:        baseAmount,
    taxAmount:     computedTax,
    taxRate:       computedTaxRate || null,
    discountAmount: parseFloat(discountAmount || 0),
    penaltyAmount:  parseFloat(penaltyAmount || 0),
    paidAmount:    0,
    currency,
    lineItems:     lineItems.length > 0 ? lineItems : null,
    description:   description || null,
    internalNotes: internalNotes || null,
  });

  // Mark selected add-ons as BILLED
  if (addOnIds && addOnIds.length > 0) {
    await db.PackageAddOn.update(
      { status: 'BILLED', billedAt: new Date() },
      { where: { id: { [Op.in]: addOnIds } } }
    );
  }

  await writeAuditLog(req, {
    category: AUDIT_CATEGORY.PAYMENT,
    action:   AUDIT_ACTION.INVOICE_CREATED || 'INVOICE_CREATED',
    targetModel: 'ClientPayment',
    targetId: invoice.id,
    details: { clientId, amount: baseAmount + computedTax },
  });

  return invoice;
}

// ── Payment Collection ────────────────────────────────────────────────────────

async function collectPayment({ requestingUser, invoiceId, data, req }) {
  const { amount, paymentMode, paidDate, referenceNumber, internalNotes } = data;

  const invoice = await db.ClientPayment.findOne({
    where: { id: invoiceId, paymentType: 'INVOICE', deletedAt: null },
  });
  if (!invoice) throw notFound('Invoice not found');
  if (invoice.invoiceStatus !== 'APPROVED') {
    const err = new Error('Invoice must be APPROVED before collecting payment');
    err.statusCode = 400;
    throw err;
  }

  const collectAmount = parseFloat(amount);
  if (collectAmount <= 0) {
    const err = new Error('Amount must be greater than 0');
    err.statusCode = 400;
    throw err;
  }

  // Record the payment entry
  const payment = await db.ClientPayment.create({
    clientId:       invoice.clientId,
    packageId:      invoice.packageId || null,
    parentInvoiceId: invoice.id,
    createdById:    requestingUser.id,
    collectedById:  requestingUser.id,
    paymentType:    'PAYMENT',
    status:         'PAID',
    paymentStatus:  'PAID',
    invoiceStatus:  'APPROVED',
    amount:         collectAmount,
    taxAmount:      0,
    totalAmount:    collectAmount,
    paidAmount:     collectAmount,
    balanceAmount:  0,
    paidDate:       paidDate || new Date().toISOString().slice(0, 10),
    paymentMode:    paymentMode || null,
    referenceNumber: referenceNumber || null,
    internalNotes:  internalNotes || null,
    currency:       invoice.currency || 'INR',
  });

  // Update the parent invoice
  const newPaid = parseFloat(invoice.paidAmount || 0) + collectAmount;
  const newBalance = parseFloat(invoice.totalAmount || 0) - newPaid;

  let newPaymentStatus = 'PARTIALLY_PAID';
  if (newBalance <= 0) newPaymentStatus = 'PAID';

  await invoice.update({
    paidAmount:    parseFloat(newPaid.toFixed(2)),
    balanceAmount: parseFloat(Math.max(0, newBalance).toFixed(2)),
    paymentStatus: newPaymentStatus,
    status:        newPaymentStatus === 'PAID' ? 'PAID' : 'PARTIALLY_PAID',
    paidDate:      newPaymentStatus === 'PAID' ? (paidDate || new Date().toISOString().slice(0, 10)) : invoice.paidDate,
    approvedById:  requestingUser.id,
    approvedAt:    newPaymentStatus === 'PAID' ? new Date() : invoice.approvedAt,
  });

  await writeAuditLog(req, {
    category: AUDIT_CATEGORY.PAYMENT,
    action:   AUDIT_ACTION.PAYMENT_COLLECTED || 'PAYMENT_COLLECTED',
    targetModel: 'ClientPayment',
    targetId: payment.id,
    details: { invoiceId, amount: collectAmount, newPaymentStatus },
  });

  return { payment, invoice: await invoice.reload() };
}

async function generateDueInvoices({ requestingUser, req }) {
  assertLevel(requestingUser, BILLING_CONFIG_MAX_LEVEL, 'Manager+ required to trigger invoice generation');

  const today = new Date();
  const todayDay = today.getDate();
  const todayStr = today.toISOString().slice(0, 10);

  // Find all active billing configs where billingDay = today OR nextDueAt <= today
  const configs = await db.InvoiceBillingConfig.findAll({
    where: {
      isActive:       true,
      isAutoGenerate: true,
      [Op.or]: [
        { billingDay: todayDay },
        { nextDueAt: { [Op.lte]: todayStr } },
      ],
    },
    include: [
      { model: db.Client,        as: 'client',  attributes: ['id', 'name', 'clientCode', 'gst'] },
      { model: db.ClientPackage, as: 'package', attributes: ['id', 'name', 'basePrice', 'billingCycle'], required: false },
    ],
  });

  const generated = [];
  const skipped   = [];

  for (const config of configs) {
    // Check if an invoice was already generated this cycle
    const billingMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    const existing = await db.ClientPayment.findOne({
      where: {
        clientId:     config.clientId,
        paymentType:  'INVOICE',
        billingMonth,
        billingConfigId: config.id,
        deletedAt:    null,
      },
    });

    if (existing) {
      skipped.push({ clientId: config.clientId, reason: 'Already generated for this period', billingMonth });
      continue;
    }

    // Build line items from package
    const lineItems = [];
    let baseAmount = 0;

    if (config.package) {
      lineItems.push({
        description: `${config.package.name} — ${today.toLocaleString('default', { month: 'long' })} ${today.getFullYear()}`,
        quantity:    1,
        unitPrice:   parseFloat(config.package.basePrice || 0),
        amount:      parseFloat(config.package.basePrice || 0),
      });
      baseAmount += parseFloat(config.package.basePrice || 0);
    }

    // Include DELIVERED add-ons if configured
    if (config.includeAddOns && config.packageId) {
      const addOns = await db.PackageAddOn.findAll({
        where: { packageId: config.packageId, status: 'DELIVERED' },
        include: [{ model: db.ServiceCatalog, as: 'service', attributes: ['name'], required: false }],
      });
      for (const addOn of addOns) {
        const addonAmount = parseFloat(addOn.totalPrice || 0);
        lineItems.push({
          description: addOn.service?.name || addOn.customDescription || 'Add-on',
          quantity:    addOn.quantity,
          unitPrice:   parseFloat(addOn.unitPrice || 0),
          amount:      addonAmount,
        });
        baseAmount += addonAmount;
      }
    }

    const taxRate   = config.defaultTaxRate ? parseFloat(config.defaultTaxRate) : 0;
    const taxAmount = parseFloat(((baseAmount * taxRate) / 100).toFixed(2));
    const dueDate   = new Date(today);
    dueDate.setDate(dueDate.getDate() + (config.defaultDueDays || 15));

    const invoice = await db.ClientPayment.create({
      clientId:       config.clientId,
      packageId:      config.packageId || null,
      createdById:    requestingUser.id,
      paymentType:    'INVOICE',
      invoiceStatus:  'DRAFT',
      paymentStatus:  'UNPAID',
      status:         'DRAFT',
      invoiceDate:    todayStr,
      dueDate:        dueDate.toISOString().slice(0, 10),
      amount:         baseAmount,
      taxAmount,
      taxRate:        taxRate || null,
      paidAmount:     0,
      currency:       'INR',
      lineItems:      lineItems.length > 0 ? lineItems : null,
      description:    `Auto-generated monthly invoice — ${config.client.name} (${billingMonth})`,
      billingMonth,
      billingConfigId: config.id,
    });

    // Update lastGeneratedAt and compute next due date
    const nextDue = new Date(today);
    if (config.billingFrequency === 'MONTHLY')   nextDue.setMonth(nextDue.getMonth() + 1);
    if (config.billingFrequency === 'QUARTERLY') nextDue.setMonth(nextDue.getMonth() + 3);
    if (config.billingFrequency === 'ANNUAL')    nextDue.setFullYear(nextDue.getFullYear() + 1);
    nextDue.setDate(config.billingDay);

    await config.update({
      lastGeneratedAt: new Date(),
      nextDueAt: nextDue.toISOString().slice(0, 10),
    });

    await writeAuditLog(req, {
      category: AUDIT_CATEGORY.PAYMENT,
      action:   AUDIT_ACTION.INVOICE_AUTO_GENERATED,
      targetModel: 'ClientPayment',
      targetId: invoice.id,
      details: { clientId: config.clientId, billingMonth, amount: baseAmount + taxAmount },
    });

    generated.push({ invoice, clientName: config.client.name });
  }

  return { generated, skipped, totalGenerated: generated.length };
}

module.exports = {
  getFinanceDashboard,
  getAllInvoices,
  getReceivables,
  getBillingConfig,
  upsertBillingConfig,
  generateDueInvoices,
  createInvoice,
  collectPayment,
};
