'use strict';

const svc = require('../services/finance.service');
const { successResponse } = require('../utils/response');

const getFinanceDashboard = async (req, res, next) => {
  try {
    const data = await svc.getFinanceDashboard();
    successResponse(res, { data: { dashboard: data } });
  } catch (e) { next(e); }
};

const getAllInvoices = async (req, res, next) => {
  try {
    const result = await svc.getAllInvoices({ ...req.query });
    successResponse(res, { data: result });
  } catch (e) { next(e); }
};

const getReceivables = async (req, res, next) => {
  try {
    const data = await svc.getReceivables({ clientId: req.query.clientId });
    successResponse(res, { data: { receivables: data } });
  } catch (e) { next(e); }
};

const getBillingConfig = async (req, res, next) => {
  try {
    const data = await svc.getBillingConfig(req.params.clientId);
    successResponse(res, { data: { billingConfig: data } });
  } catch (e) { next(e); }
};

const upsertBillingConfig = async (req, res, next) => {
  try {
    const data = await svc.upsertBillingConfig({
      requestingUser: req.user,
      clientId: req.params.clientId,
      data: req.body,
      req,
    });
    successResponse(res, { message: 'Billing configuration saved', data: { billingConfig: data } });
  } catch (e) { next(e); }
};

const generateDueInvoices = async (req, res, next) => {
  try {
    const { generateClientInvoicesForDay } = require('../utils/invoiceCron');
    const targetDay = parseInt(req.query.day) || new Date().getDate();
    const data = await generateClientInvoicesForDay(targetDay, req.user.id);
    successResponse(res, { message: `Generated ${data.totalGenerated} invoice(s)`, data });
  } catch (e) { next(e); }
};

const createInvoice = async (req, res, next) => {
  try {
    const data = await svc.createInvoice({ requestingUser: req.user, data: req.body, req });
    successResponse(res, { message: 'Invoice created as draft', data: { invoice: data } });
  } catch (e) { next(e); }
};

const triggerDailyCron = async (req, res, next) => {
  try {
    const { runDailyCronNow } = require('../utils/invoiceCron');
    const result = await runDailyCronNow(req.query.day || req.body?.day || null);
    successResponse(res, {
      message: `Daily cron executed for day ${result.day}: ${result.invoices.totalGenerated} invoices generated, ${result.payroll.generated.length} payroll entries generated`,
      data: result,
    });
  } catch (e) { next(e); }
};

const collectPayment = async (req, res, next) => {
  try {
    const data = await svc.collectPayment({
      requestingUser: req.user,
      invoiceId: req.params.invoiceId,
      data: req.body,
      req,
    });
    successResponse(res, { message: 'Payment recorded successfully', data });
  } catch (e) { next(e); }
};

const downloadInvoicePdf = async (req, res, next) => {
  try {
    const { getInvoiceById } = require('../services/finance.service');
    const { generatePdf, numberToWords } = require('../utils/pdfGenerator');
    
    const invoice = await getInvoiceById(req.params.invoiceId);
    
    let items = [];
    if (invoice.lineItems && Array.isArray(invoice.lineItems)) {
      items = invoice.lineItems.map(item => ({
        description: item.description,
        tags: item.tags || [],
        hsnCode: item.hsnCode || null,
        notes: item.notes || null,
        rate: parseFloat(item.unitPrice || item.amount || 0),
        qty: item.quantity || 1,
        unit: item.unit || 'QTY',
        amount: parseFloat(item.amount || 0)
      }));
    } else {
      // Fallback if lineItems is missing
      items = [{
        description: invoice.description || 'Services Rendered',
        tags: [],
        hsnCode: null,
        notes: null,
        rate: parseFloat(invoice.amount),
        qty: 1,
        unit: 'QTY',
        amount: parseFloat(invoice.amount)
      }];
    }

    const formatDate = (dateStr) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      return `${d.getDate().toString().padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
    };
    
    // Address format
    const clientAddress = invoice.client.locationPreference || 'Address not provided';

    const pdfData = {
      clientName: invoice.client.name,
      clientAddress: clientAddress,
      clientGst: invoice.client.gst,
      clientAccountCode: invoice.client.clientCode,
      clientEmail: invoice.client.email || 'N/A',
      clientPhone: invoice.client.phone || '',
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: formatDate(invoice.invoiceDate),
      dueDate: formatDate(invoice.dueDate),
      billingType: invoice.package ? invoice.package.packageType : 'RETAINER',
      billingPeriod: invoice.billingMonth || (invoice.package ? invoice.package.billingCycle : 'MONTHLY'),
      remarks: invoice.description || invoice.notes || '',
      items: items,
      currencySymbol: invoice.currency === 'INR' ? '₹' : (invoice.currency === 'USD' ? '$' : invoice.currency + ' '),
      qrCodeDataUri: null,
      subTotal: parseFloat(invoice.amount),
      discountAmount: parseFloat(invoice.discountAmount),
      taxableAmount: parseFloat(invoice.amount) - parseFloat(invoice.discountAmount),
      taxRate: parseFloat(invoice.taxRate || 0),
      taxAmount: parseFloat(invoice.taxAmount),
      amountInWords: numberToWords(Math.round(parseFloat(invoice.totalAmount))),
      totalAmount: parseFloat(invoice.totalAmount)
    };
    
    const pdfBuffer = await generatePdf('invoice', pdfData);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice-${invoice.invoiceNumber}.pdf"`);
    res.send(pdfBuffer);
  } catch (e) { next(e); }
};

module.exports = {
  getFinanceDashboard,
  getAllInvoices,
  getReceivables,
  getBillingConfig,
  upsertBillingConfig,
  generateDueInvoices,
  triggerDailyCron,
  createInvoice,
  collectPayment,
  downloadInvoicePdf,
};
