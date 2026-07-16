'use strict';

const logService = require('../services/clientCommunicationLog.service');
const { successResponse } = require('../utils/response');
const { uploadImage } = require('../utils/cloudinary');
const fs = require('fs');

async function createLog(req, res, next) {
  try {
    let attachmentUrl = null;
    if (req.file) {
      attachmentUrl = await uploadImage(req.file.path, 'wiftil_comms');
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Failed to delete temp file:', err);
      });
    }

    const logData = { ...req.body };
    if (attachmentUrl) logData.attachmentUrl = attachmentUrl;

    const log = await logService.createLog({
      requestingUser: req.user,
      clientId: req.params.clientId,
      data: logData,
      req,
    });
    return successResponse(res, { statusCode: 201, message: 'Communication logged successfully', data: log });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    next(error);
  }
}

async function getLogs(req, res, next) {
  try {
    const { page, limit, search, channel, followUpPending } = req.query;
    const result = await logService.getLogs({
      requestingUser: req.user,
      clientId: req.params.clientId,
      page, limit, search, channel, followUpPending,
    });
    return successResponse(res, {
      data: result.logs,
      meta: { total: result.total, page, limit },
    });
  } catch (error) {
    next(error);
  }
}

async function getLogById(req, res, next) {
  try {
    const log = await logService.getLogById({
      clientId: req.params.clientId,
      logId: req.params.logId,
    });
    return successResponse(res, { data: log });
  } catch (error) {
    next(error);
  }
}

async function updateLog(req, res, next) {
  try {
    let attachmentUrl = null;
    if (req.file) {
      attachmentUrl = await uploadImage(req.file.path, 'wiftil_comms');
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Failed to delete temp file:', err);
      });
    }

    const logData = { ...req.body };
    if (attachmentUrl) logData.attachmentUrl = attachmentUrl;

    const log = await logService.updateLog({
      requestingUser: req.user,
      clientId: req.params.clientId,
      logId: req.params.logId,
      data: logData,
      req,
    });
    return successResponse(res, { message: 'Communication log updated successfully', data: log });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    next(error);
  }
}

async function deleteLog(req, res, next) {
  try {
    await logService.deleteLog({
      requestingUser: req.user,
      clientId: req.params.clientId,
      logId: req.params.logId,
      req,
    });
    return successResponse(res, { message: 'Communication log deleted successfully' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createLog,
  getLogs,
  getLogById,
  updateLog,
  deleteLog,
};
