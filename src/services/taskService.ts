import { TaskPriority, TaskStatus } from '@prisma/client';
import * as taskRepository from '../repositories/taskRepository';
import * as commentRepository from '../repositories/commentRepository';
import * as activityRepository from '../repositories/activityRepository';
import { ForbiddenError } from '../errors/ForbiddenError';
import { NotFoundError } from '../errors/NotFoundError';
import { ValidationError } from '../errors/ValidationError';
import { compact } from '../utils/queryParams';
import { getProjectForMember } from './projectService';
import { assertMembers, MANAGERS, requireMember } from './workspaceService';

export type TaskInput = {
  title?: string | undefined;
  description?: string | null | undefined;
  status?: TaskStatus | undefined;
  priority?: TaskPriority | undefined;
  assigneeId?: number | null | undefined;
  dueDate?: Date | null | undefined;
};

function invalid(path: string, message: string) {
  return new ValidationError(`${path}: ${message}`, [{ path, message }]);
}

/** The task with its details, after checking the caller is a member of its workspace. */
export async function getTaskForMember(taskId: number, userId: number) {
  const task = await taskRepository.findTaskById(taskId);
  if (!task) {
    throw new NotFoundError('Task');
  }
  const membership = await requireMember(task.project.workspaceId, userId);
  return { task, membership };
}

export async function getProjectTasks(
  projectId: number,
  userId: number,
  filters: Omit<taskRepository.TaskFilters, 'projectId' | 'workspaceId'>,
  sort: taskRepository.TaskSort,
  pagination: { skip: number; take: number }
) {
  await getProjectForMember(projectId, userId);
  return await taskRepository.findAllTasks({ ...filters, projectId }, sort, pagination);
}

export async function getWorkspaceTasks(
  workspaceId: number,
  userId: number,
  filters: Omit<taskRepository.TaskFilters, 'workspaceId'>,
  sort: taskRepository.TaskSort,
  pagination: { skip: number; take: number }
) {
  await requireMember(workspaceId, userId);
  return await taskRepository.findAllTasks({ ...filters, workspaceId }, sort, pagination);
}

export async function getTask(taskId: number, userId: number) {
  return (await getTaskForMember(taskId, userId)).task;
}

export async function createTask(
  projectId: number,
  input: TaskInput & { title: string; parentId?: number | null | undefined },
  userId: number
) {
  const { project } = await getProjectForMember(projectId, userId);
  if (input.assigneeId) await assertMembers(project.workspaceId, 'assigneeId', [input.assigneeId]);
  if (input.parentId) {
    const parent = await taskRepository.findTaskInProject(input.parentId, projectId);
    if (!parent) throw invalid('parentId', 'must be a task in the same project');
    // One level only, so a subtask list never needs a board of its own.
    if (parent.parentId !== null) throw invalid('parentId', 'a subtask cannot have subtasks');
  }
  const task = await taskRepository.createTask(
    projectId,
    {
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? 'Todo',
      priority: input.priority ?? 'None',
      assigneeId: input.assigneeId ?? null,
      dueDate: input.dueDate ?? null,
    },
    input.parentId ?? null,
    userId
  );
  return await getTask(task.id, userId);
}

export async function updateTask(taskId: number, input: TaskInput, userId: number) {
  const { task } = await getTaskForMember(taskId, userId);
  if (input.assigneeId) {
    await assertMembers(task.project.workspaceId, 'assigneeId', [input.assigneeId]);
  }
  await taskRepository.updateTask(taskId, compact(input), userId);
  return await getTask(taskId, userId);
}

export async function moveTask(
  taskId: number,
  input: { status: TaskStatus; beforeTaskId: number | null },
  userId: number
) {
  const { task } = await getTaskForMember(taskId, userId);
  if (input.beforeTaskId !== null) {
    const below = await taskRepository.findTaskInProject(input.beforeTaskId, task.projectId);
    if (
      !below ||
      below.id === taskId ||
      below.parentId !== task.parentId ||
      below.status !== input.status
    ) {
      throw invalid('beforeTaskId', 'must be another task in the target column');
    }
  }
  await taskRepository.moveTask(taskId, input.status, input.beforeTaskId, userId);
  return await getTask(taskId, userId);
}

/** The reporter can delete their task; owners and admins can delete any. */
export async function deleteTask(taskId: number, userId: number) {
  const { task, membership } = await getTaskForMember(taskId, userId);
  if (task.reporterId !== userId && !MANAGERS.includes(membership.role)) {
    throw new ForbiddenError('Only the reporter or a workspace admin can delete this task');
  }
  return await taskRepository.removeTask(taskId);
}

export async function getComments(taskId: number, userId: number) {
  await getTaskForMember(taskId, userId);
  return await commentRepository.findComments(taskId);
}

export async function addComment(taskId: number, body: string, userId: number) {
  await getTaskForMember(taskId, userId);
  return await commentRepository.createComment(taskId, userId, body);
}

async function getCommentForMember(commentId: number, userId: number) {
  const comment = await commentRepository.findCommentById(commentId);
  if (!comment) {
    throw new NotFoundError('Comment');
  }
  const { membership } = await getTaskForMember(comment.taskId, userId);
  return { comment, membership };
}

export async function editComment(commentId: number, body: string, userId: number) {
  const { comment } = await getCommentForMember(commentId, userId);
  if (comment.authorId !== userId) {
    throw new ForbiddenError('Only the author can edit a comment');
  }
  return await commentRepository.updateComment(commentId, body);
}

/** The author can delete their comment; owners and admins can delete any (moderation). */
export async function deleteComment(commentId: number, userId: number) {
  const { comment, membership } = await getCommentForMember(commentId, userId);
  if (comment.authorId !== userId && !MANAGERS.includes(membership.role)) {
    throw new ForbiddenError('Only the author or a workspace admin can delete a comment');
  }
  return await commentRepository.removeComment(commentId);
}

export async function getActivity(taskId: number, userId: number) {
  await getTaskForMember(taskId, userId);
  return await activityRepository.findTaskActivity(taskId);
}
