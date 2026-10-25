'use strict';

const attendanceService = require('../services/attendance.service');
const { successResponse, paginatedResponse } = require('../utils/response');

async function punchIn(req, res, next) {
  try {
    const record = await attendanceService.punchIn({
      requestingUser: req.user,
      notes: req.body.notes,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      req,
    });
    return successResponse(res, { statusCode: 201, message: 'Punched in successfully', data: { record } });
  } catch (err) { next(err); }
}

async function punchOut(req, res, next) {
  try {
    const record = await attendanceService.punchOut({
      requestingUser: req.user,
      notes: req.body.notes,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      req,
    });
    return successResponse(res, { message: 'Punched out successfully', data: { record } });
  } catch (err) { next(err); }
}

async function getMyAttendance(req, res, next) {
  try {
    const { page = 1, limit = 31, month } = req.query;
    const { records, total } = await attendanceService.getMyAttendance({
      requestingUser: req.user, page, limit, month,
    });
    return paginatedResponse(res, { data: records, total, page, limit, message: 'Attendance records fetched' });
  } catch (err) { next(err); }
}

async function getTodayRecord(req, res, next) {
  try {
    const record = await attendanceService.getTodayRecord(req.user.id);
    return successResponse(res, { message: 'Today record fetched', data: { record } });
  } catch (err) { next(err); }
}

async function getTodaySummary(req, res, next) {
  try {
    const summary = await attendanceService.getTodaySummary();
    return successResponse(res, { message: 'Today summary fetched', data: { summary } });
  } catch (err) { next(err); }
}

async function getAttendanceList(req, res, next) {
  try {
    const { page = 1, limit = 30, date, userId, month, status } = req.query;
    const { records, total } = await attendanceService.getAttendanceList({
      requestingUser: req.user, page, limit, date, userId, month, status,
    });
    return paginatedResponse(res, { data: records, total, page, limit, message: 'Attendance list fetched' });
  } catch (err) { next(err); }
}

async function getAttendanceMatrix(req, res, next) {
  try {
    const { month, department, search } = req.query;
    const matrixData = await attendanceService.getAttendanceMatrix({
      requestingUser: req.user,
      month,
      department,
      search,
    });
    return successResponse(res, {
      message: 'Attendance matrix retrieved successfully',
      data: matrixData,
    });
  } catch (err) { next(err); }
}

async function manualOverride(req, res, next) {
  try {
    const record = await attendanceService.manualOverride({
      requestingUser: req.user,
      data: req.body,
      req,
    });
    return successResponse(res, { message: 'Attendance overridden', data: { record } });
  } catch (err) { next(err); }
}

async function getMonthlySummary(req, res, next) {
  try {
    const { userId, month } = req.params;
    const summary = await attendanceService.getMonthlySummary(userId, month);
    return successResponse(res, { message: 'Monthly summary fetched', data: { summary } });
  } catch (err) { next(err); }
}

module.exports = {
  punchIn,
  punchOut,
  getMyAttendance,
  getTodayRecord,
  getTodaySummary,
  getAttendanceList,
  getAttendanceMatrix,
  manualOverride,
  getMonthlySummary,
};
