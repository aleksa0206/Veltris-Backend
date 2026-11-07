import { ProjectStatus, WorkspaceRole } from '@prisma/client';
import * as projectRepository from '../repositories/projectRepository';
import { NotFoundError } from '../errors/NotFoundError';
import { compact } from '../utils/queryParams';
import { assertMembers, MANAGERS, requireMember } from './workspaceService';

export type ProjectInput = {
  key?: string | undefined;
  name?: string | undefined;
  description?: string | null | undefined;
  status?: ProjectStatus | undefined;
  leadId?: number | null | undefined;
  startDate?: Date | null | undefined;
  targetDate?: Date | null | undefined;
};

/** The project, after checking the caller is a member of its workspace (with one of `roles`). */
export async function getProjectForMember(
  projectId: number,
  userId: number,
  roles?: WorkspaceRole[]
) {
  const project = await projectRepository.findProjectById(projectId);
  if (!project) {
    throw new NotFoundError('Project');
  }
  const membership = await requireMember(project.workspaceId, userId, roles);
  return { project, membership };
}

export async function getAllProjects(
  workspaceId: number,
  userId: number,
  filters: projectRepository.ProjectFilters,
  sort: projectRepository.ProjectSort,
  today: Date,
  pagination: { skip: number; take: number }
) {
  await requireMember(workspaceId, userId);
  return await projectRepository.findAllProjects(workspaceId, filters, sort, today, pagination);
}

export async function getProject(projectId: number, userId: number, today: Date) {
  await getProjectForMember(projectId, userId);
  return await projectRepository.findProjectWithCounts(projectId, today);
}

export async function createProject(
  workspaceId: number,
  input: ProjectInput & { key: string; name: string },
  userId: number
) {
  await requireMember(workspaceId, userId);
  if (input.leadId) await assertMembers(workspaceId, 'leadId', [input.leadId]);
  return await projectRepository.createProject(workspaceId, {
    key: input.key,
    name: input.name,
    description: input.description ?? null,
    status: input.status ?? 'Active',
    leadId: input.leadId ?? null,
    startDate: input.startDate ?? null,
    targetDate: input.targetDate ?? null,
  });
}

export async function updateProject(projectId: number, input: ProjectInput, userId: number) {
  const { project } = await getProjectForMember(projectId, userId);
  if (input.leadId) await assertMembers(project.workspaceId, 'leadId', [input.leadId]);
  return await projectRepository.updateProject(projectId, compact(input));
}

export async function deleteProject(projectId: number, userId: number) {
  await getProjectForMember(projectId, userId, MANAGERS);
  return await projectRepository.removeProject(projectId);
}
