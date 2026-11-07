import { Prisma, ProjectStatus } from '@prisma/client';
import { prisma } from '../config/prismaClient';
import { compact } from '../utils/queryParams';
import { userRefSelect } from './userRepository';

export const PROJECT_SORTS = ['name', 'targetDate', 'updated'] as const;
export type ProjectSort = (typeof PROJECT_SORTS)[number];

export type ProjectFilters = {
  status?: ProjectStatus[] | undefined;
  /** Matches name or key. */
  search?: string | undefined;
};

const ORDER_BY: Record<ProjectSort, Prisma.ProjectOrderByWithRelationInput[]> = {
  name: [{ name: 'asc' }, { id: 'asc' }],
  targetDate: [{ targetDate: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }, { id: 'asc' }],
  updated: [{ updatedAt: 'desc' }, { id: 'desc' }],
};

const projectInclude = { lead: { select: userRefSelect } } as const;

type TaskCounts = { total: number; done: number; open: number; overdue: number };

/**
 * Top-level task counts per project. Cancelled tasks count for nothing; `overdue` is open tasks
 * due before `today`.
 */
async function taskCounts(projectIds: number[], today: Date): Promise<Map<number, TaskCounts>> {
  const counts = new Map<number, TaskCounts>(
    projectIds.map((id) => [id, { total: 0, done: 0, open: 0, overdue: 0 }])
  );
  if (projectIds.length === 0) return counts;
  const base = { projectId: { in: projectIds }, parentId: null };
  const [byStatus, overdue] = await Promise.all([
    prisma.task.groupBy({
      by: ['projectId', 'status'],
      where: { ...base, status: { not: 'Cancelled' } },
      _count: { _all: true },
      orderBy: { projectId: 'asc' },
    }),
    prisma.task.groupBy({
      by: ['projectId'],
      where: { ...base, status: { notIn: ['Done', 'Cancelled'] }, dueDate: { lt: today } },
      _count: { _all: true },
      orderBy: { projectId: 'asc' },
    }),
  ]);
  for (const row of byStatus) {
    const entry = counts.get(row.projectId)!;
    entry.total += row._count._all;
    if (row.status === 'Done') entry.done += row._count._all;
    else entry.open += row._count._all;
  }
  for (const row of overdue) counts.get(row.projectId)!.overdue = row._count._all;
  return counts;
}

export async function findAllProjects(
  workspaceId: number,
  filters: ProjectFilters,
  sort: ProjectSort,
  today: Date,
  pagination: { skip: number; take: number }
) {
  const where = compact({
    workspaceId,
    status: filters.status ? { in: filters.status } : undefined,
    OR: filters.search
      ? [{ name: { contains: filters.search } }, { key: { contains: filters.search } }]
      : undefined,
  });
  const [rows, total] = await Promise.all([
    prisma.project.findMany({
      where,
      include: projectInclude,
      orderBy: ORDER_BY[sort],
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.project.count({ where }),
  ]);
  const counts = await taskCounts(
    rows.map((row) => row.id),
    today
  );
  return { data: rows.map((row) => ({ ...row, tasks: counts.get(row.id)! })), total };
}

export async function findProjectById(id: number) {
  return await prisma.project.findUnique({ where: { id }, include: projectInclude });
}

export async function findProjectWithCounts(id: number, today: Date) {
  const project = await findProjectById(id);
  if (!project) return null;
  const counts = await taskCounts([id], today);
  return { ...project, tasks: counts.get(id)! };
}

export type ProjectData = {
  key: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  leadId: number | null;
  startDate: Date | null;
  targetDate: Date | null;
};

export async function createProject(workspaceId: number, data: ProjectData) {
  return await prisma.project.create({
    data: { ...data, workspaceId },
    include: projectInclude,
  });
}

export async function updateProject(id: number, data: Partial<ProjectData>) {
  return await prisma.project.update({ where: { id }, data, include: projectInclude });
}

/** Deletes the project with all its tasks, their comments and history. */
export async function removeProject(id: number) {
  return await prisma.$transaction(async (tx) => {
    const taskWhere = { task: { projectId: id } };
    await tx.comment.deleteMany({ where: taskWhere });
    await tx.taskActivity.deleteMany({ where: taskWhere });
    // Subtasks first: parentId is ON DELETE RESTRICT.
    await tx.task.deleteMany({ where: { projectId: id, parentId: { not: null } } });
    await tx.task.deleteMany({ where: { projectId: id } });
    return await tx.project.delete({ where: { id } });
  });
}
