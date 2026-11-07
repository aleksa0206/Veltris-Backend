import request from 'supertest';
import app from '../src/app';
import { cleanDatabase, disconnectDb } from './helpers/testDb';
import { createTestUser } from './helpers/testFactory';

describe('2FA flow', () => {
  afterEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  it('full flow: setup -> confirm -> login requires 2FA -> verify-login succeeds', async () => {
    const { user, rawPassword } = await createTestUser();

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: rawPassword });
    const accessToken = loginRes.body.token;

    const setupRes = await request(app)
      .post('/auth/2fa/setup')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(setupRes.status).toBe(200);
    expect(setupRes.body.qrCode).toBeDefined();

    const wrongConfirmRes = await request(app)
      .post('/auth/2fa/confirm')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: '000000' });
    expect(wrongConfirmRes.status).toBe(401);

    const confirmRes = await request(app)
      .post('/auth/2fa/confirm')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: '123456' });
    expect(confirmRes.status).toBe(204);

    const secondLoginRes = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: rawPassword });
    expect(secondLoginRes.status).toBe(401);
    expect(secondLoginRes.body.twoFactorRequired).toBe(true);
    expect(secondLoginRes.body.tempToken).toBeDefined();

    const wrongVerifyRes = await request(app)
      .post('/auth/2fa/verify-login')
      .send({ tempToken: secondLoginRes.body.tempToken, code: '000000' });
    expect(wrongVerifyRes.status).toBe(401);

    const verifyRes = await request(app)
      .post('/auth/2fa/verify-login')
      .send({ tempToken: secondLoginRes.body.tempToken, code: '123456' });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.token).toBeDefined();

    // The temp token is not an access token: it must not reach any protected endpoint, and with
    // 2FA on, the secret cannot be replaced.
    const tempToken = secondLoginRes.body.tempToken;
    for (const [method, path] of [
      ['get', '/workspaces'],
      ['get', '/auth/me'],
      ['post', '/auth/2fa/setup'],
    ] as const) {
      const res = await request(app)[method](path).set('Authorization', `Bearer ${tempToken}`);
      expect(res.status).toBe(401);
    }
    const resetup = await request(app)
      .post('/auth/2fa/setup')
      .set('Authorization', `Bearer ${verifyRes.body.token}`);
    expect(resetup.status).toBe(409);
  });

  it('disabling 2FA returns login to the normal flow without a tempToken', async () => {
    const { user, rawPassword } = await createTestUser();

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: rawPassword });
    const accessToken = loginRes.body.token;

    await request(app).post('/auth/2fa/setup').set('Authorization', `Bearer ${accessToken}`);
    await request(app)
      .post('/auth/2fa/confirm')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: '123456' });

    await request(app)
      .delete('/auth/2fa')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: '123456' });

    const afterDisableLoginRes = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: rawPassword });
    expect(afterDisableLoginRes.status).toBe(200);
    expect(afterDisableLoginRes.body.token).toBeDefined();
  });
});
