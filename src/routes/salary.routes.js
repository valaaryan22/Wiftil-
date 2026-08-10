'use strict';

const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/salary.controller');
const { authenticate }      = require('../middlewares/auth.middleware');
const { authorizeLevel, authorizePermission } = require('../middlewares/authorize.middleware');

router.use(authenticate);

// ── Salary Config ─────────────────────────────────────────────────────────────
// GET  /salary/configs              — list all (ADMIN+)
// GET  /salary/configs/:userId      — get one user's config
// POST /salary/configs/:userId      — set/update salary config (ADMIN+)

router.get('/configs',
  authorizeLevel(2),
  ctrl.listSalaryConfigs,
);

router.get('/configs/:userId',
  authorizePermission('canAccessSalary'),
  ctrl.getSalaryConfig,
);

router.post('/configs/:userId',
  authorizeLevel(2),
  ctrl.upsertSalaryConfig,
);

// ── Payroll ───────────────────────────────────────────────────────────────────
// GET  /salary/payroll                    — list (MANAGER+)
// GET  /salary/payroll/:id               — single entry
// POST /salary/payroll/:id/approve       — approve DRAFT (ADMIN+)
// POST /salary/payroll/:id/pay           — mark as paid (ADMIN+)
// POST /salary/payroll/:id/incentive     — add incentive/deduction (ADMIN+)
// POST /salary/payroll/:id/cancel        — cancel (ADMIN+)
// POST /salary/payroll/generate          — manual cron trigger (BOSS only)

router.get('/payroll',
  authorizePermission('canAccessSalary'),
  ctrl.listPayroll,
);

router.get('/payroll/:id',
  authorizePermission('canAccessSalary'),
  ctrl.getPayroll,
);

router.post('/payroll/generate',
  authorizeLevel(1),
  ctrl.manualGenerate,
);

router.post('/payroll/:id/approve',
  authorizeLevel(2),
  ctrl.approvePayroll,
);

router.post('/payroll/:id/pay',
  authorizeLevel(2),
  ctrl.markPaid,
);

router.post('/payroll/:id/incentive',
  authorizeLevel(2),
  ctrl.addIncentive,
);

router.post('/payroll/:id/cancel',
  authorizeLevel(2),
  ctrl.cancelPayroll,
);

module.exports = router;
