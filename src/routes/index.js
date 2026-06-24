'use strict';

const express = require('express');
const router  = express.Router();

const authRoutes         = require('./auth.routes');
const userRoutes         = require('./user.routes');
const leaveRoutes        = require('./leave.routes');
const roleRoutes         = require('./role.routes');
const auditLogRoutes     = require('./auditLog.routes');
const taskRoutes         = require('./task.routes');
const subTaskRoutes      = require('./subTask.routes');
const performanceRoutes  = require('./performance.routes');
const commentRoutes      = require('./comment.routes');
const notificationRoutes = require('./notification.routes');

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Wiftil API is running',
    version: '2.0.0',
    modules: ['auth', 'users', 'roles', 'leaves', 'tasks', 'performance', 'notifications'],
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ── Existing modules ──────────────────────────────────────────────────────────
router.use('/auth',        authRoutes);
router.use('/users',       userRoutes);
router.use('/leaves',      leaveRoutes);
router.use('/roles',       roleRoutes);
router.use('/audit-logs',  auditLogRoutes);

// ── Task management module ────────────────────────────────────────────────────
router.use('/tasks',                                          taskRoutes);
router.use('/tasks/:taskId/subtasks',                         subTaskRoutes);
router.use('/performance',                                    performanceRoutes);
router.use('/comments',                                       commentRoutes);
router.use('/notifications',                                  notificationRoutes);

module.exports = router;
