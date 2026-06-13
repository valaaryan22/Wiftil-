'use strict';

const notifService    = require('../services/notification.service');
const { successResponse } = require('../utils/response');

const getNotifications   = async (req, res, next) => { try { const data = await notifService.getNotifications({ requestingUser: req.user, page: req.query.page, limit: req.query.limit, unreadOnly: req.query.unreadOnly === 'true' }); successResponse(res, { data }); } catch (e) { next(e); } };
const getUnreadCount     = async (req, res, next) => { try { const count = await notifService.getUnreadCount({ requestingUser: req.user }); successResponse(res, { data: { unreadCount: count } }); } catch (e) { next(e); } };
const markAsRead         = async (req, res, next) => { try { const notif = await notifService.markAsRead({ requestingUser: req.user, id: req.params.id }); successResponse(res, { message: 'Marked as read', data: { notification: notif } }); } catch (e) { next(e); } };
const markAllAsRead      = async (req, res, next) => { try { const result = await notifService.markAllAsRead({ requestingUser: req.user }); successResponse(res, { message: `${result.updated} notification(s) marked as read`, data: result }); } catch (e) { next(e); } };

module.exports = { getNotifications, getUnreadCount, markAsRead, markAllAsRead };
