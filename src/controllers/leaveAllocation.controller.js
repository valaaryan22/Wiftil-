'use strict';

const leaveAllocationService = require('../services/leaveAllocation.service');
const { HTTP_STATUS } = require('../constants');

const upsertAllocation = async (req, res, next) => {
  try {
    const { userId, year, annualDays, sickDays, unpaidDays, emergencyDays, maternityDays, paternityDays, note } = req.body;
    const allocation = await leaveAllocationService.upsertAllocation({
      requestingUser: req.user,
      userId, year, annualDays, sickDays, unpaidDays, emergencyDays, maternityDays, paternityDays, note,
    });
    res.status(HTTP_STATUS.OK).json({ success: true, message: 'Leave allocation saved', data: allocation });
  } catch (err) { next(err); }
};

const getAllocations = async (req, res, next) => {
  try {
    const { year, userId, page, limit } = req.query;
    const result = await leaveAllocationService.getAllocations({
      requestingUser: req.user,
      year, userId, page, limit,
    });
    res.status(HTTP_STATUS.OK).json({ success: true, message: 'Allocations fetched', data: result.allocations, meta: { total: result.total } });
  } catch (err) { next(err); }
};

const getMyBalance = async (req, res, next) => {
  try {
    const { year } = req.query;
    const result = await leaveAllocationService.getEmployeeBalance({
      requestingUser: req.user,
      userId: req.user.id,
      year,
    });
    res.status(HTTP_STATUS.OK).json({ success: true, message: 'Leave balance fetched', data: result });
  } catch (err) { next(err); }
};

const getEmployeeBalance = async (req, res, next) => {
  try {
    const { year } = req.query;
    const result = await leaveAllocationService.getEmployeeBalance({
      requestingUser: req.user,
      userId: req.params.userId,
      year,
    });
    res.status(HTTP_STATUS.OK).json({ success: true, message: 'Employee leave balance fetched', data: result });
  } catch (err) { next(err); }
};

const deleteAllocation = async (req, res, next) => {
  try {
    await leaveAllocationService.deleteAllocation({ requestingUser: req.user, id: req.params.id });
    res.status(HTTP_STATUS.OK).json({ success: true, message: 'Allocation deleted' });
  } catch (err) { next(err); }
};

module.exports = { upsertAllocation, getAllocations, getMyBalance, getEmployeeBalance, deleteAllocation };
