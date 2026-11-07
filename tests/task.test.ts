import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/config/prismaClient';
import { cleanDatabase, disconnectDb } from './helpers/testDb';
import { bearer } from './helpers/testHelpers';
import { createTestProject, createTestUser, createTestWorkspace } from './helpers/testFactory';

async function setup() {
  const { user } = await createTestUser({ firstName: 'Ana' });
  const { user: teammate } = await createTestUser({ firstName: 'Marko' });
  const workspace = await createTestWorkspace(user.id, [{ userId: teammate.id, role: 'Member' }]);
  const project = await createTestProject(workspace.id, 'WEB');
  const auth = bearer(user);
  const create = async (body: object) =>
    (await request(app).post(`/projects/${project.id}/tasks`).set('Authorization', auth).send(body))
      .body as { id: number; number: number; status: string };
  return { user, teammate, workspace, project, auth, create };
}

async function column(projectId: number, status: string) {
  const tasks = await prisma.task.findMany({
    where: { projectId, status: status as 'Todo', parentId: null },
    orderBy: { position: 'asc' },
  });
  return tasks.map((task) => task.title);
}

describe('Tasks', () => {
  afterEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  it('numbers tasks per project and logs who created them', async () => {
    const { project, auth, create, user } = await setup();

    const first = await create({ title: 'Header' });
    const second = await create({ title: 'Footer', priority: 'High' });

    expect([first.number, second.number]).toEqual([1, 2]);
    const detail = await request(app).get(`/tasks/${second.id}`).set('Authorization', auth);
    expect(detail.body).toMatchObject({
      status: 'Todo',
      priority: 'High',
      project: { id: project.id, key: 'WEB' },
      reporter: { id: user.id },
    });
    const activity = await request(app)
      .get(`/tasks/${second.id}/activity`)
      .set('Authorization', auth);
    expect(activity.body).toEqual([expect.objectContaining({ type: 'Created' })]);
  });

  it('logs one activity per changed field and stamps completion', async () => {
    const { auth, create, teammate } = await setup();
    const task = await create({ title: 'Header', priority: 'Low' });

    const res = await request(app)
      .put(`/tasks/${task.id}`)
      .set('Authorization', auth)
      .send({ status: 'Done', priority: 'Low', assigneeId: teammate.id, dueDate: '2026-11-20' });

    expect(res.status).toBe(200);
    expect(res.body.completedAt).not.toBeNull();
    const activity = await request(app)
      .get(`/tasks/${task.id}/activity`)
      .set('Authorization', auth);
    expect(
      activity.body.map((a: { type: string; fromValue: string; toValue: string }) => [
        a.type,
        a.fromValue,
        a.toValue,
      ])
    ).toEqual([
      ['Created', null, null],
      ['StatusChanged', 'Todo', 'Done'],
      ['AssigneeChanged', null, String(teammate.id)],
      ['DueDateChanged', null, '2026-11-20'],
    ]);

    const reopened = await request(app)
      .put(`/tasks/${task.id}`)
      .set('Authorization', auth)
      .send({ status: 'InProgress' });
    expect(reopened.body.completedAt).toBeNull();
  });

  it('rejects an assignee from outside the workspace', async () => {
    const { auth, create } = await setup();
    const { user: outsider } = await createTestUser();
    const task = await create({ title: 'Header' });

    const res = await request(app)
      .put(`/tasks/${task.id}`)
      .set('Authorization', auth)
      .send({ assigneeId: outsider.id });

    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe('assigneeId');
  });

  it('moves a card between columns and above another card', async () => {
    const { project, auth, create } = await setup();
    const a = await create({ title: 'A' });
    const b = await create({ title: 'B' });
    const c = await create({ title: 'C', status: 'InProgress' });

    const toTop = await request(app)
      .post(`/tasks/${b.id}/move`)
      .set('Authorization', auth)
      .send({ status: 'Todo', beforeTaskId: a.id });
    expect(toTop.status).toBe(200);
    expect(await column(project.id, 'Todo')).toEqual(['B', 'A']);

    await request(app)
      .post(`/tasks/${a.id}/move`)
      .set('Authorization', auth)
      .send({ status: 'InProgress', beforeTaskId: c.id });
    expect(await column(project.id, 'InProgress')).toEqual(['A', 'C']);
    expect(await column(project.id, 'Todo')).toEqual(['B']);

    const wrongColumn = await request(app)
      .post(`/tasks/${b.id}/move`)
      .set('Authorization', auth)
      .send({ status: 'Done', beforeTaskId: c.id });
    expect(wrongColumn.status).toBe(400);
  });

  it('renumbers a column once the gap between two cards is used up', async () => {
    const { project, auth, create } = await setup();
    const a = await create({ title: 'A' });
    const b = await create({ title: 'B' });
    await prisma.task.update({ where: { id: a.id }, data: { position: 1 } });
    await prisma.task.update({ where: { id: b.id }, data: { position: 1 + 1e-9 } });
    const x = await create({ title: 'X', status: 'Backlog' });

    await request(app)
      .post(`/tasks/${x.id}/move`)
      .set('Authorization', auth)
      .send({ status: 'Todo', beforeTaskId: b.id });

    expect(await column(project.id, 'Todo')).toEqual(['A', 'X', 'B']);
  });

  it('subtasks are one level deep and stay off the board', async () => {
    const { project, auth, create } = await setup();
    const parent = await create({ title: 'Parent' });
    const child = await create({ title: 'Child', parentId: parent.id, status: 'Done' });

    const nested = await request(app)
      .post(`/projects/${project.id}/tasks`)
      .set('Authorization', auth)
      .send({ title: 'Grandchild', parentId: child.id });
    expect(nested.status).toBe(400);

    const board = await request(app)
      .get(`/projects/${project.id}/tasks`)
      .set('Authorization', auth);
    expect(board.body.data).toEqual([
      expect.objectContaining({ id: parent.id, subtaskCount: 1, subtasksDone: 1 }),
    ]);
  });

  it('finds a task by its identifier across the workspace', async () => {
    const { workspace, auth, create } = await setup();
    await create({ title: 'Header' });
    const second = await create({ title: 'Footer' });

    const res = await request(app)
      .get(`/workspaces/${workspace.id}/tasks?search=web-2`)
      .set('Authorization', auth);

    expect(res.body.data.map((t: { id: number }) => t.id)).toEqual([second.id]);
  });

  it('comments: authors edit their own; members cannot delete others, admins can', async () => {
    const { auth, create, teammate, user } = await setup();
    const task = await create({ title: 'Header' });
    const comment = await request(app)
      .post(`/tasks/${task.id}/comments`)
      .set('Authorization', bearer(teammate))
      .send({ body: 'On it' });
    expect(comment.status).toBe(201);
    expect(comment.body.author.id).toBe(teammate.id);

    const edit = await request(app)
      .put(`/comments/${comment.body.id}`)
      .set('Authorization', auth)
      .send({ body: 'Hijacked' });
    expect(edit.status).toBe(403);

    const mine = await request(app)
      .post(`/tasks/${task.id}/comments`)
      .set('Authorization', auth)
      .send({ body: 'Thanks' });
    const memberDelete = await request(app)
      .delete(`/comments/${mine.body.id}`)
      .set('Authorization', bearer(teammate));
    expect(memberDelete.status).toBe(403);

    // The owner (user) moderates the teammate's comment.
    const ownerDelete = await request(app)
      .delete(`/comments/${comment.body.id}`)
      .set('Authorization', bearer(user));
    expect(ownerDelete.status).toBe(200);
  });

  it('outsiders cannot read or change a task', async () => {
    const { create } = await setup();
    const { user: outsider } = await createTestUser();
    const task = await create({ title: 'Secret' });

    const read = await request(app).get(`/tasks/${task.id}`).set('Authorization', bearer(outsider));
    const write = await request(app)
      .put(`/tasks/${task.id}`)
      .set('Authorization', bearer(outsider))
      .send({ title: 'Mine' });

    expect([read.status, write.status]).toEqual([403, 403]);
  });

  it('only the reporter or an admin deletes a task, together with its subtasks', async () => {
    const { auth, create, teammate } = await setup();
    const parent = await create({ title: 'Parent' });
    await create({ title: 'Child', parentId: parent.id });

    const denied = await request(app)
      .delete(`/tasks/${parent.id}`)
      .set('Authorization', bearer(teammate));
    expect(denied.status).toBe(403);

    const res = await request(app).delete(`/tasks/${parent.id}`).set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(await prisma.task.count()).toBe(0);
  });
});
