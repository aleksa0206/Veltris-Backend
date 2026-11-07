import request from 'supertest';
import app from '../src/app';
import { cleanDatabase, disconnectDb } from './helpers/testDb';
import { bearer } from './helpers/testHelpers';
import { createTestProject, createTestUser, createTestWorkspace } from './helpers/testFactory';

describe('Zod validation - rejects bad input', () => {
  afterEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  it('rejects registering with an invalid email', async () => {
    const res = await request(app).post('/auth/register').send({
      firstName: 'Test',
      lastName: 'User',
      email: 'not-an-email',
      password: 'password123',
    });

    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe('email');
  });

  it('rejects a project with a bad key and a target date before the start', async () => {
    const { user } = await createTestUser();
    const workspace = await createTestWorkspace(user.id);

    const res = await request(app)
      .post(`/workspaces/${workspace.id}/projects`)
      .set('Authorization', bearer(user))
      .send({ key: '1-bad', name: 'Web', startDate: '2026-12-01', targetDate: '2026-11-01' });

    expect(res.status).toBe(400);
    expect(res.body.details.map((d: { path: string }) => d.path)).toContain('key');
  });

  it('rejects a task without a title or with an unknown status', async () => {
    const { user } = await createTestUser();
    const project = await createTestProject((await createTestWorkspace(user.id)).id);

    const res = await request(app)
      .post(`/projects/${project.id}/tasks`)
      .set('Authorization', bearer(user))
      .send({ status: 'Maybe', dueDate: '07/11/2026' });

    expect(res.status).toBe(400);
    expect(res.body.details.map((d: { path: string }) => d.path).sort()).toEqual([
      'dueDate',
      'status',
      'title',
    ]);
  });

  it('rejects an unknown list filter', async () => {
    const { user } = await createTestUser();
    const project = await createTestProject((await createTestWorkspace(user.id)).id);

    const res = await request(app)
      .get(`/projects/${project.id}/tasks?status=Maybe`)
      .set('Authorization', bearer(user));

    expect(res.status).toBe(400);
  });
});
