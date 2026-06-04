"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
const zod_1 = require("zod");
const validation_js_1 = require("../utils/validation.js");
describe('Validation Schemas', () => {
    describe('CNPJ validation', () => {
        it('should accept valid 14-digit CNPJ', () => {
            const schema = zod_1.z.object({ cnpj: validation_js_1.commonSchemas.cnpj });
            const result = schema.safeParse({ cnpj: '12345678000190' });
            expect(result.success).toBe(true);
        });
        it('should reject invalid CNPJ format', () => {
            const schema = zod_1.z.object({ cnpj: validation_js_1.commonSchemas.cnpj });
            const result = schema.safeParse({ cnpj: '123' });
            expect(result.success).toBe(false);
        });
    });
    describe('Email validation', () => {
        it('should accept valid email', () => {
            const schema = zod_1.z.object({ email: validation_js_1.commonSchemas.email });
            const result = schema.safeParse({ email: 'test@example.com' });
            expect(result.success).toBe(true);
        });
        it('should reject invalid email', () => {
            const schema = zod_1.z.object({ email: validation_js_1.commonSchemas.email });
            const result = schema.safeParse({ email: 'invalid-email' });
            expect(result.success).toBe(false);
        });
    });
});
