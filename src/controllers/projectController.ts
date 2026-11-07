import type { Request, Response, NextFunction } from 'express';
import * as projectService from '../services/projectService';
import { PROJECT_SORTS } from '../repositories/projectRepository';
import { PROJECT_STATUSES } from '../validation/projectSchemas';
import { todayUtc } from '../utils/dates';
import { buildPaginationMeta, parsePagination } from '../utils/pagination';
import {
  parseOptionalDateQuery,
  parseOptionalEnumListQuery,
  parseOptionalEnumQuery,
  parseOptionalSearchQuery,
} from '../utils/queryParams';

export async function getAllProjectsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = Number(req.params.workspaceId);
    const pagination = parsePagination(req);
    const filters = {
      status: parseOptionalEnumListQuery(req, 'status', PROJECT_STATUSES),
      search: parseOptionalSearchQuery(req, 'search'),
    };
    const sort = parseOptionalEnumQuery(req, 'sort', PROJECT_SORTS) ?? 'name';
    const today = parseOptionalDateQuery(req, 'today') ?? todayUtc();
    const { data, total } = await projectService.getAllProjects(
      workspaceId,
      req.user!.userId,
      filters,
      sort,
      today,
      pagination
    );
    res.json({ data, meta: buildPaginationMeta(total, pagination.page, pagination.limit) });
  } catch (err) {
    next(err);
  }
}

export async function getProjectHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const projectId = Number(req.params.projectId);
    const today = parseOptionalDateQuery(req, 'today') ?? todayUtc();
    res.json(await projectService.getProject(projectId, req.user!.userId, today));
  } catch (err) {
    next(err);
  }
}

export async function createProjectHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = Number(req.params.workspaceId);
    res
      .status(201)
      .json(await projectService.createProject(workspaceId, req.body, req.user!.userId));
  } catch (err) {
    next(err);
  }
}

export async function updateProjectHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const projectId = Number(req.params.projectId);
    res.json(await projectService.updateProject(projectId, req.body, req.user!.userId));
  } catch (err) {
    next(err);
  }
}

export async function deleteProjectHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const projectId = Number(req.params.projectId);
    res.json(await projectService.deleteProject(projectId, req.user!.userId));
  } catch (err) {
    next(err);
  }
}
