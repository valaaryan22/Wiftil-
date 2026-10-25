'use strict';

const { Op }            = require('sequelize');
const { db }            = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const { HTTP_STATUS, AUDIT_CATEGORY, AUDIT_ACTION } = require('../constants');
const officeLocationService = require('./officeLocation.service');

// Standard working hours per day
const STANDARD_WORK_HOURS = 8;

const USER_ATTRS = ['id', 'email', 'firstName', 'lastName', 'department', 'jobTitle', 'profilePicture'];

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayDateString() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function diffHours(start, end) {
  return parseFloat(((end - start) / (1000 * 60 * 60)).toFixed(2));
}

/** Get total working days in a month (Mon-Fri only) */
function workingDaysInMonth(yearMonth) {
  // yearMonth: "YYYY-MM"
  const [y, m] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(y, m - 1, d).getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

/** Count absent / leave days for an employee in a given month (for deduction calc) */
async function countAbsentDaysForMonth(userId, yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const startOfMonth = `${yearMonth}-01`;
  const daysInMonth  = new Date(y, m, 0).getDate();
  const endOfMonth   = `${yearMonth}-${String(daysInMonth).padStart(2, '0')}`;

  // Count attendance records marked ABSENT or HALF_DAY
  const absentRecords = await db.Attendance.findAll({
    where: {
      userId,
      date:   { [Op.between]: [startOfMonth, endOfMonth] },
      status: { [Op.in]: ['ABSENT', 'HALF_DAY'] },
    },
    attributes: ['id', 'date', 'status'],
  });

  let absentDays = 0;
  for (const rec of absentRecords) {
    absentDays += rec.status === 'HALF_DAY' ? 0.5 : 1;
  }

  // Also count APPROVED leave days that are UNPAID
  const unpaidLeaves = await db.LeaveRequest.findAll({
    where: {
      requesterId: userId,
      leaveType: 'UNPAID',
      status: 'APPROVED',
      startDate: { [Op.lte]: endOfMonth },
      endDate:   { [Op.gte]: startOfMonth },
    },
  });

  for (const leave of unpaidLeaves) {
    const ls = new Date(Math.max(new Date(leave.startDate), new Date(startOfMonth)));
    const le = new Date(Math.min(new Date(leave.endDate),   new Date(endOfMonth)));
    let days = 0;
    const cur = new Date(ls);
    while (cur <= le) {
      const day = cur.getDay();
      if (day !== 0 && day !== 6) days++;
      cur.setDate(cur.getDate() + 1);
    }
    absentDays += days;
  }

  return absentDays;
}

/** Sum overtime hours for an employee in a given month */
async function totalOvertimeHoursForMonth(userId, yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const startOfMonth = `${yearMonth}-01`;
  const daysInMonth  = new Date(y, m, 0).getDate();
  const endOfMonth   = `${yearMonth}-${String(daysInMonth).padStart(2, '0')}`;

  const result = await db.Attendance.findOne({
    where: {
      userId,
      date: { [Op.between]: [startOfMonth, endOfMonth] },
      status: { [Op.in]: ['PRESENT', 'HALF_DAY'] },
    },
    attributes: [
      [db.sequelize.fn('SUM', db.sequelize.col('overtime_hours')), 'totalOvertime'],
    ],
    raw: true,
  });

  return parseFloat(result?.totalOvertime || 0);
}

// ── Punch-In ──────────────────────────────────────────────────────────────────

async function punchIn({ requestingUser, notes, latitude, longitude, req }) {
  const today = todayDateString();

  // Check if already punched in today
  const existing = await db.Attendance.findOne({
    where: { userId: requestingUser.id, date: today },
  });

  if (existing) {
    if (existing.punchIn) {
      const err = new Error(
        existing.punchOut
          ? 'You have already completed your attendance for today'
          : 'You have already punched in today. Use punch-out instead.'
      );
      err.statusCode = HTTP_STATUS.CONFLICT; throw err;
    }
  }

  // Verify geofence office location
  const geoResult = await officeLocationService.verifyLocation({ latitude, longitude });
  if (!geoResult.verified) {
    const err = new Error(geoResult.message);
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    err.meta = {
      isGeofenceActive: true,
      reason: geoResult.reason,
      distance: geoResult.distance,
      allowedRadius: geoResult.allowedRadius,
      officeName: geoResult.office?.name,
    };
    throw err;
  }

  const punchInTime = new Date();
  const locFields = {
    punchInLatitude: latitude != null ? parseFloat(latitude) : null,
    punchInLongitude: longitude != null ? parseFloat(longitude) : null,
    punchInDistance: geoResult.distance != null ? geoResult.distance : null,
    punchInAddress: geoResult.office ? geoResult.office.name : null,
  };

  let record;
  if (existing) {
    await existing.update({
      punchIn: punchInTime,
      status: 'PRESENT',
      notes: notes || existing.notes,
      ...locFields,
    });
    record = existing;
  } else {
    record = await db.Attendance.create({
      userId: requestingUser.id,
      date: today,
      punchIn: punchInTime,
      status: 'PRESENT',
      workingHours: 0,
      overtimeHours: 0,
      notes: notes || null,
      ...locFields,
    });
  }

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.ATTENDANCE_PUNCH_IN || 'ATTENDANCE_PUNCH_IN',
    category: AUDIT_CATEGORY.ATTENDANCE || 'ATTENDANCE',
    entity: 'Attendance', entityId: record.id,
    description: `${requestingUser.firstName} ${requestingUser.lastName} punched in at ${punchInTime.toISOString()}${geoResult.office ? ` (Office: ${geoResult.office.name}, ${geoResult.distance}m away)` : ''}`,
    req,
  });

  return record;
}

// ── Punch-Out ─────────────────────────────────────────────────────────────────

async function punchOut({ requestingUser, notes, latitude, longitude, req }) {
  const today = todayDateString();

  const record = await db.Attendance.findOne({
    where: { userId: requestingUser.id, date: today },
  });

  if (!record || !record.punchIn) {
    const err = new Error('You have not punched in today');
    err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }
  if (record.punchOut) {
    const err = new Error('You have already punched out today');
    err.statusCode = HTTP_STATUS.CONFLICT; throw err;
  }

  // Verify geofence office location
  const geoResult = await officeLocationService.verifyLocation({ latitude, longitude });
  if (!geoResult.verified) {
    const err = new Error(geoResult.message);
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    err.meta = {
      isGeofenceActive: true,
      reason: geoResult.reason,
      distance: geoResult.distance,
      allowedRadius: geoResult.allowedRadius,
      officeName: geoResult.office?.name,
    };
    throw err;
  }

  const punchOutTime  = new Date();
  const workingHours  = diffHours(new Date(record.punchIn), punchOutTime);
  const overtimeHours = Math.max(0, parseFloat((workingHours - STANDARD_WORK_HOURS).toFixed(2)));

  // Determine final status based on working hours
  let status = 'PRESENT';
  if (workingHours < 4) status = 'HALF_DAY';

  const locFields = {
    punchOutLatitude: latitude != null ? parseFloat(latitude) : null,
    punchOutLongitude: longitude != null ? parseFloat(longitude) : null,
    punchOutDistance: geoResult.distance != null ? geoResult.distance : null,
    punchOutAddress: geoResult.office ? geoResult.office.name : null,
  };

  await record.update({
    punchOut:     punchOutTime,
    workingHours: parseFloat(workingHours.toFixed(2)),
    overtimeHours,
    status,
    notes: notes || record.notes,
    ...locFields,
  });

  await writeAuditLog({
    performedBy: requestingUser,
    action: AUDIT_ACTION.ATTENDANCE_PUNCH_OUT || 'ATTENDANCE_PUNCH_OUT',
    category: AUDIT_CATEGORY.ATTENDANCE || 'ATTENDANCE',
    entity: 'Attendance', entityId: record.id,
    description: `${requestingUser.firstName} ${requestingUser.lastName} punched out at ${punchOutTime.toISOString()} — ${workingHours}h worked, ${overtimeHours}h overtime${geoResult.office ? ` (Office: ${geoResult.office.name}, ${geoResult.distance}m away)` : ''}`,
    req,
  });

  return record;
}

// ── Queries ───────────────────────────────────────────────────────────────────

async function getMyAttendance({ requestingUser, page = 1, limit = 31, month }) {
  page  = parseInt(page);
  limit = parseInt(limit);
  const where = { userId: requestingUser.id };

  if (month) {
    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    where.date = {
      [Op.between]: [`${month}-01`, `${month}-${String(daysInMonth).padStart(2, '0')}`],
    };
  }

  const { rows, count } = await db.Attendance.findAndCountAll({
    where,
    order: [['date', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  });

  return { records: rows, total: count };
}

async function getAttendanceList({ requestingUser, page = 1, limit = 30, date, userId, month, status }) {
  if (requestingUser.roleLevel > 3) {
    const err = new Error('Access denied: Manager or above required');
    err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  page  = parseInt(page);
  limit = parseInt(limit);
  const where = {};

  if (date)   where.date   = date;
  if (userId) where.userId = userId;
  if (status) where.status = status;

  if (month && !date) {
    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    where.date = {
      [Op.between]: [`${month}-01`, `${month}-${String(daysInMonth).padStart(2, '0')}`],
    };
  }

  const { rows, count } = await db.Attendance.findAndCountAll({
    where,
    include: [
      { model: db.User, as: 'employee', attributes: USER_ATTRS },
    ],
    order: [['date', 'DESC'], ['created_at', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  });

  return { records: rows, total: count };
}

/**
 * Get monthly day-wise attendance matrix across all users
 * Returns calendar days, all active employees, and day-wise attendance statuses
 */
async function getAttendanceMatrix({ requestingUser, month, department, search }) {
  if (requestingUser.roleLevel > 3) {
    const err = new Error('Access denied: Manager or above required');
    err.statusCode = HTTP_STATUS.FORBIDDEN;
    throw err;
  }

  const targetMonth = month || new Date().toISOString().substring(0, 7);
  const [yearStr, monthStr] = targetMonth.split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const startDate = `${targetMonth}-01`;
  const endDate = `${targetMonth}-${String(daysInMonth).padStart(2, '0')}`;

  // 1. Fetch active employees
  const userWhere = { isActive: true, deletedAt: null };
  if (requestingUser && requestingUser.roleLevel > 3) {
    userWhere.id = requestingUser.id;
  }
  if (department) userWhere.department = department;
  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    userWhere[Op.or] = [
      { firstName: { [Op.like]: q } },
      { lastName: { [Op.like]: q } },
      { email: { [Op.like]: q } },
    ];
  }

  const employees = await db.User.findAll({
    where: userWhere,
    attributes: ['id', 'firstName', 'lastName', 'email', 'department', 'jobTitle', 'profilePicture'],
    order: [['firstName', 'ASC'], ['lastName', 'ASC']],
  });

  const employeeIds = employees.map((e) => e.id);

  // 2. Fetch all attendance records for this month
  const attendanceRecords = await db.Attendance.findAll({
    where: {
      userId: { [Op.in]: employeeIds },
      date: { [Op.between]: [startDate, endDate] },
    },
    attributes: ['id', 'userId', 'date', 'status', 'punchIn', 'punchOut', 'workingHours', 'overtimeHours', 'notes'],
  });

  // 3. Fetch approved leaves for this month
  const leaves = await db.LeaveRequest.findAll({
    where: {
      requesterId: { [Op.in]: employeeIds },
      status: 'APPROVED',
      startDate: { [Op.lte]: endDate },
      endDate: { [Op.gte]: startDate },
    },
    attributes: ['id', 'requesterId', 'leaveType', 'startDate', 'endDate', 'totalDays', 'halfDayType'],
  });

  // 4. Fetch holidays for this month
  let holidays = [];
  if (db.Holiday) {
    holidays = await db.Holiday.findAll({
      where: {
        date: { [Op.between]: [startDate, endDate] },
        status: 'ACTIVE',
      },
      attributes: ['id', 'name', 'date', 'type'],
    });
  }

  const holidaysMap = {};
  holidays.forEach((h) => {
    holidaysMap[h.date] = h;
  });

  const attendanceMap = {};
  attendanceRecords.forEach((r) => {
    attendanceMap[`${r.userId}_${r.date}`] = r;
  });

  // Build calendar days metadata [1..daysInMonth]
  const calendarDays = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dStr = `${targetMonth}-${String(day).padStart(2, '0')}`;
    const dateObj = new Date(year, monthNum - 1, day);
    const dayOfWeek = dateObj.getDay(); // 0 = Sun, 6 = Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const holiday = holidaysMap[dStr] || null;

    calendarDays.push({
      day,
      date: dStr,
      dayOfWeek: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek],
      isWeekend,
      holiday: holiday ? { id: holiday.id, name: holiday.name, type: holiday.type } : null,
    });
  }

  const todayStr = new Date().toISOString().split('T')[0];

  const matrix = employees.map((emp) => {
    let presentDays = 0;
    let halfDays = 0;
    let absentDays = 0;
    let onLeaveDays = 0;
    let holidayDays = 0;
    let totalHours = 0;
    let totalOvertime = 0;

    const days = calendarDays.map((cDay) => {
      const key = `${emp.id}_${cDay.date}`;
      const record = attendanceMap[key];

      let leaveInfo = null;
      for (const l of leaves) {
        if (l.requesterId === emp.id && cDay.date >= l.startDate && cDay.date <= l.endDate) {
          leaveInfo = l;
          break;
        }
      }

      let status = 'NOT_MARKED';
      let workingHours = 0;
      let overtimeHours = 0;
      let punchIn = null;
      let punchOut = null;
      let recordId = null;

      if (record) {
        status = record.status;
        workingHours = parseFloat(record.workingHours || 0);
        overtimeHours = parseFloat(record.overtimeHours || 0);
        punchIn = record.punchIn;
        punchOut = record.punchOut;
        recordId = record.id;
      } else if (leaveInfo) {
        status = leaveInfo.halfDayType ? 'HALF_DAY' : 'ON_LEAVE';
      } else if (cDay.holiday) {
        status = 'HOLIDAY';
      } else if (cDay.isWeekend) {
        status = 'WEEKEND';
      } else {
        status = 'NOT_MARKED';
      }

      if (status === 'PRESENT') {
        presentDays++;
        totalHours += workingHours;
        totalOvertime += overtimeHours;
      } else if (status === 'HALF_DAY') {
        halfDays++;
        totalHours += workingHours;
        totalOvertime += overtimeHours;
      } else if (status === 'ABSENT') {
        absentDays++;
      } else if (status === 'ON_LEAVE') {
        onLeaveDays++;
      } else if (status === 'HOLIDAY') {
        holidayDays++;
      }

      return {
        day: cDay.day,
        date: cDay.date,
        dayOfWeek: cDay.dayOfWeek,
        isWeekend: cDay.isWeekend,
        status,
        workingHours,
        overtimeHours,
        punchIn,
        punchOut,
        recordId,
        holidayName: cDay.holiday?.name,
        leaveType: leaveInfo?.leaveType,
      };
    });

    return {
      employee: emp,
      summary: {
        presentDays,
        halfDays,
        absentDays,
        onLeaveDays,
        holidayDays,
        totalHours: parseFloat(totalHours.toFixed(2)),
        totalOvertime: parseFloat(totalOvertime.toFixed(2)),
      },
      days,
    };
  });

  return {
    month: targetMonth,
    daysInMonth,
    calendarDays,
    matrix,
    totalEmployees: employees.length,
  };
}

async function getTodaySummary() {
  const today = todayDateString();
  const [present, absent, onLeave, total] = await Promise.all([
    db.Attendance.count({ where: { date: today, status: 'PRESENT' } }),
    db.Attendance.count({ where: { date: today, status: 'ABSENT' } }),
    db.Attendance.count({ where: { date: today, status: 'ON_LEAVE' } }),
    db.User.count({ where: { isActive: true, deletedAt: null } }),
  ]);

  return { date: today, total, present, absent, onLeave, notMarked: total - present - absent - onLeave };
}

async function getTodayRecord(userId) {
  const today = todayDateString();
  return db.Attendance.findOne({ where: { userId, date: today } });
}

async function manualOverride({ requestingUser, data, req }) {
  if (requestingUser.roleLevel > 2) {
    const err = new Error('Only Admin or above can manually override attendance');
    err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  const { userId, date, status, punchIn: pin, punchOut: pout, notes } = data;

  if (!userId || !date || !status) {
    const err = new Error('userId, date and status are required');
    err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  const employee = await db.User.findOne({ where: { id: userId, deletedAt: null } });
  if (!employee) {
    const err = new Error('Employee not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
  }

  let workingHours   = 0;
  let overtimeHours  = 0;
  if (pin && pout) {
    workingHours  = diffHours(new Date(pin), new Date(pout));
    overtimeHours = Math.max(0, parseFloat((workingHours - STANDARD_WORK_HOURS).toFixed(2)));
    workingHours  = parseFloat(workingHours.toFixed(2));
  }

  const [record, created] = await db.Attendance.findOrCreate({
    where: { userId, date },
    defaults: {
      userId, date, status,
      punchIn: pin ? new Date(pin) : null,
      punchOut: pout ? new Date(pout) : null,
      workingHours, overtimeHours, notes,
      markedById: requestingUser.id,
    },
  });

  if (!created) {
    await record.update({
      status,
      punchIn:      pin ? new Date(pin) : record.punchIn,
      punchOut:     pout ? new Date(pout) : record.punchOut,
      workingHours,
      overtimeHours,
      notes:        notes || record.notes,
      markedById:   requestingUser.id,
    });
  }

  await writeAuditLog({
    performedBy: requestingUser,
    action: 'ATTENDANCE_OVERRIDE',
    category: AUDIT_CATEGORY.ATTENDANCE || 'ATTENDANCE',
    entity: 'Attendance', entityId: record.id,
    targetUserId: userId, targetUserName: `${employee.firstName} ${employee.lastName}`,
    description: `Admin manually set attendance for ${employee.firstName} ${employee.lastName} on ${date} → ${status}`,
    newValues: { status, punchIn: pin, punchOut: pout, workingHours, overtimeHours },
    req,
  });

  return record;
}

async function getMonthlySummary(userId, yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const startDate   = `${yearMonth}-01`;
  const endDate     = `${yearMonth}-${String(daysInMonth).padStart(2, '0')}`;

  const records = await db.Attendance.findAll({
    where: {
      userId,
      date: { [Op.between]: [startDate, endDate] },
    },
    attributes: ['date', 'status', 'workingHours', 'overtimeHours'],
    order: [['date', 'ASC']],
  });

  const workingDays  = workingDaysInMonth(yearMonth);
  const absentDays   = await countAbsentDaysForMonth(userId, yearMonth);
  const overtimeHrs  = await totalOvertimeHoursForMonth(userId, yearMonth);

  const statusCounts = {};
  for (const r of records) {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  }

  return {
    userId, month: yearMonth, workingDays, absentDays, overtimeHrs, statusCounts, records,
  };
}

module.exports = {
  punchIn,
  punchOut,
  getMyAttendance,
  getAttendanceList,
  getAttendanceMatrix,
  getTodaySummary,
  getTodayRecord,
  manualOverride,
  getMonthlySummary,
  // Helpers used by salary service
  countAbsentDaysForMonth,
  totalOvertimeHoursForMonth,
  workingDaysInMonth,
};
