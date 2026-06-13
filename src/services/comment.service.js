'use strict';

const { db }         = require('../database/client');
const { HTTP_STATUS } = require('../constants');

/**
 * Add comment to a task or sub-task
 */
async function addComment({ requestingUser, taskId, subTaskId, content, mentions = [] }) {
  if (!taskId && !subTaskId) {
    const err = new Error('Either taskId or subTaskId is required'); err.statusCode = HTTP_STATUS.BAD_REQUEST; throw err;
  }

  const comment = await db.taskComment.create({
    data: {
      taskId:    taskId    || null,
      subTaskId: subTaskId || null,
      authorId:  requestingUser.id,
      content:
       content.trim(),
      mentions,
    },
    include: {
      author: { select: { id: true, firstName: true, lastName: true, role: { select: { displayName: true } } } },
    },
  });

  // Notify @mentioned users
  for (const userId of mentions) {
    if (userId === requestingUser.id) continue;
    try {
      await db.notification.create({
        data: {
          userId, type: 'MENTION', title: 'You were mentioned',
          message: `${requestingUser.firstName} mentioned you in a comment`,
          entityType: taskId ? 'Task' : 'SubTask',
          entityId:   taskId || subTaskId,
        },
      });
    } catch { /* non-fatal */ }
  }

  return comment;
}

/**
 * Get comments for a task or sub-task
 */
async function getComments({ taskId, subTaskId, page = 1, limit = 50 }) {
  page  = parseInt(page);
  limit = parseInt(limit);

  const where = {};
  if (taskId)    where.taskId    = taskId;
  if (subTaskId) where.subTaskId = subTaskId;

  const [comments, total] = await Promise.all([
    db.taskComment.findMany({
      where,
      include: { author: { select: { id: true, firstName: true, lastName: true, profilePicture: true, role: { select: { displayName: true } } } } },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * limit, take: limit,
    }),
    db.taskComment.count({ where }),
  ]);

  return { comments, total };
}

/**
 * Edit own comment
 */
async function editComment({ requestingUser, id, content }) {
  const comment = await db.taskComment.findUnique({ where: { id }, select: { id: true, authorId: true, content: true } });

  if (!comment) { const err = new Error('Comment not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err; }
  if (comment.authorId !== requestingUser.id && requestingUser.roleLevel < 5) {
    const err = new Error('Can only edit your own comments'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  return db.taskComment.update({
    where: { id },
    data:  { content: content.trim(), editedAt: new Date() },
    include: { author: { select: { id: true, firstName: true, lastName: true } } },
  });
}

/**
 * Delete comment (own or Admin)
 */
async function deleteComment({ requestingUser, id }) {
  const comment = await db.taskComment.findUnique({ where: { id }, select: { id: true, authorId: true } });

  if (!comment) { const err = new Error('Comment not found'); err.statusCode = HTTP_STATUS.NOT_FOUND; throw err; }
  if (comment.authorId !== requestingUser.id && requestingUser.roleLevel < 5) {
    const err = new Error('Can only delete your own comments'); err.statusCode = HTTP_STATUS.FORBIDDEN; throw err;
  }

  await db.taskComment.delete({ where: { id } });
}

module.exports = { addComment, getComments, editComment, deleteComment };
