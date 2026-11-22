'use strict';

const { Op, fn, col, literal } = require('sequelize');
const { sequelize, Client, ClientPayment, ClientPackage, PackageService, PackageAddOn, ServiceCatalog, Docket, Task, SubTask, ClientRisk, User } = require('../models');

// ─── Client Overview ──────────────────────────────────────────────────────────

async function getClientOverview({ clientId }) {
  const client = await Client.findByPk(clientId, {
    attributes: ['id', 'name', 'logo', 'industry', 'clientCode', 'loyaltyScore', 'healthScore', 'relationshipStatus', 'clientLevel'],
  });
  if (!client) throw Object.assign(new Error('Client not found'), { statusCode: 404 });

  const [
    outstandingData,
    packagesData,
    docketsData,
    tasksData,
    risksData,
    billingSummary,
  ] = await Promise.all([
    _getOutstanding(clientId),
    _getPackagesSummary(clientId),
    _getDocketsSummary(clientId),
    _getTasksSummary(clientId),
    _getActiveRisks(clientId),
    _getBillingSummary(clientId),
  ]);

  // Quick Alerts are derived from other data
  const quickAlerts = {
    pendingApprovals: tasksData.pendingApprovalCount,
    overdueTasks: tasksData.overdueCount,
    openRisks: risksData.filter(r => !r.isResolved).length,
    unpaidInvoices: outstandingData.unpaidInvoicesCount,
    total: tasksData.pendingApprovalCount + tasksData.overdueCount + risksData.filter(r => !r.isResolved).length + outstandingData.unpaidInvoicesCount,
  };

  return {
    client: client.toJSON(),
    scores: {
      loyaltyScore: client.loyaltyScore,
      healthScore: client.healthScore,
      relationshipStatus: client.relationshipStatus,
      clientLevel: client.clientLevel,
    },
    outstanding: outstandingData,
    billing: billingSummary,
    quickAlerts,
    packages: packagesData,
    dockets: docketsData,
    tasks: tasksData,
    risks: risksData,
  };
}

async function _getOutstanding(clientId) {
  // Sum of balance_amount for all unpaid invoices
  const result = await ClientPayment.findAll({
    where: {
      clientId,
      paymentType: 'INVOICE',
      status: { [Op.in]: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
    },
    attributes: [
      [fn('COUNT', col('id')), 'count'],
      [fn('SUM', col('total_amount')), 'totalInvoiced'],
      [fn('SUM', col('paid_amount')), 'totalPaid'],
      [fn('SUM', col('balance_amount')), 'outstandingAmount'],
    ],
    raw: true,
  });

  const row = result[0] || {};
  return {
    totalInvoiced: parseFloat(row.totalInvoiced || 0),
    totalPaid: parseFloat(row.totalPaid || 0),
    outstandingAmount: parseFloat(row.outstandingAmount || 0),
    unpaidInvoicesCount: parseInt(row.count || 0),
  };
}

async function _getPackagesSummary(clientId) {
  const packages = await ClientPackage.findAll({
    where: { clientId, status: { [Op.in]: ['ACTIVE', 'PAUSED'] } },
    attributes: ['id', 'name', 'packageType', 'status', 'basePrice', 'renewalDate', 'billingCycle', 'startDate', 'endDate'],
    include: [
      {
        model: PackageService,
        as: 'services',
        required: false,
        include: [{ model: ServiceCatalog, as: 'service', attributes: ['id', 'name', 'category', 'unit', 'defaultPrice', 'serviceLevel'] }],
      },
      {
        model: PackageAddOn,
        as: 'addOns',
        required: false,
        include: [{ model: ServiceCatalog, as: 'service', attributes: ['id', 'name', 'category', 'serviceLevel'] }],
      },
    ],
  });

  const activePackages = packages.filter(p => p.status === 'ACTIVE');

  return {
    activeCount: activePackages.length,
    totalCount: packages.length,
    list: packages.map(p => {
      const pkg = p.toJSON();

      // ── Add-on financials per package ──────────────────────────────────────
      const addOnTotals = (pkg.addOns || []).reduce((acc, ao) => {
        acc.total += parseFloat(ao.totalPrice || 0);
        if (ao.status === 'APPROVED' || ao.status === 'DELIVERED') acc.pendingBilling += parseFloat(ao.totalPrice || 0);
        if (ao.status === 'BILLED') acc.billed += parseFloat(ao.totalPrice || 0);
        return acc;
      }, { total: 0, pendingBilling: 0, billed: 0 });

      // ── Service level breakdown (BL / SL / PL / UL counts & totals) ────────
      const levelCounts = { BL: 0, SL: 0, PL: 0, UL: 0 };
      const levelTotals = { BL: 0, SL: 0, PL: 0, UL: 0 };
      let computedBasePrice = 0;

      for (const ps of (pkg.services || [])) {
        if (!ps.isIncluded) continue;
        const qty = ps.quantity || 1;
        const effectivePrice = parseFloat(
          ps.unitPrice != null ? ps.unitPrice : (ps.service?.defaultPrice ?? 0)
        );
        const lineAmount = qty * effectivePrice;
        computedBasePrice += lineAmount;

        const level = ps.service?.serviceLevel; // e.g. 'BL-1', 'SL-2', 'UL-1'
        if (level) {
          const tier = level.split('-')[0]; // 'BL', 'SL', 'PL', 'UL'
          if (levelCounts[tier] !== undefined) {
            levelCounts[tier]++;
            levelTotals[tier] += lineAmount;
          }
        }
      }

      const packageOverview = {
        totalServicesIncluded: (pkg.services || []).filter(s => s.isIncluded).length,
        computedBasePrice: parseFloat(computedBasePrice.toFixed(2)),
        levelBreakdown: {
          BL: { count: levelCounts.BL, total: parseFloat(levelTotals.BL.toFixed(2)) },
          SL: { count: levelCounts.SL, total: parseFloat(levelTotals.SL.toFixed(2)) },
          PL: { count: levelCounts.PL, total: parseFloat(levelTotals.PL.toFixed(2)) },
          UL: { count: levelCounts.UL, total: parseFloat(levelTotals.UL.toFixed(2)) },
        },
      };

      return { ...pkg, addOnSummary: addOnTotals, packageOverview };
    }),
  };
}

async function _getDocketsSummary(clientId) {
  const dockets = await Docket.findAll({
    where: { clientId, status: { [Op.ne]: 'CANCELLED' } },
    attributes: ['id', 'title', 'status', 'docketType', 'startDate', 'endDate'],
  });

  // For each docket, get task summary
  const docketIds = dockets.map(d => d.id);
  let tasksByDocket = {};

  if (docketIds.length > 0) {
    const taskRows = await Task.findAll({
      where: { docketId: { [Op.in]: docketIds } },
      attributes: ['docketId', 'status', 'dueDate'],
      raw: true,
    });

    const now = new Date();
    for (const t of taskRows) {
      if (!tasksByDocket[t.docketId]) tasksByDocket[t.docketId] = { total: 0, completed: 0, overdue: 0 };
      tasksByDocket[t.docketId].total++;
      if (t.status === 'COMPLETED') tasksByDocket[t.docketId].completed++;
      if (t.dueDate && new Date(t.dueDate) < now && t.status !== 'COMPLETED') tasksByDocket[t.docketId].overdue++;
    }
  }

  const activeStatuses = ['PUBLISHED', 'ACTIVE'];

  return {
    activeCount: dockets.filter(d => activeStatuses.includes(d.status)).length,
    totalCount: dockets.length,
    list: dockets.map(d => ({
      ...d.toJSON(),
      taskSummary: tasksByDocket[d.id] || { total: 0, completed: 0, overdue: 0 },
    })),
  };
}

async function _getTasksSummary(clientId) {
  // Get all tasks linked to this client's dockets
  const dockets = await Docket.findAll({
    where: { clientId },
    attributes: ['id'],
    raw: true,
  });
  const docketIds = dockets.map(d => d.id);

  if (docketIds.length === 0) {
    return { totalCount: 0, completedCount: 0, overdueCount: 0, pendingApprovalCount: 0, inProgressCount: 0 };
  }

  const tasks = await Task.findAll({
    where: { docketId: { [Op.in]: docketIds } },
    attributes: ['id', 'status', 'dueDate'],
    raw: true,
  });

  const now = new Date();
  let completedCount = 0;
  let overdueCount = 0;
  let pendingApprovalCount = 0;
  let inProgressCount = 0;

  for (const t of tasks) {
    if (t.status === 'COMPLETED') completedCount++;
    if (t.status === 'MANAGER_REVIEW') pendingApprovalCount++;
    if (t.status === 'IN_PROGRESS') inProgressCount++;
    if (t.dueDate && new Date(t.dueDate) < now && !['COMPLETED', 'CANCELLED'].includes(t.status)) overdueCount++;
  }

  return {
    totalCount: tasks.length,
    completedCount,
    overdueCount,
    pendingApprovalCount,
    inProgressCount,
  };
}

async function _getActiveRisks(clientId) {
  const risks = await ClientRisk.findAll({
    where: { clientId },
    include: [{ model: User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'] }],
    order: [['created_at', 'DESC']],
  });
  return risks.map(r => r.toJSON());
}

// ─── Billing Summary ─────────────────────────────────────────────────────────

async function _getBillingSummary(clientId) {
  // ── 1. Invoice-based totals (grouped by status) ────────────────────────────
  const invoiceRows = await ClientPayment.findAll({
    where: { clientId, paymentType: 'INVOICE' },
    attributes: [
      'status',
      [fn('COUNT', col('id')), 'count'],
      [fn('SUM', col('total_amount')), 'totalAmount'],
      [fn('SUM', col('paid_amount')), 'paidAmount'],
      [fn('SUM', col('balance_amount')), 'balanceAmount'],
    ],
    group: ['status'],
    raw: true,
  });

  const byStatus = {};
  let totalInvoiced = 0;
  let totalPaid = 0;
  let totalOutstanding = 0; // unpaid balance across active invoices
  let totalOverdue = 0;
  let totalDisputed = 0;
  let invoiceCount = 0;

  for (const row of invoiceRows) {
    const s = row.status;
    byStatus[s] = {
      count: parseInt(row.count || 0),
      totalAmount: parseFloat(row.totalAmount || 0),
      paidAmount: parseFloat(row.paidAmount || 0),
      balanceAmount: parseFloat(row.balanceAmount || 0),
    };
    if (s !== 'DRAFT' && s !== 'CANCELLED') {
      totalInvoiced += parseFloat(row.totalAmount || 0);
    }
    totalPaid += parseFloat(row.paidAmount || 0);
    invoiceCount += parseInt(row.count || 0);
    // Outstanding = balance on open invoices (SENT, PARTIALLY_PAID, OVERDUE, DISPUTED)
    if (['SENT', 'PARTIALLY_PAID', 'OVERDUE', 'DISPUTED'].includes(s)) {
      totalOutstanding += parseFloat(row.balanceAmount || 0);
    }
    if (s === 'OVERDUE') totalOverdue += parseFloat(row.balanceAmount || 0);
    if (s === 'DISPUTED') totalDisputed += parseFloat(row.balanceAmount || 0);
  }

  // ── 2. Advances received ───────────────────────────────────────────────────
  const advanceRow = await ClientPayment.findOne({
    where: { clientId, paymentType: 'ADVANCE' },
    attributes: [[fn('SUM', col('amount')), 'totalAdvance'], [fn('COUNT', col('id')), 'count']],
    raw: true,
  });
  const totalAdvanceReceived = parseFloat(advanceRow?.totalAdvance || 0);
  const advanceCount = parseInt(advanceRow?.count || 0);

  // ── 3. Credit notes issued ─────────────────────────────────────────────────
  const creditRow = await ClientPayment.findOne({
    where: { clientId, paymentType: 'CREDIT_NOTE' },
    attributes: [[fn('SUM', col('amount')), 'totalCredit'], [fn('COUNT', col('id')), 'count']],
    raw: true,
  });
  const totalCreditNotes = parseFloat(creditRow?.totalCredit || 0);
  const creditNoteCount = parseInt(creditRow?.count || 0);

  // ── 4. Active package contract value ──────────────────────────────────────
  // Sum of basePrice of all ACTIVE packages (monthly equivalent)
  const activePackages = await ClientPackage.findAll({
    where: { clientId, status: 'ACTIVE' },
    attributes: ['id', 'name', 'basePrice', 'billingCycle'],
    raw: true,
  });

  // Compute monthly value for each package
  const CYCLE_MONTHS = { MONTHLY: 1, QUARTERLY: 3, ANNUAL: 12 };
  let totalMonthlyContractValue = 0;
  let totalContractValue = 0; // base prices summed as-is (per billing cycle)
  for (const pkg of activePackages) {
    const base = parseFloat(pkg.basePrice || 0);
    totalContractValue += base;
    totalMonthlyContractValue += base / (CYCLE_MONTHS[pkg.billingCycle] || 1);
  }

  // ── 5. Add-on amounts pending billing ─────────────────────────────────────
  // Add-ons that are APPROVED or DELIVERED but not yet BILLED
  const pendingAddOnRows = await PackageAddOn.findAll({
    where: {
      status: { [Op.in]: ['APPROVED', 'DELIVERED'] },
      '$package.client_id$': clientId,
    },
    include: [{
      model: ClientPackage,
      as: 'package',
      attributes: ['id', 'name', 'clientId'],
      where: { clientId },
    }],
    attributes: ['id', 'totalPrice', 'unitPrice', 'quantity', 'status'],
    raw: true,
  }).catch(() => []); // graceful fallback if join fails

  const addOnsPendingBillingAmount = pendingAddOnRows.reduce((sum, ao) => sum + parseFloat(ao.totalPrice || 0), 0);
  const addOnsPendingBillingCount = pendingAddOnRows.length;

  // ── 6. Billed add-ons total ────────────────────────────────────────────────
  const billedAddOnRows = await PackageAddOn.findAll({
    where: {
      status: 'BILLED',
      '$package.client_id$': clientId,
    },
    include: [{
      model: ClientPackage,
      as: 'package',
      attributes: ['id', 'name', 'clientId'],
      where: { clientId },
    }],
    attributes: ['id', 'totalPrice'],
    raw: true,
  }).catch(() => []);

  const totalAddOnsBilled = billedAddOnRows.reduce((sum, ao) => sum + parseFloat(ao.totalPrice || 0), 0);

  // ── 7. Net position ───────────────────────────────────────────────────────
  // Effective amount collected = paid invoices + advances - credit notes
  const netCollected = totalPaid + totalAdvanceReceived - totalCreditNotes;

  return {
    // Invoice aggregate
    invoices: {
      totalCount: invoiceCount,
      totalInvoiced,          // Sum of all invoice totalAmounts
      totalPaid,              // Sum of paidAmount across all invoices
      totalOutstanding,       // Balance due on open (SENT/PARTIALLY_PAID/OVERDUE/DISPUTED)
      totalOverdue,           // Balance due on OVERDUE invoices specifically
      totalDisputed,          // Balance due on DISPUTED invoices
      byStatus,               // Breakdown per status
    },
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
    // Package (retainer) value
    packages: {
      activeCount: activePackages.length,
      totalContractValue,           // Sum of basePrice of active packages
      monthlyEquivalentValue: parseFloat(totalMonthlyContractValue.toFixed(2)),
    },
    // Add-ons
    addOns: {
      pendingBillingCount: addOnsPendingBillingCount,
      pendingBillingAmount: parseFloat(addOnsPendingBillingAmount.toFixed(2)),
      totalBilled: parseFloat(totalAddOnsBilled.toFixed(2)),
    },
    // Net financial position
    netCollected: parseFloat(netCollected.toFixed(2)),
    // Unpaid charges not yet invoiced (add-ons pending + any contract value not billed)
    uninvoicedCharges: parseFloat(addOnsPendingBillingAmount.toFixed(2)),
  };
}

// ─── Scores Update ────────────────────────────────────────────────────────────

async function updateClientScores({ requestingUser, clientId, data }) {
  const client = await Client.findByPk(clientId);
  if (!client) throw Object.assign(new Error('Client not found'), { statusCode: 404 });

  const allowedFields = ['loyaltyScore', 'healthScore', 'relationshipStatus'];
  const update = {};
  for (const f of allowedFields) {
    if (data[f] !== undefined) update[f] = data[f];
  }

  await client.update(update);
  return client.reload({ attributes: ['id', 'name', 'loyaltyScore', 'healthScore', 'relationshipStatus', 'clientLevel'] });
}

// ─── Client Level ─────────────────────────────────────────────────────────────

const VALID_CLIENT_LEVELS = ['BASIC', 'STANDARD', 'PREMIUM'];

async function updateClientLevel({ requestingUser, clientId, level }) {
  if (!VALID_CLIENT_LEVELS.includes(level)) {
    throw Object.assign(
      new Error(`Invalid client level. Must be one of: ${VALID_CLIENT_LEVELS.join(', ')}`),
      { statusCode: 400 }
    );
  }

  const client = await Client.findByPk(clientId);
  if (!client) throw Object.assign(new Error('Client not found'), { statusCode: 404 });

  await client.update({ clientLevel: level });
  return client.reload({
    attributes: ['id', 'name', 'clientLevel', 'loyaltyScore', 'healthScore', 'relationshipStatus'],
  });
}

async function getClientLevel({ clientId }) {
  const client = await Client.findByPk(clientId, {
    attributes: ['id', 'name', 'clientLevel'],
  });
  if (!client) throw Object.assign(new Error('Client not found'), { statusCode: 404 });
  return client.toJSON();
}

// ─── Risk CRUD ────────────────────────────────────────────────────────────────

async function createRisk({ requestingUser, clientId, data }) {
  const client = await Client.findByPk(clientId);
  if (!client) throw Object.assign(new Error('Client not found'), { statusCode: 404 });

  const risk = await ClientRisk.create({
    clientId,
    createdById: requestingUser.id,
    title: data.title,
    description: data.description,
    severity: data.severity || 'warning',
    category: data.category || 'OTHER',
  });

  return risk;
}

async function updateRisk({ requestingUser, clientId, riskId, data }) {
  const risk = await ClientRisk.findOne({ where: { id: riskId, clientId } });
  if (!risk) throw Object.assign(new Error('Risk not found'), { statusCode: 404 });

  const update = {};
  if (data.title !== undefined) update.title = data.title;
  if (data.description !== undefined) update.description = data.description;
  if (data.severity !== undefined) update.severity = data.severity;
  if (data.category !== undefined) update.category = data.category;
  if (data.isResolved !== undefined) {
    update.isResolved = data.isResolved;
    if (data.isResolved) {
      update.resolvedAt = new Date();
      update.resolvedById = requestingUser.id;
    } else {
      update.resolvedAt = null;
      update.resolvedById = null;
    }
  }

  await risk.update(update);
  return risk;
}

async function deleteRisk({ requestingUser, clientId, riskId }) {
  const risk = await ClientRisk.findOne({ where: { id: riskId, clientId } });
  if (!risk) throw Object.assign(new Error('Risk not found'), { statusCode: 404 });
  await risk.destroy();
}

async function getRisks({ clientId, includeResolved = false }) {
  const where = { clientId };
  if (!includeResolved) where.isResolved = false;

  const risks = await ClientRisk.findAll({
    where,
    include: [{ model: User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'] }],
    order: [['created_at', 'DESC']],
  });

  return risks.map(r => r.toJSON());
}

module.exports = {
  getClientOverview,
  updateClientScores,
  updateClientLevel,
  getClientLevel,
  createRisk,
  updateRisk,
  deleteRisk,
  getRisks,
  getBillingSummary: _getBillingSummary,
};
