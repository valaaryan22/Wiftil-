'use strict';

const { Op }            = require('sequelize');
const { db }            = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const { HTTP_STATUS, AUDIT_CATEGORY, AUDIT_ACTION } = require('../constants');
const attendanceSvc     = require('./attendance.service');

const USER_ATTRS = ['id', 'email', 'firstName', 'lastName', 'department', 'jobTitle', 'profilePicture'];

// ── Helpers ────────────────────────────────────────────────────────────────────

function calcNet(base, incentive = 0, deduction = 0) {
  return parseFloat((parseFloat(base) + parseFloat(incentive) - parseFloat(deduction)).toFixed(2));
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ── Salary Config CRUD ─────────────────────────────────────────────────────────

async function getSalaryConfigForUser(userId) {
  const config = await db.EmployeeSalary.findOne({
    where: { userId, isActive: true, deletedAt: null },
    include: [
      { model: db.User, as: 'employee', attributes: USER_ATTRS },
      { model: db.User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'] },
    ],
  });
  return config;
}

async function getAllSalaryConfigs({ page = 1, limit = 20, search }) {
  page  = parseInt(page);
  limit = parseInt(limit);

  const userWhere = { deletedAt: null };
  if (search) {
    userWhere[Op.or] = [
      { firstName: { [Op.like]: `%${search}%` } },
      { lastName:  { [Op.like]: `%${search}%` } },
      { email:     { [Op.like]: `%${search}%` } },
    ];
  }

  const { rows, count } = await db.EmployeeSalary.findAndCountAll({
    where: { isActive: true, deletedAt: null },
    include: [
      { model: db.User, as: 'employee', attributes: USER_ATTRS, where: userWhere },
    ],
    limit,
    offset: (page - 1) * limit,
    order: [['created_at', 'DESC']],
  });

  return { configs: rows, total: count };
}

async function upsertSalaryConfig({ requestingUser, userId, data, req }) {
  // Only ADMIN+ (level ≤ 2) can manage salary configs
  if (requestingUser.roleLevel > 2) {
    const err = new Error('Only Admin level or above (level ≤ 2) can manage salary configs');
    err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  const employee = await db.User.findOne({ where: { id: userId, deletedAt: null } });
  if (!employee) {
    const err = new Error('Employee not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
  }

  const { baseSalary, salaryDay, currency = 'INR', effectiveFrom, notes } = data;

  if (!baseSalary || !salaryDay) {
    const err = new Error('baseSalary and salaryDay are required');
    err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  // Deactivate any existing active config
  const existing = await db.EmployeeSalary.findOne({ where: { userId, isActive: true, deletedAt: null } });
  const isNew = !existing;

  if (existing) {
    await existing.update({ isActive: false });
  }

  const config = await db.EmployeeSalary.create({
    userId,
    baseSalary: parseFloat(baseSalary),
    salaryDay:  parseInt(salaryDay),
    currency,
    isActive: true,
    effectiveFrom: effectiveFrom || new Date(),
    notes,
    createdById: requestingUser.id,
  });

  await writeAuditLog({
    performedBy: requestingUser,
    action: isNew ? AUDIT_ACTION.SALARY_CONFIG_CREATED : AUDIT_ACTION.SALARY_CONFIG_UPDATED,
    category: AUDIT_CATEGORY.SALARY,
    entity: 'EmployeeSalary', entityId: config.id,
    entityName: `${employee.firstName} ${employee.lastName}`,
    description: `${isNew ? 'Set' : 'Updated'} salary config for ${employee.firstName} ${employee.lastName}: ₹${baseSalary}, day ${salaryDay}`,
    newValues: { baseSalary, salaryDay, currency },
    req,
  });

  return config;
}

// ── Payroll CRUD ───────────────────────────────────────────────────────────────

async function getPayrollList({ requestingUser, page = 1, limit = 20, month, employeeId, status }) {
  page  = parseInt(page);
  limit = parseInt(limit);

  const where = { deletedAt: null };
  if (month)      where.payrollMonth = month;
  if (status)     where.status = status;
  if (employeeId) where.employeeId = employeeId;

  const { rows, count } = await db.EmployeePayroll.findAndCountAll({
    where,
    include: [
      { model: db.User, as: 'employee', attributes: USER_ATTRS },
      { model: db.User, as: 'paidBy',   attributes: ['id', 'firstName', 'lastName'] },
    ],
    limit,
    offset: (page - 1) * limit,
    order: [['salary_date', 'DESC'], ['created_at', 'DESC']],
  });

  return { payrolls: rows, total: count };
}

async function getPayrollById(id) {
  return db.EmployeePayroll.findOne({
    where: { id, deletedAt: null },
    include: [
      { model: db.User, as: 'employee', attributes: USER_ATTRS },
      { model: db.EmployeeSalary, as: 'salaryConfig' },
      { model: db.User, as: 'paidBy', attributes: ['id', 'firstName', 'lastName'] },
    ],
  });
}

async function approvePayroll({ requestingUser, payrollId, req }) {
  if (requestingUser.roleLevel > 2) {
    const err = new Error('Only Admin level or above can approve payroll');
    err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  const payroll = await db.EmployeePayroll.findOne({ where: { id: payrollId, deletedAt: null } });
  if (!payroll) {
    const err = new Error('Payroll not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
  }
  if (payroll.status !== 'DRAFT') {
    const err = new Error(`Cannot approve a payroll with status: ${payroll.status}`);
    err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  await payroll.update({ status: 'APPROVED' });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.PAYROLL_APPROVED,
    category: AUDIT_CATEGORY.SALARY,
    entity: 'EmployeePayroll', entityId: payrollId,
    description: `Approved payroll #${payrollId} for month ${payroll.payrollMonth}`,
    req,
  });

  return payroll;
}

async function markPaid({ requestingUser, payrollId, data, req }) {
  if (requestingUser.roleLevel > 2) {
    const err = new Error('Only Admin level or above can mark payroll as paid');
    err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  const payroll = await db.EmployeePayroll.findOne({ where: { id: payrollId, deletedAt: null } });
  if (!payroll) {
    const err = new Error('Payroll not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
  }
  if (!['DRAFT', 'APPROVED'].includes(payroll.status)) {
    const err = new Error(`Cannot mark payroll as paid with status: ${payroll.status}`);
    err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  await payroll.update({
    status: 'PAID',
    paidAt: new Date(),
    paidById: requestingUser.id,
    paymentMode:     data.paymentMode     || null,
    referenceNumber: data.referenceNumber || null,
    notes: data.notes || payroll.notes,
  });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.PAYROLL_PAID,
    category: AUDIT_CATEGORY.SALARY,
    entity: 'EmployeePayroll', entityId: payrollId,
    description: `Marked payroll #${payrollId} as PAID for ${payroll.payrollMonth}`,
    newValues: { paymentMode: data.paymentMode, referenceNumber: data.referenceNumber },
    req,
  });

  return payroll;
}

async function addIncentive({ requestingUser, payrollId, data, req }) {
  if (requestingUser.roleLevel > 2) {
    const err = new Error('Only Admin level or above can add incentives/deductions');
    err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  const payroll = await db.EmployeePayroll.findOne({ where: { id: payrollId, deletedAt: null } });
  if (!payroll) {
    const err = new Error('Payroll not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
  }
  if (payroll.status === 'PAID' || payroll.status === 'CANCELLED') {
    const err = new Error(`Cannot modify a payroll with status: ${payroll.status}`);
    err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  const { type, amount, notes } = data;
  if (!type || !amount) {
    const err = new Error('type (INCENTIVE|DEDUCTION) and amount are required');
    err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  const newIncentive = type === 'INCENTIVE'
    ? parseFloat(payroll.incentiveAmount) + parseFloat(amount)
    : payroll.incentiveAmount;
  const newDeduction = type === 'DEDUCTION'
    ? parseFloat(payroll.deductionAmount) + parseFloat(amount)
    : payroll.deductionAmount;

  const newNet = calcNet(payroll.baseSalary, newIncentive, newDeduction);

  await payroll.update({
    incentiveAmount: newIncentive,
    deductionAmount: newDeduction,
    netSalary: newNet,
    notes: notes || payroll.notes,
  });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.PAYROLL_INCENTIVE_ADDED,
    category: AUDIT_CATEGORY.SALARY,
    entity: 'EmployeePayroll', entityId: payrollId,
    description: `Added ${type} of ₹${amount} to payroll #${payrollId}`,
    newValues: { type, amount, newNet },
    req,
  });

  return payroll;
}

async function cancelPayroll({ requestingUser, payrollId, req }) {
  if (requestingUser.roleLevel > 2) {
    const err = new Error('Only Admin level or above can cancel payroll');
    err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  const payroll = await db.EmployeePayroll.findOne({ where: { id: payrollId, deletedAt: null } });
  if (!payroll) {
    const err = new Error('Payroll not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
  }
  if (payroll.status === 'PAID') {
    const err = new Error('Cannot cancel a PAID payroll');
    err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  await payroll.update({ status: 'CANCELLED' });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.PAYROLL_CANCELLED,
    category: AUDIT_CATEGORY.SALARY,
    entity: 'EmployeePayroll', entityId: payrollId,
    description: `Cancelled payroll #${payrollId} for month ${payroll.payrollMonth}`,
    req,
  });

  return payroll;
}

// ── Manual Payroll Creation ────────────────────────────────────────────────────

async function createPayrollManually({ requestingUser, data, req }) {
  // Only ADMIN+ (level ≤ 2) can manually create payroll
  if (requestingUser.roleLevel > 2) {
    const err = new Error('Only Admin level or above can manually create payroll entries');
    err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  const {
    employeeId,
    month,
    baseSalary: overrideBaseSalary,
    incentiveAmount = 0,
    deductionAmount = 0,
    currency,
    notes,
    salaryDate,
    autoAttendance = false, // NEW: auto-calculate from attendance records
  } = data;

  if (!employeeId || !month) {
    const err = new Error('employeeId and month (YYYY-MM) are required');
    err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  // Validate month format YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(month)) {
    const err = new Error('month must be in YYYY-MM format (e.g. 2026-08)');
    err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  // Ensure employee exists
  const employee = await db.User.findOne({ where: { id: employeeId, deletedAt: null }, attributes: USER_ATTRS });
  if (!employee) {
    const err = new Error('Employee not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
  }

  // Duplicate check — one payroll per employee per month
  const existing = await db.EmployeePayroll.findOne({
    where: { employeeId, payrollMonth: month, deletedAt: null },
  });
  if (existing) {
    const err = new Error(
      `A payroll entry already exists for ${employee.firstName} ${employee.lastName} for ${month} (status: ${existing.status})`
    );
    err.statusCode = HTTP_STATUS.CONFLICT; throw err;
  }

  // Try to load the employee's salary config for defaults
  const salaryConfig = await db.EmployeeSalary.findOne({
    where: { userId: employeeId, isActive: true, deletedAt: null },
  });

  const resolvedBaseSalary = overrideBaseSalary != null
    ? parseFloat(overrideBaseSalary)
    : (salaryConfig ? parseFloat(salaryConfig.baseSalary) : 0);

  const resolvedCurrency = currency || (salaryConfig ? salaryConfig.currency : 'INR');

  let inc = parseFloat(incentiveAmount) || 0;
  let ded = parseFloat(deductionAmount) || 0;
  let attendanceNotes = '';

  // ── Auto-calculate from attendance records ──
  if (autoAttendance && resolvedBaseSalary > 0) {
    try {
      const workingDays  = attendanceSvc.workingDaysInMonth(month);
      const absentDays   = await attendanceSvc.countAbsentDaysForMonth(employeeId, month);
      const overtimeHrs  = await attendanceSvc.totalOvertimeHoursForMonth(employeeId, month);

      const dailyRate    = resolvedBaseSalary / workingDays;
      const leaveDed     = parseFloat((dailyRate * absentDays).toFixed(2));
      // Overtime rate: 1.5x hourly rate (base salary / (workingDays * 8 hours))
      const hourlyRate   = resolvedBaseSalary / (workingDays * 8);
      const overtimeInc  = parseFloat((hourlyRate * 1.5 * overtimeHrs).toFixed(2));

      ded += leaveDed;
      inc += overtimeInc;
      attendanceNotes = `Auto: ${absentDays} absent days → ₹${leaveDed} deducted; ${overtimeHrs}h overtime → ₹${overtimeInc} incentive.`;
    } catch (e) {
      // Non-fatal: fall back to manual values if attendance data is unavailable
      console.warn('[salary.service] Attendance auto-calc failed:', e.message);
    }
  }

  const net = calcNet(resolvedBaseSalary, inc, ded);

  const payroll = await db.EmployeePayroll.create({
    employeeId,
    salaryConfigId: salaryConfig ? salaryConfig.id : null,
    baseSalary:     resolvedBaseSalary,
    incentiveAmount: inc,
    deductionAmount: ded,
    netSalary:      net,
    payrollMonth:   month,
    salaryDate:     salaryDate ? new Date(salaryDate) : null,
    status:         'DRAFT',
    currency:       resolvedCurrency,
    notes:          [notes, attendanceNotes].filter(Boolean).join(' | ') || null,
    createdById:    requestingUser.id,
  });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.PAYROLL_CREATED_MANUAL,
    category: AUDIT_CATEGORY.SALARY,
    entity: 'EmployeePayroll', entityId: payroll.id,
    entityName: `${employee.firstName} ${employee.lastName}`,
    description: `Manually created DRAFT payroll for ${employee.firstName} ${employee.lastName} — month: ${month}, net: ₹${net}`,
    newValues: { baseSalary: resolvedBaseSalary, incentiveAmount: inc, deductionAmount: ded, net, month, autoAttendance },
    req,
  });

  // Re-fetch with associations for response
  const result = await db.EmployeePayroll.findOne({
    where: { id: payroll.id },
    include: [
      { model: db.User, as: 'employee', attributes: USER_ATTRS },
    ],
  });

  return result;
}

// ── Cron: Auto-generate payroll entries ────────────────────────────────────────

async function generatePayrollForDay(dayOfMonth, systemUserId) {
  const month = currentMonth();
  const generated = [];
  const skipped   = [];

  // Find all active salary configs with salaryDay matching today
  const configs = await db.EmployeeSalary.findAll({
    where: { isActive: true, deletedAt: null, salaryDay: dayOfMonth },
    include: [{ model: db.User, as: 'employee', attributes: USER_ATTRS }],
  });

  for (const cfg of configs) {
    // Skip if a payroll entry already exists for this employee/month
    const exists = await db.EmployeePayroll.findOne({
      where: { employeeId: cfg.userId, payrollMonth: month, deletedAt: null },
    });

    if (exists) {
      skipped.push({ employeeId: cfg.userId, reason: 'Already generated for this month' });
      continue;
    }

    const net = calcNet(cfg.baseSalary, 0, 0);

    const payroll = await db.EmployeePayroll.create({
      employeeId:     cfg.userId,
      salaryConfigId: cfg.id,
      baseSalary:     parseFloat(cfg.baseSalary),
      incentiveAmount: 0,
      deductionAmount: 0,
      netSalary:      net,
      payrollMonth:   month,
      salaryDate:     new Date(),
      status:         'DRAFT',
      currency:       cfg.currency,
      createdById:    systemUserId,
    });

    generated.push(payroll.id);
  }

  return { generated, skipped };
}

module.exports = {
  getSalaryConfigForUser,
  getAllSalaryConfigs,
  upsertSalaryConfig,
  getPayrollList,
  getPayrollById,
  approvePayroll,
  markPaid,
  addIncentive,
  cancelPayroll,
  createPayrollManually,
  generatePayrollForDay,
};
