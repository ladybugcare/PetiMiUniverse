jest.mock('../../../config/supabase', () =>
  require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule(),
);

import { configureSupabaseMock, getMockSupabaseClient } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  prescriptionIssueFixture,
  RX_CLINIC_ID,
  RX_PRESCRIPTION_ID,
  RX_VALIDATION_CODE,
} from '../../../__tests__/helpers/fixtures/prescription';
import { VALIDATION_CODE_REGEX } from '../prescriptionValidation';
import { issueValidatablePrescriptionDocument } from '../prescriptionDocumentIssue';

describe('issueValidatablePrescriptionDocument (integração)', () => {
  beforeEach(() => {
    configureSupabaseMock(prescriptionIssueFixture());
  });

  it('emite documento com código, token, hash e evento created', async () => {
    const result = await issueValidatablePrescriptionDocument({
      prescriptionId: RX_PRESCRIPTION_ID,
      clinicId: RX_CLINIC_ID,
      issuedBy: null,
      actorUserId: 'user-test',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const doc = result.result.document;
    expect(doc.validation_code).toMatch(VALIDATION_CODE_REGEX);
    expect(doc.public_url).toMatch(/\/receita\//);
    expect(doc.content_hash_short).toContain('…');
    expect(result.result.snapshot.medications).toHaveLength(1);

    const client = getMockSupabaseClient();
    const rx = client._state.tables.hub_prescriptions?.[0];
    expect(rx?.status).toBe('issued');

    const events = client._state.tables.hub_prescription_document_events ?? [];
    expect(events.some((e) => e.event_type === 'created')).toBe(true);
  });

  it('incrementa version_no na reemissão', async () => {
    const first = await issueValidatablePrescriptionDocument({
      prescriptionId: RX_PRESCRIPTION_ID,
      clinicId: RX_CLINIC_ID,
    });
    expect(first.ok).toBe(true);

    const second = await issueValidatablePrescriptionDocument({
      prescriptionId: RX_PRESCRIPTION_ID,
      clinicId: RX_CLINIC_ID,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.result.document.version_no).toBe(2);

    const client = getMockSupabaseClient();
    expect(client._state.tables.hub_prescription_documents?.length).toBe(2);
  });

  it('rejeita emissão sem medicamentos', async () => {
    configureSupabaseMock(
      prescriptionIssueFixture({
        hub_prescription_items: [],
      }),
    );

    const result = await issueValidatablePrescriptionDocument({
      prescriptionId: RX_PRESCRIPTION_ID,
      clinicId: RX_CLINIC_ID,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
    expect(result.error).toMatch(/medicamento/i);
  });

  it('rejeita prescrição sem atendimento vinculado', async () => {
    configureSupabaseMock(
      prescriptionIssueFixture({
        hub_prescriptions: [
          {
            ...prescriptionIssueFixture().tables.hub_prescriptions[0],
            hub_encounter_id: null,
          },
        ],
      }),
    );

    const result = await issueValidatablePrescriptionDocument({
      prescriptionId: RX_PRESCRIPTION_ID,
      clinicId: RX_CLINIC_ID,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
    expect(result.error).toMatch(/atendimento/i);
  });

  it('não reutiliza código RX existente', async () => {
    const first = await issueValidatablePrescriptionDocument({
      prescriptionId: RX_PRESCRIPTION_ID,
      clinicId: RX_CLINIC_ID,
    });
    expect(first.ok).toBe(true);

    const second = await issueValidatablePrescriptionDocument({
      prescriptionId: RX_PRESCRIPTION_ID,
      clinicId: RX_CLINIC_ID,
    });
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(first.result.document.validation_code).not.toBe(second.result.document.validation_code);
    expect(second.result.document.validation_code).not.toBe(RX_VALIDATION_CODE);
  });
});
