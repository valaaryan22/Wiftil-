'use strict';

const { db } = require('../database/client');
const { ROLE_WEIGHT, LEAVE_APPROVAL_MATRIX, HTTP_STATUS } = require('../constants');
const { writeAuditLog } = require('../utils/auditLog');

/**
 * Calculate working days between two dates (excludes weekends)
 */
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

/**
 * Create leave request (any authenticated user)
 */
async function createLeaveRequest({ requesterId, leaveType, startDate, endDate, reason }) {
  // Check for overlapping pending/approved leave
  const overlap = await db.leaveRequest.findFirst({
    where: {
      requesterId,
      status: { in: ['PENDING', 'APPROVED'] },
      OR: [
        { startDate: { lte: endDate }, endDate: { gte: startDate } },
      ],
    },
  });

  if (overlap) {
    const err = new Error('You already have an overlapping leave request for this period');
    err.statusCode = HTTP_STATUS.CONFLICT;
    throw err;
  }

  const totalDays = calcWorkingDays(startDate, endDate);

  const leave = await db.leaveRequest.create({
    data: { requesterId, leaveType, startDate, endDate, totalDays, reason },
    include: {
      requester: { select: { id: true, firstName: true, lastName: true, email: true, role: true, department: true } },
    },
  });

  await writeAuditLog({ userId: requesterId, action: 'LEAVE_REQUESTED', entity: 'LeaveRequest', entityId: leave.id });

  return leave;
}

/**
 * Get leave requests — scoped by role
 */
async function getLeaveRequests({ requestingUser, page = 1, limit = 20, status, leaveType }) {
  const where = {};

  // Scope: employees see only their own; managers/leaders see their direct reports' leaves
  if (requestingUser.role === 'EMPLOYEE') {
    where.requesterId = requestingUser.id;
  } else if (requestingUser.role === 'LEADER' || requestingUser.role === 'MANAGER') {
    // Get IDs of all reportees
    const approvableRoles = LEAVE_APPROVAL_MATRIX[requestingUser.role];
    const reportees = await db.user.findMany({
      where: { managerId: requestingUser.id, role: { in: approvableRoles }, deletedAt: null },
      select: { id: true },
    });
    where.requesterId = { in: [requestingUser.id, ...reportees.map((r) => r.id)] };
  }
  // BOSS sees all — no filter

  if (status)    where.status    = status;
  if (leaveType) where.leaveType = leaveType;

  const skip = (page - 1) * limit;
  const [leaves, total] = await Promise.all([
    db.leaveRequest.findMany({
      where,
      include: {
        requester: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
        reviewer:  { select: { id: true, firstName: true, lastName: true } },
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    db.leaveRequest.count({ where }),
  ]);

  return { leaves, total };
}

/**
 * Get my own leave requests
 */
async function getMyLeaves({ requesterId, page = 1, limit = 20 }) {
  const skip = (page - 1) * limit;
  const [leaves, total] = await Promise.all([
    db.leaveRequest.findMany({
      where: { requesterId },
      include: { reviewer: { select: { id: true, firstName: true, lastName: true } } },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    db.leaveRequest.count({ where: { requesterId } }),
  ]);
  return { leaves, total };
}

/**
 * Review leave (approve / reject) — respects approval matrix
 */
async function reviewLeaveRequest({ leaveId, reviewerId, status, reviewComment, requestingUser }) {
  const leave = await db.leaveRequest.findUnique({
    where: { id: leaveId },
    include: { requester: { select: { id: true, role: true, managerId: true } } },
  });

  if (!leave) {
    const err = new Error('Leave request not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  if (leave.status !== 'PENDING') {
    const err = new Error(`Leave request is already ${leave.status.toLowerCase()}`);
    err.statusCode = HTTP_STATUS.CONFLICT;
    throw err;
  }

  // Prevent self-review
  if (leave.requesterId === reviewerId) {
    const err = new Error('Cannot review your own leave request');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  // Check if reviewer is allowed to approve this role's leaves
  const approvableRoles = LEAVE_APPROVAL_MATRIX[requestingUser.role] || [];
  if (!approvableRoles.includes(leave.requester.role)) {
    const err = new Error('You are not authorized to review this leave request');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  const updated = await db.leaveRequest.update({
    where: { id: leaveId },
    data: {
      status,
      reviewerId,
      reviewComment,
      reviewedAt: new Date(),
    },
    include: {
      requester: { select: { id: true, firstName: true, lastName: true, email: true } },
      reviewer:  { select: { id: true, firstName: true, lastName: true } },
    },
  });

  await writeAuditLog({
    userId: reviewerId,
    action: `LEAVE_${status}`,
    entity: 'LeaveRequest',
    entityId: leaveId,
    oldValues: { status: 'PENDING' },
    newValues: { status, reviewComment },
  });

  return updated;
}

/**
 * Cancel own pending leave
 */
async function cancelLeaveRequest({ leaveId, requesterId }) {
  const leave = await db.leaveRequest.findUnique({ where: { id: leaveId } });

  if (!leave || leave.requesterId !== requesterId) {
    const err = new Error('Leave request not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  if (leave.status !== 'PENDING') {
    const err = new Error('Only pending leave requests can be cancelled');
    err.statusCode = HTTP_STATUS.CONFLICT;
    throw err;
  }

  const updated = await db.leaveRequest.update({
    where: { id: leaveId },
    data: { status: 'CANCELLED' },
  });

  await writeAuditLog({ userId: requesterId, action: 'LEAVE_CANCELLED', entity: 'LeaveRequest', entityId: leaveId });

  return updated;
}

module.exports = {
  createLeaveRequest,
  getLeaveRequests,
  getMyLeaves,
  reviewLeaveRequest,
  cancelLeaveRequest,
};
