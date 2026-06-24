'use strict';

const performanceService = require('../services/performance.service');
const { successResponse } = require('../utils/response');

// Manager (level 4+) rates a Member on a completed sub-task
const rateSubTask = async (req, res, next) => {
  try {
    const rating = await performanceService.rateSubTask({
      requestingUser: req.user,
      subTaskId: req.params.subTaskId,
      ...req.body,
      req,
    });
    successResponse(res, { statusCode: 201, message: 'Rating submitted', data: { rating } });
  } catch (e) { next(e); }
};

// Boss/Admin (level 5) rates a Manager or Team Lead directly (not tied to a sub-task)
const rateUserDirectly = async (req, res, next) => {
  try {
    const rating = await performanceService.rateUserDirectly({
      requestingUser: req.user,
      ratedUserId: req.params.userId,
      ...req.body,
      req,
    });
    successResponse(res, { statusCode: 201, message: 'Direct performance rating submitted', data: { rating } });
  } catch (e) { next(e); }
};

// Get any user's performance history (Manager+ can view others, members see own only)
const getUserPerformance = async (req, res, next) => {
  try {
    const data = await performanceService.getUserPerformance({
      requestingUser: req.user,
      userId: req.params.userId,
      page: req.query.page,
      limit: req.query.limit,
    });
    successResponse(res, { data });
  } catch (e) { next(e); }
};

const getMemberDashboard  = async (req, res, next) => { try { const data = await performanceService.getMemberDashboard({ requestingUser: req.user });  successResponse(res, { data }); } catch (e) { next(e); } };
const getTeamDashboard    = async (req, res, next) => { try { const data = await performanceService.getTeamDashboard({ requestingUser: req.user });    successResponse(res, { data }); } catch (e) { next(e); } };
const getManagerDashboard = async (req, res, next) => { try { const data = await performanceService.getManagerDashboard({ requestingUser: req.user }); successResponse(res, { data }); } catch (e) { next(e); } };
const getLeaderboard      = async (req, res, next) => { try { const data = await performanceService.getLeaderboard({ limit: req.query.limit });        successResponse(res, { data: { leaderboard: data } }); } catch (e) { next(e); } };

module.exports = {
  rateSubTask, rateUserDirectly,
  getUserPerformance,
  getMemberDashboard, getTeamDashboard, getManagerDashboard,
  getLeaderboard,
};
