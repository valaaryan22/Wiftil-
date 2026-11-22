'use strict';

const clientOverviewService = require('../services/clientOverview.service');
const { successResponse } = require('../utils/response');

// ─── Overview ─────────────────────────────────────────────────────────────────

async function getClientOverview(req, res, next) {
  try {
    const data = await clientOverviewService.getClientOverview({ clientId: req.params.clientId });
    return successResponse(res, { data });
  } catch (e) { next(e); }
}

// ─── Scores ───────────────────────────────────────────────────────────────────

async function updateClientScores(req, res, next) {
  try {
    const client = await clientOverviewService.updateClientScores({
      requestingUser: req.user,
      clientId: req.params.clientId,
      data: req.body,
    });
    return successResponse(res, { message: 'Client scores updated', data: client });
  } catch (e) { next(e); }
}

// ─── Client Level ─────────────────────────────────────────────────────────────

async function getClientLevel(req, res, next) {
  try {
    const data = await clientOverviewService.getClientLevel({ clientId: req.params.clientId });
    return successResponse(res, { data });
  } catch (e) { next(e); }
}

async function updateClientLevel(req, res, next) {
  try {
    const client = await clientOverviewService.updateClientLevel({
      requestingUser: req.user,
      clientId: req.params.clientId,
      level: req.body.level,
    });
    return successResponse(res, { message: 'Client level updated', data: client });
  } catch (e) { next(e); }
}

// ─── Risks ────────────────────────────────────────────────────────────────────

async function getRisks(req, res, next) {
  try {
    const risks = await clientOverviewService.getRisks({
      clientId: req.params.clientId,
      includeResolved: req.query.includeResolved === 'true',
    });
    return successResponse(res, { data: risks });
  } catch (e) { next(e); }
}

async function createRisk(req, res, next) {
  try {
    const risk = await clientOverviewService.createRisk({
      requestingUser: req.user,
      clientId: req.params.clientId,
      data: req.body,
    });
    return successResponse(res, { statusCode: 201, message: 'Risk created', data: risk });
  } catch (e) { next(e); }
}

async function updateRisk(req, res, next) {
  try {
    const risk = await clientOverviewService.updateRisk({
      requestingUser: req.user,
      clientId: req.params.clientId,
      riskId: req.params.riskId,
      data: req.body,
    });
    return successResponse(res, { message: 'Risk updated', data: risk });
  } catch (e) { next(e); }
}

async function deleteRisk(req, res, next) {
  try {
    await clientOverviewService.deleteRisk({
      requestingUser: req.user,
      clientId: req.params.clientId,
      riskId: req.params.riskId,
    });
    return successResponse(res, { message: 'Risk deleted' });
  } catch (e) { next(e); }
}

module.exports = {
  getClientOverview,
  updateClientScores,
  getClientLevel,
  updateClientLevel,
  getRisks,
  createRisk,
  updateRisk,
  deleteRisk,
};
