'use strict';

const docketService = require('../services/docket.service');
const { successResponse } = require('../utils/response');

// ─── Dockets ──────────────────────────────────────────────────────────────────

async function createDocket(req, res, next) {
  try {
    const docket = await docketService.createDocket({
      requestingUser: req.user,
      clientId: req.params.clientId,
      data: req.body,
      req,
    });
    return successResponse(res, { statusCode: 201, message: 'Docket created in DRAFT mode', data: docket });
  } catch (e) { next(e); }
}

async function getAllDockets(req, res, next) {
  try {
    const result = await docketService.getAllDockets({ requestingUser: req.user, query: req.query });
    return successResponse(res, { data: result.dockets, meta: { total: result.total, page: result.page, limit: result.limit } });
  } catch (e) { next(e); }
}

async function getDocketsByClient(req, res, next) {
  try {
    const dockets = await docketService.getDocketsByClient({ clientId: req.params.clientId });
    return successResponse(res, { data: dockets });
  } catch (e) { next(e); }
}

async function getDocketById(req, res, next) {
  try {
    const docket = await docketService.getDocketById({ docketId: req.params.docketId, requestingUser: req.user });
    return successResponse(res, { data: docket });
  } catch (e) { next(e); }
}

async function updateDocket(req, res, next) {
  try {
    const docket = await docketService.updateDocket({
      requestingUser: req.user,
      docketId: req.params.docketId,
      data: req.body,
      req,
    });
    return successResponse(res, { message: 'Docket updated', data: docket });
  } catch (e) { next(e); }
}

async function deleteDocket(req, res, next) {
  try {
    await docketService.deleteDocket({ requestingUser: req.user, docketId: req.params.docketId, req });
    return successResponse(res, { message: 'Docket cancelled' });
  } catch (e) { next(e); }
}

// ─── Publish ──────────────────────────────────────────────────────────────────

async function publishDocket(req, res, next) {
  try {
    const docket = await docketService.publishDocket({
      requestingUser: req.user,
      docketId: req.params.docketId,
      req,
    });
    return successResponse(res, { message: 'Docket published', data: docket });
  } catch (e) { next(e); }
}

// ─── Docket Managers ──────────────────────────────────────────────────────────

async function getDocketManagers(req, res, next) {
  try {
    const managers = await docketService.getDocketManagers({ docketId: req.params.docketId });
    return successResponse(res, { data: managers });
  } catch (e) { next(e); }
}

async function addDocketManager(req, res, next) {
  try {
    const manager = await docketService.addDocketManager({
      requestingUser: req.user,
      docketId: req.params.docketId,
      data: req.body,
      req,
    });
    return successResponse(res, { statusCode: 201, message: 'Manager assigned to docket', data: manager });
  } catch (e) { next(e); }
}

async function removeDocketManager(req, res, next) {
  try {
    await docketService.removeDocketManager({
      requestingUser: req.user,
      docketId: req.params.docketId,
      managerId: req.params.managerId,
      req,
    });
    return successResponse(res, { message: 'Manager removed from docket' });
  } catch (e) { next(e); }
}

// ─── Task Linking ─────────────────────────────────────────────────────────────

async function linkTaskToDocket(req, res, next) {
  try {
    const task = await docketService.linkTaskToDocket({
      requestingUser: req.user,
      docketId: req.params.docketId,
      taskId: req.params.taskId,
      req,
    });
    return successResponse(res, { message: 'Task linked to docket', data: task });
  } catch (e) { next(e); }
}

async function unlinkTaskFromDocket(req, res, next) {
  try {
    const task = await docketService.unlinkTaskFromDocket({
      requestingUser: req.user,
      docketId: req.params.docketId,
      taskId: req.params.taskId,
      req,
    });
    return successResponse(res, { message: 'Task unlinked from docket', data: task });
  } catch (e) { next(e); }
}

// ─── Tickets ──────────────────────────────────────────────────────────────────

async function createTicket(req, res, next) {
  try {
    const ticket = await docketService.createTicket({
      requestingUser: req.user,
      docketId: req.params.docketId,
      data: req.body,
      req,
    });
    return successResponse(res, { statusCode: 201, message: 'Ticket created', data: ticket });
  } catch (e) { next(e); }
}

async function getTicketsByDocket(req, res, next) {
  try {
    const tickets = await docketService.getTicketsByDocket({ docketId: req.params.docketId });
    return successResponse(res, { data: tickets });
  } catch (e) { next(e); }
}

async function getTicketById(req, res, next) {
  try {
    const ticket = await docketService.getTicketById({ ticketId: req.params.ticketId });
    return successResponse(res, { data: ticket });
  } catch (e) { next(e); }
}

async function updateTicket(req, res, next) {
  try {
    const ticket = await docketService.updateTicket({
      requestingUser: req.user,
      ticketId: req.params.ticketId,
      data: req.body,
      req,
    });
    return successResponse(res, { message: 'Ticket updated', data: ticket });
  } catch (e) { next(e); }
}

async function deleteTicket(req, res, next) {
  try {
    await docketService.deleteTicket({ requestingUser: req.user, ticketId: req.params.ticketId, req });
    return successResponse(res, { message: 'Ticket deleted' });
  } catch (e) { next(e); }
}

module.exports = {
  // Docket CRUD
  createDocket, getAllDockets, getDocketsByClient, getDocketById, updateDocket, deleteDocket,
  // Publish
  publishDocket,
  // Manager CRUD
  getDocketManagers, addDocketManager, removeDocketManager,
  // Task linking
  linkTaskToDocket, unlinkTaskFromDocket,
  // Tickets
  createTicket, getTicketsByDocket, getTicketById, updateTicket, deleteTicket,
};
