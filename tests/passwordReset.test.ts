import request from 'supertest';
import app from '../src/app';
import { cleanDatabase, disconnectDb } from './helpers/testDb';
import { createTestUser } from './helpers/testFactory';
import { setContainer, resetContainer } from '../src/container';

describe('Password reset flow', () => {
  afterEach(async () => {
    resetContainer();
    await cleanDatabase();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  it('forgot-password for an existing email sends a token via the email service (mock, no real SMTP)', async () => {
    const sendPasswordResetEmail = jest.fn().mockResolvedValue(undefined);
    setContainer({ email: { sendPasswordResetEmail } as any });

    const { user } = await createTestUser();

    const res = await request(app).post('/auth/forgot-password').send({ email: user.email });

    expect(res.status).toBe(200);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(user.email, expect.any(String));
  });

  it('forgot-password for an unknown email returns the same response and does NOT call the email service (prevents enumeration)', async () => {
    const sendPasswordResetEmail = jest.fn().mockResolvedValue(undefined);
    setContainer({ email: { sendPasswordResetEmail } as any });

    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'nepostojeci@test.com' });

    expect(res.status).toBe(200);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('full flow: forgot-password -> reset-password with a valid token changes the password and revokes refresh tokens', async () => {
    let capturedToken = '';
    const sendPasswordResetEmail = jest
      .fn()
      .mockImplementation(async (_to: string, token: string) => {
        capturedToken = token;
      });
    setContainer({ email: { sendPasswordResetEmail } as any });

    const { user, rawPassword } = await createTestUser();

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: rawPassword });
    const oldRefreshCookie = loginRes.headers['set-cookie'];
    expect(oldRefreshCookie).toBeDefined();

    await request(app).post('/auth/forgot-password').send({ email: user.email });
    expect(capturedToken).not.toBe('');

    const newPassword = 'novaLozinka123';
    const resetRes = await request(app)
      .post('/auth/reset-password')
      .send({ token: capturedToken, newPassword });
    expect(resetRes.status).toBe(204);

    const oldPasswordLoginRes = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: rawPassword });
    expect(oldPasswordLoginRes.status).toBe(401);

    const newPasswordLoginRes = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: newPassword });
    expect(newPasswordLoginRes.status).toBe(200);

    const refreshWithOldCookieRes = await request(app)
      .post('/auth/refresh')
      .set('Cookie', oldRefreshCookie);
    expect(refreshWithOldCookieRes.status).toBe(401);
  });

  it('reset-password with a wrong/made-up token returns 401 and does not change the password', async () => {
    const { user, rawPassword } = await createTestUser();

    const resetRes = await request(app)
      .post('/auth/reset-password')
      .send({ token: 'izmisljen-token-koji-ne-postoji', newPassword: 'novaLozinka123' });
    expect(resetRes.status).toBe(401);

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: rawPassword });
    expect(loginRes.status).toBe(200);
  });

  it('reset-password rejects a password shorter than 8 characters (Zod validation)', async () => {
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token: 'bilo-sta', newPassword: 'kratka' });
    expect(res.status).toBe(400);
  });
});
