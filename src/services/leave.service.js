'use strict';

const { Op }            = require('sequelize');
const { db }            = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const { HTTP_STATUS, AUDIT_CATEGORY, AUDIT_ACTION } = require('../constants');

function calcWorkingDays(startDate, endDate) {
  let count = 0;
  const cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

const REQUESTER_INCLUDE = {
  model: db.User, as: 'requester',
  attributes: ['id', 'firstName', 'lastName', 'email', 'department'],
  include: [{ model: db.RoleDefinition, as: 'role', attributes: ['name', 'displayName', 'accessLevel'] }],
};
const REVIEWER_INCLUDE = {
  model: db.User, as: 'reviewer',
  attributes: ['id', 'firstName', 'lastName'],
};

async function createLeaveRequest({ requestingUser, leaveType, startDate, endDate, reason, req }) {
  const requesterId = requestingUser.id;

  const overlap = await db.LeaveRequest.findOne({
    where: {
      requesterId,
      status: { [Op.in]: ['PENDING', 'APPROVED'] },
      startDate: { [Op.lte]: endDate },
      endDate:   { [Op.gte]: startDate },
    },
  });
  if (overlap) {
    const err = new Error('You already have an overlapping leave request for this period');
    err.statusCode = HTTP_STATUS.CONFLICT; throw err;
  }

  const totalDays = calcWorkingDays(startDate, endDate);
  const leave = await db.LeaveRequest.create({ requesterId, leaveType, startDate, endDate, totalDays, reason });
  const result = await db.LeaveRequest.findByPk(leave.id, { include: [REQUESTER_INCLUDE] });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.LEAVE_APPLIED, category: AUDIT_CATEGORY.LEAVE,
    entity: 'LeaveRequest', entityId: leave.id, targetUserId: requesterId,
    targetUserName: `${requestingUser.firstName} ${requestingUser.lastName}`,
    description: `${requestingUser.firstName} ${requestingUser.lastName} applied for ${leaveType} leave (${totalDays} working days)`,
    newValues: { leaveType, startDate, endDate, totalDays, reason }, req,
  });

  return result;
}

async function getLeaveRequests({ requestingUser, page = 1, limit = 20, status, leaveType }) {
  page  = parseInt(page);
  limit = parseInt(limit);
  const where = {};

  if (requestingUser.roleLevel >= 5) {
    // Employee (level 5+): only see their own requests
    where.requesterId = requestingUser.id;
  } else if (requestingUser.roleLevel > 1) {
    // Mid-level: see own + subordinates with less authority (higher level number)
    const reportees = await db.User.findAll({
      where: { managerId: requestingUser.id, deletedAt: null },
      attributes: ['id'],
      include: [{ model: db.RoleDefinition, as: 'role', where: { accessLevel: { [Op.gt]: requestingUser.roleLevel } }, attributes: [] }],
    });
    const ids = [requestingUser.id, ...reportees.map(r => r.id)];
    where.requesterId = { [Op.in]: ids };
  }
  // BOSS (level 1) sees all — no filter applied

  if (status)    where.status    = status;
  if (leaveType) where.leaveType = leaveType;

  const { count: total, rows: leaves } = await db.LeaveRequest.findAndCountAll({
    where,
    include: [REQUESTER_INCLUDE, REVIEWER_INCLUDE],
    offset: (page - 1) * limit,
    limit,
    order: [['createdAt', 'DESC']],
    distinct: true,
  });

  return { leaves, total };
}

async function getMyLeaves({ requesterId, page = 1, limit = 20 }) {
  page  = parseInt(page);
  limit = parseInt(limit);
  const { count: total, rows: leaves } = await db.LeaveRequest.findAndCountAll({
    where: { requesterId },
    include: [REVIEWER_INCLUDE],
    offset: (page - 1) * limit,
    limit,
    order: [['createdAt', 'DESC']],
    distinct: true,
  });
  return { leaves, total };
}

async function reviewLeaveRequest({ leaveId, requestingUser, status, reviewComment, req }) {
  const leave = await db.LeaveRequest.findByPk(leaveId, {
    include: [{
      model: db.User, as: 'requester',
      attributes: ['id', 'firstName', 'lastName', 'managerId'],
      include: [{ model: db.RoleDefinition, as: 'role', attributes: ['accessLevel', 'name'] }],
    }],
  });
  if (!leave) {
    const err = new Error('Leave request not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
  }
  if (leave.status !== 'PENDING') {
    const err = new Error(`Leave request is already ${leave.status.toLowerCase()}`);
    err.statusCode = HTTP_STATUS.CONFLICT; throw err;
  }
  if (leave.requesterId === requestingUser.id) {
    const err = new Error('Cannot review your own leave request'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }
  // Reviewer must have more authority (lower level number) than the requester
  if (requestingUser.roleLevel >= leave.requester.role.accessLevel) {
    const err = new Error('You are not authorized to review this leave request (insufficient authority)');
    err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  await leave.update({ status, reviewerId: requestingUser.id, reviewComment, reviewedAt: new Date() });
  const updated = await db.LeaveRequest.findByPk(leaveId, {
    include: [
      { model: db.User, as: 'requester', attributes: ['id', 'firstName', 'lastName', 'email'] },
      REVIEWER_INCLUDE,
    ],
  });

  const action = status === 'APPROVED' ? AUDIT_ACTION.LEAVE_APPROVED : AUDIT_ACTION.LEAVE_REJECTED;
  await writeAuditLog({
    performedBy: requestingUser, action, category: AUDIT_CATEGORY.LEAVE,
    entity: 'LeaveRequest', entityId: leaveId,
    targetUserId: leave.requesterId, targetUserName: `${leave.requester.firstName} ${leave.requester.lastName}`,
    description: `${status === 'APPROVED' ? 'Approved' : 'Rejected'} leave request from "${leave.requester.firstName} ${leave.requester.lastName}"${reviewComment ? `: "${reviewComment}"` : ''}`,
    oldValues: { status: 'PENDING' }, newValues: { status, reviewComment }, req,
  });

  return updated;
}

async function cancelLeaveRequest({ leaveId, requestingUser, req }) {
  const leave = await db.LeaveRequest.findByPk(leaveId);
  if (!leave || leave.requesterId !== requestingUser.id) {
    const err = new Error('Leave request not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
  }
  if (leave.status !== 'PENDING') {
    const err = new Error('Only pending leave requests can be cancelled'); err.statusCode = HTTP_STATUS.CONFLICT; throw err;
  }

  await leave.update({ status: 'CANCELLED' });

  await writeAuditLog({
    performedBy: requestingUser, action: AUDIT_ACTION.LEAVE_CANCELLED, category: AUDIT_CATEGORY.LEAVE,
    entity: 'LeaveRequest', entityId: leaveId,
    targetUserId: requestingUser.id, targetUserName: `${requestingUser.firstName} ${requestingUser.lastName}`,
    description: `${requestingUser.firstName} ${requestingUser.lastName} cancelled their leave request`, req,
  });

  return leave.reload();
}

module.exports = { createLeaveRequest, getLeaveRequests, getMyLeaves, reviewLeaveRequest, cancelLeaveRequest };
