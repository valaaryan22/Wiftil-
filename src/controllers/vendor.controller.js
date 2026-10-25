'use strict';

const vendorService = require('../services/vendor.service');
const { successResponse, paginatedResponse } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

// ── Vendor Profiles ──────────────────────────────────────────────────────────

async function getVendors(req, res, next) {
  try {
    const { page = 1, limit = 20, search, type, status, sortBy, sortOrder } = req.query;
    const { vendors, total } = await vendorService.getVendors({
      page,
      limit,
      search,
      type,
      status,
      sortBy,
      sortOrder,
    });
    return paginatedResponse(res, {
      message: 'Vendors fetched successfully',
      data: vendors,
      total,
      page,
      limit,
    });
  } catch (err) {
    next(err);
  }
}

async function getVendorStats(req, res, next) {
  try {
    const stats = await vendorService.getVendorStats();
    return successResponse(res, {
      message: 'Vendor hub statistics fetched successfully',
      data: stats,
    });
  } catch (err) {
    next(err);
  }
}

async function getVendorById(req, res, next) {
  try {
    const vendor = await vendorService.getVendorById(req.params.id);
    return successResponse(res, {
      message: 'Vendor profile fetched successfully',
      data: vendor,
    });
  } catch (err) {
    next(err);
  }
}

async function createVendor(req, res, next) {
  try {
    const vendor = await vendorService.createVendor(req.body, req.user);
    return successResponse(res, {
      statusCode: HTTP_STATUS.CREATED,
      message: 'Vendor profile created successfully',
      data: vendor,
    });
  } catch (err) {
    next(err);
  }
}

async function updateVendor(req, res, next) {
  try {
    const vendor = await vendorService.updateVendor(req.params.id, req.body, req.user);
    return successResponse(res, {
      message: 'Vendor profile updated successfully',
      data: vendor,
    });
  } catch (err) {
    next(err);
  }
}

async function deleteVendor(req, res, next) {
  try {
    const result = await vendorService.deleteVendor(req.params.id, req.user);
    return successResponse(res, {
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
}

// ── Rate Cards ───────────────────────────────────────────────────────────────

async function getRateCards(req, res, next) {
  try {
    const { vendorId, category, pricingModel, search } = req.query;
    const rateCards = await vendorService.getRateCards({
      vendorId: vendorId || req.params.id,
      category,
      pricingModel,
      search,
    });
    return successResponse(res, {
      message: 'Rate cards fetched successfully',
      data: rateCards,
    });
  } catch (err) {
    next(err);
  }
}

async function createRateCard(req, res, next) {
  try {
    const vendorId = req.params.id;
    const rateCard = await vendorService.createRateCard(vendorId, req.body, req.user);
    return successResponse(res, {
      statusCode: HTTP_STATUS.CREATED,
      message: 'Rate card created successfully',
      data: rateCard,
    });
  } catch (err) {
    next(err);
  }
}

async function updateRateCard(req, res, next) {
  try {
    const rateCard = await vendorService.updateRateCard(req.params.rateCardId, req.body, req.user);
    return successResponse(res, {
      message: 'Rate card updated successfully',
      data: rateCard,
    });
  } catch (err) {
    next(err);
  }
}

async function deleteRateCard(req, res, next) {
  try {
    const result = await vendorService.deleteRateCard(req.params.rateCardId, req.user);
    return successResponse(res, {
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
}

// ── Performance Records ──────────────────────────────────────────────────────

async function getPerformanceRecords(req, res, next) {
  try {
    const { vendorId, deliveryTimeline, costAdherence } = req.query;
    const records = await vendorService.getPerformanceRecords({
      vendorId: vendorId || req.params.id,
      deliveryTimeline,
      costAdherence,
    });
    return successResponse(res, {
      message: 'Performance records fetched successfully',
      data: records,
    });
  } catch (err) {
    next(err);
  }
}

async function createPerformanceRecord(req, res, next) {
  try {
    const vendorId = req.params.id;
    const record = await vendorService.createPerformanceRecord(vendorId, req.body, req.user);
    return successResponse(res, {
      statusCode: HTTP_STATUS.CREATED,
      message: 'Performance evaluation recorded successfully',
      data: record,
    });
  } catch (err) {
    next(err);
  }
}

async function deletePerformanceRecord(req, res, next) {
  try {
    const result = await vendorService.deletePerformanceRecord(req.params.recordId, req.user);
    return successResponse(res, {
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getVendors,
  getVendorStats,
  getVendorById,
  createVendor,
  updateVendor,
  deleteVendor,
  getRateCards,
  createRateCard,
  updateRateCard,
  deleteRateCard,
  getPerformanceRecords,
  createPerformanceRecord,
  deletePerformanceRecord,
};
