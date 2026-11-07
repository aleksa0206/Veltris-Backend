import request from 'supertest';
import app from '../src/app';
import { cleanDatabase, disconnectDb } from './helpers/testDb';
import { bearer } from './helpers/testHelpers';
import { createTestProject, createTestUser, createTestWorkspace } from './helpers/testFactory';

describe('Workspaces', () => {
  afterEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  it('signing up creates a workspace the new user owns', async () => {
    const res = await request(app).post('/auth/register').send({
      firstName: 'Ana',
      lastName: 'Petrović',
      email: 'ana@test.com',
      password: 'password123',
      workspaceName: 'Northwind',
    });
    expect(res.status).toBe(201);

    const list = await request(app)
      .get('/workspaces')
      .set('Authorization', `Bearer ${res.body.token}`);

    expect(list.body).toEqual([
      expect.objectContaining({ name: 'Northwind', role: 'Owner', memberCount: 1 }),
    ]);
  });

  it('only members can read a workspace; outsiders get 403, unknown ids 404', async () => {
    const { user: owner } = await createTestUser();
    const { user: outsider } = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);

    const own = await request(app)
      .get(`/workspaces/${workspace.id}`)
      .set('Authorization', bearer(owner));
    expect(own.status).toBe(200);
    expect(own.body.members).toHaveLength(1);

    const other = await request(app)
      .get(`/workspaces/${workspace.id}`)
      .set('Authorization', bearer(outsider));
    expect(other.status).toBe(403);

    const projects = await request(app)
      .get(`/workspaces/${workspace.id}/projects`)
      .set('Authorization', bearer(outsider));
    expect(projects.status).toBe(403);

    const missing = await request(app)
      .get('/workspaces/999999')
      .set('Authorization', bearer(owner));
    expect(missing.status).toBe(404);
  });

  it('admins add existing accounts by email; members cannot', async () => {
    const { user: owner } = await createTestUser();
    const { user: member } = await createTestUser();
    const { user: newcomer } = await createTestUser({ email: 'new@test.com' });
    const workspace = await createTestWorkspace(owner.id, [{ userId: member.id, role: 'Member' }]);

    const denied = await request(app)
      .post(`/workspaces/${workspace.id}/members`)
      .set('Authorization', bearer(member))
      .send({ email: 'new@test.com' });
    expect(denied.status).toBe(403);

    const added = await request(app)
      .post(`/workspaces/${workspace.id}/members`)
      .set('Authorization', bearer(owner))
      .send({ email: 'new@test.com', role: 'Admin' });
    expect(added.status).toBe(201);
    expect(added.body).toContainEqual(expect.objectContaining({ id: newcomer.id, role: 'Admin' }));

    const again = await request(app)
      .post(`/workspaces/${workspace.id}/members`)
      .set('Authorization', bearer(owner))
      .send({ email: 'new@test.com' });
    expect(again.status).toBe(409);
  });

  it('the overview counts open, overdue and due-this-week tasks relative to the given day', async () => {
    const { user } = await createTestUser();
    const workspace = await createTestWorkspace(user.id);
    const project = await createTestProject(workspace.id);
    const auth = bearer(user);
    const create = (body: object) =>
      request(app).post(`/projects/${project.id}/tasks`).set('Authorization', auth).send(body);

    await create({ title: 'Overdue', dueDate: '2026-11-01', assigneeId: user.id });
    await create({ title: 'This week', dueDate: '2026-11-10' });
    await create({ title: 'Later', dueDate: '2026-12-31' });
    await create({ title: 'Shipped', status: 'Done' });

    const res = await request(app)
      .get(`/workspaces/${workspace.id}/overview?today=2026-11-07`)
      .set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.stats).toEqual({ open: 3, overdue: 1, dueThisWeek: 1, completedThisWeek: 1 });
    expect(res.body.myTasks.map((t: { title: string }) => t.title)).toEqual(['Overdue']);
    expect(res.body.projects[0].tasks).toEqual({ total: 4, done: 1, open: 3, overdue: 1 });
    expect(res.body.activity).toHaveLength(4);
  });
});
