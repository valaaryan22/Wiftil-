'use strict';

const serviceService = require('../services/service.service');
const { successResponse } = require('../utils/response');

async function createService(req, res, next) {
  try {
    const service = await serviceService.createService({ requestingUser: req.user, data: req.body, req });
    return successResponse(res, { statusCode: 201, message: 'Service created', data: service });
  } catch (e) { next(e); }
}

async function getServices(req, res, next) {
  try {
    const { isActive } = req.query;
    const services = await serviceService.getServices({ isActive });
    return successResponse(res, { data: services });
  } catch (e) { next(e); }
}

async function getServiceById(req, res, next) {
  try {
    const service = await serviceService.getServiceById({ id: req.params.id });
    return successResponse(res, { data: service });
  } catch (e) { next(e); }
}

async function updateService(req, res, next) {
  try {
    const service = await serviceService.updateService({ requestingUser: req.user, id: req.params.id, data: req.body, req });
    return successResponse(res, { message: 'Service updated', data: service });
  } catch (e) { next(e); }
}

async function deleteService(req, res, next) {
  try {
    await serviceService.deleteService({ requestingUser: req.user, id: req.params.id, req });
    return successResponse(res, { message: 'Service deactivated' });
  } catch (e) { next(e); }
}

module.exports = { createService, getServices, getServiceById, updateService, deleteService };
