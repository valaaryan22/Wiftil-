'use strict';

const dateChangeRequestService = require('../services/dateChangeRequest.service');
const { successResponse } = require('../utils/response');

async function getDateChangeRequests(req, res, next) {
  try {
    const { entityType, entityId, status } = req.query;
    const requests = await dateChangeRequestService.getDateChangeRequests({
      requestingUser: req.user,
      entityType,
      entityId,
      status,
    });
    return successResponse(res, { data: requests });
  } catch (e) { next(e); }
}

async function approveDateChange(req, res, next) {
  try {
    const dcr = await dateChangeRequestService.approveDateChange({
      requestingUser: req.user,
      requestId: req.params.id,
      comment: req.body.comment,
      req,
    });
    return successResponse(res, { message: 'Date change approved and applied', data: dcr });
  } catch (e) { next(e); }
}

async function rejectDateChange(req, res, next) {
  try {
    const dcr = await dateChangeRequestService.rejectDateChange({
      requestingUser: req.user,
      requestId: req.params.id,
      comment: req.body.comment,
      req,
    });
    return successResponse(res, { message: 'Date change request rejected', data: dcr });
  } catch (e) { next(e); }
}

module.exports = { getDateChangeRequests, approveDateChange, rejectDateChange };
