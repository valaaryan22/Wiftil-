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
    return successResponse(res, { statusCode: 201, message: 'Docket created', data: docket });
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
    const docket = await docketService.getDocketById({ docketId: req.params.docketId });
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
  createDocket, getDocketsByClient, getDocketById, updateDocket, deleteDocket,
  createTicket, getTicketsByDocket, getTicketById, updateTicket, deleteTicket,
};
