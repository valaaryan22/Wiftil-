'use strict';

const { db } = require('../database/client');
const { successResponse, paginatedResponse } = require('../utils/response');
const { Op } = require('sequelize');
const salaryService = require('../services/salary.service');

async function createPolicy(req, res, next) {
  try {
    const { name, minRating, maxRating, incrementPercentage } = req.body;
    const policy = await db.PerformanceIncrementPolicy.create({
      name,
      minRating,
      maxRating,
      incrementPercentage,
      createdById: req.user.id,
    });
    return successResponse(res, { statusCode: 201, message: 'Increment policy created', data: { policy } });
  } catch (err) { next(err); }
}

async function listPolicies(req, res, next) {
  try {
    const policies = await db.PerformanceIncrementPolicy.findAll({
      order: [['min_rating', 'ASC']],
    });
    return successResponse(res, { message: 'Increment policies fetched', data: { policies } });
  } catch (err) { next(err); }
}

async function updatePolicy(req, res, next) {
  try {
    const policyId = req.params.id;
    const { name, minRating, maxRating, incrementPercentage, isActive } = req.body;
    const policy = await db.PerformanceIncrementPolicy.findByPk(policyId);
    if (!policy) {
      return successResponse(res, { statusCode: 404, message: 'Policy not found', data: null });
    }
    
    if (name !== undefined) policy.name = name;
    if (minRating !== undefined) policy.minRating = minRating;
    if (maxRating !== undefined) policy.maxRating = maxRating;
    if (incrementPercentage !== undefined) policy.incrementPercentage = incrementPercentage;
    if (isActive !== undefined) policy.isActive = isActive;
    
    await policy.save();
    return successResponse(res, { message: 'Increment policy updated', data: { policy } });
  } catch (err) { next(err); }
}

async function deletePolicy(req, res, next) {
  try {
    const policyId = req.params.id;
    const policy = await db.PerformanceIncrementPolicy.findByPk(policyId);
    if (!policy) {
      return successResponse(res, { statusCode: 404, message: 'Policy not found', data: null });
    }
    await policy.destroy();
    return successResponse(res, { message: 'Increment policy deleted', data: null });
  } catch (err) { next(err); }
}

async function calculateIncrements(req, res, next) {
  try {
    const { startDate, endDate, userId } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
    }

    const whereClause = {
      ratedAt: {
        [Op.between]: [new Date(startDate), new Date(endDate)],
      }
    };

    if (userId) {
      whereClause.ratedUserId = userId;
    }

    // Get ratings
    const ratings = await db.PerformanceRating.findAll({
      where: whereClause,
      attributes: ['ratedUserId', [db.sequelize.fn('AVG', db.sequelize.col('overall')), 'averageRating']],
      group: ['ratedUserId'],
      include: [{ model: db.User, as: 'ratedUser', attributes: ['id', 'firstName', 'lastName', 'email'] }],
      raw: true,
      nest: true,
    });

    // Get active policies
    const policies = await db.PerformanceIncrementPolicy.findAll({
      where: { isActive: true },
      order: [['min_rating', 'ASC']],
    });

    const results = [];
    for (const r of ratings) {
      const avg = parseFloat(r.averageRating);
      // Find matching policy
      const policy = policies.find(p => avg >= p.minRating && avg <= p.maxRating);
      
      // Get current active salary
      const currentSalary = await db.EmployeeSalary.findOne({
        where: { userId: r.ratedUserId, isActive: true },
        order: [['createdAt', 'DESC']],
      });

      let currentBaseSalary = 0;
      let newBaseSalary = 0;
      let incrementAmount = 0;
      
      if (currentSalary) {
        currentBaseSalary = parseFloat(currentSalary.baseSalary);
      }

      if (policy && currentBaseSalary > 0) {
        incrementAmount = (currentBaseSalary * (policy.incrementPercentage / 100));
        newBaseSalary = currentBaseSalary + incrementAmount;
      }

      results.push({
        userId: r.ratedUserId,
        user: r.ratedUser,
        averageRating: avg,
        suggestedPolicy: policy || null,
        currentBaseSalary,
        currentSalaryDay: currentSalary?.salaryDay || 1,
        currency: currentSalary?.currency || 'INR',
        suggestedIncrementPercentage: policy ? policy.incrementPercentage : 0,
        suggestedIncrementAmount: incrementAmount,
        suggestedNewSalary: newBaseSalary,
      });
    }

    return successResponse(res, { message: 'Increments calculated', data: { results } });
  } catch (err) { next(err); }
}

async function applyIncrement(req, res, next) {
  try {
    const { userId, newBaseSalary, baseSalary, salaryDay, currency, effectiveFrom, notes } = req.body;
    
    const salaryToApply = newBaseSalary !== undefined ? newBaseSalary : baseSalary;

    if (!userId || salaryToApply === undefined || salaryToApply === null) {
      return res.status(400).json({ success: false, message: 'userId and newBaseSalary are required' });
    }

    // Find existing active salary config to preserve salaryDay and currency if not explicitly provided
    const existing = await db.EmployeeSalary.findOne({
      where: { userId, isActive: true, deletedAt: null },
      order: [['createdAt', 'DESC']],
    });

    const finalSalaryDay = (salaryDay !== undefined && salaryDay !== null && salaryDay !== '')
      ? parseInt(salaryDay)
      : (existing?.salaryDay || 1);

    const finalCurrency = currency || existing?.currency || 'INR';

    // We can use the existing upsertSalaryConfig function from salaryService
    const config = await salaryService.upsertSalaryConfig({
      requestingUser: req.user, 
      userId, 
      data: {
        baseSalary: salaryToApply,
        salaryDay: finalSalaryDay,
        currency: finalCurrency,
        effectiveFrom: effectiveFrom || new Date().toISOString().split('T')[0],
        notes: notes || 'Performance increment applied',
      }, 
      req
    });

    return successResponse(res, { message: 'Increment applied successfully', data: { config } });
  } catch (err) { next(err); }
}

async function getIncrementHistory(req, res, next) {
  try {
    const { page = 1, limit = 20, userId, search, startDate, endDate } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;

    const where = { deletedAt: null };
    if (userId) {
      where.userId = userId;
    }
    if (startDate && endDate) {
      where.effectiveFrom = {
        [Op.between]: [new Date(startDate), new Date(endDate)],
      };
    } else if (startDate) {
      where.effectiveFrom = { [Op.gte]: new Date(startDate) };
    } else if (endDate) {
      where.effectiveFrom = { [Op.lte]: new Date(endDate) };
    }

    const userWhere = { deletedAt: null };
    if (search) {
      userWhere[Op.or] = [
        { firstName: { [Op.like]: `%${search}%` } },
        { lastName: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
      ];
    }

    const { rows, count } = await db.EmployeeSalary.findAndCountAll({
      where,
      include: [
        {
          model: db.User,
          as: 'employee',
          attributes: ['id', 'firstName', 'lastName', 'email', 'department', 'jobTitle', 'profilePicture'],
          where: userWhere,
        },
        {
          model: db.User,
          as: 'createdBy',
          attributes: ['id', 'firstName', 'lastName', 'email'],
        },
      ],
      limit: limitNum,
      offset: (pageNum - 1) * limitNum,
      order: [['createdAt', 'DESC']],
    });

    const history = await Promise.all(
      rows.map(async (item) => {
        // Find previous salary record for the user before this record's createdAt
        const previousRecord = await db.EmployeeSalary.findOne({
          where: {
            userId: item.userId,
            createdAt: { [Op.lt]: item.createdAt },
            deletedAt: null,
          },
          order: [['createdAt', 'DESC']],
        });

        const currentSalary = parseFloat(item.baseSalary);
        const previousSalary = previousRecord ? parseFloat(previousRecord.baseSalary) : null;
        const incrementAmount = previousSalary !== null ? currentSalary - previousSalary : 0;
        const incrementPercentage =
          previousSalary !== null && previousSalary > 0
            ? parseFloat(((incrementAmount / previousSalary) * 100).toFixed(2))
            : 0;

        return {
          id: item.id,
          userId: item.userId,
          employee: item.employee,
          createdBy: item.createdBy,
          newSalary: currentSalary,
          previousSalary: previousSalary !== null ? previousSalary : currentSalary,
          incrementAmount,
          incrementPercentage,
          salaryDay: item.salaryDay,
          currency: item.currency || 'INR',
          isActive: item.isActive,
          effectiveFrom: item.effectiveFrom,
          notes: item.notes,
          createdAt: item.createdAt,
          isInitial: previousRecord === null,
        };
      })
    );

    return paginatedResponse(res, {
      data: history,
      total: count,
      page: pageNum,
      limit: limitNum,
      message: 'Increment history fetched successfully',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createPolicy,
  listPolicies,
  updatePolicy,
  deletePolicy,
  calculateIncrements,
  applyIncrement,
  getIncrementHistory,
};
