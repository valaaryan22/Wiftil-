'use strict';

const taskChainService = require('../services/taskChain.service');
const { successResponse } = require('../utils/response');

const getTaskChains = async (req, res, next) => {
  try {
    const chains = await taskChainService.getTaskChains({
      search: req.query.search,
      category: req.query.category,
      isActive: req.query.isActive,
    });
    successResponse(res, {
      message: 'Task chains fetched successfully',
      data: { chains, total: chains.length },
    });
  } catch (err) {
    next(err);
  }
};

const getTaskChainById = async (req, res, next) => {
  try {
    const chain = await taskChainService.getTaskChainById(req.params.id);
    successResponse(res, {
      message: 'Task chain fetched successfully',
      data: { chain },
    });
  } catch (err) {
    next(err);
  }
};

const createTaskChain = async (req, res, next) => {
  try {
    const chain = await taskChainService.createTaskChain({
      ...req.body,
      requestingUser: req.user,
      req,
    });
    successResponse(res, {
      statusCode: 201,
      message: 'Task chain created successfully',
      data: { chain },
    });
  } catch (err) {
    next(err);
  }
};

const updateTaskChain = async (req, res, next) => {
  try {
    const chain = await taskChainService.updateTaskChain({
      id: req.params.id,
      data: req.body,
      requestingUser: req.user,
      req,
    });
    successResponse(res, {
      message: 'Task chain updated successfully',
      data: { chain },
    });
  } catch (err) {
    next(err);
  }
};

const deleteTaskChain = async (req, res, next) => {
  try {
    await taskChainService.deleteTaskChain({
      id: req.params.id,
      requestingUser: req.user,
      req,
    });
    successResponse(res, {
      message: 'Task chain deleted successfully',
    });
  } catch (err) {
    next(err);
  }
};

const applyTaskChainToTask = async (req, res, next) => {
  try {
    const taskId = req.params.taskId || req.body.taskId;
    const chainId = req.params.id || req.body.chainId;
    const chainKey = req.body.chainKey;

    const result = await taskChainService.applyTaskChainToTask({
      taskId,
      chainId,
      chainKey,
      requestingUser: req.user,
      req,
    });

    successResponse(res, {
      statusCode: 201,
      message: `Successfully applied task chain "${result.chain.name}" (${result.totalCreated} tasks generated)`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getTaskChains,
  getTaskChainById,
  createTaskChain,
  updateTaskChain,
  deleteTaskChain,
  applyTaskChainToTask,
};
