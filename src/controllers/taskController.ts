import type { Request, Response, NextFunction } from 'express';
import * as taskService from '../services/taskService';
import { TASK_SORTS, TaskFilters } from '../repositories/taskRepository';
import { TASK_PRIORITIES, TASK_STATUSES } from '../validation/taskSchemas';
import { ValidationError } from '../errors/ValidationError';
import { buildPaginationMeta, parsePagination } from '../utils/pagination';
import {
  parseOptionalBooleanQuery,
  parseOptionalEnumListQuery,
  parseOptionalEnumQuery,
  parseOptionalSearchQuery,
} from '../utils/queryParams';

const IDENTIFIER = /^([A-Za-z][A-Za-z0-9]{1,9})-(\d{1,9})$/;

/** `assigneeId` is `me`, `none` (unassigned) or a user id. */
function parseAssignee(req: Request): number | null | undefined {
  const raw = req.query.assigneeId;
  if (raw === undefined) return undefined;
  if (raw === 'me') return req.user!.userId;
  if (raw === 'none') return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    const message = 'must be me, none or a positive integer';
    throw new ValidationError(`assigneeId: ${message}`, [{ path: 'assigneeId', message }]);
  }
  return id;
}

function parseTaskFilters(req: Request): TaskFilters {
  const search = parseOptionalSearchQuery(req, 'search');
  const identifier = search?.match(IDENTIFIER);
  return {
    status: parseOptionalEnumListQuery(req, 'status', TASK_STATUSES),
    priority: parseOptionalEnumListQuery(req, 'priority', TASK_PRIORITIES),
    open: parseOptionalBooleanQuery(req, 'open'),
    topLevel: parseOptionalBooleanQuery(req, 'topLevel'),
    assigneeId: parseAssignee(req),
    search,
    // Typing WEB-12 finds that task rather than titles containing "WEB-12".
    identifier: identifier
      ? { key: identifier[1]!.toUpperCase(), number: Number(identifier[2]) }
      : undefined,
  };
}

function listResponse(res: Response, pagination: { page: number; limit: number }) {
  return ({ data, total }: { data: unknown[]; total: number }) =>
    res.json({ data, meta: buildPaginationMeta(total, pagination.page, pagination.limit) });
}

export async function getProjectTasksHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const projectId = Number(req.params.projectId);
    const pagination = parsePagination(req);
    const sort = parseOptionalEnumQuery(req, 'sort', TASK_SORTS) ?? 'board';
    listResponse(
      res,
      pagination
    )(
      await taskService.getProjectTasks(
        projectId,
        req.user!.userId,
        parseTaskFilters(req),
        sort,
        pagination
      )
    );
  } catch (err) {
    next(err);
  }
}

export async function getWorkspaceTasksHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = Number(req.params.workspaceId);
    const pagination = parsePagination(req);
    const sort = parseOptionalEnumQuery(req, 'sort', TASK_SORTS) ?? 'updated';
    listResponse(
      res,
      pagination
    )(
      await taskService.getWorkspaceTasks(
        workspaceId,
        req.user!.userId,
        parseTaskFilters(req),
        sort,
        pagination
      )
    );
  } catch (err) {
    next(err);
  }
}

export async function getTaskHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await taskService.getTask(Number(req.params.taskId), req.user!.userId));
  } catch (err) {
    next(err);
  }
}

export async function createTaskHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const projectId = Number(req.params.projectId);
    res.status(201).json(await taskService.createTask(projectId, req.body, req.user!.userId));
  } catch (err) {
    next(err);
  }
}

export async function updateTaskHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const taskId = Number(req.params.taskId);
    res.json(await taskService.updateTask(taskId, req.body, req.user!.userId));
  } catch (err) {
    next(err);
  }
}

export async function moveTaskHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const taskId = Number(req.params.taskId);
    res.json(await taskService.moveTask(taskId, req.body, req.user!.userId));
  } catch (err) {
    next(err);
  }
}

export async function deleteTaskHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await taskService.deleteTask(Number(req.params.taskId), req.user!.userId));
  } catch (err) {
    next(err);
  }
}

export async function getCommentsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await taskService.getComments(Number(req.params.taskId), req.user!.userId));
  } catch (err) {
    next(err);
  }
}

export async function addCommentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const taskId = Number(req.params.taskId);
    res.status(201).json(await taskService.addComment(taskId, req.body.body, req.user!.userId));
  } catch (err) {
    next(err);
  }
}

export async function editCommentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const commentId = Number(req.params.commentId);
    res.json(await taskService.editComment(commentId, req.body.body, req.user!.userId));
  } catch (err) {
    next(err);
  }
}

export async function deleteCommentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await taskService.deleteComment(Number(req.params.commentId), req.user!.userId));
  } catch (err) {
    next(err);
  }
}

export async function getActivityHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await taskService.getActivity(Number(req.params.taskId), req.user!.userId));
  } catch (err) {
    next(err);
  }
}
