process.env.METRICS_TOKEN = 'test-metrics-token-1234';

import request from 'supertest';
import app from '../src/app';
import { disconnectDb } from './helpers/testDb';

describe('GET /metrics', () => {
  afterAll(async () => {
    await disconnectDb();
  });

  it('rejects a request without the bearer token', async () => {
    const res = await request(app).get('/metrics');

    expect(res.status).toBe(401);
  });

  it('rejects a wrong token', async () => {
    const res = await request(app).get('/metrics').set('Authorization', 'Bearer wrong');

    expect(res.status).toBe(401);
  });

  it('labels requests with the route pattern, not the raw URL', async () => {
    await request(app).get('/health');
    await request(app).get('/users/12345');

    const res = await request(app)
      .get('/metrics')
      .set('Authorization', 'Bearer test-metrics-token-1234');

    expect(res.status).toBe(200);
    expect(res.text).toContain('route="/health"');
    expect(res.text).not.toContain('12345');
  });
});
