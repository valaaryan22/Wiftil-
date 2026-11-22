'use strict';

const svc = require('../services/clientPayment.service');
const { successResponse } = require('../utils/response');

// ── Invoice CRUD ──────────────────────────────────────────────────────────────

const createInvoice = async (req, res, next) => {
  try {
    const data = await svc.createInvoice({
      requestingUser: req.user,
      clientId: req.params.clientId,
      data: req.body,
      req,
    });
    successResponse(res, { statusCode: 201, message: 'Invoice created', data: { payment: data } });
  } catch (e) { next(e); }
};

const getPayments = async (req, res, next) => {
  try {
    const result = await svc.getPayments({
      clientId: req.params.clientId,
      ...req.query,
    });
    successResponse(res, { data: result });
  } catch (e) { next(e); }
};

const getPaymentById = async (req, res, next) => {
  try {
    const data = await svc.getPaymentById({
      clientId: req.params.clientId,
      paymentId: req.params.paymentId,
    });
    successResponse(res, { data: { payment: data } });
  } catch (e) { next(e); }
};

const updatePayment = async (req, res, next) => {
  try {
    const data = await svc.updatePayment({
      requestingUser: req.user,
      clientId: req.params.clientId,
      paymentId: req.params.paymentId,
      data: req.body,
      req,
    });
    successResponse(res, { message: 'Payment record updated', data: { payment: data } });
  } catch (e) { next(e); }
};

const deletePayment = async (req, res, next) => {
  try {
    await svc.deletePayment({
      requestingUser: req.user,
      clientId: req.params.clientId,
      paymentId: req.params.paymentId,
      req,
    });
    successResponse(res, { message: 'Payment record deleted' });
  } catch (e) { next(e); }
};

// ── Payment recording ─────────────────────────────────────────────────────────

const recordPayment = async (req, res, next) => {
  try {
    const data = await svc.recordPayment({
      requestingUser: req.user,
      clientId: req.params.clientId,
      data: req.body,
      req,
    });
    successResponse(res, { statusCode: 201, message: 'Payment recorded', data: { payment: data } });
  } catch (e) { next(e); }
};

const recordAdvance = async (req, res, next) => {
  try {
    const data = await svc.recordAdvance({
      requestingUser: req.user,
      clientId: req.params.clientId,
      data: req.body,
      req,
    });
    successResponse(res, { statusCode: 201, message: 'Advance recorded', data: { payment: data } });
  } catch (e) { next(e); }
};

const issueCreditNote = async (req, res, next) => {
  try {
    const data = await svc.issueCreditNote({
      requestingUser: req.user,
      clientId: req.params.clientId,
      data: req.body,
      req,
    });
    successResponse(res, { statusCode: 201, message: 'Credit note issued', data: { payment: data } });
  } catch (e) { next(e); }
};

// ── Workflow actions ──────────────────────────────────────────────────────────

const markInvoiceSent = async (req, res, next) => {
  try {
    const data = await svc.markInvoiceSent({
      requestingUser: req.user,
      clientId: req.params.clientId,
      paymentId: req.params.paymentId,
      req,
    });
    successResponse(res, { message: 'Invoice marked as SENT', data: { payment: data } });
  } catch (e) { next(e); }
};

const markInvoiceOverdue = async (req, res, next) => {
  try {
    const data = await svc.markInvoiceOverdue({
      requestingUser: req.user,
      clientId: req.params.clientId,
      paymentId: req.params.paymentId,
      req,
    });
    successResponse(res, { message: 'Invoice marked as OVERDUE', data: { payment: data } });
  } catch (e) { next(e); }
};

const raiseDispute = async (req, res, next) => {
  try {
    const data = await svc.raiseDispute({
      requestingUser: req.user,
      clientId: req.params.clientId,
      paymentId: req.params.paymentId,
      data: req.body,
      req,
    });
    successResponse(res, { message: 'Dispute raised', data: { payment: data } });
  } catch (e) { next(e); }
};

const resolveDispute = async (req, res, next) => {
  try {
    const data = await svc.resolveDispute({
      requestingUser: req.user,
      clientId: req.params.clientId,
      paymentId: req.params.paymentId,
      req,
    });
    successResponse(res, { message: 'Dispute resolved', data: { payment: data } });
  } catch (e) { next(e); }
};

const approvePayment = async (req, res, next) => {
  try {
    const data = await svc.approvePayment({
      requestingUser: req.user,
      clientId: req.params.clientId,
      paymentId: req.params.paymentId,
      req,
    });
    successResponse(res, { message: 'Payment approved', data: { payment: data } });
  } catch (e) { next(e); }
};

const cancelInvoice = async (req, res, next) => {
  try {
    const data = await svc.cancelInvoice({
      requestingUser: req.user,
      clientId: req.params.clientId,
      paymentId: req.params.paymentId,
      req,
    });
    successResponse(res, { message: 'Invoice cancelled', data: { payment: data } });
  } catch (e) { next(e); }
};

const writeOffInvoice = async (req, res, next) => {
  try {
    const data = await svc.writeOffInvoice({
      requestingUser: req.user,
      clientId: req.params.clientId,
      paymentId: req.params.paymentId,
      req,
    });
    successResponse(res, { message: 'Invoice written off', data: { payment: data } });
  } catch (e) { next(e); }
};

const logFollowUp = async (req, res, next) => {
  try {
    const data = await svc.logFollowUp({
      requestingUser: req.user,
      clientId: req.params.clientId,
      paymentId: req.params.paymentId,
      data: req.body,
      req,
    });
    successResponse(res, { message: 'Follow-up logged', data: { payment: data } });
  } catch (e) { next(e); }
};

// ── Summary ───────────────────────────────────────────────────────────────────

const getPaymentSummary = async (req, res, next) => {
  try {
    const data = await svc.getPaymentSummary({ clientId: req.params.clientId });
    successResponse(res, { data: { summary: data } });
  } catch (e) { next(e); }
};

module.exports = {
  createInvoice,
  getPayments,
  getPaymentById,
  updatePayment,
  deletePayment,
  recordPayment,
  recordAdvance,
  issueCreditNote,
  markInvoiceSent,
  markInvoiceOverdue,
  raiseDispute,
  resolveDispute,
  approvePayment,
  cancelInvoice,
  writeOffInvoice,
  logFollowUp,
  getPaymentSummary,
  // Invoice approval flow
  submitInvoiceForReview: async (req, res, next) => {
    try {
      const data = await svc.submitInvoiceForReview({
        requestingUser: req.user,
        clientId: req.params.clientId,
        paymentId: req.params.paymentId,
        req,
      });
      successResponse(res, { message: 'Invoice submitted for review', data: { payment: data } });
    } catch (e) { next(e); }
  },
  approveInvoice: async (req, res, next) => {
    try {
      const data = await svc.approveInvoice({
        requestingUser: req.user,
        clientId: req.params.clientId,
        paymentId: req.params.paymentId,
        req,
      });
      successResponse(res, { message: 'Invoice approved', data: { payment: data } });
    } catch (e) { next(e); }
  },
  rejectInvoice: async (req, res, next) => {
    try {
      const data = await svc.rejectInvoice({
        requestingUser: req.user,
        clientId: req.params.clientId,
        paymentId: req.params.paymentId,
        data: req.body,
        req,
      });
      successResponse(res, { message: 'Invoice rejected back to Draft', data: { payment: data } });
    } catch (e) { next(e); }
  },
};
