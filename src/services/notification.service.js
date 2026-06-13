'use strict';

const { db } = require('../database/client');

async function getNotifications({ requestingUser, page = 1, limit = 20, unreadOnly = false }) {
  page  = parseInt(page);
  limit = parseInt(limit);

  const where = { userId: requestingUser.id };
  if (unreadOnly) where.isRead = false;

  const [notifications, total, unreadCount] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit, take: limit,
    }),
    db.notification.count({ where }),
    db.notification.count({ where: { userId: requestingUser.id, isRead: false } }),
  ]);

  return { notifications, total, unreadCount };
}

async function getUnreadCount({ requestingUser }) {
  return db.notification.count({ where: { userId: requestingUser.id, isRead: false } });
}

async function markAsRead({ requestingUser, id }) {
  const notif = await db.notification.findUnique({ where: { id } });
  if (!notif || notif.userId !== requestingUser.id) {
    const err = new Error('Notification not found'); err.statusCode = 404; throw err;
  }
  return db.notification.update({ where: { id }, data: { isRead: true, readAt: new Date() } });
}

async function markAllAsRead({ requestingUser }) {
  const { count } = await db.notification.updateMany({
    where: { userId: requestingUser.id, isRead: false },
    data:  { isRead: true, readAt: new Date() },
  });
  return { updated: count };
}

module.exports = { getNotifications, getUnreadCount, markAsRead, markAllAsRead };
