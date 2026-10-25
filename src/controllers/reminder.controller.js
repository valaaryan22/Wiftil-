'use strict';

const reminderService = require('../services/reminder.service');
const { successResponse, paginatedResponse } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

async function getReminders(req, res, next) {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      priority,
      search,
      dateFrom,
      dateTo,
    } = req.query;

    const userLevel = req.user?.role?.accessLevel || 5;

    const result = await reminderService.getReminders({
      userId: req.user.id,
      userLevel,
      status,
      priority,
      search,
      dateFrom,
      dateTo,
      page,
      limit,
    });

    return paginatedResponse(res, {
      message: 'Reminders retrieved successfully',
      data: result.reminders,
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  } catch (err) {
    next(err);
  }
}

async function getReminderById(req, res, next) {
  try {
    const userLevel = req.user?.role?.accessLevel || 5;
    const reminder = await reminderService.getReminderById(req.params.id, req.user.id, userLevel);
    return successResponse(res, {
      message: 'Reminder fetched successfully',
      data: reminder,
    });
  } catch (err) {
    next(err);
  }
}

async function createReminder(req, res, next) {
  try {
    const reminder = await reminderService.createReminder(req.body, req.user.id);
    return successResponse(res, {
      status: HTTP_STATUS.CREATED,
      message: 'Reminder created successfully',
      data: reminder,
    });
  } catch (err) {
    next(err);
  }
}

async function updateReminder(req, res, next) {
  try {
    const userLevel = req.user?.role?.accessLevel || 5;
    const reminder = await reminderService.updateReminder(req.params.id, req.body, req.user.id, userLevel);
    return successResponse(res, {
      message: 'Reminder updated successfully',
      data: reminder,
    });
  } catch (err) {
    next(err);
  }
}

async function updateReminderStatus(req, res, next) {
  try {
    const userLevel = req.user?.role?.accessLevel || 5;
    const { status } = req.body;
    const reminder = await reminderService.updateReminderStatus(req.params.id, status, req.user.id, userLevel);
    return successResponse(res, {
      message: `Reminder marked as ${status.toLowerCase()}`,
      data: reminder,
    });
  } catch (err) {
    next(err);
  }
}

async function deleteReminder(req, res, next) {
  try {
    const userLevel = req.user?.role?.accessLevel || 5;
    const result = await reminderService.deleteReminder(req.params.id, req.user.id, userLevel);
    return successResponse(res, {
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
}

async function getRemindersSummary(req, res, next) {
  try {
    const userLevel = req.user?.role?.accessLevel || 5;
    const summary = await reminderService.getRemindersSummary(req.user.id, userLevel);
    return successResponse(res, {
      message: 'Reminders summary fetched successfully',
      data: summary,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getReminders,
  getReminderById,
  createReminder,
  updateReminder,
  updateReminderStatus,
  deleteReminder,
  getRemindersSummary,
};
