'use strict';

const subTaskService = require('../services/subTask.service');
const { successResponse, paginatedResponse } = require('../utils/response');

const createSubTask    = async (req, res, next) => { try { const st = await subTaskService.createSubTask({ requestingUser: req.user, taskId: req.params.taskId, ...req.body, req }); successResponse(res, { statusCode: 201, message: 'Sub-task created', data: { subTask: st } }); } catch (e) { next(e); } };
const getSubTasks      = async (req, res, next) => { try { const subTasks = await subTaskService.getSubTasks({ requestingUser: req.user, taskId: req.params.taskId, status: req.query.status }); successResponse(res, { data: { subTasks, total: subTasks.length } }); } catch (e) { next(e); } };
const getSubTaskById   = async (req, res, next) => { try { const st = await subTaskService.getSubTaskById({ requestingUser: req.user, taskId: req.params.taskId, id: req.params.id }); successResponse(res, { data: { subTask: st } }); } catch (e) { next(e); } };
const updateSubTask    = async (req, res, next) => {
  try {
    const result = await subTaskService.updateSubTask({ requestingUser: req.user, taskId: req.params.taskId, id: req.params.id, data: req.body, req });
    if (result.pendingDateRequest) {
      successResponse(res, { message: 'Sub-task updated', data: result });
    } else {
      successResponse(res, { message: 'Sub-task updated', data: { subTask: result } });
    }
  } catch (e) { next(e); }
};
const deleteSubTask    = async (req, res, next) => { try { await subTaskService.deleteSubTask({ requestingUser: req.user, taskId: req.params.taskId, id: req.params.id, req }); successResponse(res, { message: 'Sub-task deleted' }); } catch (e) { next(e); } };
const assignSubTask    = async (req, res, next) => { try { const st = await subTaskService.assignSubTask({ requestingUser: req.user, taskId: req.params.taskId, id: req.params.id, ...req.body, req }); successResponse(res, { message: 'Sub-task assigned', data: { subTask: st } }); } catch (e) { next(e); } };
const startSubTask     = async (req, res, next) => { try { const st = await subTaskService.startSubTask({ requestingUser: req.user, taskId: req.params.taskId, id: req.params.id, req }); successResponse(res, { message: 'Sub-task started', data: { subTask: st } }); } catch (e) { next(e); } };
const submitSubTask    = async (req, res, next) => { try { const st = await subTaskService.submitSubTask({ requestingUser: req.user, taskId: req.params.taskId, id: req.params.id, ...req.body, req }); successResponse(res, { message: 'Sub-task submitted for review', data: { subTask: st } }); } catch (e) { next(e); } };
const approveSubTask   = async (req, res, next) => { try { const st = await subTaskService.approveSubTask({ requestingUser: req.user, taskId: req.params.taskId, id: req.params.id, ...req.body, req }); successResponse(res, { message: 'Sub-task approved', data: { subTask: st } }); } catch (e) { next(e); } };
const rejectSubTask    = async (req, res, next) => { try { const st = await subTaskService.rejectSubTask({ requestingUser: req.user, taskId: req.params.taskId, id: req.params.id, ...req.body, req }); successResponse(res, { message: 'Sub-task rejected', data: { subTask: st } }); } catch (e) { next(e); } };
const addDependency    = async (req, res, next) => { try { const st = await subTaskService.addDependency({ requestingUser: req.user, taskId: req.params.taskId, id: req.params.id, prerequisiteId: req.body.prerequisiteId, req }); successResponse(res, { message: 'Dependency added', data: { subTask: st } }); } catch (e) { next(e); } };
const removeDependency = async (req, res, next) => { try { const st = await subTaskService.removeDependency({ requestingUser: req.user, taskId: req.params.taskId, id: req.params.id, prerequisiteId: req.params.prerequisiteId, req }); successResponse(res, { message: 'Dependency removed', data: { subTask: st } }); } catch (e) { next(e); } };

module.exports = { createSubTask, getSubTasks, getSubTaskById, updateSubTask, deleteSubTask, assignSubTask, startSubTask, submitSubTask, approveSubTask, rejectSubTask, addDependency, removeDependency };
