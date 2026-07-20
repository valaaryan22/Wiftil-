'use strict';

const packageService = require('../services/package.service');
const { successResponse } = require('../utils/response');

// ─── Client Packages ──────────────────────────────────────────────────────────

async function createPackage(req, res, next) {
  try {
    const pkg = await packageService.createPackage({
      requestingUser: req.user,
      clientId: req.params.clientId,
      data: req.body,
      req,
    });
    return successResponse(res, { statusCode: 201, message: 'Package created', data: pkg });
  } catch (e) { next(e); }
}

async function getPackagesByClient(req, res, next) {
  try {
    const packages = await packageService.getPackagesByClient({
      clientId: req.params.clientId,
      requestingUser: req.user,
    });
    return successResponse(res, { data: packages });
  } catch (e) { next(e); }
}

async function getPackageById(req, res, next) {
  try {
    const pkg = await packageService.getPackageById({ packageId: req.params.packageId });
    return successResponse(res, { data: pkg });
  } catch (e) { next(e); }
}

async function updatePackage(req, res, next) {
  try {
    const pkg = await packageService.updatePackage({
      requestingUser: req.user,
      packageId: req.params.packageId,
      data: req.body,
      req,
    });
    return successResponse(res, { message: 'Package updated', data: pkg });
  } catch (e) { next(e); }
}

async function deletePackage(req, res, next) {
  try {
    await packageService.deletePackage({ requestingUser: req.user, packageId: req.params.packageId, req });
    return successResponse(res, { message: 'Package cancelled' });
  } catch (e) { next(e); }
}

// ─── Package Services ─────────────────────────────────────────────────────────

async function addServiceToPackage(req, res, next) {
  try {
    const ps = await packageService.addServiceToPackage({
      requestingUser: req.user,
      packageId: req.params.packageId,
      data: req.body,
      req,
    });
    return successResponse(res, { statusCode: 201, message: 'Service added to package', data: ps });
  } catch (e) { next(e); }
}

async function updatePackageService(req, res, next) {
  try {
    const ps = await packageService.updatePackageService({
      requestingUser: req.user,
      packageServiceId: req.params.serviceEntryId,
      data: req.body,
      req,
    });
    return successResponse(res, { message: 'Package service updated', data: ps });
  } catch (e) { next(e); }
}

async function removeServiceFromPackage(req, res, next) {
  try {
    await packageService.removeServiceFromPackage({
      requestingUser: req.user,
      packageServiceId: req.params.serviceEntryId,
      req,
    });
    return successResponse(res, { message: 'Service removed from package' });
  } catch (e) { next(e); }
}

// ─── Add-ons ──────────────────────────────────────────────────────────────────

async function requestAddOn(req, res, next) {
  try {
    const addOn = await packageService.requestAddOn({
      requestingUser: req.user,
      packageId: req.params.packageId,
      data: req.body,
      req,
    });
    return successResponse(res, { statusCode: 201, message: 'Add-on requested', data: addOn });
  } catch (e) { next(e); }
}

async function approveAddOn(req, res, next) {
  try {
    const { approve, rejectionReason } = req.body;
    const addOn = await packageService.approveAddOn({
      requestingUser: req.user,
      addOnId: req.params.addOnId,
      approve: approve === true || approve === 'true',
      rejectionReason,
      req,
    });
    return successResponse(res, { message: `Add-on ${addOn.status.toLowerCase()}`, data: addOn });
  } catch (e) { next(e); }
}

async function updateAddOnStatus(req, res, next) {
  try {
    const addOn = await packageService.updateAddOnStatus({
      requestingUser: req.user,
      addOnId: req.params.addOnId,
      status: req.body.status,
      req,
    });
    return successResponse(res, { message: `Add-on marked as ${addOn.status}`, data: addOn });
  } catch (e) { next(e); }
}

module.exports = {
  createPackage,
  getPackagesByClient,
  getPackageById,
  updatePackage,
  deletePackage,
  addServiceToPackage,
  updatePackageService,
  removeServiceFromPackage,
  requestAddOn,
  approveAddOn,
  updateAddOnStatus,
};
