jest.mock('../../../config/supabase', () =>
  require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule()
);

import request from 'supertest';
import app from '../../../app';
import { configureSupabaseMock } from '../../../__tests__/helpers/supabaseTestDouble';
import type { PrescriptionSnapshot } from '../prescriptionValidation';

const PUBLIC_TOKEN = 'abcdefghijklmnopqrstuvwx';
const VALIDATION_CODE = 'RX-AB12-CD34';
const DOC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLINIC_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const snapshot: PrescriptionSnapshot = {
  version: 1,
  prescription_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  document_version: 1,
  clinic: { id: CLINIC_ID, name: 'Clínica Teste' },
  pet: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'Thor', species: 'Canino', breed: 'Labrador' },
  guardian: { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', full_name: 'João Souza' },
  veterinarian: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', full_name: 'Dra. Ana', crmv: '99999', crmv_uf: 'RJ' },
  medications: [
    {
      medication_name: 'Amoxicilina',
      presentation: null,
      concentration: '250mg',
      quantity: '14',
      posology: '12/12h',
      duration: '7 dias',
      instructions: null,
      administration: 'home_use',
      use_route: 'Oral',
    },
  ],
  notes: null,
  issued_at: '2026-07-01T10:00:00.000Z',
  disclaimers: ['Aviso legal PetMi Hub.'],
};

function prescriptionDocumentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DOC_ID,
    clinic_id: CLINIC_ID,
    prescription_id: snapshot.prescription_id,
    version_no: 1,
    validation_code: VALIDATION_CODE,
    public_token: PUBLIC_TOKEN,
    document_status: 'valid',
    content_hash: 'f'.repeat(64),
    snapshot,
    issued_at: snapshot.issued_at,
    expires_at: '2099-01-01T00:00:00.000Z',
    revoked_at: null,
    revoke_reason: null,
    validation_url: `http://localhost:3002/receita/${PUBLIC_TOKEN}`,
    ...overrides,
  };
}

describe('APIs públicas de receita (integração)', () => {
  beforeEach(() => {
    configureSupabaseMock({
      tables: {
        hub_prescription_documents: [prescriptionDocumentRow()],
        hub_prescription_document_events: [],
      },
    });
  });

  describe('GET /api/public/prescriptions/:token', () => {
    it('retorna payload sanitizado com Cache-Control no-store', async () => {
      const res = await request(app).get(`/api/public/prescriptions/${PUBLIC_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toMatch(/no-store/i);
      expect(res.body.prescription.status).toBe('valid');
      expect(res.body.prescription.validation_code).toBe(VALIDATION_CODE);
      expect(res.body.prescription.pet.name).toBe('Thor');
      expect(res.body.prescription.guardian).toEqual({ full_name: 'João Souza' });
      expect(res.body.prescription.medications).toHaveLength(1);
    });

    it('retorna 404 para token inexistente', async () => {
      const res = await request(app).get('/api/public/prescriptions/zzzzzzzzzzzzzzzzzzzzzzzzzz');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Receita não encontrada');
    });

    it('retorna 400 para token malformado', async () => {
      const res = await request(app).get('/api/public/prescriptions/curto');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/public/prescriptions/validate', () => {
    it('localiza receita por código RX-XXXX-XXXX', async () => {
      const res = await request(app)
        .get('/api/public/prescriptions/validate')
        .query({ code: 'rx-ab12-cd34' });

      expect(res.status).toBe(200);
      expect(res.body.prescription.validation_code).toBe(VALIDATION_CODE);
    });

    it('retorna 400 para código malformado', async () => {
      const res = await request(app)
        .get('/api/public/prescriptions/validate')
        .query({ code: 'codigo-invalido' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/inválido/i);
    });

    it('retorna 404 para código inexistente', async () => {
      const res = await request(app)
        .get('/api/public/prescriptions/validate')
        .query({ code: 'RX-ZZZZ-ZZZZ' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Receita não encontrada');
    });
  });

  describe('status público', () => {
    it('marca receita revogada', async () => {
      configureSupabaseMock({
        tables: {
          hub_prescription_documents: [
            prescriptionDocumentRow({
              revoked_at: '2026-07-02T10:00:00.000Z',
              document_status: 'revoked',
            }),
          ],
          hub_prescription_document_events: [],
        },
      });

      const res = await request(app).get(`/api/public/prescriptions/${PUBLIC_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.prescription.status).toBe('revoked');
    });

    it('marca receita expirada', async () => {
      configureSupabaseMock({
        tables: {
          hub_prescription_documents: [
            prescriptionDocumentRow({
              expires_at: '2020-01-01T00:00:00.000Z',
              document_status: 'expired',
            }),
          ],
          hub_prescription_document_events: [],
        },
      });

      const res = await request(app).get(`/api/public/prescriptions/${PUBLIC_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.prescription.status).toBe('expired');
    });
  });

  describe('sanitização da resposta pública', () => {
    it('não expõe token, hash completo ou IDs internos', async () => {
      const res = await request(app).get(`/api/public/prescriptions/${PUBLIC_TOKEN}`);
      expect(res.status).toBe(200);

      const body = JSON.stringify(res.body);
      expect(body).not.toContain(PUBLIC_TOKEN);
      expect(body).not.toContain('f'.repeat(64));
      expect(res.body.prescription.guardian).toEqual({ full_name: 'João Souza' });
      expect(res.body.prescription.pet).not.toHaveProperty('id');
      expect(res.body.prescription.veterinarian).not.toHaveProperty('id');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('GET /api/public/prescriptions/:token/pdf', () => {
    it('retorna PDF application/pdf', async () => {
      const res = await request(app).get(`/api/public/prescriptions/${PUBLIC_TOKEN}/pdf`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/pdf/i);
      expect(res.headers['cache-control']).toMatch(/no-store/i);
      expect(Buffer.isBuffer(res.body) || typeof res.body === 'object').toBe(true);
    });
  });
});
