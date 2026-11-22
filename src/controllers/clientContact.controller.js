'use strict';

const contactService = require('../services/clientContact.service');
const { successResponse } = require('../utils/response');

async function createContact(req, res, next) {
  try {
    const contact = await contactService.createContact({
      requestingUser: req.user,
      clientId: req.params.clientId,
      data: req.body,
      req,
    });
    return successResponse(res, { statusCode: 201, message: 'Contact added successfully', data: contact });
  } catch (error) {
    next(error);
  }
}

async function getContacts(req, res, next) {
  try {
    const { page, limit, search, stakeholderType } = req.query;
    const result = await contactService.getContacts({
      requestingUser: req.user,
      clientId: req.params.clientId,
      page, limit, search, stakeholderType,
    });
    return successResponse(res, {
      data: result.contacts,
      meta: { total: result.total, page, limit },
    });
  } catch (error) {
    next(error);
  }
}

async function getContactById(req, res, next) {
  try {
    const contact = await contactService.getContactById({
      clientId: req.params.clientId,
      contactId: req.params.contactId,
    });
    return successResponse(res, { data: contact });
  } catch (error) {
    next(error);
  }
}

async function updateContact(req, res, next) {
  try {
    const contact = await contactService.updateContact({
      requestingUser: req.user,
      clientId: req.params.clientId,
      contactId: req.params.contactId,
      data: req.body,
      req,
    });
    return successResponse(res, { message: 'Contact updated successfully', data: contact });
  } catch (error) {
    next(error);
  }
}

async function deleteContact(req, res, next) {
  try {
    await contactService.deleteContact({
      requestingUser: req.user,
      clientId: req.params.clientId,
      contactId: req.params.contactId,
      req,
    });
    return successResponse(res, { message: 'Contact deleted successfully' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createContact,
  getContacts,
  getContactById,
  updateContact,
  deleteContact,
};
