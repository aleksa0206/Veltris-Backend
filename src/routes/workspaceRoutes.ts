import { Router } from 'express';
import {
  acceptInvitationHandler,
  changeRoleHandler,
  createWorkspaceHandler,
  getInvitationsHandler,
  getMembersHandler,
  getMyWorkspacesHandler,
  getOverviewHandler,
  getWorkspaceHandler,
  inviteMemberHandler,
  previewInvitationHandler,
  removeMemberHandler,
  renameWorkspaceHandler,
  revokeInvitationHandler,
} from '../controllers/workspaceController';
import { authMiddleware } from '../middleware/authMiddleware';
import { loginDbRateLimiter } from '../middleware/dbRateLimiter';
import { validate } from '../middleware/validate';
import {
  changeRoleSchema,
  invitationTokenSchema,
  inviteMemberSchema,
  workspaceSchema,
} from '../validation/workspaceSchemas';

const router = Router();

router.get('/workspaces', authMiddleware, getMyWorkspacesHandler);
router.post('/workspaces', authMiddleware, validate(workspaceSchema), createWorkspaceHandler);
router.get('/workspaces/:workspaceId', authMiddleware, getWorkspaceHandler);
router.put(
  '/workspaces/:workspaceId',
  authMiddleware,
  validate(workspaceSchema),
  renameWorkspaceHandler
);
router.get('/workspaces/:workspaceId/overview', authMiddleware, getOverviewHandler);

router.get('/workspaces/:workspaceId/members', authMiddleware, getMembersHandler);
router.post(
  '/workspaces/:workspaceId/members',
  authMiddleware,
  validate(inviteMemberSchema),
  inviteMemberHandler
);
router.put(
  '/workspaces/:workspaceId/members/:userId',
  authMiddleware,
  validate(changeRoleSchema),
  changeRoleHandler
);
router.delete('/workspaces/:workspaceId/members/:userId', authMiddleware, removeMemberHandler);

router.get('/workspaces/:workspaceId/invitations', authMiddleware, getInvitationsHandler);
router.delete(
  '/workspaces/:workspaceId/invitations/:invitationId',
  authMiddleware,
  revokeInvitationHandler
);
// Public: the token is the secret. Rate-limited like sign-in, so tokens cannot be guessed at speed.
router.post(
  '/invitations/preview',
  loginDbRateLimiter,
  validate(invitationTokenSchema),
  previewInvitationHandler
);
router.post(
  '/invitations/accept',
  authMiddleware,
  validate(invitationTokenSchema),
  acceptInvitationHandler
);

export default router;
