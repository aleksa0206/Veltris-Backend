import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/config/prismaClient';
import { cleanDatabase, disconnectDb } from './helpers/testDb';
import { bearer } from './helpers/testHelpers';
import { createTestProject, createTestUser, createTestWorkspace } from './helpers/testFactory';

describe('Projects', () => {
  afterEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  it('creates a project with an upper-cased key; keys are unique per workspace', async () => {
    const { user } = await createTestUser();
    const workspace = await createTestWorkspace(user.id);
    const auth = bearer(user);

    const res = await request(app)
      .post(`/workspaces/${workspace.id}/projects`)
      .set('Authorization', auth)
      .send({ key: 'web', name: 'Website', leadId: user.id, targetDate: '2027-01-31' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ key: 'WEB', status: 'Active', lead: { id: user.id } });

    const duplicate = await request(app)
      .post(`/workspaces/${workspace.id}/projects`)
      .set('Authorization', auth)
      .send({ key: 'WEB', name: 'Other' });
    expect(duplicate.status).toBe(409);
  });

  it('a project lead must be a member of the workspace', async () => {
    const { user } = await createTestUser();
    const { user: outsider } = await createTestUser();
    const workspace = await createTestWorkspace(user.id);

    const res = await request(app)
      .post(`/workspaces/${workspace.id}/projects`)
      .set('Authorization', bearer(user))
      .send({ key: 'OPS', name: 'Ops', leadId: outsider.id });

    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe('leadId');
  });

  it('filters by status and search, with task counts per project', async () => {
    const { user } = await createTestUser();
    const workspace = await createTestWorkspace(user.id);
    const web = await createTestProject(workspace.id, 'WEB');
    await prisma.project.create({
      data: { workspaceId: workspace.id, key: 'OLD', name: 'Legacy', status: 'Archived' },
    });
    await request(app)
      .post(`/projects/${web.id}/tasks`)
      .set('Authorization', bearer(user))
      .send({ title: 'One' });

    const res = await request(app)
      .get(`/workspaces/${workspace.id}/projects?status=Active,OnHold&search=we`)
      .set('Authorization', bearer(user));

    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0]).toMatchObject({ key: 'WEB', tasks: { total: 1, open: 1 } });
  });

  it('only owners and admins delete a project, which removes its tasks', async () => {
    const { user: owner } = await createTestUser();
    const { user: member } = await createTestUser();
    const workspace = await createTestWorkspace(owner.id, [{ userId: member.id, role: 'Member' }]);
    const project = await createTestProject(workspace.id);
    const task = await request(app)
      .post(`/projects/${project.id}/tasks`)
      .set('Authorization', bearer(member))
      .send({ title: 'Parent' });
    await request(app)
      .post(`/projects/${project.id}/tasks`)
      .set('Authorization', bearer(member))
      .send({ title: 'Child', parentId: task.body.id });
    await request(app)
      .post(`/tasks/${task.body.id}/comments`)
      .set('Authorization', bearer(member))
      .send({ body: 'Looks good' });

    const denied = await request(app)
      .delete(`/projects/${project.id}`)
      .set('Authorization', bearer(member));
    expect(denied.status).toBe(403);

    const res = await request(app)
      .delete(`/projects/${project.id}`)
      .set('Authorization', bearer(owner));
    expect(res.status).toBe(200);
    expect(await prisma.task.count()).toBe(0);
    expect(await prisma.comment.count()).toBe(0);
  });
});
