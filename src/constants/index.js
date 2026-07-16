'use strict';

/**
 * Access Level System — Lower number = HIGHER authority.
 *
 *   Level 1  →  BOSS        (top authority, level never changes)
 *   Level 2  →  ADMIN
 *   Level 3  →  MANAGER
 *   Level 4  →  TEAM_LEAD
 *   Level 5  →  EMPLOYEE
 *   Level 6+ →  any future custom roles added below Employee
 *
 * New roles can be added at any level > 1 without touching BOSS.
 * Comparisons: roleLevel <= threshold means "at least that rank or higher".
 */

const SYSTEM_ROLE_NAMES = Object.freeze({
  BOSS:      'BOSS',
  ADMIN:     'ADMIN',
  MANAGER:   'MANAGER',
  TEAM_LEAD: 'TEAM_LEAD',
  EMPLOYEE:  'EMPLOYEE',
});

// ─── Permission thresholds (roleLevel <= X means the user has at least that rank) ─
// BOSS_LEVEL is the absolute top — always 1 and never changes.
const BOSS_LEVEL = 1;

const LEAVE_APPROVAL_MAX_LEVEL  = 4; // Level ≤ 4 (TEAM_LEAD+) can approve leave
const USER_INVITE_MAX_LEVEL     = 3; // Level ≤ 3 (MANAGER+) can invite users
const ROLE_MANAGE_MAX_LEVEL     = 2; // Level ≤ 2 (ADMIN+)   can manage roles
const USER_DELETE_MAX_LEVEL     = 2; // Level ≤ 2 (ADMIN+)   can delete users
const USER_STATUS_MAX_LEVEL     = 3; // Level ≤ 3 (MANAGER+) can toggle user status

// Task permission levels
const TASK_CREATE_MAX_LEVEL     = 2; // Level ≤ 2 (ADMIN/BOSS) creates main tasks
const TASK_MANAGE_MAX_LEVEL     = 3; // Level ≤ 3 (MANAGER+) accepts/assigns/approves
const SUBTASK_CREATE_MAX_LEVEL  = 4; // Level ≤ 4 (TEAM_LEAD+) creates sub-tasks
const RATING_MAX_LEVEL          = 3; // Level ≤ 3 (MANAGER+) rates performance

// Client permissions
const CLIENT_MANAGE_MAX_LEVEL   = 3; // Level ≤ 3 (MANAGER+) can create/update/delete clients

// ─── Legacy aliases (kept so old call-sites compile without mass-rename) ─────────
// These point to the same constants under the old names.
const LEAVE_APPROVAL_MIN_LEVEL  = LEAVE_APPROVAL_MAX_LEVEL;
const USER_INVITE_MIN_LEVEL     = USER_INVITE_MAX_LEVEL;
const ROLE_MANAGE_MIN_LEVEL     = ROLE_MANAGE_MAX_LEVEL;
const USER_DELETE_MIN_LEVEL     = USER_DELETE_MAX_LEVEL;
const USER_STATUS_MIN_LEVEL     = USER_STATUS_MAX_LEVEL;
const TASK_CREATE_MIN_LEVEL     = TASK_CREATE_MAX_LEVEL;
const TASK_MANAGE_MIN_LEVEL     = TASK_MANAGE_MAX_LEVEL;
const SUBTASK_CREATE_MIN_LEVEL  = SUBTASK_CREATE_MAX_LEVEL;
const RATING_MIN_LEVEL          = RATING_MAX_LEVEL;

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
  CLIENT: 'CLIENT',
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
  // Clients
  CLIENT_CREATED:        'CLIENT_CREATED',
  CLIENT_UPDATED:        'CLIENT_UPDATED',
  CLIENT_DELETED:        'CLIENT_DELETED',
  // Client Contacts
  CLIENT_CONTACT_CREATED: 'CLIENT_CONTACT_CREATED',
  CLIENT_CONTACT_UPDATED: 'CLIENT_CONTACT_UPDATED',
  CLIENT_CONTACT_DELETED: 'CLIENT_CONTACT_DELETED',
  // Client Communication Logs
  CLIENT_COMM_LOGGED:    'CLIENT_COMM_LOGGED',
  CLIENT_COMM_UPDATED:   'CLIENT_COMM_UPDATED',
  CLIENT_COMM_DELETED:   'CLIENT_COMM_DELETED',
});

module.exports = {
  SYSTEM_ROLE_NAMES,
  BOSS_LEVEL,
  // New-style threshold names
  LEAVE_APPROVAL_MAX_LEVEL,
  USER_INVITE_MAX_LEVEL,
  ROLE_MANAGE_MAX_LEVEL,
  USER_DELETE_MAX_LEVEL,
  USER_STATUS_MAX_LEVEL,
  TASK_CREATE_MAX_LEVEL,
  TASK_MANAGE_MAX_LEVEL,
  SUBTASK_CREATE_MAX_LEVEL,
  RATING_MAX_LEVEL,
  CLIENT_MANAGE_MAX_LEVEL,
  // Legacy aliases (backward-compat)
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
