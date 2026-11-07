import request from 'supertest';
import app from '../src/app';
import { cleanDatabase, disconnectDb } from './helpers/testDb';
import { createTestUser } from './helpers/testFactory';

describe('Refresh token flow', () => {
  afterEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  it('the refresh token issues a new access token and rotates the refresh cookie', async () => {
    const { user, rawPassword } = await createTestUser();

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: rawPassword });

    const cookies = loginRes.headers['set-cookie'];

    const refreshRes = await request(app).post('/auth/refresh').set('Cookie', cookies);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.token).toBeDefined();

    const originalRefreshCookie = cookies.find((c: string) => c.startsWith('refreshToken='));
    const newRefreshCookie = refreshRes.headers['set-cookie'].find((c: string) =>
      c.startsWith('refreshToken=')
    );
    expect(newRefreshCookie).toBeDefined();
    expect(newRefreshCookie).not.toBe(originalRefreshCookie);
  });

  it('an old refresh token cannot be reused after rotation', async () => {
    const { user, rawPassword } = await createTestUser();

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: rawPassword });

    const originalCookies = loginRes.headers['set-cookie'];

    await request(app).post('/auth/refresh').set('Cookie', originalCookies);

    const secondAttemptRes = await request(app)
      .post('/auth/refresh')
      .set('Cookie', originalCookies);

    expect(secondAttemptRes.status).toBe(401);
  });

  it('refresh without a cookie returns 401', async () => {
    const res = await request(app).post('/auth/refresh');

    expect(res.status).toBe(401);
  });

  it('logout revokes the refresh token; the next refresh attempt fails', async () => {
    const { user, rawPassword } = await createTestUser();

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: rawPassword });

    const cookies = loginRes.headers['set-cookie'];

    const logoutRes = await request(app).post('/auth/logout').set('Cookie', cookies);
    expect(logoutRes.status).toBe(204);

    const refreshRes = await request(app).post('/auth/refresh').set('Cookie', cookies);
    expect(refreshRes.status).toBe(401);
  });
});
