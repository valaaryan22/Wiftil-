'use strict';

const userService = require('../services/user.service');
const { successResponse, paginatedResponse } = require('../utils/response');
const { uploadImage } = require('../utils/cloudinary');
const fs = require('fs');

async function inviteUser(req, res, next) {
  try {
    let profilePictureUrl = null;
    if (req.file) {
      profilePictureUrl = await uploadImage(req.file.path);
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Failed to delete temp file:', err);
      });
    }

    const userData = { ...req.body };
    if (profilePictureUrl) {
      userData.profilePicture = profilePictureUrl;
    }

    const user = await userService.inviteUser({ requestingUser: req.user, data: userData, req });
    return successResponse(res, { statusCode: 201, message: 'User created successfully', data: { user } });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(err);
  }
}

async function getAllUsers(req, res, next) {
  try {
    const { page = 1, limit = 20, roleId, department, search } = req.query;
    const { users, total } = await userService.getAllUsers({
      requestingUser: req.user, page, limit, roleId, department, search,
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
    const user = await userService.updateUser({
      id: req.params.id, requestingUser: req.user, data: req.body, req,
    });
    return successResponse(res, { message: 'User updated', data: { user } });
  } catch (err) {
    next(err);
  }
}

async function updateUserRole(req, res, next) {
  try {
    const user = await userService.updateUserRole({
      id: req.params.id, requestingUser: req.user, roleId: req.body.roleId, req,
    });
    return successResponse(res, { message: 'Role updated', data: { user } });
  } catch (err) {
    next(err);
  }
}

async function toggleUserStatus(req, res, next) {
  try {
    const { isActive } = req.body;
    const user = await userService.toggleUserStatus({
      id: req.params.id, requestingUser: req.user, isActive, req,
    });
    return successResponse(res, {
      message: `User ${isActive ? 'activated' : 'deactivated'}`,
      data: { user },
    });
  } catch (err) {
    next(err);
  }
}

async function deleteUser(req, res, next) {
  try {
    await userService.deleteUser({ id: req.params.id, requestingUser: req.user, req });
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

async function uploadProfilePicture(req, res, next) {
  try {
    if (!req.file) {
      const err = new Error('No image file provided');
      err.statusCode = 400;
      throw err;
    }

    // Upload to Cloudinary
    const imageUrl = await uploadImage(req.file.path);

    // Delete temp file asynchronously
    fs.unlink(req.file.path, (err) => {
      if (err) console.error('Failed to delete temp file:', err);
    });

    // Update user profile picture using existing service method
    const user = await userService.updateUser({
      id: req.params.id,
      requestingUser: req.user,
      data: { profilePicture: imageUrl },
      req,
    });

    return successResponse(res, { message: 'Profile picture uploaded successfully', data: { user } });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(err);
  }
}

module.exports = {
  inviteUser, getAllUsers, getUserById, updateUser,
  updateUserRole, toggleUserStatus, deleteUser, getMyTeam, uploadProfilePicture,
};
