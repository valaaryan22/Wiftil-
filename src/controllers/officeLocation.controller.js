'use strict';

const officeLocationService = require('../services/officeLocation.service');
const { successResponse } = require('../utils/response');

async function getLocations(req, res, next) {
  try {
    const locations = await officeLocationService.getAllLocations();
    return successResponse(res, {
      message: 'Office locations fetched',
      data: locations,
    });
  } catch (err) { next(err); }
}

async function getActiveLocations(req, res, next) {
  try {
    const locations = await officeLocationService.getActiveLocations();
    return successResponse(res, {
      message: 'Active office locations fetched',
      data: locations,
    });
  } catch (err) { next(err); }
}

async function getGeofenceStatus(req, res, next) {
  try {
    const status = await officeLocationService.getGeofenceStatus();
    return successResponse(res, {
      message: 'Geofence status fetched',
      data: status,
    });
  } catch (err) { next(err); }
}

async function createLocation(req, res, next) {
  try {
    const location = await officeLocationService.createLocation({
      data: req.body,
      requestingUser: req.user,
    });
    return successResponse(res, {
      statusCode: 201,
      message: 'Office location created successfully',
      data: location,
    });
  } catch (err) { next(err); }
}

async function updateLocation(req, res, next) {
  try {
    const location = await officeLocationService.updateLocation({
      id: req.params.id,
      data: req.body,
      requestingUser: req.user,
    });
    return successResponse(res, {
      message: 'Office location updated successfully',
      data: location,
    });
  } catch (err) { next(err); }
}

async function deleteLocation(req, res, next) {
  try {
    const result = await officeLocationService.deleteLocation({
      id: req.params.id,
      requestingUser: req.user,
    });
    return successResponse(res, {
      message: 'Office location deleted successfully',
      data: result,
    });
  } catch (err) { next(err); }
}

async function verifyLiveLocation(req, res, next) {
  try {
    const { latitude, longitude } = req.body;
    const result = await officeLocationService.verifyLocation({ latitude, longitude });
    return successResponse(res, {
      message: result.message,
      data: result,
    });
  } catch (err) { next(err); }
}

module.exports = {
  getLocations,
  getActiveLocations,
  getGeofenceStatus,
  createLocation,
  updateLocation,
  deleteLocation,
  verifyLiveLocation,
};
