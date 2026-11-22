'use strict';

const { Op } = require('sequelize');
const { db } = require('../database/client');
const { HTTP_STATUS } = require('../constants');

const EMPLOYEE_INCLUDE = {
  model: db.User, as: 'employee',
  attributes: ['id', 'firstName', 'lastName', 'email', 'department', 'jobTitle'],
  include: [{ model: db.RoleDefinition, as: 'role', attributes: ['name', 'displayName', 'accessLevel'] }],
};
const ALLOCATOR_INCLUDE = {
  model: db.User, as: 'allocatedBy',
  attributes: ['id', 'firstName', 'lastName'],
};

/**
 * Upsert a leave allocation for an employee for a given year.
 * Only levels 1–3 can allocate, and only to employees with a higher level number.
 */
async function upsertAllocation({ requestingUser, userId, year, annualDays, sickDays, unpaidDays, emergencyDays, maternityDays, paternityDays, note }) {
  // Only level 1/2/3 can allocate
  if (requestingUser.roleLevel > 3) {
    const err = new Error('You are not authorized to allocate leaves'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  // Fetch the target employee
  const employee = await db.User.findByPk(userId, {
    include: [{ model: db.RoleDefinition, as: 'role', attributes: ['accessLevel'] }],
  });
  if (!employee || employee.deletedAt) {
    const err = new Error('Employee not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
  }
  if (employee.role.accessLevel <= requestingUser.roleLevel) {
    const err = new Error('You can only allocate leaves to employees with lower authority than you');
    err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  const [allocation] = await db.LeaveAllocation.upsert({
    userId,
    year: parseInt(year),
    annualDays:    annualDays    ?? 0,
    sickDays:      sickDays      ?? 0,
    unpaidDays:    unpaidDays    ?? 0,
    emergencyDays: emergencyDays ?? 0,
    maternityDays: maternityDays ?? 0,
    paternityDays: paternityDays ?? 0,
    note: note || null,
    allocatedById: requestingUser.id,
  }, { conflictFields: ['user_id', 'year'] });

  return db.LeaveAllocation.findByPk(allocation.id, { include: [EMPLOYEE_INCLUDE, ALLOCATOR_INCLUDE] });
}

/**
 * Get all allocations visible to the requesting user, optionally filtered by year.
 */
async function getAllocations({ requestingUser, year, userId, page = 1, limit = 20 }) {
  page  = parseInt(page);
  limit = parseInt(limit);

  const where = {};
  if (year)   where.year   = parseInt(year);
  if (userId) where.userId = userId;

  // Build employee filter — can only see allocations for employees below their level
  const employeeWhere = { deletedAt: null };

  // Level 4+ cannot manage allocations at all
  if (requestingUser.roleLevel > 3) {
    // Employees can only view their own allocation
    where.userId = requestingUser.id;
  }

  const { count: total, rows: allocations } = await db.LeaveAllocation.findAndCountAll({
    where,
    include: [
      {
        ...EMPLOYEE_INCLUDE,
        where: requestingUser.roleLevel <= 3 ? undefined : { id: requestingUser.id },
      },
      ALLOCATOR_INCLUDE,
    ],
    order: [['year', 'DESC'], ['created_at', 'DESC']],
    offset: (page - 1) * limit,
    limit,
    distinct: true,
  });

  return { allocations, total };
}

/**
 * Get a single employee's allocation for a given year, along with consumed leave days.
 */
async function getEmployeeBalance({ requestingUser, userId, year }) {
  const targetId = userId || requestingUser.id;
  const targetYear = parseInt(year) || new Date().getFullYear();

  // Permission: level 4+ can only view their own balance
  if (requestingUser.roleLevel > 3 && targetId !== requestingUser.id) {
    const err = new Error('You can only view your own leave balance'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  const allocation = await db.LeaveAllocation.findOne({
    where: { userId: targetId, year: targetYear },
    include: [EMPLOYEE_INCLUDE, ALLOCATOR_INCLUDE],
  });

  // Consumed: sum up approved leaves for this user in this year
  const yearStart = `${targetYear}-01-01`;
  const yearEnd   = `${targetYear}-12-31`;

  const approvedLeaves = await db.LeaveRequest.findAll({
    where: {
      requesterId: targetId,
      status: 'APPROVED',
      startDate: { [Op.gte]: yearStart },
      endDate:   { [Op.lte]: yearEnd },
    },
  });

  const consumed = {
    ANNUAL:    0, SICK: 0, UNPAID: 0,
    EMERGENCY: 0, MATERNITY: 0, PATERNITY: 0,
  };
  approvedLeaves.forEach(l => {
    if (consumed[l.leaveType] !== undefined) consumed[l.leaveType] += l.totalDays;
  });

  return { allocation, consumed, year: targetYear };
}

/**
 * Delete an allocation (Level 1 only).
 */
async function deleteAllocation({ requestingUser, id }) {
  if (requestingUser.roleLevel > 1) {
    const err = new Error('Only Level 1 (Boss) can delete allocations'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }
  const allocation = await db.LeaveAllocation.findByPk(id);
  if (!allocation) {
    const err = new Error('Allocation not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
  }
  await allocation.destroy();
}

module.exports = { upsertAllocation, getAllocations, getEmployeeBalance, deleteAllocation };
