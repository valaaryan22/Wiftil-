'use strict';

const { Op, fn, col, literal } = require('sequelize');
const { db } = require('../database/client');

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDateRange({ dateFrom, dateTo, period } = {}) {
  const now = new Date();
  let start = null;
  let end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (period) {
    switch (period.toLowerCase()) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        break;
      case 'this_week': {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday start
        start = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0);
        break;
      }
      case 'this_month':
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        break;
      case 'this_quarter': {
        const qMonth = Math.floor(now.getMonth() / 3) * 3;
        start = new Date(now.getFullYear(), qMonth, 1, 0, 0, 0, 0);
        break;
      }
      case 'this_year':
        start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        break;
      case 'all_time':
        start = null;
        end = null;
        break;
      default:
        break;
    }
  }

  if (dateFrom) {
    start = new Date(dateFrom);
  }
  if (dateTo) {
    end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
  }

  // Default to this year if nothing specified
  if (!start && !period) {
    start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
  }

  return { start, end };
}

function buildDateFilter(field, start, end) {
  if (start && end) {
    return { [field]: { [Op.between]: [start, end] } };
  } else if (start) {
    return { [field]: { [Op.gte]: start } };
  } else if (end) {
    return { [field]: { [Op.lte]: end } };
  }
  return {};
}

// ── 1. Executive Management KPI Scorecard ──────────────────────────────────────

async function getExecutiveKpis(filters = {}) {
  const { start, end } = parseDateRange(filters);
  const dateWhere = buildDateFilter('created_at', start, end);

  // 1. Finance Metrics
  const invoiceWhere = { deletedAt: null, paymentType: 'INVOICE', ...dateWhere };
  const allInvoices = await db.ClientPayment.findAll({
    where: invoiceWhere,
    attributes: ['id', 'status', 'paymentStatus', 'amount', 'totalAmount', 'paidAmount', 'balanceAmount', 'dueDate'],
  });

  const totalInvoiced = allInvoices.reduce((sum, inv) => sum + parseFloat(inv.totalAmount || inv.amount || 0), 0);
  const totalCollected = allInvoices.reduce((sum, inv) => sum + parseFloat(inv.paidAmount || 0), 0);
  const totalOutstanding = allInvoices.reduce((sum, inv) => sum + parseFloat(inv.balanceAmount || 0), 0);

  // Direct payments recorded in period
  const directPayments = await db.ClientPayment.findAll({
    where: { deletedAt: null, paymentType: 'PAYMENT', status: 'PAID', ...dateWhere },
    attributes: ['amount', 'totalAmount', 'paidAmount'],
  });
  const directPaid = directPayments.reduce((sum, p) => sum + parseFloat(p.paidAmount || p.totalAmount || p.amount || 0), 0);
  const effectiveTotalRevenue = totalCollected + directPaid;

  // Expenses in period
  const expenseWhere = { deletedAt: null, status: { [Op.in]: ['APPROVED', 'PAID'] }, ...dateWhere };
  const expenses = await db.Expense.findAll({
    where: expenseWhere,
    attributes: ['amount', 'totalAmount', 'taxAmount'],
  });
  const totalExpenses = expenses.reduce((sum, exp) => sum + parseFloat(exp.totalAmount || exp.amount || 0), 0);

  const netOperatingProfit = effectiveTotalRevenue - totalExpenses;
  const netProfitMargin = effectiveTotalRevenue > 0 ? parseFloat(((netOperatingProfit / effectiveTotalRevenue) * 100).toFixed(1)) : 0;

  // 2. Operational Metrics
  const taskWhere = { deletedAt: null, ...dateWhere };
  const [totalTasks, completedTasks, inProgressTasks, overdueTasks, activeDockets, totalSubTasks, completedSubTasks] = await Promise.all([
    db.Task.count({ where: taskWhere }),
    db.Task.count({ where: { ...taskWhere, status: { [Op.in]: ['COMPLETED', 'MANAGER_APPROVED'] } } }),
    db.Task.count({ where: { ...taskWhere, status: { [Op.in]: ['IN_PROGRESS', 'ACCEPTED', 'SUBMITTED', 'MANAGER_REVIEW'] } } }),
    db.Task.count({
      where: {
        ...taskWhere,
        status: { [Op.notIn]: ['COMPLETED', 'MANAGER_APPROVED'] },
        dueDate: { [Op.lt]: new Date() },
      },
    }),
    db.Docket.count({ where: { deletedAt: null, status: { [Op.in]: ['PUBLISHED', 'ACTIVE'] } } }),
    db.SubTask.count({ where: { ...dateWhere } }),
    db.SubTask.count({ where: { status: { [Op.in]: ['FINAL_APPROVED', 'COMPLETED'] }, ...dateWhere } }),
  ]);

  const taskCompletionRate = totalTasks > 0 ? parseFloat(((completedTasks / totalTasks) * 100).toFixed(1)) : 0;
  const subTaskCompletionRate = totalSubTasks > 0 ? parseFloat(((completedSubTasks / totalSubTasks) * 100).toFixed(1)) : 0;
  const onTimeDeliveryRate = totalTasks > 0 ? parseFloat((Math.max(0, 100 - ((overdueTasks / totalTasks) * 100))).toFixed(1)) : 100;

  // 3. Workforce & HR Metrics
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const todayStr = todayStart.toISOString().slice(0, 10);

  const [totalActiveEmployees, punchedInToday, activeLeaveRequests] = await Promise.all([
    db.User.count({ where: { deletedAt: null, isActive: true } }),
    db.Attendance.count({
      where: {
        date: todayStr,
      },
      distinct: true,
      col: 'user_id',
    }),
    db.LeaveRequest.count({ where: { status: 'PENDING' } }).catch(() => 0),
  ]);

  const attendanceRateToday = totalActiveEmployees > 0 ? parseFloat(((punchedInToday / totalActiveEmployees) * 100).toFixed(1)) : 0;

  // Latest monthly payroll total
  const latestPayrolls = await db.EmployeePayroll.findAll({
    where: { deletedAt: null },
    order: [['created_at', 'DESC']],
    limit: 50,
    attributes: ['netSalary', 'status', 'payrollMonth'],
  });
  const monthlyPayrollBurn = latestPayrolls.reduce((sum, p) => sum + parseFloat(p.netSalary || 0), 0);

  // 4. Client & Pipeline Metrics
  const [totalClients, activeClients, activePackages] = await Promise.all([
    db.Client.count({ where: { deletedAt: null } }),
    db.Client.count({ where: { deletedAt: null, relationshipStatus: { [Op.ne]: 'CHURNED' } } }),
    db.ClientPackage.findAll({
      where: { deletedAt: null, status: 'ACTIVE' },
      attributes: ['basePrice'],
    }),
  ]);
  const totalMonthlyRetainerValue = activePackages.reduce((sum, p) => sum + parseFloat(p.basePrice || 0), 0);

  // 5. Strategic Health Score & Status (0 - 100 scale)
  const collectionRate = (totalInvoiced > 0) ? Math.min(100, (totalCollected / totalInvoiced) * 100) : 100;
  const profitScore = netOperatingProfit > 0 ? Math.min(100, Math.max(20, netProfitMargin * 2)) : 15;
  const healthScore = Math.round(
    (taskCompletionRate * 0.25) +
    (collectionRate * 0.25) +
    (profitScore * 0.25) +
    (attendanceRateToday * 0.25)
  );

  let healthStatus = 'EXCELLENT';
  let healthBadgeColor = '#16a34a'; // green
  if (healthScore < 50) {
    healthStatus = 'CRITICAL';
    healthBadgeColor = '#dc2626'; // red
  } else if (healthScore < 70) {
    healthStatus = 'NEEDS_ATTENTION';
    healthBadgeColor = '#f59e0b'; // amber
  } else if (healthScore < 85) {
    healthStatus = 'GOOD';
    healthBadgeColor = '#2563eb'; // blue
  }

  // Actionable Management Alerts
  const alerts = [];
  if (overdueTasks > 0) {
    alerts.push({ level: 'WARNING', message: `${overdueTasks} tasks are currently overdue and require management follow-up.` });
  }
  if (totalOutstanding > 0) {
    alerts.push({ level: 'INFO', message: `₹${totalOutstanding.toLocaleString('en-IN')} pending in accounts receivable across client invoices.` });
  }
  if (activeLeaveRequests > 0) {
    alerts.push({ level: 'INFO', message: `${activeLeaveRequests} leave request(s) awaiting manager approval.` });
  }
  if (attendanceRateToday < 75 && totalActiveEmployees > 0) {
    alerts.push({ level: 'WARNING', message: `Today's attendance is ${attendanceRateToday}% (${punchedInToday}/${totalActiveEmployees} employees).` });
  }

  return {
    period: filters.period || 'custom',
    dateRange: { start, end },
    healthScore,
    healthStatus,
    healthBadgeColor,
    finance: {
      totalInvoiced: parseFloat(totalInvoiced.toFixed(2)),
      totalCollected: parseFloat(effectiveTotalRevenue.toFixed(2)),
      totalOutstanding: parseFloat(totalOutstanding.toFixed(2)),
      totalExpenses: parseFloat(totalExpenses.toFixed(2)),
      netOperatingProfit: parseFloat(netOperatingProfit.toFixed(2)),
      netProfitMargin,
      monthlyRetainerValue: parseFloat(totalMonthlyRetainerValue.toFixed(2)),
    },
    operations: {
      totalTasks,
      completedTasks,
      inProgressTasks,
      overdueTasks,
      taskCompletionRate,
      onTimeDeliveryRate,
      activeDockets,
      totalSubTasks,
      completedSubTasks,
      subTaskCompletionRate,
    },
    workforce: {
      totalActiveEmployees,
      punchedInToday,
      attendanceRateToday,
      monthlyPayrollBurn: parseFloat(monthlyPayrollBurn.toFixed(2)),
      pendingLeaves: activeLeaveRequests,
    },
    crm: {
      totalClients,
      activeClients,
      activePackages: activePackages.length,
      monthlyRetainerValue: parseFloat(totalMonthlyRetainerValue.toFixed(2)),
    },
    alerts,
  };
}

// ── 2. Finance Reports ────────────────────────────────────────────────────────

async function getFinanceReport(filters = {}) {
  const { start, end } = parseDateRange(filters);
  const dateWhere = buildDateFilter('created_at', start, end);

  // 1. Invoices breakdown
  const invoices = await db.ClientPayment.findAll({
    where: { deletedAt: null, paymentType: 'INVOICE', ...dateWhere },
    include: [{ model: db.Client, as: 'client', attributes: ['id', 'name', 'clientCode'] }],
    order: [['created_at', 'DESC']],
  });

  const byStatus = {};
  let totalBilled = 0;
  let totalPaid = 0;
  let totalPending = 0;

  invoices.forEach((inv) => {
    const st = inv.invoiceStatus || inv.status || 'OTHER';
    if (!byStatus[st]) byStatus[st] = { count: 0, amount: 0, paid: 0, balance: 0 };
    const tot = parseFloat(inv.totalAmount || inv.amount || 0);
    const pd = parseFloat(inv.paidAmount || 0);
    const bal = parseFloat(inv.balanceAmount || Math.max(0, tot - pd));

    byStatus[st].count += 1;
    byStatus[st].amount += tot;
    byStatus[st].paid += pd;
    byStatus[st].balance += bal;

    totalBilled += tot;
    totalPaid += pd;
    totalPending += bal;
  });

  // 2. A/R Aging Analysis (Current, 1-30, 31-60, 61-90, 90+ days)
  const today = new Date();
  const aging = {
    current:    { label: 'Current (Not Due)', count: 0, amount: 0, clients: new Set() },
    days_1_30:  { label: '1 - 30 Days Overdue', count: 0, amount: 0, clients: new Set() },
    days_31_60: { label: '31 - 60 Days Overdue', count: 0, amount: 0, clients: new Set() },
    days_61_90: { label: '61 - 90 Days Overdue', count: 0, amount: 0, clients: new Set() },
    days_90_plus: { label: '90+ Days Overdue', count: 0, amount: 0, clients: new Set() },
  };

  const unpaidInvoices = invoices.filter(i => parseFloat(i.balanceAmount || 0) > 0 && !['PAID', 'CANCELLED'].includes(i.status));
  unpaidInvoices.forEach((inv) => {
    const bal = parseFloat(inv.balanceAmount || 0);
    const due = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.created_at);
    const diffDays = Math.floor((today - due) / (1000 * 60 * 60 * 24));
    const clientName = inv.client?.name || 'Unknown Client';

    if (diffDays <= 0) {
      aging.current.count += 1;
      aging.current.amount += bal;
      aging.current.clients.add(clientName);
    } else if (diffDays <= 30) {
      aging.days_1_30.count += 1;
      aging.days_1_30.amount += bal;
      aging.days_1_30.clients.add(clientName);
    } else if (diffDays <= 60) {
      aging.days_31_60.count += 1;
      aging.days_31_60.amount += bal;
      aging.days_31_60.clients.add(clientName);
    } else if (diffDays <= 90) {
      aging.days_61_90.count += 1;
      aging.days_61_90.amount += bal;
      aging.days_61_90.clients.add(clientName);
    } else {
      aging.days_90_plus.count += 1;
      aging.days_90_plus.amount += bal;
      aging.days_90_plus.clients.add(clientName);
    }
  });

  const agingReport = Object.entries(aging).map(([k, v]) => ({
    key: k,
    label: v.label,
    count: v.count,
    amount: parseFloat(v.amount.toFixed(2)),
    clients: Array.from(v.clients),
  }));

  // 3. Expenses Breakdown
  const expenses = await db.Expense.findAll({
    where: { deletedAt: null, ...dateWhere },
    include: [{ model: db.ExpenseCategory, as: 'category', attributes: ['id', 'name', 'colorCode'] }],
  });

  const expenseByCategory = {};
  let totalExpenseAmount = 0;

  expenses.forEach((e) => {
    const catName = e.category?.name || 'Uncategorized';
    const color = e.category?.colorCode || '#94a3b8';
    if (!expenseByCategory[catName]) {
      expenseByCategory[catName] = { name: catName, color, amount: 0, count: 0 };
    }
    const amt = parseFloat(e.totalAmount || e.amount || 0);
    expenseByCategory[catName].amount += amt;
    expenseByCategory[catName].count += 1;
    totalExpenseAmount += amt;
  });

  const categoryBreakdown = Object.values(expenseByCategory).map(c => ({
    ...c,
    amount: parseFloat(c.amount.toFixed(2)),
    percentage: totalExpenseAmount > 0 ? parseFloat(((c.amount / totalExpenseAmount) * 100).toFixed(1)) : 0,
  })).sort((a, b) => b.amount - a.amount);

  // 4. Bank Accounts & Liquidity
  const bankAccounts = await db.BankAccount.findAll({
    where: { deletedAt: null },
    attributes: ['id', 'accountName', 'bankName', 'accountNumber', 'accountType', 'currentBalance', 'isDefault', 'isActive'],
  });
  const totalCashLiquidity = bankAccounts.reduce((sum, b) => sum + parseFloat(b.currentBalance || 0), 0);

  // 5. Monthly Financial Performance Trend (past 6 months)
  const monthlyTrend = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const mStart = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
    const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

    const mInvoices = invoices.filter(inv => {
      const cDate = new Date(inv.created_at || inv.createdAt);
      return cDate >= mStart && cDate <= mEnd;
    });
    const mExpenses = expenses.filter(exp => {
      const cDate = new Date(exp.created_at || exp.createdAt);
      return cDate >= mStart && cDate <= mEnd;
    });

    const invoiced = mInvoices.reduce((s, x) => s + parseFloat(x.totalAmount || x.amount || 0), 0);
    const collected = mInvoices.reduce((s, x) => s + parseFloat(x.paidAmount || 0), 0);
    const expTotal = mExpenses.reduce((s, x) => s + parseFloat(x.totalAmount || x.amount || 0), 0);

    monthlyTrend.push({
      month: mStr,
      label: d.toLocaleString('default', { month: 'short', year: '2-digit' }),
      invoiced: parseFloat(invoiced.toFixed(2)),
      collected: parseFloat(collected.toFixed(2)),
      expenses: parseFloat(expTotal.toFixed(2)),
      netProfit: parseFloat((collected - expTotal).toFixed(2)),
    });
  }

  return {
    summary: {
      totalBilled: parseFloat(totalBilled.toFixed(2)),
      totalPaid: parseFloat(totalPaid.toFixed(2)),
      totalPending: parseFloat(totalPending.toFixed(2)),
      totalExpenses: parseFloat(totalExpenseAmount.toFixed(2)),
      netProfit: parseFloat((totalPaid - totalExpenseAmount).toFixed(2)),
      cashLiquidity: parseFloat(totalCashLiquidity.toFixed(2)),
    },
    byStatus,
    agingReport,
    categoryBreakdown,
    bankAccounts,
    monthlyTrend,
  };
}

// ── 3. Operations & Productivity Reports ──────────────────────────────────────

async function getOperationsReport(filters = {}) {
  const { start, end } = parseDateRange(filters);
  const dateWhere = buildDateFilter('created_at', start, end);

  // 1. Task Pipeline Status
  const allTasks = await db.Task.findAll({
    where: { deletedAt: null, ...dateWhere },
    include: [
      { model: db.User, as: 'manager', attributes: ['id', 'firstName', 'lastName'] },
      { model: db.Docket, as: 'docket', attributes: ['id', 'title'] },
      {
        model: db.TaskAssignment, as: 'assignments',
        include: [{ model: db.User, as: 'teamLead', attributes: ['id', 'firstName', 'lastName'] }],
      },
    ],
    order: [['created_at', 'DESC']],
  });

  const taskStatusCounts = {};
  const priorityCounts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  let overdueCount = 0;
  let totalEstHours = 0;
  let totalActHours = 0;

  const now = new Date();
  allTasks.forEach(t => {
    taskStatusCounts[t.status] = (taskStatusCounts[t.status] || 0) + 1;
    if (priorityCounts[t.priority] !== undefined) priorityCounts[t.priority] += 1;
    if (t.dueDate && new Date(t.dueDate) < now && !['COMPLETED', 'MANAGER_APPROVED'].includes(t.status)) {
      overdueCount++;
    }
    totalEstHours += parseFloat(t.estimatedHours || 0);
    totalActHours += parseFloat(t.actualHours || 0);
  });

  // 2. Team Productivity Leaderboard
  const users = await db.User.findAll({
    where: { deletedAt: null, isActive: true },
    include: [{ model: db.RoleDefinition, as: 'role', attributes: ['displayName', 'name', 'accessLevel'] }],
    attributes: ['id', 'firstName', 'lastName', 'email', 'department', 'jobTitle'],
  });

  const assignments = await db.TaskAssignment.findAll({
    include: [{ model: db.Task, as: 'task', attributes: ['id', 'status', 'estimatedHours', 'actualHours', 'dueDate'] }],
  });

  const ratings = await db.PerformanceRating.findAll({
    attributes: ['ratedUserId', 'overall'],
  }).catch(() => []);

  const userStats = users.map(u => {
    const userAssignments = assignments.filter(a => a.teamLeadId === u.id);
    const assignedTasks = userAssignments.map(a => a.task).filter(Boolean);
    const total = assignedTasks.length;
    const completed = assignedTasks.filter(t => ['COMPLETED', 'MANAGER_APPROVED'].includes(t.status)).length;
    const est = assignedTasks.reduce((s, t) => s + parseFloat(t.estimatedHours || 0), 0);
    const act = assignedTasks.reduce((s, t) => s + parseFloat(t.actualHours || 0), 0);

    const userRatings = ratings.filter(r => r.ratedUserId === u.id);
    const avgRating = userRatings.length > 0
      ? parseFloat((userRatings.reduce((s, r) => s + parseFloat(r.overall || 0), 0) / userRatings.length).toFixed(1))
      : null;

    const completionRate = total > 0 ? parseFloat(((completed / total) * 100).toFixed(1)) : 0;
    const efficiencyRatio = act > 0 && est > 0 ? parseFloat((est / act).toFixed(2)) : (total > 0 ? 1.0 : 0);

    return {
      userId: u.id,
      name: `${u.firstName} ${u.lastName}`.trim(),
      email: u.email,
      role: u.role?.displayName || u.role?.name || 'Staff',
      department: u.department || 'General',
      jobTitle: u.jobTitle || 'Team Member',
      totalTasks: total,
      completedTasks: completed,
      completionRate,
      estimatedHours: parseFloat(est.toFixed(1)),
      actualHours: parseFloat(act.toFixed(1)),
      efficiencyRatio,
      averageRating: avgRating,
    };
  }).sort((a, b) => b.completedTasks - a.completedTasks || b.completionRate - a.completionRate);

  // 3. Dockets / Projects Throughput
  const dockets = await db.Docket.findAll({
    where: { deletedAt: null },
    include: [
      { model: db.Client, as: 'client', attributes: ['id', 'name'] },
      { model: db.Task, as: 'tasks', attributes: ['id', 'status'] },
    ],
    order: [['created_at', 'DESC']],
    limit: 20,
  });

  const docketProgress = dockets.map(d => {
    const tasks = d.tasks || [];
    const done = tasks.filter(t => ['COMPLETED', 'MANAGER_APPROVED'].includes(t.status)).length;
    const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : (d.status === 'COMPLETED' ? 100 : 0);
    return {
      id: d.id,
      title: d.title,
      clientName: d.client?.name || 'N/A',
      docketType: d.docketType,
      status: d.status,
      startDate: d.startDate,
      endDate: d.endDate,
      totalTasks: tasks.length,
      completedTasks: done,
      progressPercentage: pct,
    };
  });

  return {
    overview: {
      totalTasks: allTasks.length,
      taskStatusCounts,
      priorityCounts,
      overdueCount,
      totalEstimatedHours: parseFloat(totalEstHours.toFixed(1)),
      totalActualHours: parseFloat(totalActHours.toFixed(1)),
    },
    productivityLeaderboard: userStats,
    docketProgress,
  };
}

// ── 4. HR, Attendance & Payroll Reports ────────────────────────────────────────

async function getHrReport(filters = {}) {
  const { start, end } = parseDateRange(filters);
  const dateWhere = buildDateFilter('created_at', start, end);

  // 1. Headcount & Roles
  const employees = await db.User.findAll({
    where: { deletedAt: null },
    include: [{ model: db.RoleDefinition, as: 'role', attributes: ['id', 'name', 'displayName', 'accessLevel'] }],
    attributes: ['id', 'firstName', 'lastName', 'email', 'isActive', 'department', 'jobTitle', 'created_at'],
  });

  const departmentCounts = {};
  const roleCounts = {};
  let activeCount = 0;
  let inactiveCount = 0;

  employees.forEach(e => {
    if (e.isActive) activeCount++; else inactiveCount++;
    const dept = e.department || 'General';
    departmentCounts[dept] = (departmentCounts[dept] || 0) + 1;
    const rName = e.role?.displayName || e.role?.name || 'Employee';
    roleCounts[rName] = (roleCounts[rName] || 0) + 1;
  });

  // 2. Attendance Stats
  const attWhere = {};
  if (start && end) {
    attWhere.date = { [Op.between]: [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)] };
  } else if (start) {
    attWhere.date = { [Op.gte]: start.toISOString().slice(0, 10) };
  } else if (end) {
    attWhere.date = { [Op.lte]: end.toISOString().slice(0, 10) };
  }

  const attendances = await db.Attendance.findAll({
    where: attWhere,
    attributes: ['id', 'userId', 'date', 'punchIn', 'punchOut', 'workingHours', 'overtimeHours', 'status'],
  });

  let totalPunches = attendances.length;
  let totalWorkingHours = 0;
  let totalOvertimeHours = 0;
  const statusBreakdown = { PRESENT: 0, LATE: 0, HALF_DAY: 0, ABSENT: 0 };

  attendances.forEach(a => {
    totalWorkingHours += parseFloat(a.workingHours || 0);
    totalOvertimeHours += parseFloat(a.overtimeHours || 0);
    if (statusBreakdown[a.status] !== undefined) {
      statusBreakdown[a.status] += 1;
    }
  });

  // 3. Leaves Analytics
  const leaveWhere = buildDateFilter('created_at', start, end);
  const leaves = await db.LeaveRequest.findAll({
    where: leaveWhere,
    attributes: ['id', 'leaveType', 'totalDays', 'status'],
  }).catch(() => []);

  const leavesByType = {};
  const leaveStatusCounts = { PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0 };
  let totalLeaveDays = 0;

  leaves.forEach(l => {
    leavesByType[l.leaveType] = (leavesByType[l.leaveType] || 0) + parseFloat(l.totalDays || 1);
    if (leaveStatusCounts[l.status] !== undefined) leaveStatusCounts[l.status] += 1;
    if (l.status === 'APPROVED') totalLeaveDays += parseFloat(l.totalDays || 1);
  });

  // 4. Payroll Analytics
  const payrolls = await db.EmployeePayroll.findAll({
    where: { deletedAt: null },
    include: [{ model: db.User, as: 'employee', attributes: ['id', 'firstName', 'lastName', 'email', 'department'] }],
    order: [['created_at', 'DESC']],
    limit: 100,
  });

  let totalPayrollSpend = 0;
  let totalIncentives = 0;
  let totalDeductions = 0;
  const payrollByMonth = {};

  payrolls.forEach(p => {
    const net = parseFloat(p.netSalary || 0);
    const inc = parseFloat(p.incentiveAmount || 0);
    const ded = parseFloat(p.deductionAmount || 0);
    totalPayrollSpend += net;
    totalIncentives += inc;
    totalDeductions += ded;

    const m = p.payrollMonth || 'Recent';
    if (!payrollByMonth[m]) payrollByMonth[m] = { month: m, total: 0, count: 0 };
    payrollByMonth[m].total += net;
    payrollByMonth[m].count += 1;
  });

  const payrollMonthlyTrend = Object.values(payrollByMonth).map(p => ({
    ...p,
    total: parseFloat(p.total.toFixed(2)),
  })).sort((a, b) => a.month.localeCompare(b.month));

  return {
    headcount: {
      totalEmployees: employees.length,
      activeCount,
      inactiveCount,
      departmentCounts,
      roleCounts,
    },
    attendance: {
      totalPunches,
      totalWorkingHours: parseFloat(totalWorkingHours.toFixed(1)),
      totalOvertimeHours: parseFloat(totalOvertimeHours.toFixed(1)),
      avgHoursPerPunch: totalPunches > 0 ? parseFloat((totalWorkingHours / totalPunches).toFixed(1)) : 0,
      statusBreakdown,
    },
    leaves: {
      totalRequests: leaves.length,
      leaveStatusCounts,
      leavesByType,
      totalLeaveDaysApproved: totalLeaveDays,
    },
    payroll: {
      totalPayrollSpend: parseFloat(totalPayrollSpend.toFixed(2)),
      totalIncentives: parseFloat(totalIncentives.toFixed(2)),
      totalDeductions: parseFloat(totalDeductions.toFixed(2)),
      payrollMonthlyTrend,
    },
  };
}

// ── 5. CRM & Pipeline Reports ─────────────────────────────────────────────────

async function getCrmReport(filters = {}) {
  const { start, end } = parseDateRange(filters);

  // 1. Clients Overview
  const clients = await db.Client.findAll({
    where: { deletedAt: null },
    include: [
      { model: db.ClientPackage, as: 'packages', attributes: ['id', 'name', 'basePrice', 'packageType', 'status'] },
      { model: db.ClientPayment, as: 'payments', attributes: ['id', 'paymentType', 'status', 'totalAmount', 'amount', 'paidAmount'] },
    ],
  });

  let activeClients = 0;
  let inactiveClients = 0;
  const clientRevenueList = [];

  clients.forEach(c => {
    if (c.relationshipStatus !== 'CHURNED') activeClients++; else inactiveClients++;

    const payments = c.payments || [];
    const totalBilled = payments
      .filter(p => p.paymentType === 'INVOICE')
      .reduce((s, p) => s + parseFloat(p.totalAmount || p.amount || 0), 0);
    const totalPaid = payments
      .reduce((s, p) => s + parseFloat(p.paidAmount || (p.status === 'PAID' ? (p.totalAmount || p.amount || 0) : 0)), 0);

    const activePackages = (c.packages || []).filter(p => p.status === 'ACTIVE');
    const retainerValue = activePackages.reduce((s, p) => s + parseFloat(p.basePrice || 0), 0);

    clientRevenueList.push({
      clientId: c.id,
      clientName: c.name,
      clientCode: c.clientCode,
      status: c.relationshipStatus || 'ACTIVE',
      totalBilled: parseFloat(totalBilled.toFixed(2)),
      totalPaid: parseFloat(totalPaid.toFixed(2)),
      activePackagesCount: activePackages.length,
      monthlyRetainerValue: parseFloat(retainerValue.toFixed(2)),
    });
  });

  // Sort clients by revenue
  clientRevenueList.sort((a, b) => b.totalPaid - a.totalPaid);

  const totalCrmRevenue = clientRevenueList.reduce((s, c) => s + c.totalPaid, 0);
  const clientConcentration = clientRevenueList.map(c => ({
    ...c,
    revenueSharePercentage: totalCrmRevenue > 0 ? parseFloat(((c.totalPaid / totalCrmRevenue) * 100).toFixed(1)) : 0,
  }));

  // 2. Communications Log Summary
  const commsWhere = buildDateFilter('created_at', start, end);
  const commLogs = await db.ClientCommunicationLog.findAll({
    where: { deletedAt: null, ...commsWhere },
    attributes: ['channel', 'direction', 'created_at'],
  }).catch(() => []);

  const commsByChannel = {};
  commLogs.forEach(l => {
    const ch = l.channel || 'OTHER';
    commsByChannel[ch] = (commsByChannel[ch] || 0) + 1;
  });

  return {
    overview: {
      totalClients: clients.length,
      activeClients,
      inactiveClients,
      totalRevenueCollected: parseFloat(totalCrmRevenue.toFixed(2)),
      totalMonthlyRetainers: parseFloat(clientRevenueList.reduce((s, c) => s + c.monthlyRetainerValue, 0).toFixed(2)),
    },
    clientConcentration: clientConcentration.slice(0, 20),
    communications: {
      totalCommunications: commLogs.length,
      byChannel: commsByChannel,
    },
  };
}

// ── 6. Daily Activity Summary ─────────────────────────────────────────────────

async function getDailyActivitySummary({ date } = {}) {
  const targetDate = date ? new Date(date) : new Date();
  const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);
  const targetDateStr = targetDate.toISOString().slice(0, 10);

  const dateFilter = { [Op.between]: [startOfDay, endOfDay] };

  // Fetch parallel data for the day
  const [attendances, tasksCreated, tasksCompleted, payments, expenses, leaves, auditLogs] = await Promise.all([
    db.Attendance.findAll({
      where: { date: targetDateStr },
      include: [{ model: db.User, as: 'employee', attributes: ['id', 'firstName', 'lastName', 'email', 'department'] }],
    }),
    db.Task.findAll({
      where: { created_at: dateFilter, deletedAt: null },
      attributes: ['id', 'title', 'priority', 'status', 'created_at'],
      include: [{ model: db.User, as: 'createdBy', attributes: ['firstName', 'lastName'] }],
    }),
    db.Task.findAll({
      where: { completedAt: dateFilter, deletedAt: null },
      attributes: ['id', 'title', 'priority', 'status', 'completedAt'],
      include: [{ model: db.User, as: 'manager', attributes: ['firstName', 'lastName'] }],
    }),
    db.ClientPayment.findAll({
      where: { created_at: dateFilter, deletedAt: null },
      attributes: ['id', 'invoiceNumber', 'paymentType', 'status', 'totalAmount', 'paidAmount', 'amount'],
      include: [{ model: db.Client, as: 'client', attributes: ['id', 'name'] }],
    }),
    db.Expense.findAll({
      where: { created_at: dateFilter, deletedAt: null },
      attributes: ['id', 'title', 'amount', 'totalAmount', 'status'],
      include: [{ model: db.ExpenseCategory, as: 'category', attributes: ['name'] }],
    }),
    db.LeaveRequest.findAll({
      where: { created_at: dateFilter },
      attributes: ['id', 'leaveType', 'totalDays', 'status'],
      include: [{ model: db.User, as: 'requester', attributes: ['firstName', 'lastName'] }],
    }).catch(() => []),
    db.AuditLog.findAll({
      where: { createdAt: dateFilter },
      order: [['createdAt', 'DESC']],
      limit: 25,
      attributes: ['id', 'action', 'category', 'description', 'performedByName', 'createdAt', 'status'],
    }),
  ]);

  const moneyIn = payments
    .reduce((s, p) => s + parseFloat(p.paidAmount || (p.status === 'PAID' ? (p.totalAmount || p.amount || 0) : 0)), 0);
  const moneyOut = expenses
    .filter(e => ['APPROVED', 'PAID'].includes(e.status))
    .reduce((s, e) => s + parseFloat(e.totalAmount || e.amount || 0), 0);

  return {
    date: targetDate.toISOString().slice(0, 10),
    summary: {
      punchesCount: attendances.length,
      tasksCreatedCount: tasksCreated.length,
      tasksCompletedCount: tasksCompleted.length,
      moneyCollected: parseFloat(moneyIn.toFixed(2)),
      moneySpent: parseFloat(moneyOut.toFixed(2)),
      leaveRequestsCount: leaves.length,
      auditEventsCount: auditLogs.length,
    },
    attendances: attendances.map(a => ({
      id: a.id,
      employeeName: a.employee ? `${a.employee.firstName} ${a.employee.lastName}`.trim() : 'Staff',
      department: a.employee?.department || 'General',
      punchInTime: a.punchIn,
      punchOutTime: a.punchOut,
      workingHours: a.workingHours,
      status: a.status,
    })),
    tasksCreated: tasksCreated.map(t => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      createdByName: t.createdBy ? `${t.createdBy.firstName} ${t.createdBy.lastName}`.trim() : 'Admin',
    })),
    tasksCompleted: tasksCompleted.map(t => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      managerName: t.manager ? `${t.manager.firstName} ${t.manager.lastName}`.trim() : 'Manager',
    })),
    payments: payments.map(p => ({
      id: p.id,
      clientName: p.client?.name || 'Client',
      invoiceNumber: p.invoiceNumber,
      paymentType: p.paymentType,
      amount: p.totalAmount || p.amount,
      paidAmount: p.paidAmount,
      status: p.status,
    })),
    expenses: expenses.map(e => ({
      id: e.id,
      title: e.title,
      categoryName: e.category?.name || 'General',
      amount: e.totalAmount || e.amount,
      status: e.status,
    })),
    leaves: leaves.map(l => ({
      id: l.id,
      requesterName: l.requester ? `${l.requester.firstName} ${l.requester.lastName}`.trim() : 'Staff',
      leaveType: l.leaveType,
      totalDays: l.totalDays,
      status: l.status,
    })),
    auditLogs,
  };
}

// ── 7. Timeline & Project Progress Reports ────────────────────────────────────

async function getTimelineReport(filters = {}) {
  const dockets = await db.Docket.findAll({
    where: { deletedAt: null },
    include: [
      { model: db.Client, as: 'client', attributes: ['id', 'name', 'clientCode'] },
      {
        model: db.Task, as: 'tasks',
        where: { deletedAt: null },
        required: false,
        attributes: ['id', 'title', 'status', 'priority', 'startDate', 'dueDate', 'completionPercent'],
      },
    ],
    order: [['startDate', 'ASC'], ['created_at', 'DESC']],
  });

  const now = new Date();
  const timeline = dockets.map(d => {
    const start = d.startDate ? new Date(d.startDate) : null;
    const end = d.endDate ? new Date(d.endDate) : null;
    const isOverdue = end && end < now && d.status !== 'COMPLETED';
    const daysRemaining = end ? Math.ceil((end - now) / (1000 * 60 * 60 * 24)) : null;

    const tasks = d.tasks || [];
    const doneTasks = tasks.filter(t => ['COMPLETED', 'MANAGER_APPROVED'].includes(t.status)).length;
    const progress = tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : (d.status === 'COMPLETED' ? 100 : 0);

    return {
      id: d.id,
      title: d.title,
      clientName: d.client?.name || 'Internal',
      docketType: d.docketType,
      status: d.status,
      startDate: d.startDate,
      endDate: d.endDate,
      isOverdue,
      daysRemaining,
      progressPercentage: progress,
      totalTasks: tasks.length,
      completedTasks: doneTasks,
      tasks: tasks.map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        startDate: t.startDate,
        dueDate: t.dueDate,
        isOverdue: t.dueDate && new Date(t.dueDate) < now && !['COMPLETED', 'MANAGER_APPROVED'].includes(t.status),
        completionPercent: t.completionPercent || 0,
      })),
    };
  });

  // Date change requests summary
  const dateChanges = await db.DateChangeRequest.findAll({
    order: [['created_at', 'DESC']],
    limit: 15,
  }).catch(() => []);

  return {
    timeline,
    dateChangesSummary: {
      totalRequests: dateChanges.length,
      approvedCount: dateChanges.filter(d => d.status === 'APPROVED').length,
      pendingCount: dateChanges.filter(d => d.status === 'PENDING').length,
      rejectedCount: dateChanges.filter(d => d.status === 'REJECTED').length,
      recentRequests: dateChanges,
    },
  };
}

module.exports = {
  getExecutiveKpis,
  getFinanceReport,
  getOperationsReport,
  getHrReport,
  getCrmReport,
  getDailyActivitySummary,
  getTimelineReport,
};
