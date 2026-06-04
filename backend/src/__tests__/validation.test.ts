/**
 * Testes de validação
 * 
 * Para executar: npm test ou npm run test:watch
 * 
 * NOTA: Estes são testes básicos de exemplo.
 * Para implementação completa, configure:
 * - Jest ou Vitest
 * - Testes unitários dos schemas Zod
 */

import { z } from 'zod';
import { commonSchemas } from '../utils/validation.js';

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
});

