'use strict';

const svc = require('../services/clientDocument.service');
const { successResponse } = require('../utils/response');

const createDocument = async (req, res, next) => {
  try {
    const doc = await svc.createDocument({
      requestingUser: req.user,
      clientId: req.params.clientId,
      data: req.body,
      req,
    });
    successResponse(res, { statusCode: 201, message: 'Document added', data: { document: doc } });
  } catch (e) { next(e); }
};

const getDocuments = async (req, res, next) => {
  try {
    const result = await svc.getDocuments({
      requestingUser: req.user,
      clientId: req.params.clientId,
      ...req.query,
    });
    successResponse(res, { data: result });
  } catch (e) { next(e); }
};

const getDocumentById = async (req, res, next) => {
  try {
    const doc = await svc.getDocumentById({
      clientId: req.params.clientId,
      docId: req.params.docId,
    });
    successResponse(res, { data: { document: doc } });
  } catch (e) { next(e); }
};

const updateDocument = async (req, res, next) => {
  try {
    const doc = await svc.updateDocument({
      requestingUser: req.user,
      clientId: req.params.clientId,
      docId: req.params.docId,
      data: req.body,
      req,
    });
    successResponse(res, { message: 'Document updated', data: { document: doc } });
  } catch (e) { next(e); }
};

const deleteDocument = async (req, res, next) => {
  try {
    await svc.deleteDocument({
      requestingUser: req.user,
      clientId: req.params.clientId,
      docId: req.params.docId,
      req,
    });
    successResponse(res, { message: 'Document deleted' });
  } catch (e) { next(e); }
};

module.exports = {
  createDocument,
  getDocuments,
  getDocumentById,
  updateDocument,
  deleteDocument,
};
