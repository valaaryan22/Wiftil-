'use strict';

const express = require('express');
const router = express.Router();

const authRoutes  = require('./auth.routes');
const userRoutes  = require('./user.routes');
const leaveRoutes = require('./leave.routes');

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Wiftil API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// Mount routes
router.use('/auth',   authRoutes);
router.use('/users',  userRoutes);
router.use('/leaves', leaveRoutes);

module.exports = router;
