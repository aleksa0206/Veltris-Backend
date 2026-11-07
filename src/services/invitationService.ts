import * as invitationRepository from '../repositories/invitationRepository';
import * as userRepository from '../repositories/userRepository';
import { ConflictError } from '../errors/ConflictError';
import { ForbiddenError } from '../errors/ForbiddenError';
import { NotFoundError } from '../errors/NotFoundError';
import { hashToken } from '../utils/tokens';

type InvitationStatus = 'open' | 'accepted' | 'expired';

function statusOf(invitation: { acceptedAt: Date | null; expiresAt: Date }): InvitationStatus {
  if (invitation.acceptedAt) return 'accepted';
  return invitation.expiresAt > new Date() ? 'open' : 'expired';
}

export function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** The invitation behind a link, for anyone holding it (the token is the secret). */
export async function findByToken(token: string) {
  const invitation = await invitationRepository.findInvitationByTokenHash(hashToken(token));
  if (!invitation) {
    throw new NotFoundError('Invitation');
  }
  return { invitation, status: statusOf(invitation) };
}

/** What the invite page shows before the person signs in or signs up. */
export async function preview(token: string) {
  const { invitation, status } = await findByToken(token);
  return {
    status,
    email: invitation.email,
    role: invitation.role,
    workspace: invitation.workspace,
    invitedBy: invitation.invitedBy,
    // Lets the page offer "Sign in" rather than "Create account".
    hasAccount: !!(await userRepository.findUserByEmail(invitation.email)),
  };
}

/** Joins the workspace as the signed-in user, who must own the invited email address. */
export async function accept(token: string, userId: number) {
  const { invitation, status } = await findByToken(token);
  if (status !== 'open') {
    throw new ConflictError('This invitation is no longer valid');
  }
  const user = await userRepository.findById(userId);
  if (!user || !sameEmail(user.email, invitation.email)) {
    throw new ForbiddenError('This invitation was sent to a different email address');
  }
  if (!(await invitationRepository.acceptInvitation(invitation.id, userId, new Date()))) {
    throw new ConflictError('This invitation is no longer valid');
  }
  return { workspaceId: invitation.workspaceId };
}
