import request from 'supertest';
import app from '../app';

describe('Health (integração)', () => {
  it('GET /health/live retorna status ok', async () => {
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'petivet-api' });
  });
});
