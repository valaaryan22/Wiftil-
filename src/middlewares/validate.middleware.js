'use strict';

const { validationResult } = require('express-validator');
const { errorResponse } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

/**
 * Middleware to run after express-validator chains.
 * Returns 422 with field-level errors if validation fails.
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return errorResponse(res, {
      statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY,
      message: 'Validation failed',
      errors: errors.array().map((e) => ({
        field: e.path,
        message: e.msg,
      })),
    });
  }
  next();
}

module.exports = { validate };
