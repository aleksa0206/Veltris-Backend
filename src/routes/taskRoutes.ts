import { Router } from 'express';
import {
  addCommentHandler,
  createTaskHandler,
  deleteCommentHandler,
  deleteTaskHandler,
  editCommentHandler,
  getActivityHandler,
  getCommentsHandler,
  getProjectTasksHandler,
  getTaskHandler,
  getWorkspaceTasksHandler,
  moveTaskHandler,
  updateTaskHandler,
} from '../controllers/taskController';
import { authMiddleware } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import {
  commentSchema,
  createTaskSchema,
  moveTaskSchema,
  updateTaskSchema,
} from '../validation/taskSchemas';

const router = Router();

router.get('/workspaces/:workspaceId/tasks', authMiddleware, getWorkspaceTasksHandler);
router.get('/projects/:projectId/tasks', authMiddleware, getProjectTasksHandler);
router.post(
  '/projects/:projectId/tasks',
  authMiddleware,
  validate(createTaskSchema),
  createTaskHandler
);
router.get('/tasks/:taskId', authMiddleware, getTaskHandler);
router.put('/tasks/:taskId', authMiddleware, validate(updateTaskSchema), updateTaskHandler);
router.post('/tasks/:taskId/move', authMiddleware, validate(moveTaskSchema), moveTaskHandler);
router.delete('/tasks/:taskId', authMiddleware, deleteTaskHandler);
router.get('/tasks/:taskId/comments', authMiddleware, getCommentsHandler);
router.post('/tasks/:taskId/comments', authMiddleware, validate(commentSchema), addCommentHandler);
router.put('/comments/:commentId', authMiddleware, validate(commentSchema), editCommentHandler);
router.delete('/comments/:commentId', authMiddleware, deleteCommentHandler);
router.get('/tasks/:taskId/activity', authMiddleware, getActivityHandler);

export default router;
