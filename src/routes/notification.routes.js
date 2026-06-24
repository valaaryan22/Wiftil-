'use strict';

const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/notification.controller');
const { authenticate } = require('../middlewares/auth.middleware');

router.use(authenticate);

router.get('/',              ctrl.getNotifications);    // ?unreadOnly=true
router.get('/unread-count',  ctrl.getUnreadCount);
router.patch('/read-all',    ctrl.markAllAsRead);
router.patch('/:id/read',    ctrl.markAsRead);

module.exports = router;
