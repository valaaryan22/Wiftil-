'use strict';

const { db } = require('../database/client');

async function getNotifications({ requestingUser, page = 1, limit = 20, unreadOnly = false }) {
  page  = parseInt(page);
  limit = parseInt(limit);
  const where = { userId: requestingUser.id };
  if (unreadOnly) where.isRead = false;

  const [total, notifications, unreadCount] = await Promise.all([
    db.Notification.count({ where }),
    db.Notification.findAll({
      where, order: [['createdAt', 'DESC']],
      offset: (page - 1) * limit, limit,
    }),
    db.Notification.count({ where: { userId: requestingUser.id, isRead: false } }),
  ]);

  return { notifications, total, unreadCount };
}

async function getUnreadCount({ requestingUser }) {
  return db.Notification.count({ where: { userId: requestingUser.id, isRead: false } });
}

async function markAsRead({ requestingUser, id }) {
  const notif = await db.Notification.findByPk(id);
  if (!notif || notif.userId !== requestingUser.id) {
    const err = new Error('Notification not found'); err.statusCode = 404; throw err;
  }
  await notif.update({ isRead: true, readAt: new Date() });
  return notif;
}

async function markAllAsRead({ requestingUser }) {
  const [count] = await db.Notification.update(
    { isRead: true, readAt: new Date() },
    { where: { userId: requestingUser.id, isRead: false } }
  );
  return { updated: count };
}

module.exports = { getNotifications, getUnreadCount, markAsRead, markAllAsRead };
