'use strict';

const leaveService = require('../services/leave.service');
const { successResponse, paginatedResponse } = require('../utils/response');

async function createLeave(req, res, next) {
  try {
    const leave = await leaveService.createLeaveRequest({
      requestingUser: req.user,
      ...req.body,
      req,
    });
    return successResponse(res, { statusCode: 201, message: 'Leave request submitted', data: { leave } });
  } catch (err) {
    next(err);
  }
}

async function getLeaves(req, res, next) {
  try {
    const { page = 1, limit = 20, status, leaveType } = req.query;
    const { leaves, total } = await leaveService.getLeaveRequests({
      requestingUser: req.user, page, limit, status, leaveType,
    });
    return paginatedResponse(res, { data: leaves, total, page, limit, message: 'Leave requests fetched' });
  } catch (err) {
    next(err);
  }
}

async function getMyLeaves(req, res, next) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { leaves, total } = await leaveService.getMyLeaves({ requesterId: req.user.id, page, limit });
    return paginatedResponse(res, { data: leaves, total, page, limit, message: 'Your leave requests fetched' });
  } catch (err) {
    next(err);
  }
}

async function reviewLeave(req, res, next) {
  try {
    const leave = await leaveService.reviewLeaveRequest({
      leaveId:       req.params.id,
      requestingUser: req.user,
      status:        req.body.status,
      reviewComment: req.body.reviewComment,
      req,
    });
    return successResponse(res, { message: `Leave ${req.body.status.toLowerCase()}`, data: { leave } });
  } catch (err) {
    next(err);
  }
}

async function cancelLeave(req, res, next) {
  try {
    const leave = await leaveService.cancelLeaveRequest({
      leaveId:       req.params.id,
      requestingUser: req.user,
      req,
    });
    return successResponse(res, { message: 'Leave request cancelled', data: { leave } });
  } catch (err) {
    next(err);
  }
}

module.exports = { createLeave, getLeaves, getMyLeaves, reviewLeave, cancelLeave };
