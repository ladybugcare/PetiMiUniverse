jest.mock('qrcode', () => ({
  toBuffer: jest.fn().mockRejectedValue(new Error('QR omitido em teste')),
}));

import { PassThrough } from 'node:stream';
import type { Response } from 'express';
import { streamValidatableExamOrderPdf } from '../hubExamOrderPdf';
import { streamValidatableSpecialistReferralPdf } from '../hubSpecialistReferralPdf';
import type { ExamOrderSnapshot } from '../examOrderValidation';
import type { SpecialistReferralSnapshot } from '../specialistReferralValidation';

const parties = {
  clinic: {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    name: 'Clínica PDF',
    phone: '(11) 99999-0000',
    email: 'contato@clinica.test',
    address: 'Rua Teste, 100',
    city: 'São Paulo',
    state: 'SP',
  },
  pet: {
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    name: 'Mel',
    species: 'Cão',
    breed: 'SRD',
    birth_date: '2020-01-15',
  },
  guardian: {
    id: '11111111-1111-4111-8111-111111111111',
    full_name: 'Ana Silva',
    phone: '(11) 98888-0000',
    tax_id: '12345678901',
    id_doc_number: '12.345.678-9',
    street: 'Av. Brasil',
    street_number: '10',
    district: 'Centro',
    city: 'São Paulo',
    state: 'SP',
    postal_code: '01001000',
  },
  veterinarian: {
    id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    full_name: 'Dr. Pedro',
    crmv: '12345',
    crmv_uf: 'SP',
    signature_image_url: null,
    stamp_image_url: null,
  },
};

async function collectPdf(
  run: (res: Response) => Promise<void>,
): Promise<{ headers: Record<string, string>; pdfBuffer: Buffer }> {
  const sink = new PassThrough();
  const chunks: Buffer[] = [];
  sink.on('data', (c) => chunks.push(c as Buffer));
  const headers: Record<string, string> = {};
  const res = Object.assign(sink, {
    setHeader: (k: string, v: string) => {
      headers[k.toLowerCase()] = v;
    },
  }) as unknown as Response;

  await run(res);
  await new Promise<void>((resolve, reject) => {
    sink.on('end', resolve);
    sink.on('error', reject);
  });

  return { headers, pdfBuffer: Buffer.concat(chunks) };
}

describe('PDFs clínicos — padrão receituário', () => {
  it('streamValidatableExamOrderPdf gera PDF com código EX', async () => {
    const snapshot: ExamOrderSnapshot = {
      version: 1,
      hub_encounter_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      document_version: 1,
      scope: 'encounter_bundle',
      ...parties,
      exams: [
        {
          exam_id: 'e1',
          exam_type: 'Hemograma',
          lab_kind: 'external',
          lab_name: null,
          external_lab_name: 'Lab X',
          clinical_indication: 'Anemia',
          fasting_required: true,
          collection_instructions: null,
          urgency: 'routine',
          notes: null,
        },
      ],
      issued_at: '2026-07-01T12:00:00.000Z',
      disclaimers: ['Aviso de autenticação PetMi Hub.'],
    };

    const { headers, pdfBuffer } = await collectPdf((res) =>
      streamValidatableExamOrderPdf(res, snapshot, {
        validation_code: 'EX-TEST-CODE',
        public_url: 'http://localhost:3002/solicitacao-exame/token-test',
        content_hash: 'b'.repeat(64),
        issued_at: snapshot.issued_at,
        expires_at: '2099-01-01T00:00:00.000Z',
        disclaimers: snapshot.disclaimers,
      }),
    );

    expect(headers['content-type']).toMatch(/application\/pdf/i);
    expect(headers['content-disposition']).toContain('EX-TEST-CODE');
    expect(pdfBuffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdfBuffer.length).toBeGreaterThan(500);
  });

  it('streamValidatableSpecialistReferralPdf gera PDF com código RF', async () => {
    const snapshot: SpecialistReferralSnapshot = {
      version: 1,
      hub_encounter_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      document_version: 1,
      scope: 'single',
      ...parties,
      referrals: [
        {
          referral_id: 'r1',
          specialty: 'Dermatologia',
          specialist_name: 'Dra. Ana',
          specialist_contact: null,
          referral_reason: 'Lesão cutânea',
          clinical_summary: 'Prurido há 2 semanas',
          priority: 'routine',
          notes: null,
        },
      ],
      issued_at: '2026-07-01T12:00:00.000Z',
      disclaimers: ['Aviso de autenticação PetMi Hub.'],
    };

    const { headers, pdfBuffer } = await collectPdf((res) =>
      streamValidatableSpecialistReferralPdf(res, snapshot, {
        validation_code: 'RF-TEST-CODE',
        public_url: 'http://localhost:3002/encaminhamento/token-test',
        content_hash: 'c'.repeat(64),
        issued_at: snapshot.issued_at,
        expires_at: '2099-01-01T00:00:00.000Z',
        disclaimers: snapshot.disclaimers,
      }),
    );

    expect(headers['content-type']).toMatch(/application\/pdf/i);
    expect(headers['content-disposition']).toContain('RF-TEST-CODE');
    expect(pdfBuffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdfBuffer.length).toBeGreaterThan(500);
  });
});
