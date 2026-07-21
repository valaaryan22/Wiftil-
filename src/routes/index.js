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
const clientRoutes       = require('./client.routes');
const clientContactRoutes        = require('./clientContact.routes');
const clientCommunicationLogRoutes = require('./clientCommunicationLog.routes');
const serviceRoutes      = require('./service.routes');
const packageRoutes      = require('./package.routes');
const packageItemRoutes  = require('./packageItem.routes');
const docketRoutes       = require('./docket.routes');
const docketItemRoutes   = require('./docketItem.routes');
const clientDocumentRoutes = require('./clientDocument.routes');
const clientPaymentRoutes  = require('./clientPayment.routes');

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Wiftil API is running',
    version: '2.0.0',
    modules: ['auth', 'users', 'roles', 'leaves', 'tasks', 'performance', 'notifications', 'clients'],
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
router.use('/clients',     clientRoutes);
router.use('/clients/:clientId/contacts', clientContactRoutes);
router.use('/clients/:clientId/comms',    clientCommunicationLogRoutes);
router.use('/clients/:clientId/packages', packageRoutes);
router.use('/clients/:clientId/dockets',    docketRoutes);
router.use('/clients/:clientId/documents',  clientDocumentRoutes);
router.use('/clients/:clientId/payments',   clientPaymentRoutes);

// ── Task management module ────────────────────────────────────────────────────
router.use('/tasks',                                          taskRoutes);
router.use('/tasks/:taskId/subtasks',                         subTaskRoutes);
router.use('/performance',                                    performanceRoutes);
router.use('/comments',                                       commentRoutes);
router.use('/notifications',                                  notificationRoutes);

// ── Package / Docket / Service module ────────────────────────────────────────
router.use('/services',  serviceRoutes);
router.use('/packages',  packageItemRoutes);
router.use('/dockets',   docketItemRoutes);

module.exports = router;
