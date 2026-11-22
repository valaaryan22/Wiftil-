'use strict';

const clientService = require('../services/client.service');
const { successResponse } = require('../utils/response');
const { uploadImage } = require('../utils/cloudinary');
const fs = require('fs');

async function createClient(req, res, next) {
  try {
    let logoUrl = null;
    if (req.file) {
      logoUrl = await uploadImage(req.file.path, 'wiftil_clients');
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Failed to delete temp file:', err);
      });
    }

    const clientData = { ...req.body };
    if (logoUrl) {
      clientData.logo = logoUrl;
    }

    const client = await clientService.createClient({
      requestingUser: req.user,
      data: clientData,
      req,
    });
    return successResponse(res, { statusCode: 201, message: 'Client created successfully', data: client });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  }
}

async function getClients(req, res, next) {
  try {
    const { page, limit, search } = req.query;
    const result = await clientService.getClients({
      requestingUser: req.user,
      page,
      limit,
      search,
    });
    return successResponse(res, { data: result.clients, meta: { total: result.total, page, limit } });
  } catch (error) {
    next(error);
  }
}

async function getClientById(req, res, next) {
  try {
    const client = await clientService.getClientById({ id: req.params.id, requestingUser: req.user });
    return successResponse(res, { data: client });
  } catch (error) {
    next(error);
  }
}

async function updateClient(req, res, next) {
  try {
    let logoUrl = null;
    if (req.file) {
      logoUrl = await uploadImage(req.file.path, 'wiftil_clients');
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Failed to delete temp file:', err);
      });
    }

    const clientData = { ...req.body };
    if (logoUrl) {
      clientData.logo = logoUrl;
    }

    const client = await clientService.updateClient({
      requestingUser: req.user,
      id: req.params.id,
      data: clientData,
      req,
    });
    return successResponse(res, { message: 'Client updated successfully', data: client });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  }
}

async function deleteClient(req, res, next) {
  try {
    await clientService.deleteClient({ requestingUser: req.user, id: req.params.id, req });
    return successResponse(res, { message: 'Client deleted successfully' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createClient,
  getClients,
  getClientById,
  updateClient,
  deleteClient,
};
