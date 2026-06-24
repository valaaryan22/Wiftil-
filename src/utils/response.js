'use strict';

const { HTTP_STATUS } = require('../constants');

/**
 * Standard success response
 */
function successResponse(res, { statusCode = HTTP_STATUS.OK, message = 'Success', data = null, meta = null } = {}) {
  const response = { success: true, message };
  if (data !== null) response.data = data;
  if (meta !== null) response.meta = meta;
  return res.status(statusCode).json(response);
}

/**
 * Standard error response
 */
function errorResponse(res, { statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, message = 'Internal Server Error', errors = null } = {}) {
  const response = { success: false, message };
  if (errors) response.errors = errors;
  return res.status(statusCode).json(response);
}

/**
 * Paginated response helper
 */
function paginatedResponse(res, { data, total, page, limit, message = 'Fetched successfully' }) {
  return successResponse(res, {
    message,
    data,
    meta: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  });
}

module.exports = { successResponse, errorResponse, paginatedResponse };
