'use strict';

const { Op, fn, col, literal } = require('sequelize');
const { sequelize, Client, ClientPayment, ClientPackage, Docket, Task, SubTask, ClientRisk, User } = require('../models');

// ─── Client Overview ──────────────────────────────────────────────────────────

async function getClientOverview({ clientId }) {
  const client = await Client.findByPk(clientId, {
    attributes: ['id', 'name', 'logo', 'industry', 'clientCode', 'loyaltyScore', 'healthScore', 'relationshipStatus'],
  });
  if (!client) throw Object.assign(new Error('Client not found'), { statusCode: 404 });

  const [
    outstandingData,
    packagesData,
    docketsData,
    tasksData,
    risksData,
  ] = await Promise.all([
    _getOutstanding(clientId),
    _getPackagesSummary(clientId),
    _getDocketsSummary(clientId),
    _getTasksSummary(clientId),
    _getActiveRisks(clientId),
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
    },
    outstanding: outstandingData,
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
    where: { clientId, status: 'ACTIVE' },
    attributes: ['id', 'name', 'packageType', 'status', 'basePrice', 'renewalDate', 'billingCycle', 'startDate'],
  });

  return {
    activeCount: packages.length,
    list: packages.map(p => p.toJSON()),
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
  return client.reload({ attributes: ['id', 'name', 'loyaltyScore', 'healthScore', 'relationshipStatus'] });
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
  createRisk,
  updateRisk,
  deleteRisk,
  getRisks,
};
