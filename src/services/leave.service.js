'use strict';

const { db }           = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const { HTTP_STATUS, AUDIT_CATEGORY, AUDIT_ACTION } = require('../constants');

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
async function createLeaveRequest({ requestingUser, leaveType, startDate, endDate, reason, req }) {
  const requesterId = requestingUser.id;

  // Check for overlapping pending/approved leave
  const overlap = await db.leaveRequest.findFirst({
    where: {
      requesterId,
      status: { in: ['PENDING', 'APPROVED'] },
      OR: [{ startDate: { lte: endDate }, endDate: { gte: startDate } }],
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
      requester: {
        select: {
          id: true, firstName: true, lastName: true, email: true, department: true,
          role: { select: { name: true, displayName: true } },
        },
      },
    },
  });

  await writeAuditLog({
    performedBy:  requestingUser,
    action:       AUDIT_ACTION.LEAVE_APPLIED,
    category:     AUDIT_CATEGORY.LEAVE,
    entity:       'LeaveRequest',
    entityId:     leave.id,
    targetUserId: requesterId,
    targetUserName: `${requestingUser.firstName} ${requestingUser.lastName}`,
    description:  `${requestingUser.firstName} ${requestingUser.lastName} applied for ${leaveType} leave (${totalDays} working days)`,
    newValues:    { leaveType, startDate, endDate, totalDays, reason },
    req,
  });

  return leave;
}

/**
 * Get leave requests — scoped by role level
 * Level 5 (BOSS): all
 * Level 4 (MANAGER): their team
 * Level 2–3 (LEADER/SUPERVISOR): direct reports with lower level
 * Level 1 (EMPLOYEE): own only
 */
async function getLeaveRequests({ requestingUser, page = 1, limit = 20, status, leaveType }) {
  page  = parseInt(page);
  limit = parseInt(limit);
  const where = {};

  if (requestingUser.roleLevel === 1) {
    where.requesterId = requestingUser.id;
  } else if (requestingUser.roleLevel < 5) {
    // Show own + direct reports' leaves
    const reportees = await db.user.findMany({
      where: {
        managerId: requestingUser.id,
        role: { accessLevel: { lt: requestingUser.roleLevel } },
        deletedAt: null,
      },
      select: { id: true },
    });
    where.requesterId = { in: [requestingUser.id, ...reportees.map((r) => r.id)] };
  }
  // Level 5: no restriction

  if (status)    where.status    = status;
  if (leaveType) where.leaveType = leaveType;

  const skip = (page - 1) * limit;
  const [leaves, total] = await Promise.all([
    db.leaveRequest.findMany({
      where,
      include: {
        requester: {
          select: {
            id: true, firstName: true, lastName: true, email: true,
            role: { select: { name: true, displayName: true } },
          },
        },
        reviewer: { select: { id: true, firstName: true, lastName: true } },
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
  page  = parseInt(page);
  limit = parseInt(limit);
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
 * Review leave (approve / reject) — reviewer must have higher level than requester
 */
async function reviewLeaveRequest({ leaveId, requestingUser, status, reviewComment, req }) {
  const leave = await db.leaveRequest.findUnique({
    where: { id: leaveId },
    include: {
      requester: {
        select: {
          id: true, firstName: true, lastName: true,
          role: { select: { accessLevel: true, name: true } },
          managerId: true,
        },
      },
    },
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

  if (leave.requesterId === requestingUser.id) {
    const err = new Error('Cannot review your own leave request');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  // Reviewer must have strictly higher access level than requester
  if (requestingUser.roleLevel <= leave.requester.role.accessLevel) {
    const err = new Error('You are not authorized to review this leave request (insufficient access level)');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  const updated = await db.leaveRequest.update({
    where: { id: leaveId },
    data: { status, reviewerId: requestingUser.id, reviewComment, reviewedAt: new Date() },
    include: {
      requester: { select: { id: true, firstName: true, lastName: true, email: true } },
      reviewer:  { select: { id: true, firstName: true, lastName: true } },
    },
  });

  const action = status === 'APPROVED' ? AUDIT_ACTION.LEAVE_APPROVED : AUDIT_ACTION.LEAVE_REJECTED;

  await writeAuditLog({
    performedBy:    requestingUser,
    action,
    category:       AUDIT_CATEGORY.LEAVE,
    entity:         'LeaveRequest',
    entityId:       leaveId,
    targetUserId:   leave.requesterId,
    targetUserName: `${leave.requester.firstName} ${leave.requester.lastName}`,
    description:    `${status === 'APPROVED' ? 'Approved' : 'Rejected'} leave request from "${leave.requester.firstName} ${leave.requester.lastName}"${reviewComment ? `: "${reviewComment}"` : ''}`,
    oldValues:      { status: 'PENDING' },
    newValues:      { status, reviewComment },
    req,
  });

  return updated;
}

/**
 * Cancel own pending leave
 */
async function cancelLeaveRequest({ leaveId, requestingUser, req }) {
  const leave = await db.leaveRequest.findUnique({ where: { id: leaveId } });

  if (!leave || leave.requesterId !== requestingUser.id) {
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
    data:  { status: 'CANCELLED' },
  });

  await writeAuditLog({
    performedBy:    requestingUser,
    action:         AUDIT_ACTION.LEAVE_CANCELLED,
    category:       AUDIT_CATEGORY.LEAVE,
    entity:         'LeaveRequest',
    entityId:       leaveId,
    targetUserId:   requestingUser.id,
    targetUserName: `${requestingUser.firstName} ${requestingUser.lastName}`,
    description:    `${requestingUser.firstName} ${requestingUser.lastName} cancelled their leave request`,
    req,
  });

  return updated;
}

module.exports = {
  createLeaveRequest,
  getLeaveRequests,
  getMyLeaves,
  reviewLeaveRequest,
  cancelLeaveRequest,
};
