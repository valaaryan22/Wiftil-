'use strict';

const { db } = require('../database/client');
const { HTTP_STATUS } = require('../constants');

/**
 * Calculates Great-Circle distance between two coordinates in meters using the Haversine formula
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's mean radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const phi1 = toRad(Number(lat1));
  const phi2 = toRad(Number(lat2));
  const deltaPhi = toRad(Number(lat2) - Number(lat1));
  const deltaLambda = toRad(Number(lon2) - Number(lon1));

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10; // meters (1 decimal place)
}

/**
 * Verifies whether given coordinates are within the allowed radius of any active office location
 */
async function verifyLocation({ latitude, longitude }) {
  const activeOffices = await db.OfficeLocation.findAll({
    where: { isActive: true },
    order: [['is_default', 'DESC'], ['created_at', 'ASC']],
  });

  // If no office location has been configured, geofence check is bypassed
  if (!activeOffices || activeOffices.length === 0) {
    return {
      verified: true,
      isGeofenceActive: false,
      office: null,
      distance: null,
      message: 'Geofencing is not active (no office location configured)',
    };
  }

  // If user provided no coordinates
  if (latitude === undefined || latitude === null || longitude === undefined || longitude === null) {
    return {
      verified: false,
      isGeofenceActive: true,
      reason: 'COORDINATES_MISSING',
      message: 'Live location coordinates are required to verify attendance. Please enable location permission in your browser.',
    };
  }

  const userLat = parseFloat(latitude);
  const userLon = parseFloat(longitude);

  if (isNaN(userLat) || isNaN(userLon)) {
    return {
      verified: false,
      isGeofenceActive: true,
      reason: 'INVALID_COORDINATES',
      message: 'Invalid location coordinates received.',
    };
  }

  let closestOffice = null;
  let minDistance = Infinity;

  for (const office of activeOffices) {
    const dist = calculateDistance(userLat, userLon, office.latitude, office.longitude);
    if (dist < minDistance) {
      minDistance = dist;
      closestOffice = office;
    }
  }

  const allowedRadius = closestOffice ? (closestOffice.radius || 50) : 50;

  if (minDistance <= allowedRadius) {
    return {
      verified: true,
      isGeofenceActive: true,
      office: closestOffice,
      distance: minDistance,
      allowedRadius,
      message: `Verified: You are ${minDistance}m from ${closestOffice.name} (allowed: ${allowedRadius}m)`,
    };
  }

  return {
    verified: false,
    isGeofenceActive: true,
    reason: 'OUT_OF_BOUNDS',
    office: closestOffice,
    distance: minDistance,
    allowedRadius,
    message: `Location check failed: You are ${Math.round(minDistance)}m away from "${closestOffice.name}". Punch in/out is only permitted within ${allowedRadius}m of the office.`,
  };
}

async function getAllLocations() {
  return db.OfficeLocation.findAll({
    include: [
      {
        model: db.User,
        as: 'createdBy',
        attributes: ['id', 'firstName', 'lastName', 'email'],
      },
    ],
    order: [
      ['is_default', 'DESC'],
      ['created_at', 'DESC'],
    ],
  });
}

async function getActiveLocations() {
  return db.OfficeLocation.findAll({
    where: { isActive: true },
    order: [
      ['is_default', 'DESC'],
      ['created_at', 'ASC'],
    ],
  });
}

async function getGeofenceStatus() {
  const activeCount = await db.OfficeLocation.count({ where: { isActive: true } });
  const totalCount = await db.OfficeLocation.count();
  const defaultOffice = await db.OfficeLocation.findOne({
    where: { isActive: true },
    order: [['is_default', 'DESC'], ['created_at', 'ASC']],
  });

  return {
    isGeofenceActive: activeCount > 0,
    activeOfficesCount: activeCount,
    totalOfficesCount: totalCount,
    defaultOffice: defaultOffice ? {
      id: defaultOffice.id,
      name: defaultOffice.name,
      address: defaultOffice.address,
      latitude: defaultOffice.latitude,
      longitude: defaultOffice.longitude,
      radius: defaultOffice.radius,
    } : null,
  };
}

async function createLocation({ data, requestingUser }) {
  const { name, address, latitude, longitude, radius = 50, isActive = true, isDefault = false } = data;

  if (!name || !name.trim()) {
    const err = new Error('Location name is required');
    err.statusCode = HTTP_STATUS.BAD_REQUEST;
    throw err;
  }

  if (latitude === undefined || latitude === null || longitude === undefined || longitude === null) {
    const err = new Error('Latitude and Longitude coordinates are required');
    err.statusCode = HTTP_STATUS.BAD_REQUEST;
    throw err;
  }

  const latNum = parseFloat(latitude);
  const lonNum = parseFloat(longitude);
  const radNum = parseInt(radius, 10) || 50;

  if (isNaN(latNum) || latNum < -90 || latNum > 90) {
    const err = new Error('Invalid latitude (must be between -90 and 90)');
    err.statusCode = HTTP_STATUS.BAD_REQUEST;
    throw err;
  }

  if (isNaN(lonNum) || lonNum < -180 || lonNum > 180) {
    const err = new Error('Invalid longitude (must be between -180 and 180)');
    err.statusCode = HTTP_STATUS.BAD_REQUEST;
    throw err;
  }

  // If this office is set as default, unset other defaults
  if (isDefault) {
    await db.OfficeLocation.update({ isDefault: false }, { where: { isDefault: true } });
  }

  // If this is the first office being created, make it default automatically
  const count = await db.OfficeLocation.count();
  const shouldBeDefault = isDefault || count === 0;

  return db.OfficeLocation.create({
    name: name.trim(),
    address: address ? address.trim() : null,
    latitude: latNum,
    longitude: lonNum,
    radius: Math.max(10, radNum),
    isActive: Boolean(isActive),
    isDefault: shouldBeDefault,
    createdById: requestingUser?.id || null,
  });
}

async function updateLocation({ id, data, requestingUser }) {
  const office = await db.OfficeLocation.findByPk(id);
  if (!office) {
    const err = new Error('Office location not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  const updateFields = {};
  if (data.name !== undefined) updateFields.name = data.name.trim();
  if (data.address !== undefined) updateFields.address = data.address ? data.address.trim() : null;
  if (data.latitude !== undefined) {
    const lat = parseFloat(data.latitude);
    if (isNaN(lat) || lat < -90 || lat > 90) throw new Error('Invalid latitude');
    updateFields.latitude = lat;
  }
  if (data.longitude !== undefined) {
    const lon = parseFloat(data.longitude);
    if (isNaN(lon) || lon < -180 || lon > 180) throw new Error('Invalid longitude');
    updateFields.longitude = lon;
  }
  if (data.radius !== undefined) {
    updateFields.radius = Math.max(10, parseInt(data.radius, 10) || 50);
  }
  if (data.isActive !== undefined) updateFields.isActive = Boolean(data.isActive);

  if (data.isDefault) {
    await db.OfficeLocation.update({ isDefault: false }, { where: { isDefault: true } });
    updateFields.isDefault = true;
  }

  await office.update(updateFields);
  return office;
}

async function deleteLocation({ id }) {
  const office = await db.OfficeLocation.findByPk(id);
  if (!office) {
    const err = new Error('Office location not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }
  await office.destroy();
  return { id, message: 'Office location deleted' };
}

module.exports = {
  calculateDistance,
  verifyLocation,
  getAllLocations,
  getActiveLocations,
  getGeofenceStatus,
  createLocation,
  updateLocation,
  deleteLocation,
};
