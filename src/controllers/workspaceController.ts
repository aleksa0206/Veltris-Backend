import type { Request, Response, NextFunction } from 'express';
import * as workspaceService from '../services/workspaceService';
import * as overviewService from '../services/overviewService';
import { todayUtc } from '../utils/dates';
import { parseOptionalDateQuery } from '../utils/queryParams';

export async function getMyWorkspacesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await workspaceService.getMyWorkspaces(req.user!.userId));
  } catch (err) {
    next(err);
  }
}

export async function getWorkspaceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = Number(req.params.workspaceId);
    res.json(await workspaceService.getWorkspace(workspaceId, req.user!.userId));
  } catch (err) {
    next(err);
  }
}

export async function createWorkspaceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await workspaceService.createWorkspace(req.body.name, req.user!.userId));
  } catch (err) {
    next(err);
  }
}

export async function renameWorkspaceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = Number(req.params.workspaceId);
    res.json(await workspaceService.renameWorkspace(workspaceId, req.body.name, req.user!.userId));
  } catch (err) {
    next(err);
  }
}

export async function getMembersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = Number(req.params.workspaceId);
    res.json(await workspaceService.getMembers(workspaceId, req.user!.userId));
  } catch (err) {
    next(err);
  }
}

export async function addMemberHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = Number(req.params.workspaceId);
    res.status(201).json(await workspaceService.addMember(workspaceId, req.body, req.user!.userId));
  } catch (err) {
    next(err);
  }
}

export async function getOverviewHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = Number(req.params.workspaceId);
    const today = parseOptionalDateQuery(req, 'today') ?? todayUtc();
    res.json(await overviewService.getOverview(workspaceId, req.user!.userId, today));
  } catch (err) {
    next(err);
  }
}
