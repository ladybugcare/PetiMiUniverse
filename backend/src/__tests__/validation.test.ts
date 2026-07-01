import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { commonSchemas, validate } from '../utils/validation.js';
import { errorHandler } from '../middleware/errorHandler.js';

describe('Validation Schemas', () => {
  describe('CNPJ validation', () => {
    it('should accept valid 14-digit CNPJ', () => {
      const schema = z.object({ cnpj: commonSchemas.cnpj });
      const result = schema.safeParse({ cnpj: '12345678000190' });
      expect(result.success).toBe(true);
    });

    it('should reject invalid CNPJ format', () => {
      const schema = z.object({ cnpj: commonSchemas.cnpj });
      const result = schema.safeParse({ cnpj: '123' });
      expect(result.success).toBe(false);
    });
  });

  describe('Email validation', () => {
    it('should accept valid email', () => {
      const schema = z.object({ email: commonSchemas.email });
      const result = schema.safeParse({ email: 'test@example.com' });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const schema = z.object({ email: commonSchemas.email });
      const result = schema.safeParse({ email: 'invalid-email' });
      expect(result.success).toBe(false);
    });
  });

  describe('UUID validation', () => {
    it('aceita UUID válido', () => {
      const schema = z.object({ id: commonSchemas.uuid });
      const result = schema.safeParse({ id: '11111111-1111-4111-8111-111111111111' });
      expect(result.success).toBe(true);
    });

    it('rejeita string inválida', () => {
      const schema = z.object({ id: commonSchemas.uuid });
      const result = schema.safeParse({ id: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });
  });

  describe('Phone validation', () => {
    it('aceita telefone com DDD e hífen', () => {
      const schema = z.object({ phone: commonSchemas.phone });
      expect(schema.safeParse({ phone: '+55 11 99999-9999' }).success).toBe(true);
    });

    it('rejeita telefone com letras', () => {
      const schema = z.object({ phone: commonSchemas.phone });
      expect(schema.safeParse({ phone: 'abc-def' }).success).toBe(false);
    });
  });

  describe('Date validation', () => {
    it('aceita YYYY-MM-DD', () => {
      const schema = z.object({ date: commonSchemas.date });
      expect(schema.safeParse({ date: '2026-06-01' }).success).toBe(true);
    });

    it('rejeita formato inválido', () => {
      const schema = z.object({ date: commonSchemas.date });
      expect(schema.safeParse({ date: '01/06/2026' }).success).toBe(false);
    });
  });

  describe('Time validation', () => {
    it('aceita HH:MM', () => {
      const schema = z.object({ time: commonSchemas.time });
      expect(schema.safeParse({ time: '14:30' }).success).toBe(true);
    });

    it('rejeita formato inválido', () => {
      const schema = z.object({ time: commonSchemas.time });
      expect(schema.safeParse({ time: '2:30 PM' }).success).toBe(false);
    });
  });
});

describe('validate middleware', () => {
  const schema = z.object({
    email: commonSchemas.email,
    name: z.string().min(1),
  });

  function buildApp() {
    const app = express();
    app.use(express.json());
    app.post('/test', validate(schema), (_req, res) => {
      res.status(200).json({ ok: true });
    });
    app.use(errorHandler);
    return app;
  }

  it('retorna 400 com mensagens Zod para body inválido', async () => {
    const res = await request(buildApp()).post('/test').send({ email: 'bad', name: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Erro de validação/i);
    expect(res.body.error).toMatch(/Email inválido/i);
  });

  it('passa para o handler quando body é válido', async () => {
    const res = await request(buildApp())
      .post('/test')
      .send({ email: 'valid@test.com', name: 'Teste' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
