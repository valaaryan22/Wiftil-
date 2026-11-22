'use strict';

const taskService       = require('../services/task.service');
const { successResponse, paginatedResponse } = require('../utils/response');

const createTask      = async (req, res, next) => { try { const data = await taskService.createTask({ requestingUser: req.user, ...req.body, req }); successResponse(res, { statusCode: 201, message: 'Ticket created', data: { task: data, ticket: data } }); } catch (e) { next(e); } };
const getTasks        = async (req, res, next) => { try { const { page = 1, limit = 20, status, priority, search, docketId } = req.query; const { tasks, total } = await taskService.getTasks({ requestingUser: req.user, page, limit, status, priority, search, docketId }); paginatedResponse(res, { data: tasks, total, page, limit, message: 'Tickets fetched' }); } catch (e) { next(e); } };
const getTaskById     = async (req, res, next) => { try { const task = await taskService.getTaskById({ id: req.params.id, requestingUser: req.user }); successResponse(res, { data: { task, ticket: task } }); } catch (e) { next(e); } };
const updateTask      = async (req, res, next) => {
  try {
    const result = await taskService.updateTask({ id: req.params.id, requestingUser: req.user, data: req.body, req });
    if (result.pendingDateRequest) {
      successResponse(res, { message: 'Ticket updated', data: result });
    } else {
      successResponse(res, { message: 'Ticket updated', data: { task: result, ticket: result } });
    }
  } catch (e) { next(e); }
};
const deleteTask      = async (req, res, next) => { try { await taskService.deleteTask({ id: req.params.id, requestingUser: req.user, req }); successResponse(res, { statusCode: 200, message: 'Ticket deleted' }); } catch (e) { next(e); } };
const assignManager   = async (req, res, next) => { try { const task = await taskService.assignManager({ id: req.params.id, requestingUser: req.user, ...req.body, req }); successResponse(res, { message: 'Manager assigned', data: { task, ticket: task } }); } catch (e) { next(e); } };
const acceptTask      = async (req, res, next) => { try { const task = await taskService.acceptTask({ id: req.params.id, requestingUser: req.user, ...req.body, req }); successResponse(res, { message: 'Ticket accepted', data: { task, ticket: task } }); } catch (e) { next(e); } };
const rejectTask      = async (req, res, next) => { try { const task = await taskService.rejectTask({ id: req.params.id, requestingUser: req.user, ...req.body, req }); successResponse(res, { message: 'Ticket rejected', data: { task, ticket: task } }); } catch (e) { next(e); } };
const assignTeamLeads = async (req, res, next) => { try { const task = await taskService.assignTeamLeads({ id: req.params.id, requestingUser: req.user, ...req.body, req }); successResponse(res, { message: 'Team leads assigned', data: { task, ticket: task } }); } catch (e) { next(e); } };
const submitTask      = async (req, res, next) => { try { const task = await taskService.submitTask({ id: req.params.id, requestingUser: req.user, req }); successResponse(res, { message: 'Ticket submitted for approval', data: { task, ticket: task } }); } catch (e) { next(e); } };
const approveTask     = async (req, res, next) => { try { const task = await taskService.approveTask({ id: req.params.id, requestingUser: req.user, ...req.body, req }); successResponse(res, { message: 'Ticket approved and completed', data: { task, ticket: task } }); } catch (e) { next(e); } };
const reopenTask      = async (req, res, next) => { try { const task = await taskService.reopenTask({ id: req.params.id, requestingUser: req.user, ...req.body, req }); successResponse(res, { message: 'Ticket reopened', data: { task, ticket: task } }); } catch (e) { next(e); } };
const getTaskStats    = async (req, res, next) => { try { const stats = await taskService.getTaskStats({ requestingUser: req.user }); successResponse(res, { data: { stats } }); } catch (e) { next(e); } };

module.exports = { createTask, getTasks, getTaskById, updateTask, deleteTask, assignManager, acceptTask, rejectTask, assignTeamLeads, submitTask, approveTask, reopenTask, getTaskStats };
