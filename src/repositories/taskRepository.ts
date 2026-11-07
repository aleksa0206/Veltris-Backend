import { ActivityType, Prisma, TaskPriority, TaskStatus } from '@prisma/client';
import { prisma } from '../config/prismaClient';
import { isoDay } from '../utils/dates';
import { needsRenumber, positionBetween, POSITION_STEP } from '../utils/positions';
import { compact } from '../utils/queryParams';
import { userRefSelect } from './userRepository';

export const TASK_SORTS = ['board', 'due', 'priority', 'updated'] as const;
export type TaskSort = (typeof TASK_SORTS)[number];

const ORDER_BY: Record<TaskSort, Prisma.TaskOrderByWithRelationInput[]> = {
  board: [{ status: 'asc' }, { position: 'asc' }, { id: 'asc' }],
  due: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { priority: 'desc' }, { id: 'asc' }],
  // Enum columns sort by declaration order: None < Low < ... < Urgent.
  priority: [{ priority: 'desc' }, { dueDate: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
  updated: [{ updatedAt: 'desc' }, { id: 'desc' }],
};

const taskInclude = {
  project: { select: { id: true, key: true, name: true } },
  assignee: { select: userRefSelect },
  subtasks: { select: { status: true } },
  _count: { select: { comments: true } },
} as const;

type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

// Lists carry subtask progress, not the subtasks themselves.
function toTask({ subtasks, _count, ...task }: TaskRow) {
  return {
    ...task,
    subtaskCount: subtasks.length,
    subtasksDone: subtasks.filter((subtask) => subtask.status === 'Done').length,
    commentCount: _count.comments,
  };
}

const OPEN: TaskStatus[] = ['Backlog', 'Todo', 'InProgress', 'InReview'];

export type TaskFilters = {
  workspaceId?: number | undefined;
  projectId?: number | undefined;
  /** Only top-level tasks (board cards) unless false. */
  topLevel?: boolean | undefined;
  status?: TaskStatus[] | undefined;
  open?: boolean | undefined;
  priority?: TaskPriority[] | undefined;
  /** `null` = unassigned. */
  assigneeId?: number | null | undefined;
  /** Matches the title. */
  search?: string | undefined;
  /** An exact identifier such as `WEB-12`; replaces the title search. */
  identifier?: { key: string; number: number } | undefined;
  dueBefore?: Date | undefined;
};

function whereFor(filters: TaskFilters): Prisma.TaskWhereInput {
  const status = filters.open ? OPEN : filters.status;
  return compact({
    projectId: filters.projectId,
    project:
      filters.workspaceId || filters.identifier
        ? compact({ workspaceId: filters.workspaceId, key: filters.identifier?.key })
        : undefined,
    number: filters.identifier?.number,
    parentId: filters.topLevel === false ? undefined : null,
    status: status ? { in: status } : undefined,
    priority: filters.priority ? { in: filters.priority } : undefined,
    assigneeId: filters.assigneeId,
    dueDate: filters.dueBefore ? { lt: filters.dueBefore } : undefined,
    title: filters.search && !filters.identifier ? { contains: filters.search } : undefined,
  });
}

export async function findAllTasks(
  filters: TaskFilters,
  sort: TaskSort,
  pagination: { skip: number; take: number }
) {
  const where = whereFor(filters);
  const [rows, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy: ORDER_BY[sort],
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.task.count({ where }),
  ]);
  return { data: rows.map(toTask), total };
}

export async function countTasks(filters: TaskFilters & { completedSince?: Date }) {
  const { completedSince, ...rest } = filters;
  return await prisma.task.count({
    where: {
      ...whereFor(rest),
      ...(completedSince ? { completedAt: { gte: completedSince } } : {}),
    },
  });
}

const taskDetailInclude = {
  project: { select: { id: true, key: true, name: true, workspaceId: true } },
  assignee: { select: userRefSelect },
  reporter: { select: userRefSelect },
  parent: { select: { id: true, number: true, title: true } },
  subtasks: {
    include: { assignee: { select: userRefSelect } },
    orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.TaskInclude;

export async function findTaskById(id: number) {
  return await prisma.task.findUnique({ where: { id }, include: taskDetailInclude });
}

/** The task if it belongs to `projectId` (a subtask parent or a board neighbour). */
export async function findTaskInProject(id: number, projectId: number) {
  return await prisma.task.findFirst({ where: { id, projectId } });
}

export type TaskData = {
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: number | null;
  dueDate: Date | null;
};

type Tx = Prisma.TransactionClient;

async function lastPosition(
  tx: Tx,
  projectId: number,
  status: TaskStatus,
  parentId: number | null
) {
  const last = await tx.task.findFirst({
    where: { projectId, status, parentId },
    orderBy: { position: 'desc' },
    select: { position: true },
  });
  return last?.position ?? null;
}

function completedAtFor(
  status: TaskStatus,
  previous: { status: TaskStatus; completedAt: Date | null } | null
) {
  if (status !== 'Done') return null;
  return previous?.status === 'Done' ? previous.completedAt : new Date();
}

export async function createTask(
  projectId: number,
  data: TaskData,
  parentId: number | null,
  reporterId: number
) {
  return await prisma.$transaction(async (tx) => {
    // The increment is a single UPDATE, so two concurrent creates can never share a number.
    const { nextTaskNumber } = await tx.project.update({
      where: { id: projectId },
      data: { nextTaskNumber: { increment: 1 } },
      select: { nextTaskNumber: true },
    });
    const task = await tx.task.create({
      data: {
        ...data,
        projectId,
        parentId,
        reporterId,
        number: nextTaskNumber - 1,
        position: positionBetween(await lastPosition(tx, projectId, data.status, parentId), null),
        completedAt: completedAtFor(data.status, null),
      },
    });
    await tx.taskActivity.create({
      data: { taskId: task.id, actorId: reporterId, type: 'Created' },
    });
    return task;
  });
}

const TRACKED: Array<[keyof TaskData, ActivityType, (value: unknown) => string | null]> = [
  ['title', 'TitleChanged', (v) => v as string],
  ['status', 'StatusChanged', (v) => v as string],
  ['priority', 'PriorityChanged', (v) => v as string],
  ['assigneeId', 'AssigneeChanged', (v) => (v === null ? null : String(v))],
  ['dueDate', 'DueDateChanged', (v) => isoDay(v as Date | null)],
];

/** Writes one activity entry per tracked field whose value actually changed. */
async function logChanges(
  tx: Tx,
  taskId: number,
  actorId: number,
  before: TaskData,
  after: Partial<TaskData>
) {
  const entries = TRACKED.flatMap(([field, type, serialize]) => {
    if (after[field] === undefined) return [];
    const fromValue = serialize(before[field]);
    const toValue = serialize(after[field]);
    return fromValue === toValue ? [] : [{ taskId, actorId, type, fromValue, toValue }];
  });
  if (entries.length) await tx.taskActivity.createMany({ data: entries });
}

export async function updateTask(id: number, data: Partial<TaskData>, actorId: number) {
  return await prisma.$transaction(async (tx) => {
    const before = await tx.task.findUniqueOrThrow({ where: { id } });
    const statusChange =
      data.status !== undefined && data.status !== before.status
        ? {
            completedAt: completedAtFor(data.status, before),
            // A card that changes column goes to the bottom of its new column.
            position: positionBetween(
              await lastPosition(tx, before.projectId, data.status, before.parentId),
              null
            ),
          }
        : {};
    await tx.task.update({ where: { id }, data: { ...data, ...statusChange } });
    await logChanges(tx, id, actorId, before, data);
  });
}

/**
 * Board drag and drop: puts the task into `status`, right above `beforeTaskId` (already checked
 * to be a card of the same project and column), or at the bottom when that is null.
 */
export async function moveTask(
  id: number,
  status: TaskStatus,
  beforeTaskId: number | null,
  actorId: number
) {
  return await prisma.$transaction(async (tx) => {
    const task = await tx.task.findUniqueOrThrow({ where: { id } });
    const column = { projectId: task.projectId, parentId: task.parentId, status, id: { not: id } };

    const neighbours = async () => {
      if (beforeTaskId === null) {
        return [await lastPosition(tx, task.projectId, status, task.parentId), null] as const;
      }
      const below = await tx.task.findUniqueOrThrow({ where: { id: beforeTaskId } });
      const above = await tx.task.findFirst({
        where: { ...column, position: { lt: below.position } },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      return [above?.position ?? null, below.position] as const;
    };

    let [above, below] = await neighbours();
    if (needsRenumber(above, below)) {
      const cards = await tx.task.findMany({
        where: column,
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });
      for (const [index, card] of cards.entries()) {
        await tx.task.update({
          where: { id: card.id },
          data: { position: (index + 1) * POSITION_STEP },
        });
      }
      [above, below] = await neighbours();
    }

    await tx.task.update({
      where: { id },
      data: {
        status,
        position: positionBetween(above, below),
        completedAt: completedAtFor(status, task),
      },
    });
    await logChanges(tx, id, actorId, task, { status });
  });
}

/** Deletes the task with its subtasks, comments and history. */
export async function removeTask(id: number) {
  return await prisma.$transaction(async (tx) => {
    const ids = [id, ...(await tx.task.findMany({ where: { parentId: id } })).map((t) => t.id)];
    await tx.comment.deleteMany({ where: { taskId: { in: ids } } });
    await tx.taskActivity.deleteMany({ where: { taskId: { in: ids } } });
    await tx.task.deleteMany({ where: { parentId: id } });
    return await tx.task.delete({ where: { id } });
  });
}
