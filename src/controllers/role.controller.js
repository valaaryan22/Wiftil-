'use strict';

const roleService = require('../services/role.service');
const { successResponse } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

async function getAllRoles(req, res, next) {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const roles = await roleService.getAllRoles({ includeInactive });
    return successResponse(res, { message: 'Roles fetched', data: { roles } });
  } catch (err) {
    next(err);
  }
}

async function getRoleById(req, res, next) {
  try {
    const role = await roleService.getRoleById(req.params.id);
    return successResponse(res, { message: 'Role fetched', data: { role } });
  } catch (err) {
    next(err);
  }
}

async function createRole(req, res, next) {
  try {
    const { name, displayName, description, accessLevel, color } = req.body;
    const role = await roleService.createRole({
      requestingUser: req.user,
      name, displayName, description, accessLevel, color,
    });
    return successResponse(res, { statusCode: HTTP_STATUS.CREATED, message: 'Role created', data: { role } });
  } catch (err) {
    next(err);
  }
}

async function updateRole(req, res, next) {
  try {
    const role = await roleService.updateRole({
      requestingUser: req.user,
      id: req.params.id,
      ...req.body,
    });
    return successResponse(res, { message: 'Role updated', data: { role } });
  } catch (err) {
    next(err);
  }
}

async function deleteRole(req, res, next) {
  try {
    await roleService.deleteRole({ requestingUser: req.user, id: req.params.id });
    return successResponse(res, { message: 'Role deleted successfully' });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAllRoles, getRoleById, createRole, updateRole, deleteRole };
