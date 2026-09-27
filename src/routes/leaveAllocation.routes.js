'use strict';

const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/leaveAllocation.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { body, param, query } = require('express-validator');
const { validate } = require('../middlewares/validate.middleware');

router.use(authenticate);

const upsertValidator = [
  body('userId').isUUID().withMessage('Valid employee userId is required'),
  body('year').isInt({ min: 2020, max: 2100 }).withMessage('Valid year required').toInt(),
  body('annualDays').optional().isFloat({ min: 0 }).toFloat(),
  body('sickDays').optional().isFloat({ min: 0 }).toFloat(),
  body('unpaidDays').optional().isFloat({ min: 0 }).toFloat(),
  body('emergencyDays').optional().isFloat({ min: 0 }).toFloat(),
  body('maternityDays').optional().isFloat({ min: 0 }).toFloat(),
  body('paternityDays').optional().isFloat({ min: 0 }).toFloat(),
  body('note').optional().trim().isLength({ max: 500 }),
];

// POST /leave-allocations  — upsert allocation (Level 1/2/3 only)
router.post('/', upsertValidator, validate, ctrl.upsertAllocation);

// GET /leave-allocations  — list all allocations (filtered by role)
router.get('/', [query('year').optional().isInt().toInt(), query('page').optional().isInt().toInt(), query('limit').optional().isInt().toInt()], validate, ctrl.getAllocations);

// GET /leave-allocations/my-balance  — own balance + consumed
router.get('/my-balance', [query('year').optional().isInt().toInt()], validate, ctrl.getMyBalance);

// GET /leave-allocations/employee/:userId — manager views a specific employee's balance
router.get('/employee/:userId', [param('userId').isUUID(), query('year').optional().isInt().toInt()], validate, ctrl.getEmployeeBalance);

// DELETE /leave-allocations/:id — Level 1 only
router.delete('/:id', [param('id').isUUID().withMessage('Valid allocation ID required')], validate, ctrl.deleteAllocation);

module.exports = router;
