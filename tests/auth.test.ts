import request from 'supertest';
import app from '../src/app';
import { cleanDatabase, disconnectDb } from './helpers/testDb';
import { createTestUser } from './helpers/testFactory';

describe('Auth flow', () => {
  afterEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  it('logs in a user with correct credentials', async () => {
    const { user, rawPassword } = await createTestUser();

    const res = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: rawPassword });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('rejects login with a wrong password', async () => {
    const { user } = await createTestUser();

    const res = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: 'pogresna-lozinka' });

    expect(res.status).toBe(401);
  });

  it('locks the account after 5 failed attempts', async () => {
    const { user } = await createTestUser();

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/auth/login')
        .send({ email: user.email, password: 'pogresna-lozinka' });
    }

    const res = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: 'pogresna-lozinka' });

    expect(res.status).toBe(423);
  });

  it('sets the refresh token cookie after a successful login', async () => {
    const { user, rawPassword } = await createTestUser();

    const res = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: rawPassword });

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some((c: string) => c.startsWith('refreshToken='))).toBe(true);
  });
});
