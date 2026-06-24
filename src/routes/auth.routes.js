'use strict';

const express = require('express');
const router  = express.Router();

const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authRateLimiter } = require('../middlewares/rateLimiter.middleware');
const { validate } = require('../middlewares/validate.middleware');
const {
  registerValidator,
  loginValidator,
  refreshTokenValidator,
  changePasswordValidator,
} = require('../validators');

// Public routes (rate limited)
router.post('/register', authRateLimiter, registerValidator, validate, authController.register);
router.post('/login',    authRateLimiter, loginValidator,    validate, authController.login);
router.post('/refresh',  authRateLimiter, refreshTokenValidator, validate, authController.refreshToken);

// Protected routes
router.use(authenticate);
router.get('/me',           authController.me);
router.post('/logout',      authController.logout);
router.post('/logout-all',  authController.logoutAll);
router.put('/change-password', changePasswordValidator, validate, authController.changePassword);

module.exports = router;
