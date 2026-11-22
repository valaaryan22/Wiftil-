'use strict';

const holidayService = require('../services/holiday.service');
const { successResponse, paginatedResponse } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

async function getHolidays(req, res, next) {
  try {
    const {
      year,
      type,
      status,
      search,
      dateFrom,
      dateTo,
      page = 1,
      limit = 100,
    } = req.query;

    const result = await holidayService.getHolidays({
      year,
      type,
      status,
      search,
      dateFrom,
      dateTo,
      page,
      limit,
    });

    return paginatedResponse(res, {
      message: 'Holidays retrieved successfully',
      data: result.data,
      total: result.pagination.total,
      page: result.pagination.page,
      limit: result.pagination.limit,
    });
  } catch (err) {
    next(err);
  }
}

async function getHolidayById(req, res, next) {
  try {
    const holiday = await holidayService.getHolidayById(req.params.id);
    return successResponse(res, {
      message: 'Holiday retrieved successfully',
      data: holiday,
    });
  } catch (err) {
    next(err);
  }
}

async function createHoliday(req, res, next) {
  try {
    const holiday = await holidayService.createHoliday(req.body, req.user?.id);
    return successResponse(
      res,
      {
        message: 'Holiday configured successfully',
        data: holiday,
      },
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    next(err);
  }
}

async function updateHoliday(req, res, next) {
  try {
    const holiday = await holidayService.updateHoliday(req.params.id, req.body, req.user?.id);
    return successResponse(res, {
      message: 'Holiday updated successfully',
      data: holiday,
    });
  } catch (err) {
    next(err);
  }
}

async function deleteHoliday(req, res, next) {
  try {
    const result = await holidayService.deleteHoliday(req.params.id, req.user?.id);
    return successResponse(res, {
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
}

async function seedStandardHolidays(req, res, next) {
  try {
    const year = req.body.year || req.query.year || new Date().getFullYear();
    const result = await holidayService.seedStandardHolidays(year, req.user?.id);
    return successResponse(res, {
      message: `Standard holidays populated for ${result.year}. Created: ${result.createdCount}, Skipped: ${result.skippedCount}`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

async function getHolidaysSummary(req, res, next) {
  try {
    const year = req.query.year || new Date().getFullYear();
    const summary = await holidayService.getHolidaysSummary(year);
    return successResponse(res, {
      message: 'Holiday summary retrieved successfully',
      data: summary,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getHolidays,
  getHolidayById,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  seedStandardHolidays,
  getHolidaysSummary,
};
