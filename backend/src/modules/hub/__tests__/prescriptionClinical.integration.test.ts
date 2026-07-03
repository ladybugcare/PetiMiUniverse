jest.mock('../../../config/supabase', () =>
  require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule(),
);
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule(),
);

import request from 'supertest';
import app from '../../../app';
import { configureSupabaseMock, getMockSupabaseClient } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  issuedDocumentRow,
  prescriptionIssueFixture,
  RX_CLINIC_ID,
  RX_DOC_ID,
  RX_PRESCRIPTION_ID,
  RX_PUBLIC_TOKEN,
} from '../../../__tests__/helpers/fixtures/prescription';

describe('API clínica — receita validável (integração)', () => {
  beforeEach(() => {
    configureSupabaseMock(prescriptionIssueFixture());
  });

  it('POST /clinical/prescriptions/:id/documents emite receita validável', async () => {
    const res = await request(app)
      .post(`/api/hub/clinical/prescriptions/${RX_PRESCRIPTION_ID}/documents`)
      .send({ clinic_id: RX_CLINIC_ID });

    expect(res.status).toBe(201);
    expect(res.body.document.validation_code).toMatch(/^RX-/);
    expect(res.body.public_url).toMatch(/\/receita\//);
    expect(res.body.content_hash_short).toContain('…');
    expect(res.body.snapshot.medications).toHaveLength(1);
  });

  it('POST prescrição com atendimento já issued retorna 409', async () => {
    await request(app)
      .post(`/api/hub/clinical/prescriptions/${RX_PRESCRIPTION_ID}/documents`)
      .send({ clinic_id: RX_CLINIC_ID });

    const res = await request(app).post('/api/hub/clinical/prescriptions').send({
      clinic_id: RX_CLINIC_ID,
      pet_id: prescriptionIssueFixture().tables.hub_prescriptions[0].pet_id,
      hub_encounter_id: prescriptionIssueFixture().tables.hub_prescriptions[0].hub_encounter_id,
      items: [{ medication_name: 'Novo medicamento' }],
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/emitida/i);
  });

  it('PATCH prescrição issued retorna 409', async () => {
    await request(app)
      .post(`/api/hub/clinical/prescriptions/${RX_PRESCRIPTION_ID}/documents`)
      .send({ clinic_id: RX_CLINIC_ID });

    const res = await request(app)
      .patch(`/api/hub/clinical/prescriptions/${RX_PRESCRIPTION_ID}`)
      .send({
        clinic_id: RX_CLINIC_ID,
        notes: 'Tentativa de editar após emissão',
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/emitida/i);
  });

  it('POST revoke exige motivo com ao menos 10 caracteres', async () => {
    configureSupabaseMock({
      tables: {
        ...prescriptionIssueFixture().tables,
        hub_prescriptions: [{ ...prescriptionIssueFixture().tables.hub_prescriptions[0], status: 'issued' }],
        hub_prescription_documents: [issuedDocumentRow()],
      },
    });

    const short = await request(app)
      .post(`/api/hub/clinical/prescriptions/${RX_PRESCRIPTION_ID}/documents/${RX_DOC_ID}/revoke`)
      .send({ clinic_id: RX_CLINIC_ID, reason: 'curto' });

    expect(short.status).toBe(400);

    const ok = await request(app)
      .post(`/api/hub/clinical/prescriptions/${RX_PRESCRIPTION_ID}/documents/${RX_DOC_ID}/revoke`)
      .send({ clinic_id: RX_CLINIC_ID, reason: 'Erro de prescrição detectado após emissão' });

    expect(ok.status).toBe(200);
    expect(ok.body.document.document_status).toBe('revoked');

    const client = getMockSupabaseClient();
    const events = client._state.tables.hub_prescription_document_events ?? [];
    expect(events.some((e) => e.event_type === 'revoked')).toBe(true);
  });

  it('revogação reflete na consulta pública por token', async () => {
    configureSupabaseMock({
      tables: {
        ...prescriptionIssueFixture().tables,
        hub_prescriptions: [{ ...prescriptionIssueFixture().tables.hub_prescriptions[0], status: 'issued' }],
        hub_prescription_documents: [issuedDocumentRow()],
      },
    });

    await request(app)
      .post(`/api/hub/clinical/prescriptions/${RX_PRESCRIPTION_ID}/documents/${RX_DOC_ID}/revoke`)
      .send({ clinic_id: RX_CLINIC_ID, reason: 'Prescrição substituída por nova versão corrigida' });

    const publicRes = await request(app).get(`/api/public/prescriptions/${RX_PUBLIC_TOKEN}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.prescription.status).toBe('revoked');
  });
});
