'use strict';

const { Op } = require('sequelize');
const { db } = require('../database/client');

const USER_SNAP = (as) => ({
  model: db.User,
  as,
  attributes: ['id', 'firstName', 'lastName', 'email', 'profilePicture', 'managerId'],
  include: [
    {
      model: db.RoleDefinition,
      as: 'role',
      attributes: ['id', 'name', 'displayName', 'accessLevel'],
    },
  ],
});

/**
 * Get paginated reminders visible to the user.
 * - Level 1 (BOSS) can view all reminders.
 * - Other users see reminders where they are the creator OR the assigned boss.
 */
async function getReminders({
  userId,
  userLevel = 5,
  status,
  priority,
  search,
  dateFrom,
  dateTo,
  page = 1,
  limit = 50,
}) {
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit) || 50));
  const offset = (p - 1) * l;

  const where = {};

  // Visibility Scope: Level 1 BOSS sees all; others see where creator OR boss
  if (userLevel > 1) {
    where[Op.or] = [
      { creatorId: userId },
      { bossId: userId },
    ];
  }

  // Status Filter
  if (status && status !== 'ALL') {
    where.status = status;
  }

  // Priority Filter
  if (priority && priority !== 'ALL') {
    where.priority = priority;
  }

  // Search Filter
  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push({
      [Op.or]: [
        { title: { [Op.like]: q } },
        { description: { [Op.like]: q } },
        { category: { [Op.like]: q } },
      ],
    });
  }

  // Date Range Filter
  if (dateFrom || dateTo) {
    where.remindAt = {};
    if (dateFrom) where.remindAt[Op.gte] = new Date(dateFrom);
    if (dateTo) where.remindAt[Op.lte] = new Date(dateTo);
  }

  const { count, rows } = await db.Reminder.findAndCountAll({
    where,
    include: [
      USER_SNAP('creator'),
      USER_SNAP('boss'),
    ],
    order: [['remindAt', 'ASC']],
    limit: l,
    offset,
  });

  return {
    total: count,
    page: p,
    limit: l,
    totalPages: Math.ceil(count / l),
    reminders: rows,
  };
}

/**
 * Get a single reminder by ID
 */
async function getReminderById(id, userId, userLevel = 5) {
  const reminder = await db.Reminder.findByPk(id, {
    include: [
      USER_SNAP('creator'),
      USER_SNAP('boss'),
    ],
  });

  if (!reminder) {
    const err = new Error('Reminder not found');
    err.status = 404;
    throw err;
  }

  if (userLevel > 1 && reminder.creatorId !== userId && reminder.bossId !== userId) {
    const err = new Error('You do not have permission to view this reminder');
    err.status = 403;
    throw err;
  }

  return reminder;
}

/**
 * Create a new reminder.
 * Automatically resolves the boss/manager:
 * - Uses provided bossId if specified.
 * - Otherwise checks creator's managerId.
 * - Otherwise falls back to top Level 1 BOSS user.
 */
async function createReminder(data, creatorId) {
  let bossId = data.bossId || null;

  if (!bossId) {
    // Lookup creator to find managerId
    const creatorUser = await db.User.findByPk(creatorId, { attributes: ['id', 'managerId'] });
    if (creatorUser && creatorUser.managerId) {
      bossId = creatorUser.managerId;
    } else {
      // Find default Level 1 BOSS
      const defaultBoss = await db.User.findOne({
        include: [{
          model: db.RoleDefinition,
          as: 'role',
          where: { accessLevel: 1 },
        }],
        attributes: ['id'],
      });
      if (defaultBoss && defaultBoss.id !== creatorId) {
        bossId = defaultBoss.id;
      }
    }
  }

  const reminder = await db.Reminder.create({
    title: data.title,
    description: data.description || null,
    remindAt: new Date(data.remindAt),
    priority: data.priority || 'MEDIUM',
    status: data.status || 'PENDING',
    creatorId,
    bossId,
    category: data.category || 'GENERAL',
    entityType: data.entityType || null,
    entityId: data.entityId || null,
    isAllDay: data.isAllDay || false,
  });

  return getReminderById(reminder.id, creatorId, 1);
}

/**
 * Update an existing reminder
 */
async function updateReminder(id, data, userId, userLevel = 5) {
  const reminder = await getReminderById(id, userId, userLevel);

  if (data.title !== undefined) reminder.title = data.title;
  if (data.description !== undefined) reminder.description = data.description;
  if (data.remindAt !== undefined) reminder.remindAt = new Date(data.remindAt);
  if (data.priority !== undefined) reminder.priority = data.priority;
  if (data.category !== undefined) reminder.category = data.category;
  if (data.isAllDay !== undefined) reminder.isAllDay = data.isAllDay;
  if (data.bossId !== undefined) reminder.bossId = data.bossId;
  if (data.status !== undefined) {
    reminder.status = data.status;
    reminder.completedAt = data.status === 'COMPLETED' ? new Date() : null;
  }

  await reminder.save();
  return getReminderById(reminder.id, userId, userLevel);
}

/**
 * Update reminder status (e.g. COMPLETED or DISMISSED)
 */
async function updateReminderStatus(id, status, userId, userLevel = 5) {
  const reminder = await getReminderById(id, userId, userLevel);
  reminder.status = status;
  reminder.completedAt = status === 'COMPLETED' ? new Date() : null;
  await reminder.save();
  return getReminderById(reminder.id, userId, userLevel);
}

/**
 * Delete a reminder
 */
async function deleteReminder(id, userId, userLevel = 5) {
  const reminder = await getReminderById(id, userId, userLevel);
  await reminder.destroy();
  return { success: true, message: 'Reminder deleted successfully' };
}

/**
 * Get summary counts for Workbench
 */
async function getRemindersSummary(userId, userLevel = 5) {
  const now = new Date();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const baseWhere = {};
  if (userLevel > 1) {
    baseWhere[Op.or] = [
      { creatorId: userId },
      { bossId: userId },
    ];
  }

  const [totalPending, dueToday, overdue, totalCompleted] = await Promise.all([
    db.Reminder.count({
      where: {
        ...baseWhere,
        status: 'PENDING',
      },
    }),
    db.Reminder.count({
      where: {
        ...baseWhere,
        status: 'PENDING',
        remindAt: {
          [Op.between]: [startOfDay, endOfDay],
        },
      },
    }),
    db.Reminder.count({
      where: {
        ...baseWhere,
        status: 'PENDING',
        remindAt: {
          [Op.lt]: now,
        },
      },
    }),
    db.Reminder.count({
      where: {
        ...baseWhere,
        status: 'COMPLETED',
      },
    }),
  ]);

  return {
    totalPending,
    dueToday,
    overdue,
    totalCompleted,
  };
}

module.exports = {
  getReminders,
  getReminderById,
  createReminder,
  updateReminder,
  updateReminderStatus,
  deleteReminder,
  getRemindersSummary,
};
