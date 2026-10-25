'use strict';

const authService = require('../services/auth.service');
const { successResponse, errorResponse } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

async function register(req, res, next) {
  try {
    const user = await authService.register(req.body);
    return successResponse(res, {
      statusCode: HTTP_STATUS.CREATED,
      message: 'Registration successful',
      data: { user },
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { user, accessToken, refreshToken } = await authService.login({ ...req.body, req });
    return successResponse(res, {
      message: 'Login successful',
      data: { user, tokens: { accessToken, refreshToken } },
    });
  } catch (err) {
    next(err);
  }
}

async function refreshToken(req, res, next) {
  try {
    const { refreshToken } = req.body;
    const tokens = await authService.refreshTokens({ refreshToken, req });
    return successResponse(res, {
      message: 'Tokens refreshed successfully',
      data: { tokens },
    });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body;
    await authService.logout({ refreshToken, userId: req.user.id });
    return successResponse(res, { message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

async function logoutAll(req, res, next) {
  try {
    await authService.logoutAll({ userId: req.user.id });
    return successResponse(res, { message: 'Logged out of all devices successfully' });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword({ userId: req.user.id, currentPassword, newPassword });
    return successResponse(res, { message: 'Password changed successfully. Please login again.' });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const freshUser = await authService.getMe(req.user.id);
    return successResponse(res, {
      message: 'Profile fetched',
      data: { user: freshUser || req.user },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, refreshToken, logout, logoutAll, changePassword, me };
