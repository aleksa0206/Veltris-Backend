import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/config/prismaClient';
import { resetContainer, setContainer } from '../src/container';
import { cleanDatabase, disconnectDb } from './helpers/testDb';
import { bearer } from './helpers/testHelpers';
import { createTestProject, createTestUser, createTestWorkspace } from './helpers/testFactory';

/** Captures the invitation link token the email service would have sent. */
function captureInvitations() {
  const sent: Array<{ to: string; token: string; workspaceName: string }> = [];
  setContainer({
    email: {
      sendInvitationEmail: jest.fn(
        async (to: string, invitation: { token: string; workspaceName: string }) => {
          sent.push({ to, token: invitation.token, workspaceName: invitation.workspaceName });
        }
      ),
    } as any,
  });
  return sent;
}

async function setup() {
  const { user: owner } = await createTestUser({ firstName: 'Ana' });
  const { user: admin } = await createTestUser();
  const { user: member } = await createTestUser();
  const workspace = await createTestWorkspace(owner.id, [
    { userId: admin.id, role: 'Admin' },
    { userId: member.id, role: 'Member' },
  ]);
  return { owner, admin, member, workspace };
}

describe('Members and invitations', () => {
  afterEach(async () => {
    resetContainer();
    await cleanDatabase();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  it('inviting an unknown email sends a link; signing up with it joins that workspace only', async () => {
    const { owner, workspace } = await setup();
    const sent = captureInvitations();

    const invite = await request(app)
      .post(`/workspaces/${workspace.id}/members`)
      .set('Authorization', bearer(owner))
      .send({ email: 'New.Person@Test.com' });
    expect(invite.body).toEqual({ outcome: 'invited' });
    expect(sent).toEqual([
      { to: 'new.person@test.com', token: expect.any(String), workspaceName: 'Acme' },
    ]);

    const preview = await request(app).post('/invitations/preview').send({ token: sent[0]!.token });
    expect(preview.body).toMatchObject({
      status: 'open',
      email: 'new.person@test.com',
      workspace: { id: workspace.id, name: 'Acme' },
      hasAccount: false,
    });

    const wrongEmail = await request(app).post('/auth/register').send({
      firstName: 'Eve',
      lastName: 'X',
      email: 'eve@test.com',
      password: 'password123',
      invitationToken: sent[0]!.token,
    });
    expect(wrongEmail.status).toBe(400);

    const registered = await request(app).post('/auth/register').send({
      firstName: 'New',
      lastName: 'Person',
      email: 'new.person@test.com',
      password: 'password123',
      invitationToken: sent[0]!.token,
    });
    expect(registered.status).toBe(201);

    const mine = await request(app)
      .get('/workspaces')
      .set('Authorization', `Bearer ${registered.body.token}`);
    expect(mine.body).toEqual([expect.objectContaining({ id: workspace.id, role: 'Member' })]);

    const reused = await request(app).post('/invitations/preview').send({ token: sent[0]!.token });
    expect(reused.body.status).toBe('accepted');
  });

  it('an existing account accepts with its own email only, and only once', async () => {
    const { owner, workspace } = await setup();
    const sent = captureInvitations();
    await request(app)
      .post(`/workspaces/${workspace.id}/members`)
      .set('Authorization', bearer(owner))
      .send({ email: 'later@test.com', role: 'Admin' });
    // The account is created after the invitation was sent.
    const { user: later } = await createTestUser({ email: 'later@test.com' });
    const { user: someoneElse } = await createTestUser();

    const stolen = await request(app)
      .post('/invitations/accept')
      .set('Authorization', bearer(someoneElse))
      .send({ token: sent[0]!.token });
    expect(stolen.status).toBe(403);

    const accepted = await request(app)
      .post('/invitations/accept')
      .set('Authorization', bearer(later))
      .send({ token: sent[0]!.token });
    expect(accepted.body).toEqual({ workspaceId: workspace.id });
    const membership = await prisma.workspaceMember.findUniqueOrThrow({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: later.id } },
    });
    expect(membership.role).toBe('Admin');

    const twice = await request(app)
      .post('/invitations/accept')
      .set('Authorization', bearer(later))
      .send({ token: sent[0]!.token });
    expect(twice.status).toBe(409);
  });

  it('expired invitations cannot be used; inviting again renews the link', async () => {
    const { owner, workspace } = await setup();
    const sent = captureInvitations();
    const invite = () =>
      request(app)
        .post(`/workspaces/${workspace.id}/members`)
        .set('Authorization', bearer(owner))
        .send({ email: 'slow@test.com' });

    await invite();
    await prisma.invitation.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await request(app).post('/invitations/preview').send({ token: sent[0]!.token });
    expect(expired.body.status).toBe('expired');

    await invite();
    expect(await prisma.invitation.count()).toBe(1);
    const renewed = await request(app).post('/invitations/preview').send({ token: sent[1]!.token });
    expect(renewed.body.status).toBe('open');
    const old = await request(app).post('/invitations/preview').send({ token: sent[0]!.token });
    expect(old.status).toBe(404);
  });

  it('managers list and revoke pending invitations; members cannot', async () => {
    const { owner, member, workspace } = await setup();
    captureInvitations();
    await request(app)
      .post(`/workspaces/${workspace.id}/members`)
      .set('Authorization', bearer(owner))
      .send({ email: 'pending@test.com' });

    const denied = await request(app)
      .get(`/workspaces/${workspace.id}/invitations`)
      .set('Authorization', bearer(member));
    expect(denied.status).toBe(403);

    const list = await request(app)
      .get(`/workspaces/${workspace.id}/invitations`)
      .set('Authorization', bearer(owner));
    expect(list.body).toEqual([
      expect.objectContaining({ email: 'pending@test.com', role: 'Member' }),
    ]);
    expect(list.body[0].tokenHash).toBeUndefined();

    const revoked = await request(app)
      .delete(`/workspaces/${workspace.id}/invitations/${list.body[0].id}`)
      .set('Authorization', bearer(owner));
    expect(revoked.status).toBe(200);
    expect(await prisma.invitation.count()).toBe(0);
  });

  it('roles change between Admin and Member; the owner cannot be changed or removed', async () => {
    const { owner, admin, member, workspace } = await setup();

    const promoted = await request(app)
      .put(`/workspaces/${workspace.id}/members/${member.id}`)
      .set('Authorization', bearer(admin))
      .send({ role: 'Admin' });
    expect(promoted.body).toContainEqual(expect.objectContaining({ id: member.id, role: 'Admin' }));

    const demoteOwner = await request(app)
      .put(`/workspaces/${workspace.id}/members/${owner.id}`)
      .set('Authorization', bearer(admin))
      .send({ role: 'Member' });
    expect(demoteOwner.status).toBe(403);

    const makeOwner = await request(app)
      .put(`/workspaces/${workspace.id}/members/${member.id}`)
      .set('Authorization', bearer(owner))
      .send({ role: 'Owner' });
    expect(makeOwner.status).toBe(400);

    const ownerLeaves = await request(app)
      .delete(`/workspaces/${workspace.id}/members/${owner.id}`)
      .set('Authorization', bearer(owner));
    expect(ownerLeaves.status).toBe(403);
  });

  it('removing a member unassigns their open tasks and project leads, with history', async () => {
    const { owner, member, admin, workspace } = await setup();
    const project = await createTestProject(workspace.id);
    await prisma.project.update({ where: { id: project.id }, data: { leadId: member.id } });
    const create = (body: object) =>
      request(app)
        .post(`/projects/${project.id}/tasks`)
        .set('Authorization', bearer(owner))
        .send(body);
    const open = await create({ title: 'Open', assigneeId: member.id });
    const done = await create({ title: 'Done', assigneeId: member.id, status: 'Done' });

    const byMember = await request(app)
      .delete(`/workspaces/${workspace.id}/members/${admin.id}`)
      .set('Authorization', bearer(member));
    expect(byMember.status).toBe(403);

    const removed = await request(app)
      .delete(`/workspaces/${workspace.id}/members/${member.id}`)
      .set('Authorization', bearer(owner));
    expect(removed.body).toEqual({ unassignedTasks: 1 });

    const after = await prisma.task.findMany({ orderBy: { id: 'asc' } });
    expect(after.map((t) => t.assigneeId)).toEqual([null, member.id]);
    expect(
      (await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).leadId
    ).toBeNull();
    const history = await prisma.taskActivity.findMany({
      where: { taskId: open.body.id, type: 'AssigneeChanged', toValue: null },
    });
    expect(history).toHaveLength(1);
    expect(done.body.assignee.id).toBe(member.id);

    const gone = await request(app)
      .get(`/workspaces/${workspace.id}`)
      .set('Authorization', bearer(member));
    expect(gone.status).toBe(403);
  });

  it('any member can leave on their own', async () => {
    const { member, workspace } = await setup();
    const left = await request(app)
      .delete(`/workspaces/${workspace.id}/members/${member.id}`)
      .set('Authorization', bearer(member));
    expect(left.status).toBe(200);
  });
});
