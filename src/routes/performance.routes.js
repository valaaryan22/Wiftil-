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
router.get('/dashboard/member',  ctrl.getMemberDashboard);                      // Any authenticated user (own stats)
router.get('/dashboard/team',    authorizeLevel(4), ctrl.getTeamDashboard);     // Team Lead+ (level ≤ 4)
router.get('/dashboard/manager', authorizeLevel(3), ctrl.getManagerDashboard);  // Manager+   (level ≤ 3)

// ── Sub-task Ratings (Manager rates Member on a completed sub-task) ───────────
// POST /api/v1/performance/rate/subtask/:subTaskId
// Body: { ratedUserId, quality, timeliness, communication, accuracy, ownership, comments? }
// NOTE: For sub-tasks with multiple members, call this once per member.
//       'overall' is automatically weighted by each member's contribution %.
router.post('/rate/subtask/:subTaskId', authorizeLevel(3), ctrl.rateSubTask);

// ── Direct Ratings (Boss/Admin rates a Manager or Team Lead) ─────────────────
// POST /api/v1/performance/rate/user/:userId
// Body: { periodLabel, quality, timeliness, communication, accuracy, ownership, comments? }
// periodLabel example: "Q2 2026", "June 2026"
router.post('/rate/user/:userId', authorizeLevel(2), ctrl.rateUserDirectly);

// ── User Performance History ──────────────────────────────────────────────────
router.get('/user/:userId', ctrl.getUserPerformance);  // Manager+ can view others; members see own only
router.get('/me', ctrl.getMemberDashboard);            // Own dashboard shortcut

module.exports = router;
