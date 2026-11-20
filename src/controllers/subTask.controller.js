'use strict';

const subTaskService = require('../services/subTask.service');
const { successResponse, paginatedResponse } = require('../utils/response');

const createSubTask    = async (req, res, next) => { try { const st = await subTaskService.createSubTask({ requestingUser: req.user, taskId: req.params.taskId, ...req.body, req }); successResponse(res, { statusCode: 201, message: 'Task created', data: { subTask: st, task: st } }); } catch (e) { next(e); } };
const getSubTasks      = async (req, res, next) => { try { const subTasks = await subTaskService.getSubTasks({ requestingUser: req.user, taskId: req.params.taskId, status: req.query.status }); successResponse(res, { data: { subTasks, tasks: subTasks, total: subTasks.length } }); } catch (e) { next(e); } };
const getSubTaskById   = async (req, res, next) => { try { const st = await subTaskService.getSubTaskById({ requestingUser: req.user, taskId: req.params.taskId, id: req.params.id }); successResponse(res, { data: { subTask: st, task: st } }); } catch (e) { next(e); } };
const updateSubTask    = async (req, res, next) => {
  try {
    const result = await subTaskService.updateSubTask({ requestingUser: req.user, taskId: req.params.taskId, id: req.params.id, data: req.body, req });
    if (result.pendingDateRequest) {
      successResponse(res, { message: 'Task updated', data: result });
    } else {
      successResponse(res, { message: 'Task updated', data: { subTask: result, task: result } });
    }
  } catch (e) { next(e); }
};
const deleteSubTask    = async (req, res, next) => { try { await subTaskService.deleteSubTask({ requestingUser: req.user, taskId: req.params.taskId, id: req.params.id, req }); successResponse(res, { message: 'Task deleted' }); } catch (e) { next(e); } };
const assignSubTask    = async (req, res, next) => { try { const st = await subTaskService.assignSubTask({ requestingUser: req.user, taskId: req.params.taskId, id: req.params.id, ...req.body, req }); successResponse(res, { message: 'Task assigned', data: { subTask: st, task: st } }); } catch (e) { next(e); } };
const startSubTask     = async (req, res, next) => { try { const st = await subTaskService.startSubTask({ requestingUser: req.user, taskId: req.params.taskId, id: req.params.id, req }); successResponse(res, { message: 'Task started', data: { subTask: st, task: st } }); } catch (e) { next(e); } };
const submitSubTask    = async (req, res, next) => { try { const st = await subTaskService.submitSubTask({ requestingUser: req.user, taskId: req.params.taskId, id: req.params.id, ...req.body, req }); successResponse(res, { message: 'Task submitted for review', data: { subTask: st, task: st } }); } catch (e) { next(e); } };
const approveSubTask   = async (req, res, next) => { try { const st = await subTaskService.approveSubTask({ requestingUser: req.user, taskId: req.params.taskId, id: req.params.id, ...req.body, req }); successResponse(res, { message: 'Task approved', data: { subTask: st, task: st } }); } catch (e) { next(e); } };
const rejectSubTask    = async (req, res, next) => { try { const st = await subTaskService.rejectSubTask({ requestingUser: req.user, taskId: req.params.taskId, id: req.params.id, ...req.body, req }); successResponse(res, { message: 'Task rejected', data: { subTask: st, task: st } }); } catch (e) { next(e); } };
const addDependency    = async (req, res, next) => { try { const st = await subTaskService.addDependency({ requestingUser: req.user, taskId: req.params.taskId, id: req.params.id, prerequisiteId: req.body.prerequisiteId, req }); successResponse(res, { message: 'Dependency added', data: { subTask: st } }); } catch (e) { next(e); } };
const removeDependency = async (req, res, next) => { try { const st = await subTaskService.removeDependency({ requestingUser: req.user, taskId: req.params.taskId, id: req.params.id, prerequisiteId: req.params.prerequisiteId, req }); successResponse(res, { message: 'Dependency removed', data: { subTask: st } }); } catch (e) { next(e); } };

module.exports = { createSubTask, getSubTasks, getSubTaskById, updateSubTask, deleteSubTask, assignSubTask, startSubTask, submitSubTask, approveSubTask, rejectSubTask, addDependency, removeDependency };
