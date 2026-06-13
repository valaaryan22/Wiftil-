'use strict';

const performanceService = require('../services/performance.service');
const { successResponse, paginatedResponse } = require('../utils/response');

const rateSubTask        = async (req, res, next) => { try { const rating = await performanceService.rateSubTask({ requestingUser: req.user, subTaskId: req.params.subTaskId, ...req.body, req }); successResponse(res, { statusCode: 201, message: 'Rating submitted', data: { rating } }); } catch (e) { next(e); } };
const getUserPerformance = async (req, res, next) => { try { const data = await performanceService.getUserPerformance({ requestingUser: req.user, userId: req.params.userId, page: req.query.page, limit: req.query.limit }); successResponse(res, { data }); } catch (e) { next(e); } };
const getMemberDashboard = async (req, res, next) => { try { const data = await performanceService.getMemberDashboard({ requestingUser: req.user }); successResponse(res, { data }); } catch (e) { next(e); } };
const getTeamDashboard   = async (req, res, next) => { try { const data = await performanceService.getTeamDashboard({ requestingUser: req.user }); successResponse(res, { data }); } catch (e) { next(e); } };
const getManagerDashboard = async (req, res, next) => { try { const data = await performanceService.getManagerDashboard({ requestingUser: req.user }); successResponse(res, { data }); } catch (e) { next(e); } };
const getLeaderboard     = async (req, res, next) => { try { const data = await performanceService.getLeaderboard({ limit: req.query.limit }); successResponse(res, { data: { leaderboard: data } }); } catch (e) { next(e); } };

module.exports = { rateSubTask, getUserPerformance, getMemberDashboard, getTeamDashboard, getManagerDashboard, getLeaderboard };
