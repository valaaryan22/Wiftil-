'use strict';

const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/comment.controller');
const { authenticate } = require('../middlewares/auth.middleware');

router.use(authenticate);

router.post('/',        ctrl.addComment);
router.get('/',         ctrl.getComments);    // ?taskId=<id> or ?subTaskId=<id>
router.patch('/:id',    ctrl.editComment);
router.delete('/:id',   ctrl.deleteComment);

module.exports = router;
