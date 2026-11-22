'use strict';

const crmService = require('../services/crm.service');
const { successResponse, paginatedResponse } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

// ── 1. LEADS CONTROLLER ──────────────────────────────────────────────────────

async function getLeads(req, res, next) {
  try {
    const { page = 1, limit = 20, search, status, source, priority, assignedToId, sortBy, sortOrder } = req.query;
    const { leads, total, meta } = await crmService.getLeads({
      page,
      limit,
      search,
      status,
      source,
      priority,
      assignedToId,
      sortBy,
      sortOrder,
    });
    return paginatedResponse(res, {
      message: 'Leads fetched successfully',
      data: leads,
      total,
      page,
      limit,
    });
  } catch (err) {
    next(err);
  }
}

async function getLeadById(req, res, next) {
  try {
    const lead = await crmService.getLeadById(req.params.id);
    return successResponse(res, {
      message: 'Lead fetched successfully',
      data: lead,
    });
  } catch (err) {
    next(err);
  }
}

async function createLead(req, res, next) {
  try {
    const lead = await crmService.createLead(req.body, req.user);
    return successResponse(res, {
      statusCode: HTTP_STATUS.CREATED,
      message: 'Lead created successfully',
      data: lead,
    });
  } catch (err) {
    next(err);
  }
}

async function updateLead(req, res, next) {
  try {
    const lead = await crmService.updateLead(req.params.id, req.body, req.user);
    return successResponse(res, {
      message: 'Lead updated successfully',
      data: lead,
    });
  } catch (err) {
    next(err);
  }
}

async function deleteLead(req, res, next) {
  try {
    const result = await crmService.deleteLead(req.params.id, req.user);
    return successResponse(res, {
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
}

async function convertLead(req, res, next) {
  try {
    const result = await crmService.convertLeadToDeal(req.params.id, req.body, req.user);
    return successResponse(res, {
      message: 'Lead converted to deal successfully',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

// ── 2. DEALS CONTROLLER ──────────────────────────────────────────────────────

async function getDeals(req, res, next) {
  try {
    const { page = 1, limit = 20, search, stage, ownerId, clientId, sortBy, sortOrder } = req.query;
    const { deals, total, meta } = await crmService.getDeals({
      page,
      limit,
      search,
      stage,
      ownerId,
      clientId,
      sortBy,
      sortOrder,
    });
    return paginatedResponse(res, {
      message: 'Deals fetched successfully',
      data: deals,
      total,
      page,
      limit,
    });
  } catch (err) {
    next(err);
  }
}

async function getDealById(req, res, next) {
  try {
    const deal = await crmService.getDealById(req.params.id);
    return successResponse(res, {
      message: 'Deal fetched successfully',
      data: deal,
    });
  } catch (err) {
    next(err);
  }
}

async function createDeal(req, res, next) {
  try {
    const deal = await crmService.createDeal(req.body, req.user);
    return successResponse(res, {
      statusCode: HTTP_STATUS.CREATED,
      message: 'Deal created successfully',
      data: deal,
    });
  } catch (err) {
    next(err);
  }
}

async function updateDeal(req, res, next) {
  try {
    const deal = await crmService.updateDeal(req.params.id, req.body, req.user);
    return successResponse(res, {
      message: 'Deal updated successfully',
      data: deal,
    });
  } catch (err) {
    next(err);
  }
}

async function deleteDeal(req, res, next) {
  try {
    const result = await crmService.deleteDeal(req.params.id, req.user);
    return successResponse(res, {
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
}

// ── 3. ACTIVITIES CONTROLLER ─────────────────────────────────────────────────

async function getActivities(req, res, next) {
  try {
    const { page = 1, limit = 20, type, status, leadId, dealId, clientId, assignedToId, fromDate, toDate, sortBy, sortOrder } = req.query;
    const { activities, total } = await crmService.getActivities({
      page,
      limit,
      type,
      status,
      leadId,
      dealId,
      clientId,
      assignedToId,
      fromDate,
      toDate,
      sortBy,
      sortOrder,
    });
    return paginatedResponse(res, {
      message: 'CRM Activities fetched successfully',
      data: activities,
      total,
      page,
      limit,
    });
  } catch (err) {
    next(err);
  }
}

async function getActivityById(req, res, next) {
  try {
    const act = await crmService.getActivityById(req.params.id);
    return successResponse(res, {
      message: 'Activity fetched successfully',
      data: act,
    });
  } catch (err) {
    next(err);
  }
}

async function createActivity(req, res, next) {
  try {
    const act = await crmService.createActivity(req.body, req.user);
    return successResponse(res, {
      statusCode: HTTP_STATUS.CREATED,
      message: 'Activity scheduled successfully',
      data: act,
    });
  } catch (err) {
    next(err);
  }
}

async function updateActivity(req, res, next) {
  try {
    const act = await crmService.updateActivity(req.params.id, req.body, req.user);
    return successResponse(res, {
      message: 'Activity updated successfully',
      data: act,
    });
  } catch (err) {
    next(err);
  }
}

async function deleteActivity(req, res, next) {
  try {
    const result = await crmService.deleteActivity(req.params.id, req.user);
    return successResponse(res, {
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
}

// ── 4. CONTRACTS CONTROLLER ──────────────────────────────────────────────────

async function getContracts(req, res, next) {
  try {
    const { page = 1, limit = 20, dealId, leadId, clientId, type, status, sortBy, sortOrder } = req.query;
    const { contracts, total } = await crmService.getContracts({
      page,
      limit,
      dealId,
      leadId,
      clientId,
      type,
      status,
      sortBy,
      sortOrder,
    });
    return paginatedResponse(res, {
      message: 'Contracts fetched successfully',
      data: contracts,
      total,
      page,
      limit,
    });
  } catch (err) {
    next(err);
  }
}

async function getContractById(req, res, next) {
  try {
    const contract = await crmService.getContractById(req.params.id);
    return successResponse(res, {
      message: 'Contract fetched successfully',
      data: contract,
    });
  } catch (err) {
    next(err);
  }
}

async function createContract(req, res, next) {
  try {
    const contract = await crmService.createContract(req.body, req.user);
    return successResponse(res, {
      statusCode: HTTP_STATUS.CREATED,
      message: 'Contract created successfully',
      data: contract,
    });
  } catch (err) {
    next(err);
  }
}

async function updateContract(req, res, next) {
  try {
    const contract = await crmService.updateContract(req.params.id, req.body, req.user);
    return successResponse(res, {
      message: 'Contract updated successfully',
      data: contract,
    });
  } catch (err) {
    next(err);
  }
}

async function deleteContract(req, res, next) {
  try {
    const result = await crmService.deleteContract(req.params.id, req.user);
    return successResponse(res, {
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
}

// ── 5. METRICS CONTROLLER ────────────────────────────────────────────────────

async function getCrmMetrics(req, res, next) {
  try {
    const metrics = await crmService.getCrmMetrics();
    return successResponse(res, {
      message: 'CRM metrics fetched successfully',
      data: metrics,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  // Leads
  getLeads,
  getLeadById,
  createLead,
  updateLead,
  deleteLead,
  convertLead,
  // Deals
  getDeals,
  getDealById,
  createDeal,
  updateDeal,
  deleteDeal,
  // Activities
  getActivities,
  getActivityById,
  createActivity,
  updateActivity,
  deleteActivity,
  // Contracts
  getContracts,
  getContractById,
  createContract,
  updateContract,
  deleteContract,
  // Metrics
  getCrmMetrics,
};
