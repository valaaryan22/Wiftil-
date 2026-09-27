'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/attendance.controller');
const { authenticate }      = require('../middlewares/auth.middleware');
const { authorizeLevel }    = require('../middlewares/authorize.middleware');

router.use(authenticate);

// ── Own attendance ────────────────────────────────────────────────────────────
// POST /attendance/punch-in        — any authenticated user
// POST /attendance/punch-out       — any authenticated user
// GET  /attendance/my              — own records
// GET  /attendance/today           — today's own record

router.post('/punch-in',  ctrl.punchIn);
router.post('/punch-out', ctrl.punchOut);
router.get('/my',         ctrl.getMyAttendance);
router.get('/today',      ctrl.getTodayRecord);

// ── Admin / Manager views ─────────────────────────────────────────────────────
// GET  /attendance/summary/today   — today's organisation-wide summary (MANAGER+)
// GET  /attendance                 — all attendance records (MANAGER+)
// POST /attendance/override        — manual override (ADMIN+)
// GET  /attendance/summary/:userId/:month — monthly summary for payroll

router.get('/summary/today',            authorizeLevel(3), ctrl.getTodaySummary);
router.get('/',                         authorizeLevel(3), ctrl.getAttendanceList);
router.post('/override',               authorizeLevel(2), ctrl.manualOverride);
router.get('/summary/:userId/:month',  authorizeLevel(3), ctrl.getMonthlySummary);

module.exports = router;
