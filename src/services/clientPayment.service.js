'use strict';

const { Op, fn, col } = require('sequelize');
const { db } = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const {
  HTTP_STATUS,
  AUDIT_CATEGORY,
  AUDIT_ACTION,
  CLIENT_MANAGE_MAX_LEVEL,
  PAYMENT_MANAGE_MAX_LEVEL,
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

const PAYMENT_INCLUDE = [
  { model: db.User, as: 'createdBy',    attributes: ['id', 'firstName', 'lastName'] },
  { model: db.User, as: 'collectedBy',  attributes: ['id', 'firstName', 'lastName'] },
  { model: db.User, as: 'approvedBy',   attributes: ['id', 'firstName', 'lastName'] },
  {
    model: db.ClientPackage, as: 'package',
    attributes: ['id', 'name', 'packageType', 'billingCycle'],
    required: false,
  },
  {
    model: db.ClientPayment, as: 'parentInvoice',
    attributes: ['id', 'invoiceNumber', 'totalAmount'],
    required: false,
  },
];

// For invoice → payments breakdown
const INVOICE_INCLUDE = [
  ...PAYMENT_INCLUDE,
  {
    model: db.ClientPayment, as: 'paymentEntries',
    required: false,
    include: [
      { model: db.User, as: 'collectedBy', attributes: ['id', 'firstName', 'lastName'] },
    ],
  },
];

// ── Validate client exists ────────────────────────────────────────────────────

async function assertClient(clientId) {
  const client = await db.Client.findOne({ where: { id: clientId, deletedAt: null } });
  if (!client) throw notFound('Client not found');
  return client;
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE INVOICE
// ─────────────────────────────────────────────────────────────────────────────

async function createInvoice({ requestingUser, clientId, data, req }) {
  assertLevel(requestingUser, PAYMENT_MANAGE_MAX_LEVEL, 'Manager+ required to create invoices');
  const client = await assertClient(clientId);

  const {
    packageId, invoiceNumber, invoiceDate, dueDate, description,
    amount, taxAmount, taxRate, discountAmount, penaltyAmount,
    lineItems, internalNotes, currency,
  } = data;

  const record = await db.ClientPayment.create({
    clientId,
    packageId: packageId || null,
    createdById: requestingUser.id,
    paymentType: 'INVOICE',
    status: 'DRAFT',
    invoiceNumber: invoiceNumber || null,
    invoiceDate: invoiceDate || new Date(),
    dueDate: dueDate || null,
    description, internalNotes,
    amount:         parseFloat(amount         || 0),
    taxAmount:      parseFloat(taxAmount      || 0),
    taxRate:        taxRate    ? parseFloat(taxRate)    : null,
    discountAmount: parseFloat(discountAmount || 0),
    penaltyAmount:  parseFloat(penaltyAmount  || 0),
    paidAmount:     0,
    lineItems:      lineItems  || null,
    currency:       currency   || 'INR',
  });

  const full = await db.ClientPayment.findByPk(record.id, { include: INVOICE_INCLUDE });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.PAYMENT_INVOICE_CREATED,
    category: AUDIT_CATEGORY.PAYMENT,
    entity: 'ClientPayment',
    entityId: record.id,
    entityName: record.invoiceNumber,
    description: `Invoice "${record.invoiceNumber}" created for client "${client.name}" — ₹${record.totalAmount}`,
    newValues: record.toJSON(),
    req,
  });

  return full;
}

// ─────────────────────────────────────────────────────────────────────────────
// RECORD PAYMENT (against invoice or standalone)
// ─────────────────────────────────────────────────────────────────────────────

async function recordPayment({ requestingUser, clientId, data, req }) {
  const client = await assertClient(clientId);

  const {
    parentInvoiceId, packageId, paymentMode, amount,
    taxAmount, currency, paidDate, referenceNumber,
    description, internalNotes, collectedById,
  } = data;

  if (!amount || parseFloat(amount) <= 0) throw badRequest('Payment amount must be > 0');

  // If linked to an invoice, validate it belongs to this client
  let invoice = null;
  if (parentInvoiceId) {
    invoice = await db.ClientPayment.findOne({
      where: { id: parentInvoiceId, clientId, paymentType: 'INVOICE', deletedAt: null },
    });
    if (!invoice) throw notFound('Invoice not found for this client');

    const TERMINAL = ['PAID', 'CANCELLED', 'WRITTEN_OFF'];
    if (TERMINAL.includes(invoice.status)) {
      throw badRequest(`Invoice is already ${invoice.status} — cannot record more payments`);
    }
  }

  const record = await db.ClientPayment.create({
    clientId,
    packageId:       packageId       || (invoice ? invoice.packageId : null),
    parentInvoiceId: parentInvoiceId || null,
    createdById:     requestingUser.id,
    collectedById:   collectedById   || requestingUser.id,
    paymentType:     'PAYMENT',
    status:          'PAID',
    paymentMode:     paymentMode || null,
    currency:        currency    || 'INR',
    amount:          parseFloat(amount),
    taxAmount:       parseFloat(taxAmount || 0),
    paidAmount:      parseFloat(amount),
    paidDate:        paidDate || new Date(),
    referenceNumber: referenceNumber || null,
    description, internalNotes,
  });

  // Update parent invoice paid/balance amounts and status
  if (invoice) {
    const newPaid    = parseFloat(invoice.paidAmount) + parseFloat(amount);
    const newBalance = parseFloat(invoice.totalAmount) - newPaid;
    let newStatus    = invoice.status;

    if (newBalance <= 0)           newStatus = 'PAID';
    else if (newPaid > 0)          newStatus = 'PARTIALLY_PAID';

    await invoice.update({
      paidAmount:    parseFloat(newPaid.toFixed(2)),
      balanceAmount: parseFloat(Math.max(newBalance, 0).toFixed(2)),
      status:        newStatus,
      paidDate:      newStatus === 'PAID' ? (paidDate || new Date()) : invoice.paidDate,
    });
  }

  const full = await db.ClientPayment.findByPk(record.id, { include: PAYMENT_INCLUDE });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.PAYMENT_RECEIVED,
    category: AUDIT_CATEGORY.PAYMENT,
    entity: 'ClientPayment',
    entityId: record.id,
    entityName: record.referenceNumber || record.id,
    description: `Payment of ₹${record.amount} received from client "${client.name}"${invoice ? ` against invoice ${invoice.invoiceNumber}` : ''}`,
    newValues: record.toJSON(),
    req,
  });

  return full;
}

// ─────────────────────────────────────────────────────────────────────────────
// RECORD ADVANCE
// ─────────────────────────────────────────────────────────────────────────────

async function recordAdvance({ requestingUser, clientId, data, req }) {
  const client = await assertClient(clientId);

  const {
    amount, paymentMode, currency, paidDate,
    referenceNumber, description, internalNotes, packageId, collectedById,
  } = data;

  if (!amount || parseFloat(amount) <= 0) throw badRequest('Advance amount must be > 0');

  const record = await db.ClientPayment.create({
    clientId,
    packageId:     packageId     || null,
    createdById:   requestingUser.id,
    collectedById: collectedById || requestingUser.id,
    paymentType:   'ADVANCE',
    status:        'PAID',
    paymentMode:   paymentMode || null,
    currency:      currency    || 'INR',
    amount:        parseFloat(amount),
    paidAmount:    parseFloat(amount),
    paidDate:      paidDate || new Date(),
    referenceNumber: referenceNumber || null,
    description, internalNotes,
  });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.PAYMENT_ADVANCE_RECORDED,
    category: AUDIT_CATEGORY.PAYMENT,
    entity: 'ClientPayment',
    entityId: record.id,
    entityName: record.referenceNumber || record.id,
    description: `Advance of ₹${record.amount} received from client "${client.name}"`,
    newValues: record.toJSON(),
    req,
  });

  return db.ClientPayment.findByPk(record.id, { include: PAYMENT_INCLUDE });
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK INVOICE AS SENT
// ─────────────────────────────────────────────────────────────────────────────

async function markInvoiceSent({ requestingUser, clientId, paymentId, req }) {
  assertLevel(requestingUser, PAYMENT_MANAGE_MAX_LEVEL, 'Manager+ required');
  const record = await _findPayment(paymentId, clientId, 'INVOICE');

  if (!['DRAFT'].includes(record.status)) throw badRequest(`Cannot mark ${record.status} invoice as SENT`);

  await record.update({ status: 'SENT', sentAt: new Date() });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.PAYMENT_INVOICE_SENT,
    category: AUDIT_CATEGORY.PAYMENT, entity: 'ClientPayment',
    entityId: record.id, entityName: record.invoiceNumber,
    description: `Invoice "${record.invoiceNumber}" marked as SENT`,
    req,
  });

  return db.ClientPayment.findByPk(record.id, { include: INVOICE_INCLUDE });
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK INVOICE OVERDUE
// ─────────────────────────────────────────────────────────────────────────────

async function markInvoiceOverdue({ requestingUser, clientId, paymentId, req }) {
  assertLevel(requestingUser, PAYMENT_MANAGE_MAX_LEVEL, 'Manager+ required');
  const record = await _findPayment(paymentId, clientId, 'INVOICE');

  const ALLOWABLE = ['SENT', 'PARTIALLY_PAID'];
  if (!ALLOWABLE.includes(record.status)) throw badRequest(`Cannot mark ${record.status} invoice as OVERDUE`);

  await record.update({ status: 'OVERDUE' });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.PAYMENT_OVERDUE,
    category: AUDIT_CATEGORY.PAYMENT, entity: 'ClientPayment',
    entityId: record.id, entityName: record.invoiceNumber,
    description: `Invoice "${record.invoiceNumber}" marked OVERDUE`,
    req,
  });

  return db.ClientPayment.findByPk(record.id, { include: INVOICE_INCLUDE });
}

// ─────────────────────────────────────────────────────────────────────────────
// RAISE DISPUTE
// ─────────────────────────────────────────────────────────────────────────────

async function raiseDispute({ requestingUser, clientId, paymentId, data, req }) {
  const record = await _findPayment(paymentId, clientId, 'INVOICE');

  const TERMINAL = ['PAID', 'CANCELLED', 'WRITTEN_OFF'];
  if (TERMINAL.includes(record.status)) throw badRequest(`Cannot dispute a ${record.status} invoice`);

  const { disputeReason } = data;
  if (!disputeReason || !disputeReason.trim()) throw badRequest('disputeReason is required');

  await record.update({ status: 'DISPUTED', disputeReason: disputeReason.trim(), disputeRaisedAt: new Date() });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.PAYMENT_DISPUTED,
    category: AUDIT_CATEGORY.PAYMENT, entity: 'ClientPayment',
    entityId: record.id, entityName: record.invoiceNumber,
    description: `Dispute raised on invoice "${record.invoiceNumber}": ${disputeReason}`,
    req,
  });

  return db.ClientPayment.findByPk(record.id, { include: INVOICE_INCLUDE });
}

// ─────────────────────────────────────────────────────────────────────────────
// RESOLVE DISPUTE
// ─────────────────────────────────────────────────────────────────────────────

async function resolveDispute({ requestingUser, clientId, paymentId, req }) {
  assertLevel(requestingUser, PAYMENT_MANAGE_MAX_LEVEL, 'Manager+ required to resolve disputes');
  const record = await _findPayment(paymentId, clientId, 'INVOICE');
  if (record.status !== 'DISPUTED') throw badRequest('Invoice is not in DISPUTED status');

  const resolvedStatus = parseFloat(record.balanceAmount) <= 0 ? 'PAID' : (parseFloat(record.paidAmount) > 0 ? 'PARTIALLY_PAID' : 'SENT');
  await record.update({ status: resolvedStatus, disputeResolvedAt: new Date() });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.PAYMENT_DISPUTE_RESOLVED,
    category: AUDIT_CATEGORY.PAYMENT, entity: 'ClientPayment',
    entityId: record.id, entityName: record.invoiceNumber,
    description: `Dispute resolved on invoice "${record.invoiceNumber}", status → ${resolvedStatus}`,
    req,
  });

  return db.ClientPayment.findByPk(record.id, { include: INVOICE_INCLUDE });
}

// ─────────────────────────────────────────────────────────────────────────────
// APPROVE PAYMENT
// ─────────────────────────────────────────────────────────────────────────────

async function approvePayment({ requestingUser, clientId, paymentId, req }) {
  assertLevel(requestingUser, PAYMENT_MANAGE_MAX_LEVEL, 'Manager+ required to approve payments');
  const record = await db.ClientPayment.findOne({
    where: { id: paymentId, clientId, deletedAt: null },
  });
  if (!record) throw notFound('Payment record not found');

  await record.update({ approvedById: requestingUser.id, approvedAt: new Date() });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.PAYMENT_APPROVED,
    category: AUDIT_CATEGORY.PAYMENT, entity: 'ClientPayment',
    entityId: record.id, entityName: record.invoiceNumber || record.id,
    description: `Payment record approved by ${requestingUser.firstName}`,
    req,
  });

  return db.ClientPayment.findByPk(record.id, { include: PAYMENT_INCLUDE });
}

// ─────────────────────────────────────────────────────────────────────────────
// CANCEL INVOICE / WRITE-OFF
// ─────────────────────────────────────────────────────────────────────────────

async function cancelInvoice({ requestingUser, clientId, paymentId, req }) {
  assertLevel(requestingUser, PAYMENT_MANAGE_MAX_LEVEL, 'Manager+ required');
  const record = await _findPayment(paymentId, clientId, 'INVOICE');

  const CANCELLABLE = ['DRAFT', 'SENT', 'OVERDUE', 'DISPUTED'];
  if (!CANCELLABLE.includes(record.status)) throw badRequest(`Cannot cancel a ${record.status} invoice`);

  await record.update({ status: 'CANCELLED' });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.PAYMENT_CANCELLED,
    category: AUDIT_CATEGORY.PAYMENT, entity: 'ClientPayment',
    entityId: record.id, entityName: record.invoiceNumber,
    description: `Invoice "${record.invoiceNumber}" cancelled`,
    req,
  });

  return db.ClientPayment.findByPk(record.id, { include: INVOICE_INCLUDE });
}

async function writeOffInvoice({ requestingUser, clientId, paymentId, req }) {
  assertLevel(requestingUser, CLIENT_MANAGE_MAX_LEVEL, 'Manager+ required to write off invoices');
  const record = await _findPayment(paymentId, clientId, 'INVOICE');

  const WRITABLE = ['SENT', 'PARTIALLY_PAID', 'OVERDUE', 'DISPUTED'];
  if (!WRITABLE.includes(record.status)) throw badRequest(`Cannot write off a ${record.status} invoice`);

  await record.update({ status: 'WRITTEN_OFF' });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.PAYMENT_WRITTEN_OFF,
    category: AUDIT_CATEGORY.PAYMENT, entity: 'ClientPayment',
    entityId: record.id, entityName: record.invoiceNumber,
    description: `Invoice "${record.invoiceNumber}" written off`,
    req,
  });

  return db.ClientPayment.findByPk(record.id, { include: INVOICE_INCLUDE });
}

// ─────────────────────────────────────────────────────────────────────────────
// LOG FOLLOW-UP
// ─────────────────────────────────────────────────────────────────────────────

async function logFollowUp({ requestingUser, clientId, paymentId, data, req }) {
  const record = await _findPayment(paymentId, clientId, 'INVOICE');

  const { nextFollowUpDate, internalNotes } = data;
  const updates = {
    followUpCount: record.followUpCount + 1,
  };
  if (nextFollowUpDate) updates.nextFollowUpDate = nextFollowUpDate;
  if (internalNotes)    updates.internalNotes    = internalNotes;

  await record.update(updates);

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.PAYMENT_FOLLOW_UP,
    category: AUDIT_CATEGORY.PAYMENT, entity: 'ClientPayment',
    entityId: record.id, entityName: record.invoiceNumber,
    description: `Follow-up #${updates.followUpCount} logged on invoice "${record.invoiceNumber}"`,
    req,
  });

  return db.ClientPayment.findByPk(record.id, { include: INVOICE_INCLUDE });
}

// ─────────────────────────────────────────────────────────────────────────────
// ISSUE CREDIT NOTE / REFUND
// ─────────────────────────────────────────────────────────────────────────────

async function issueCreditNote({ requestingUser, clientId, data, req }) {
  assertLevel(requestingUser, PAYMENT_MANAGE_MAX_LEVEL, 'Manager+ required');
  const client = await assertClient(clientId);

  const { amount, description, internalNotes, parentInvoiceId, packageId, currency } = data;
  if (!amount || parseFloat(amount) <= 0) throw badRequest('Credit note amount must be > 0');

  const record = await db.ClientPayment.create({
    clientId,
    packageId:       packageId       || null,
    parentInvoiceId: parentInvoiceId || null,
    createdById:     requestingUser.id,
    paymentType:     'CREDIT_NOTE',
    status:          'PAID',
    currency:        currency || 'INR',
    amount:          parseFloat(amount),
    paidAmount:      parseFloat(amount),
    description, internalNotes,
  });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.PAYMENT_CREDIT_NOTE,
    category: AUDIT_CATEGORY.PAYMENT, entity: 'ClientPayment',
    entityId: record.id, entityName: `Credit Note — ${client.name}`,
    description: `Credit note of ₹${amount} issued for client "${client.name}"`,
    newValues: record.toJSON(), req,
  });

  return db.ClientPayment.findByPk(record.id, { include: PAYMENT_INCLUDE });
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST PAYMENTS / INVOICES
// ─────────────────────────────────────────────────────────────────────────────

async function getPayments({
  clientId,
  page = 1, limit = 20,
  search, paymentType, status, paymentMode,
  fromDate, toDate, packageId,
  sortBy, sortOrder,
}) {
  page  = parseInt(page)  || 1;
  limit = parseInt(limit) || 20;

  const where = { clientId, deletedAt: null };
  if (paymentType) where.paymentType = paymentType;
  if (status)      where.status      = status;
  if (paymentMode) where.paymentMode = paymentMode;
  if (packageId)   where.packageId   = packageId;

  if (fromDate || toDate) {
    where.invoiceDate = {};
    if (fromDate) where.invoiceDate[Op.gte] = fromDate;
    if (toDate)   where.invoiceDate[Op.lte] = toDate;
  }

  if (search) {
    where[Op.or] = [
      { invoiceNumber:   { [Op.like]: `%${search}%` } },
      { referenceNumber: { [Op.like]: `%${search}%` } },
      { description:     { [Op.like]: `%${search}%` } },
    ];
  }

  const SORT_COLS = ['invoiceDate', 'dueDate', 'paidDate', 'amount', 'totalAmount', 'created_at', 'status'];
  const col = SORT_COLS.includes(sortBy) ? sortBy : 'created_at';
  const dir = sortOrder === 'ASC' ? 'ASC' : 'DESC';

  const { count: total, rows: payments } = await db.ClientPayment.findAndCountAll({
    where,
    include: PAYMENT_INCLUDE,
    offset: (page - 1) * limit,
    limit,
    order: [[col, dir]],
    distinct: true,
  });

  return { payments, total, page, limit };
}

async function getPaymentById({ clientId, paymentId }) {
  const record = await db.ClientPayment.findOne({
    where: { id: paymentId, clientId, deletedAt: null },
    include: INVOICE_INCLUDE,
  });
  if (!record) throw notFound('Payment record not found');
  return record;
}

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE PAYMENT (general field update for DRAFT invoices)
// ─────────────────────────────────────────────────────────────────────────────

async function updatePayment({ requestingUser, clientId, paymentId, data, req }) {
  assertLevel(requestingUser, PAYMENT_MANAGE_MAX_LEVEL, 'Manager+ required');
  const record = await db.ClientPayment.findOne({
    where: { id: paymentId, clientId, deletedAt: null },
  });
  if (!record) throw notFound('Payment record not found');

  // Only DRAFT invoices can be freely edited
  if (record.paymentType === 'INVOICE' && record.status !== 'DRAFT') {
    throw badRequest('Only DRAFT invoices can be fully edited. Use specific workflow actions for other statuses.');
  }

  const EDITABLE = [
    'invoiceDate', 'dueDate', 'description', 'internalNotes',
    'amount', 'taxAmount', 'taxRate', 'discountAmount', 'penaltyAmount',
    'lineItems', 'attachments', 'currency', 'referenceNumber',
    'paymentMode', 'paidDate', 'dueDate', 'nextFollowUpDate',
  ];

  const oldValues = record.toJSON();
  EDITABLE.forEach(f => { if (data[f] !== undefined) record[f] = data[f]; });

  await record.save();
  const full = await db.ClientPayment.findByPk(record.id, { include: INVOICE_INCLUDE });

  const displayName = full.invoiceNumber || full.referenceNumber || (full.paymentType ? `${full.paymentType} payment` : 'Payment record');
  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.PAYMENT_UPDATED,
    category: AUDIT_CATEGORY.PAYMENT, entity: 'ClientPayment',
    entityId: record.id, entityName: displayName,
    description: `Payment record "${displayName}" updated`,
    oldValues, newValues: full.toJSON(), req,
  });

  return full;
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE (soft)
// ─────────────────────────────────────────────────────────────────────────────

async function deletePayment({ requestingUser, clientId, paymentId, req }) {
  assertLevel(requestingUser, CLIENT_MANAGE_MAX_LEVEL, 'Manager+ required to delete payment records');

  const record = await db.ClientPayment.findOne({
    where: { id: paymentId, clientId, deletedAt: null },
  });
  if (!record) throw notFound('Payment record not found');

  if (['PAID', 'PARTIALLY_PAID'].includes(record.status)) {
    throw badRequest('Cannot delete a paid or partially-paid record. Issue a credit note or write-off instead.');
  }

  await record.update({ deletedAt: new Date() });

  const displayName = record.invoiceNumber || record.referenceNumber || (record.paymentType ? `${record.paymentType} payment` : 'Payment record');
  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.PAYMENT_DELETED,
    category: AUDIT_CATEGORY.PAYMENT, entity: 'ClientPayment',
    entityId: record.id, entityName: displayName,
    description: `Payment record "${displayName}" deleted`,
    req,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY / OUTSTANDING REPORT
// ─────────────────────────────────────────────────────────────────────────────

async function getPaymentSummary({ clientId }) {
  await assertClient(clientId);

  // ── 1. Invoice totals by status ───────────────────────────────────────────────
  const invoiceRows = await db.ClientPayment.findAll({
    where: { clientId, paymentType: 'INVOICE', deletedAt: null },
    attributes: [
      'status',
      [fn('COUNT', col('id')), 'count'],
      [fn('SUM', col('total_amount')), 'totalAmount'],
      [fn('SUM', col('paid_amount')),  'paidAmount'],
      [fn('SUM', col('balance_amount')), 'balanceAmount'],
    ],
    group: ['status'],
    raw: true,
  });

  const byStatus = {};
  let totalInvoiced   = 0;
  let totalPaid       = 0;
  let totalOutstanding = 0;
  let totalOverdue    = 0;
  let totalDisputed   = 0;
  let totalWrittenOff = 0;
  let invoiceCount    = 0;

  for (const row of invoiceRows) {
    const s = row.status;
    byStatus[s] = {
      count:         parseInt(row.count        || 0),
      totalAmount:   parseFloat(row.totalAmount  || 0),
      paidAmount:    parseFloat(row.paidAmount   || 0),
      balanceAmount: parseFloat(row.balanceAmount || 0),
    };
    if (s !== 'DRAFT' && s !== 'CANCELLED') {
      totalInvoiced  += parseFloat(row.totalAmount  || 0);
    }
    totalPaid      += parseFloat(row.paidAmount   || 0);
    invoiceCount   += parseInt(row.count          || 0);
    if (['SENT', 'PARTIALLY_PAID', 'OVERDUE', 'DISPUTED'].includes(s)) {
      totalOutstanding += parseFloat(row.balanceAmount || 0);
    }
    if (s === 'OVERDUE')    totalOverdue    += parseFloat(row.balanceAmount || 0);
    if (s === 'DISPUTED')   totalDisputed   += parseFloat(row.balanceAmount || 0);
    if (s === 'WRITTEN_OFF') totalWrittenOff += parseFloat(row.totalAmount  || 0);
  }

  // ── 2. Per-package invoice breakdown ────────────────────────────────────────
  const pkgInvoiceRows = await db.ClientPayment.findAll({
    where: {
      clientId,
      paymentType: 'INVOICE',
      deletedAt: null,
      packageId: { [Op.ne]: null },
      status: { [Op.notIn]: ['DRAFT', 'CANCELLED'] },
    },
    attributes: [
      'packageId',
      [fn('COUNT', col('ClientPayment.id')), 'count'],
      [fn('SUM', col('total_amount')),  'totalAmount'],
      [fn('SUM', col('paid_amount')),   'paidAmount'],
      [fn('SUM', col('balance_amount')),'balanceAmount'],
    ],
    include: [{
      model: db.ClientPackage,
      as: 'package',
      attributes: ['id', 'name', 'packageType', 'billingCycle', 'basePrice', 'status'],
      required: false,
    }],
    group: ['packageId', 'package.id'],
    raw: true,
    nest: true,
  });

  const byPackage = pkgInvoiceRows.map(row => ({
    packageId:     row.packageId,
    packageName:   row.package?.name || null,
    packageType:   row.package?.packageType || null,
    billingCycle:  row.package?.billingCycle || null,
    basePrice:     parseFloat(row.package?.basePrice || 0),
    packageStatus: row.package?.status || null,
    invoiceCount:  parseInt(row.count        || 0),
    totalInvoiced: parseFloat(row.totalAmount  || 0),
    totalPaid:     parseFloat(row.paidAmount   || 0),
    totalBalance:  parseFloat(row.balanceAmount || 0),
  }));

  // ── 3. Advances received ────────────────────────────────────────────────
  const advanceRow = await db.ClientPayment.findOne({
    where: { clientId, paymentType: 'ADVANCE', deletedAt: null },
    attributes: [
      [fn('SUM', col('amount')), 'totalAdvance'],
      [fn('COUNT', col('id')),  'count'],
    ],
    raw: true,
  });
  const totalAdvanceReceived = parseFloat(advanceRow?.totalAdvance || 0);
  const advanceCount         = parseInt(advanceRow?.count          || 0);

  // ── 4. Credit notes ─────────────────────────────────────────────────────
  const creditRow = await db.ClientPayment.findOne({
    where: { clientId, paymentType: 'CREDIT_NOTE', deletedAt: null },
    attributes: [
      [fn('SUM', col('amount')), 'totalCredit'],
      [fn('COUNT', col('id')),  'count'],
    ],
    raw: true,
  });
  const totalCreditNotes = parseFloat(creditRow?.totalCredit || 0);
  const creditNoteCount  = parseInt(creditRow?.count         || 0);

  // ── 5. Active package contract values ────────────────────────────────────
  const activePackages = await db.ClientPackage.findAll({
    where: { clientId, status: 'ACTIVE' },
    attributes: ['id', 'name', 'basePrice', 'billingCycle', 'packageType', 'renewalDate', 'startDate'],
    raw: true,
  });

  const CYCLE_MONTHS = { MONTHLY: 1, QUARTERLY: 3, ANNUAL: 12 };
  let totalContractValue          = 0;
  let totalMonthlyContractValue   = 0;
  for (const pkg of activePackages) {
    const base = parseFloat(pkg.basePrice || 0);
    totalContractValue        += base;
    totalMonthlyContractValue += base / (CYCLE_MONTHS[pkg.billingCycle] || 1);
  }

  // ── 6. Add-on charges (pending billing vs billed) ───────────────────────────
  // Fetch all add-ons for this client's packages, grouped by status
  const addOnRows = await db.PackageAddOn.findAll({
    where: {
      '$package.client_id$': clientId,
    },
    include: [{
      model: db.ClientPackage,
      as: 'package',
      attributes: ['id', 'name', 'clientId'],
      where: { clientId },
      required: true,
    }],
    attributes: [
      'status',
      [fn('COUNT', col('PackageAddOn.id')), 'count'],
      [fn('SUM', col('total_price')),       'totalAmount'],
    ],
    group: ['status', 'package.id', 'package.name', 'package.client_id'],
    raw: true,
    nest: true,
  }).catch(() => []);

  // Aggregate by status
  const addOnByStatus = {};
  let addOnPendingBillingAmount = 0;
  let addOnPendingBillingCount  = 0;
  let addOnBilledAmount         = 0;

  for (const row of addOnRows) {
    const s = row.status;
    if (!addOnByStatus[s]) addOnByStatus[s] = { count: 0, totalAmount: 0 };
    addOnByStatus[s].count       += parseInt(row.count       || 0);
    addOnByStatus[s].totalAmount += parseFloat(row.totalAmount || 0);

    if (['APPROVED', 'DELIVERED'].includes(s)) {
      addOnPendingBillingAmount += parseFloat(row.totalAmount || 0);
      addOnPendingBillingCount  += parseInt(row.count         || 0);
    }
    if (s === 'BILLED') addOnBilledAmount += parseFloat(row.totalAmount || 0);
  }

  // ── 7. Upcoming invoices (DRAFT / SENT not yet overdue) ─────────────────────
  const now = new Date();
  const upcomingInvoices = await db.ClientPayment.findAll({
    where: {
      clientId,
      paymentType: 'INVOICE',
      deletedAt: null,
      status: { [Op.in]: ['DRAFT', 'SENT'] },
      dueDate: { [Op.gte]: now },
    },
    attributes: ['id', 'invoiceNumber', 'totalAmount', 'balanceAmount', 'dueDate', 'status', 'packageId'],
    include: [{
      model: db.ClientPackage, as: 'package',
      attributes: ['id', 'name'],
      required: false,
    }],
    order: [['due_date', 'ASC']],
    limit: 5,
  });

  // ── 8. Net financial position ────────────────────────────────────────────────
  const netCollected = totalPaid + totalAdvanceReceived - totalCreditNotes;

  return {
    // Invoice summary by status
    invoices: {
      totalCount: invoiceCount,
      totalInvoiced,
      totalPaid,
      totalOutstanding,           // Balance due across open invoices
      totalOverdue,               // Of which: overdue
      totalDisputed,              // Of which: disputed
      totalWrittenOff,            // Written-off amounts
      byStatus,                   // Per-status breakdown
    },

    // Per-package invoice breakdown
    byPackage,

    // Advances
    advances: {
      count: advanceCount,
      totalReceived: totalAdvanceReceived,
    },

    // Credit Notes
    creditNotes: {
      count: creditNoteCount,
      totalIssued: totalCreditNotes,
    },

    // Active package (retainer) contract value
    packages: {
      activeCount:             activePackages.length,
      totalContractValue,
      monthlyEquivalentValue:  parseFloat(totalMonthlyContractValue.toFixed(2)),
      list: activePackages,
    },

    // Add-on charges
    addOns: {
      byStatus: addOnByStatus,
      pendingBillingCount:   addOnPendingBillingCount,
      pendingBillingAmount:  parseFloat(addOnPendingBillingAmount.toFixed(2)),
      totalBilledAmount:     parseFloat(addOnBilledAmount.toFixed(2)),
    },

    // Upcoming invoices (next 5 not yet due)
    upcomingInvoices: upcomingInvoices.map(i => i.toJSON()),

    // Net financial position
    netCollected:       parseFloat(netCollected.toFixed(2)),
    uninvoicedCharges:  parseFloat(addOnPendingBillingAmount.toFixed(2)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL helpers
// ─────────────────────────────────────────────────────────────────────────────

async function _findPayment(paymentId, clientId, requiredType) {
  const record = await db.ClientPayment.findOne({
    where: { id: paymentId, clientId, deletedAt: null },
  });
  if (!record) throw notFound('Payment record not found');
  if (requiredType && record.paymentType !== requiredType) {
    throw badRequest(`Expected a ${requiredType} record, got ${record.paymentType}`);
  }
  return record;
}

// ─────────────────────────────────────────────────────────────────────────────
// INVOICE APPROVAL FLOW
// Draft → Under Review → Approved → (payment collection begins)
// ─────────────────────────────────────────────────────────────────────────────

async function submitInvoiceForReview({ requestingUser, clientId, paymentId, req }) {
  const inv = await _assertInvoice(clientId, paymentId);

  if (inv.invoiceStatus !== 'DRAFT') {
    throw badRequest('Only DRAFT invoices can be submitted for review');
  }

  await inv.update({ invoiceStatus: 'UNDER_REVIEW' });

  await writeAuditLog({
    performedBy: requestingUser,
    category: AUDIT_CATEGORY.PAYMENT,
    action:   AUDIT_ACTION.PAYMENT_INVOICE_REVIEWED,
    entity: 'ClientPayment',
    entityId: paymentId,
    entityName: inv.invoiceNumber,
    description: `Invoice "${inv.invoiceNumber}" submitted for review by ${requestingUser.firstName} ${requestingUser.lastName}`,
    newValues: { invoiceNumber: inv.invoiceNumber, submittedBy: requestingUser.id },
    req,
  });

  return inv.reload({ include: INVOICE_INCLUDE });
}

async function approveInvoice({ requestingUser, clientId, paymentId, req }) {
  assertLevel(requestingUser, PAYMENT_MANAGE_MAX_LEVEL, 'Manager+ required to approve invoices');
  const inv = await _assertInvoice(clientId, paymentId);

  if (!['DRAFT', 'UNDER_REVIEW'].includes(inv.invoiceStatus)) {
    throw badRequest('Only DRAFT or UNDER_REVIEW invoices can be approved');
  }

  await inv.update({
    invoiceStatus:      'APPROVED',
    paymentStatus:      'UNPAID',
    status:             'SENT',
    reviewedById:       requestingUser.id,
    reviewedAt:         new Date(),
    invoiceApprovedById: requestingUser.id,
    invoiceApprovedAt:  new Date(),
  });

  await writeAuditLog({
    performedBy: requestingUser,
    category: AUDIT_CATEGORY.PAYMENT,
    action:   AUDIT_ACTION.PAYMENT_INVOICE_APPROVED,
    entity: 'ClientPayment',
    entityId: paymentId,
    entityName: inv.invoiceNumber,
    description: `Invoice "${inv.invoiceNumber}" approved by ${requestingUser.firstName} ${requestingUser.lastName}`,
    newValues: { invoiceNumber: inv.invoiceNumber, approvedBy: requestingUser.id },
    req,
  });

  return inv.reload({ include: INVOICE_INCLUDE });
}

async function rejectInvoice({ requestingUser, clientId, paymentId, data, req }) {
  assertLevel(requestingUser, PAYMENT_MANAGE_MAX_LEVEL, 'Manager+ required to reject invoices');
  const inv = await _assertInvoice(clientId, paymentId);

  if (inv.invoiceStatus !== 'UNDER_REVIEW') {
    throw badRequest('Only UNDER_REVIEW invoices can be rejected back to Draft');
  }

  await inv.update({
    invoiceStatus:   'DRAFT',
    reviewedById:    requestingUser.id,
    reviewedAt:      new Date(),
    rejectionReason: data?.rejectionReason || null,
  });

  await writeAuditLog({
    performedBy: requestingUser,
    category: AUDIT_CATEGORY.PAYMENT,
    action:   AUDIT_ACTION.PAYMENT_INVOICE_REJECTED,
    entity: 'ClientPayment',
    entityId: paymentId,
    entityName: inv.invoiceNumber,
    description: `Invoice "${inv.invoiceNumber}" rejected${data?.rejectionReason ? `: "${data.rejectionReason}"` : ''}`,
    newValues: { invoiceNumber: inv.invoiceNumber, rejectionReason: data?.rejectionReason },
    req,
  });

  return inv.reload({ include: INVOICE_INCLUDE });
}

// ── Helper: assert invoice exists and belongs to client ───────────────────────
async function _assertInvoice(clientId, paymentId) {
  const inv = await db.ClientPayment.findOne({
    where: { id: paymentId, clientId, paymentType: 'INVOICE', deletedAt: null },
  });
  if (!inv) throw notFound('Invoice not found');
  return inv;
}

// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  createInvoice,
  recordPayment,
  recordAdvance,
  issueCreditNote,
  markInvoiceSent,
  markInvoiceOverdue,
  raiseDispute,
  resolveDispute,
  approvePayment,
  cancelInvoice,
  writeOffInvoice,
  logFollowUp,
  getPayments,
  getPaymentById,
  updatePayment,
  deletePayment,
  getPaymentSummary,
  // Invoice approval flow
  submitInvoiceForReview,
  approveInvoice,
  rejectInvoice,
};
