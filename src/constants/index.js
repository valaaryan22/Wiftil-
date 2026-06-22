'use strict';

const SYSTEM_ROLE_NAMES = Object.freeze({
  BOSS:       'BOSS',
  MANAGER:    'MANAGER',
  SUPERVISOR: 'SUPERVISOR',
  LEADER:     'LEADER',
  EMPLOYEE:   'EMPLOYEE',
});

const ACCESS_LEVEL = Object.freeze({
  BOSS:       5,
  MANAGER:    4,
  SUPERVISOR: 3,
  LEADER:     2,
  EMPLOYEE:   1,
});

// ─── Permission thresholds ────────────────────────────────────────────────────
const LEAVE_APPROVAL_MIN_LEVEL = 2;
const USER_INVITE_MIN_LEVEL    = 4;
const ROLE_MANAGE_MIN_LEVEL    = 5;
const USER_DELETE_MIN_LEVEL    = 5;
const USER_STATUS_MIN_LEVEL    = 4;

// Task permission levels
const TASK_CREATE_MIN_LEVEL    = 5; // Only BOSS/Admin creates main tasks
const TASK_MANAGE_MIN_LEVEL    = 3; // Manager/Supervisor accepts/assigns/approves
const SUBTASK_CREATE_MIN_LEVEL = 2; // Team Lead (level 2+) creates sub-tasks
const RATING_MIN_LEVEL         = 4; // Manager rates performance

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

const TASK_PRIORITY = Object.freeze({
  LOW:      'LOW',
  MEDIUM:   'MEDIUM',
  HIGH:     'HIGH',
  CRITICAL: 'CRITICAL',
});

const TASK_STATUS = Object.freeze({
  CREATED:          'CREATED',
  ASSIGNED:         'ASSIGNED',
  ACCEPTED:         'ACCEPTED',
  REJECTED:         'REJECTED',
  IN_PROGRESS:      'IN_PROGRESS',
  SUBMITTED:        'SUBMITTED',
  MANAGER_REVIEW:   'MANAGER_REVIEW',
  MANAGER_APPROVED: 'MANAGER_APPROVED',
  COMPLETED:        'COMPLETED',
  REOPENED:         'REOPENED',
});

const SUBTASK_STATUS = Object.freeze({
  CREATED:              'CREATED',
  ASSIGNED:             'ASSIGNED',
  LOCKED:               'LOCKED',
  AVAILABLE:            'AVAILABLE',
  IN_PROGRESS:          'IN_PROGRESS',
  SUBMITTED:            'SUBMITTED',
  TEAM_LEAD_REVIEW:     'TEAM_LEAD_REVIEW',
  TEAM_LEAD_APPROVED:   'TEAM_LEAD_APPROVED',
  TEAM_LEAD_REJECTED:   'TEAM_LEAD_REJECTED',
  MANAGER_REVIEW:       'MANAGER_REVIEW',
  FINAL_APPROVED:       'FINAL_APPROVED',
  REOPENED:             'REOPENED',
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

const AUDIT_CATEGORY = Object.freeze({
  USER:   'USER',
  ROLE:   'ROLE',
  LEAVE:  'LEAVE',
  AUTH:   'AUTH',
  TASK:   'TASK',
  SYSTEM: 'SYSTEM',
});

const AUDIT_ACTION = Object.freeze({
  // Auth
  USER_REGISTERED:       'USER_REGISTERED',
  USER_LOGGED_IN:        'USER_LOGGED_IN',
  USER_LOGGED_OUT:       'USER_LOGGED_OUT',
  USER_LOGGED_OUT_ALL:   'USER_LOGGED_OUT_ALL',
  TOKEN_REFRESHED:       'TOKEN_REFRESHED',
  PASSWORD_CHANGED:      'PASSWORD_CHANGED',
  // Users
  USER_CREATED:          'USER_CREATED',
  USER_UPDATED:          'USER_UPDATED',
  USER_DELETED:          'USER_DELETED',
  USER_ACTIVATED:        'USER_ACTIVATED',
  USER_DEACTIVATED:      'USER_DEACTIVATED',
  USER_ROLE_UPDATED:     'USER_ROLE_UPDATED',
  // Roles
  ROLE_CREATED:          'ROLE_CREATED',
  ROLE_UPDATED:          'ROLE_UPDATED',
  ROLE_DELETED:          'ROLE_DELETED',
  // Leaves
  LEAVE_APPLIED:         'LEAVE_APPLIED',
  LEAVE_APPROVED:        'LEAVE_APPROVED',
  LEAVE_REJECTED:        'LEAVE_REJECTED',
  LEAVE_CANCELLED:       'LEAVE_CANCELLED',
  // Tasks (main)
  TASK_CREATED:          'TASK_CREATED',
  TASK_UPDATED:          'TASK_UPDATED',
  TASK_DELETED:          'TASK_DELETED',
  TASK_ASSIGNED:         'TASK_ASSIGNED',         // Admin → Manager
  TASK_ACCEPTED:         'TASK_ACCEPTED',         // Manager accepts
  TASK_REJECTED:         'TASK_REJECTED',         // Manager rejects
  TASK_LEAD_ASSIGNED:    'TASK_LEAD_ASSIGNED',    // Manager → Team Lead(s)
  TASK_SUBMITTED:        'TASK_SUBMITTED',        // Team Lead submits to Manager
  TASK_APPROVED:         'TASK_APPROVED',         // Manager approves
  TASK_COMPLETED:        'TASK_COMPLETED',
  TASK_REOPENED:         'TASK_REOPENED',
  // SubTasks
  SUBTASK_CREATED:       'SUBTASK_CREATED',
  SUBTASK_UPDATED:       'SUBTASK_UPDATED',
  SUBTASK_DELETED:       'SUBTASK_DELETED',
  SUBTASK_ASSIGNED:      'SUBTASK_ASSIGNED',      // Team Lead → Member(s)
  SUBTASK_STARTED:       'SUBTASK_STARTED',       // Member starts
  SUBTASK_SUBMITTED:     'SUBTASK_SUBMITTED',     // Member submits
  SUBTASK_APPROVED:      'SUBTASK_APPROVED',      // Team Lead approves
  SUBTASK_REJECTED:      'SUBTASK_REJECTED',      // Team Lead rejects
  SUBTASK_REOPENED:      'SUBTASK_REOPENED',
  DEPENDENCY_ADDED:      'DEPENDENCY_ADDED',
  DEPENDENCY_REMOVED:    'DEPENDENCY_REMOVED',
  DEPENDENCY_UNLOCKED:   'DEPENDENCY_UNLOCKED',
  // Performance
  RATING_SUBMITTED:      'RATING_SUBMITTED',
  RATING_UPDATED:        'RATING_UPDATED',
  // Comments
  COMMENT_ADDED:         'COMMENT_ADDED',
  COMMENT_UPDATED:       'COMMENT_UPDATED',
  COMMENT_DELETED:       'COMMENT_DELETED',
});

module.exports = {
  SYSTEM_ROLE_NAMES,
  ACCESS_LEVEL,
  LEAVE_APPROVAL_MIN_LEVEL,
  USER_INVITE_MIN_LEVEL,
  ROLE_MANAGE_MIN_LEVEL,
  USER_DELETE_MIN_LEVEL,
  USER_STATUS_MIN_LEVEL,
  TASK_CREATE_MIN_LEVEL,
  TASK_MANAGE_MIN_LEVEL,
  SUBTASK_CREATE_MIN_LEVEL,
  RATING_MIN_LEVEL,
  TOKEN_TYPES,
  LEAVE_STATUS,
  LEAVE_TYPES,
  TASK_PRIORITY,
  TASK_STATUS,
  SUBTASK_STATUS,
  HTTP_STATUS,
  AUDIT_CATEGORY,
  AUDIT_ACTION,
};
