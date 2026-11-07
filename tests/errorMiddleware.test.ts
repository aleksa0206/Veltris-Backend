import { errorMiddleware } from '../src/middleware/errorMiddleware';
import { NotFoundError } from '../src/errors/NotFoundError';
import type { Request, Response } from 'express';

function mockResponse() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('errorMiddleware', () => {
  it('returns the correct status and message for an AppError', () => {
    const err = new NotFoundError('Test');
    const req = { path: '/test', method: 'GET' } as Request;
    const res = mockResponse();
    const next = jest.fn();

    errorMiddleware(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Test not found' });
  });

  it('returns a generic 500 and does NOT leak details for an unexpected error', () => {
    const err = new Error('Interna tajna greska sa detaljima baze');
    const req = { path: '/test', method: 'GET' } as Request;
    const res = mockResponse();
    const next = jest.fn();

    errorMiddleware(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});
