'use strict';

const userService = require('../services/user.service');
const { successResponse, paginatedResponse } = require('../utils/response');

async function getAllUsers(req, res, next) {
  try {
    const { page = 1, limit = 20, role, department, search } = req.query;
    const { users, total } = await userService.getAllUsers({
      requestingUser: req.user, page, limit, role, department, search,
    });
    return paginatedResponse(res, { data: users, total, page, limit, message: 'Users fetched' });
  } catch (err) {
    next(err);
  }
}

async function getUserById(req, res, next) {
  try {
    const user = await userService.getUserById({ id: req.params.id, requestingUser: req.user });
    return successResponse(res, { message: 'User fetched', data: { user } });
  } catch (err) {
    next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    const user = await userService.updateUser({ id: req.params.id, requestingUser: req.user, data: req.body });
    return successResponse(res, { message: 'User updated', data: { user } });
  } catch (err) {
    next(err);
  }
}

async function updateUserRole(req, res, next) {
  try {
    const user = await userService.updateUserRole({ id: req.params.id, requestingUser: req.user, role: req.body.role });
    return successResponse(res, { message: 'Role updated', data: { user } });
  } catch (err) {
    next(err);
  }
}

async function toggleUserStatus(req, res, next) {
  try {
    const { isActive } = req.body;
    const user = await userService.toggleUserStatus({ id: req.params.id, requestingUser: req.user, isActive });
    return successResponse(res, { message: `User ${isActive ? 'activated' : 'deactivated'}`, data: { user } });
  } catch (err) {
    next(err);
  }
}

async function deleteUser(req, res, next) {
  try {
    await userService.deleteUser({ id: req.params.id, requestingUser: req.user });
    return successResponse(res, { statusCode: 200, message: 'User deleted successfully' });
  } catch (err) {
    next(err);
  }
}

async function getMyTeam(req, res, next) {
  try {
    const team = await userService.getMyTeam({ requestingUser: req.user });
    return successResponse(res, { message: 'Team members fetched', data: { team } });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAllUsers, getUserById, updateUser, updateUserRole, toggleUserStatus, deleteUser, getMyTeam };
