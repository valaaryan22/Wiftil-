'use strict';

const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/performance.controller');
const { authenticate }   = require('../middlewares/auth.middleware');
const { authorizeLevel } = require('../middlewares/authorize.middleware');

router.use(authenticate);

// ── Leaderboard ──────────────────────────────────────────────────────────────
router.get('/leaderboard', ctrl.getLeaderboard);

// ── Dashboards ────────────────────────────────────────────────────────────────
router.get('/dashboard/member',  ctrl.getMemberDashboard);   // Any user (own stats)
router.get('/dashboard/team',    authorizeLevel(2), ctrl.getTeamDashboard);    // Team Lead+
router.get('/dashboard/manager', authorizeLevel(4), ctrl.getManagerDashboard); // Manager+

// ── Ratings ──────────────────────────────────────────────────────────────────
router.post('/rate/:subTaskId',  authorizeLevel(4), ctrl.rateSubTask);         // Manager rates
router.get('/user/:userId',      ctrl.getUserPerformance);                      // User's history
router.get('/me',                ctrl.getMemberDashboard);                      // Own dashboard

module.exports = router;
