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
const dashboardRoutes      = require('./dashboard.routes');
const dateChangeRequestRoutes = require('./dateChangeRequest.routes');
// Finance & Accounting module
const financeRoutes        = require('./finance.routes');
const expenseRoutes        = require('./expense.routes');
const bankAccountRoutes    = require('./bankAccount.routes');
// Salary & Payroll module
const salaryRoutes         = require('./salary.routes');
const incrementPolicyRoutes = require('./incrementPolicy.routes');
// HRM — Attendance module
const attendanceRoutes     = require('./attendance.routes');
// HRM — Leave Allocation module
const leaveAllocationRoutes = require('./leaveAllocation.routes');
// Reports and Analytics (Management Decision System)
const reportsRoutes        = require('./reports.routes');
// Vendor and Collaborator Management (External Workforce Hub)
const vendorRoutes         = require('./vendor.routes');
// Module X: CRM (Pre-Sales Relationship Management)
const crmRoutes            = require('./crm.routes');
// Reminders Module (Workbench & Calendar)
const reminderRoutes       = require('./reminder.routes');
// HRM — Holidays Module
const holidayRoutes        = require('./holiday.routes');
// HRM — Office Locations & Geofence
const officeLocationRoutes = require('./officeLocation.routes');
// Task Chains / Predefined Sub-Task Templates module
const taskChainRoutes      = require('./taskChain.routes');
// Setup / DB Sync & Seed module
const setupRoutes          = require('./setup.routes');

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
router.use('/clients/:clientId/projects',   docketRoutes);
router.use('/clients/:clientId/documents',  clientDocumentRoutes);
router.use('/clients/:clientId/payments',   clientPaymentRoutes);

// ── Dashboard module (user-specific) ────────────────────────────────────────
router.use('/dashboard', dashboardRoutes);

// ── Task management module (Tickets & Tasks) ──────────────────────────────
router.use('/tasks',                                          taskRoutes);
router.use('/tasks/:taskId/subtasks',                         subTaskRoutes);
router.use('/tickets',                                        taskRoutes);
router.use('/tickets/:taskId/tasks',                          subTaskRoutes);
router.use('/performance',                                    performanceRoutes);
router.use('/comments',                                       commentRoutes);
router.use('/notifications',                                  notificationRoutes);

// ── Package / Docket / Service module (Projects & Services) ────────────────
router.use('/services',  serviceRoutes);
router.use('/packages',  packageItemRoutes);
router.use('/dockets',   docketItemRoutes);
router.use('/projects',  docketItemRoutes);

// ── Date Change Requests module ───────────────────────────────────────────────
router.use('/date-change-requests', dateChangeRequestRoutes);

// ── Task Chains & Templates module ────────────────────────────────────────────
router.use('/task-chains', taskChainRoutes);

// ── Finance & Accounting module ───────────────────────────────────────────────
router.use('/finance',       financeRoutes);
router.use('/expenses',      expenseRoutes);
router.use('/bank-accounts', bankAccountRoutes);

// ── Salary & Payroll module ───────────────────────────────────────────────────
router.use('/salary',        salaryRoutes);
router.use('/increment-policies', incrementPolicyRoutes);

// ── HRM — Attendance module ───────────────────────────────────────────────────
router.use('/attendance',         attendanceRoutes);

// ── HRM — Leave Allocation module ─────────────────────────────────────────────
router.use('/leave-allocations',  leaveAllocationRoutes);

// ── Reports and Analytics (Management Decision System) ──────────────────────────
router.use('/reports',            reportsRoutes);

// ── Vendor and Collaborator Management (External Workforce Hub) ────────────────
router.use('/vendors',            vendorRoutes);

// ── Module X: CRM (Pre-Sales Relationship Management) ──────────────────────────
router.use('/crm',                crmRoutes);

// ── Reminders Module (Workbench & Calendar) ───────────────────────────────────
router.use('/reminders',          reminderRoutes);

// ── HRM — Holidays Module ────────────────────────────────────────────────────
router.use('/holidays',           holidayRoutes);

// ── HRM — Office Locations & Geofence ─────────────────────────────────────────
router.use('/office-locations',   officeLocationRoutes);

// ── Setup / DB Sync & Seed ────────────────────────────────────────────────────
router.use('/setup',              setupRoutes);

module.exports = router;
