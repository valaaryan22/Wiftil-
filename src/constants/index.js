'use strict';

// Role hierarchy — higher number = more authority
const ROLES = Object.freeze({
  BOSS:     'BOSS',
  MANAGER:  'MANAGER',
  LEADER:   'LEADER',
  EMPLOYEE: 'EMPLOYEE',
});

const ROLE_WEIGHT = Object.freeze({
  BOSS:     4,
  MANAGER:  3,
  LEADER:   2,
  EMPLOYEE: 1,
});

// Who can approve leave for whom
// Key role can approve leaves of value roles
const LEAVE_APPROVAL_MATRIX = Object.freeze({
  BOSS:    [ROLES.MANAGER, ROLES.LEADER, ROLES.EMPLOYEE],
  MANAGER: [ROLES.LEADER, ROLES.EMPLOYEE],
  LEADER:  [ROLES.EMPLOYEE],
  EMPLOYEE: [],
});

const TOKEN_TYPES = Object.freeze({
  REFRESH:        'REFRESH',
  EMAIL_VERIFY:   'EMAIL_VERIFY',
  PASSWORD_RESET: 'PASSWORD_RESET',
});

const LEAVE_STATUS = Object.freeze({
  PENDING:   'PENDING',
  APPROVED:  'APPROVED',
  REJECTED:  'REJECTED',
  CANCELLED: 'CANCELLED',
});

const LEAVE_TYPES = Object.freeze({
  ANNUAL:    'ANNUAL',
  SICK:      'SICK',
  UNPAID:    'UNPAID',
  EMERGENCY: 'EMERGENCY',
  MATERNITY: 'MATERNITY',
  PATERNITY: 'PATERNITY',
});

const HTTP_STATUS = Object.freeze({
  OK:                    200,
  CREATED:               201,
  NO_CONTENT:            204,
  BAD_REQUEST:           400,
  UNAUTHORIZED:          401,
  FORBIDDEN:             403,
  NOT_FOUND:             404,
  CONFLICT:              409,
  UNPROCESSABLE_ENTITY:  422,
  TOO_MANY_REQUESTS:     429,
  INTERNAL_SERVER_ERROR: 500,
});

module.exports = {
  ROLES,
  ROLE_WEIGHT,
  LEAVE_APPROVAL_MATRIX,
  TOKEN_TYPES,
  LEAVE_STATUS,
  LEAVE_TYPES,
  HTTP_STATUS,
};
