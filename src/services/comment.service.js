'use strict';

const { Op }          = require('sequelize');
const { db }          = require('../database/client');
const { HTTP_STATUS } = require('../constants');

const AUTHOR_INCLUDE = {
  model: db.User, as: 'author',
  attributes: ['id', 'firstName', 'lastName', 'profilePicture'],
  include: [{ model: db.RoleDefinition, as: 'role', attributes: ['displayName'] }],
};

async function addComment({ requestingUser, taskId, subTaskId, content, mentions = [] }) {
  if (!taskId && !subTaskId) {
    const err = new Error('Either taskId or subTaskId is required'); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  const comment = await db.TaskComment.create({
    taskId:    taskId    || null,
    subTaskId: subTaskId || null,
    authorId:  requestingUser.id,
    content:   content.trim(),
    mentions,
  });

  // Notify @mentioned users
  for (const userId of mentions) {
    if (userId === requestingUser.id) continue;
    try {
      await db.Notification.create({
        userId, type: 'MENTION', title: 'You were mentioned',
        message: `${requestingUser.firstName} mentioned you in a comment`,
        entityType: taskId ? 'Task' : 'SubTask',
        entityId:   taskId || subTaskId,
      });
    } catch { /* non-fatal */ }
  }

  return db.TaskComment.findByPk(comment.id, { include: [AUTHOR_INCLUDE] });
}

async function getComments({ taskId, subTaskId, page = 1, limit = 50 }) {
  page  = parseInt(page);
  limit = parseInt(limit);
  const where = {};
  if (taskId)    where.taskId    = taskId;
  if (subTaskId) where.subTaskId = subTaskId;

  const [total, comments] = await Promise.all([
    db.TaskComment.count({ where }),
    db.TaskComment.findAll({
      where, include: [AUTHOR_INCLUDE],
      order: [['createdAt', 'ASC']],
      offset: (page - 1) * limit, limit,
    }),
  ]);

  return { comments, total };
}

async function editComment({ requestingUser, id, content }) {
  const comment = await db.TaskComment.findByPk(id, { attributes: ['id', 'authorId', 'content'] });
  if (!comment) {
    const err = new Error('Comment not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
  }
  if (comment.authorId !== requestingUser.id && requestingUser.roleLevel < 5) {
    const err = new Error('Can only edit your own comments'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  await comment.update({ content: content.trim(), editedAt: new Date() });
  return db.TaskComment.findByPk(id, { include: [AUTHOR_INCLUDE] });
}

async function deleteComment({ requestingUser, id }) {
  const comment = await db.TaskComment.findByPk(id, { attributes: ['id', 'authorId'] });
  if (!comment) {
    const err = new Error('Comment not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err;
  }
  if (comment.authorId !== requestingUser.id && requestingUser.roleLevel < 5) {
    const err = new Error('Can only delete your own comments'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }
  await comment.destroy();
}

module.exports = { addComment, getComments, editComment, deleteComment };
