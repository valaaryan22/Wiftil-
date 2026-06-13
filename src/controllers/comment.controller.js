'use strict';

const commentService  = require('../services/comment.service');
const { successResponse } = require('../utils/response');

const addComment    = async (req, res, next) => { try { const comment = await commentService.addComment({ requestingUser: req.user, ...req.body }); successResponse(res, { statusCode: 201, message: 'Comment added', data: { comment } }); } catch (e) { next(e); } };
const getComments   = async (req, res, next) => { try { const { comments, total } = await commentService.getComments({ taskId: req.query.taskId, subTaskId: req.query.subTaskId, page: req.query.page, limit: req.query.limit }); successResponse(res, { data: { comments, total } }); } catch (e) { next(e); } };
const editComment   = async (req, res, next) => { try { const comment = await commentService.editComment({ requestingUser: req.user, id: req.params.id, content: req.body.content }); successResponse(res, { message: 'Comment updated', data: { comment } }); } catch (e) { next(e); } };
const deleteComment = async (req, res, next) => { try { await commentService.deleteComment({ requestingUser: req.user, id: req.params.id }); successResponse(res, { message: 'Comment deleted' }); } catch (e) { next(e); } };

module.exports = { addComment, getComments, editComment, deleteComment };
