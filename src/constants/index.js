'use strict';

// Role hierarchy using accessLevel (1=lowest, 5=highest)
// These match the system roles seeded in prisma/seed.js
// For runtime checks where we don't have DB access, we use accessLevel from req.user.roleLevel

const SYSTEM_ROLE_NAMES = Object.freeze({
  BOSS:       'BOSS',
  MANAGER:    'MANAGER',
  SUPERVISOR: 'SUPERVISOR',
  LEADER:     'LEADER',
  EMPLOYEE:   'EMPLOYEE',
});

// Access level constants — used when DB roles are loaded dynamically
const ACCESS_LEVEL = Object.freeze({
  BOSS:       5,
  MANAGER:    4,
  SUPERVISOR: 3,
  LEADER:     2,
  EMPLOYEE:   1,
});

// Who can approve leave for whom (by minimum access level)
const LEAVE_APPROVAL_MIN_LEVEL = 2; // LEADER (2) and above can approve

// Who can add/invite users (access level 4+ = MANAGER and above)
const USER_INVITE_MIN_LEVEL = 4;

// Who can manage roles (access level 5+ = BOSS only)
const ROLE_MANAGE_MIN_LEVEL = 5;

// Who can delete users (access level 5 = BOSS only)
const USER_DELETE_MIN_LEVEL = 5;

// Who can toggle user status (access level 4+ = MANAGER+)
const USER_STATUS_MIN_LEVEL = 4;

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

// Audit log categories
const AUDIT_CATEGORY = Object.freeze({
  USER:   'USER',
  ROLE:   'ROLE',
  LEAVE:  'LEAVE',
  AUTH:   'AUTH',
  SYSTEM: 'SYSTEM',
});

// Audit log actions
const AUDIT_ACTION = Object.freeze({
  // Auth
  USER_REGISTERED:      'USER_REGISTERED',
  USER_LOGGED_IN:       'USER_LOGGED_IN',
  USER_LOGGED_OUT:      'USER_LOGGED_OUT',
  USER_LOGGED_OUT_ALL:  'USER_LOGGED_OUT_ALL',
  TOKEN_REFRESHED:      'TOKEN_REFRESHED',
  PASSWORD_CHANGED:     'PASSWORD_CHANGED',
  // Users
  USER_CREATED:         'USER_CREATED',
  USER_UPDATED:         'USER_UPDATED',
  USER_DELETED:         'USER_DELETED',
  USER_ACTIVATED:       'USER_ACTIVATED',
  USER_DEACTIVATED:     'USER_DEACTIVATED',
  USER_ROLE_UPDATED:    'USER_ROLE_UPDATED',
  // Roles
  ROLE_CREATED:         'ROLE_CREATED',
  ROLE_UPDATED:         'ROLE_UPDATED',
  ROLE_DELETED:         'ROLE_DELETED',
  // Leaves
  LEAVE_APPLIED:        'LEAVE_APPLIED',
  LEAVE_APPROVED:       'LEAVE_APPROVED',
  LEAVE_REJECTED:       'LEAVE_REJECTED',
  LEAVE_CANCELLED:      'LEAVE_CANCELLED',
});

module.exports = {
  SYSTEM_ROLE_NAMES,
  ACCESS_LEVEL,
  LEAVE_APPROVAL_MIN_LEVEL,
  USER_INVITE_MIN_LEVEL,
  ROLE_MANAGE_MIN_LEVEL,
  USER_DELETE_MIN_LEVEL,
  USER_STATUS_MIN_LEVEL,
  TOKEN_TYPES,
  LEAVE_STATUS,
  LEAVE_TYPES,
  HTTP_STATUS,
  AUDIT_CATEGORY,
  AUDIT_ACTION,
};
