'use strict';

const express = require('express');
const router  = express.Router();

const userController = require('../controllers/user.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize, authorizeMinRole, authorizeSelfOrRole } = require('../middlewares/authorize.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { updateUserValidator, updateRoleValidator, paginationValidator } = require('../validators');

// All user routes require authentication
router.use(authenticate);

// GET /users — BOSS sees all, MANAGER sees LEADER+EMPLOYEE, LEADER sees EMPLOYEE
router.get('/', paginationValidator, validate, userController.getAllUsers);

// GET /users/my-team — direct subordinates
router.get('/my-team', authorizeMinRole('LEADER'), userController.getMyTeam);

// GET /users/:id — self or higher role
router.get('/:id', authorizeSelfOrRole('LEADER'), userController.getUserById);

// PATCH /users/:id — self or higher role
router.patch('/:id', updateUserValidator, validate, authorizeSelfOrRole('LEADER'), userController.updateUser);

// PATCH /users/:id/role — BOSS: any role; MANAGER: LEADER/EMPLOYEE
router.patch('/:id/role', authorizeMinRole('MANAGER'), updateRoleValidator, validate, userController.updateUserRole);

// PATCH /users/:id/status — activate / deactivate (BOSS and MANAGER)
router.patch('/:id/status', authorizeMinRole('MANAGER'), userController.toggleUserStatus);

// DELETE /users/:id — soft delete (BOSS only)
router.delete('/:id', authorize('BOSS'), userController.deleteUser);

module.exports = router;
