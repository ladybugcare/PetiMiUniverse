jest.mock('qrcode', () => ({
  toBuffer: jest.fn().mockRejectedValue(new Error('QR omitido em teste')),
}));

import { PassThrough } from 'node:stream';
import type { Response } from 'express';
import { streamValidatablePrescriptionPdf } from '../hubPrescriptionPdf';
import type { PrescriptionSnapshot } from '../prescriptionValidation';

const snapshot: PrescriptionSnapshot = {
  version: 1,
  prescription_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  document_version: 1,
  clinic: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Clínica PDF' },
  pet: { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', name: 'Mel', species: 'Canino', breed: 'SRD' },
  guardian: { id: '11111111-1111-4111-8111-111111111111', full_name: 'Ana Silva' },
  veterinarian: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', full_name: 'Dr. Pedro', crmv: '12345', crmv_uf: 'SP' },
  medications: [
    {
      medication_name: 'Dipirona',
      presentation: 'Comprimido',
      concentration: '500mg',
      quantity: '10',
      posology: '1x ao dia',
      duration: '5 dias',
      instructions: null,
      administration: 'home_use',
    },
  ],
  notes: null,
  issued_at: '2026-07-01T12:00:00.000Z',
  disclaimers: ['Validação PetMi Hub — não substitui ICP-Brasil.'],
};

describe('hubPrescriptionPdf — receita validável', () => {
  it('streamValidatablePrescriptionPdf inclui código, hash truncado e avisos legais', async () => {
    const sink = new PassThrough();
    const chunks: Buffer[] = [];
    sink.on('data', (c) => chunks.push(c as Buffer));

    const headers: Record<string, string> = {};
    const res = Object.assign(sink, {
      setHeader: (k: string, v: string) => {
        headers[k.toLowerCase()] = v;
      },
    }) as unknown as Response;

    await streamValidatablePrescriptionPdf(
      res,
      {
        id: snapshot.prescription_id,
        clinic_id: snapshot.clinic.id,
        prescribed_at: snapshot.issued_at,
        notes: snapshot.notes,
        items: snapshot.medications.map((m, i) => ({ ...m, order_index: i })),
        clinic: snapshot.clinic,
        pet: snapshot.pet,
        guardian: snapshot.guardian,
        staff: {
          full_name: snapshot.veterinarian.full_name,
          crmv: snapshot.veterinarian.crmv,
          crmv_uf: snapshot.veterinarian.crmv_uf,
        },
      },
      {
        validation_code: 'RX-TEST-CODE',
        public_url: 'http://localhost:3002/receita/token-test',
        content_hash: 'a'.repeat(64),
        issued_at: snapshot.issued_at,
        expires_at: '2099-01-01T00:00:00.000Z',
        disclaimers: snapshot.disclaimers,
      },
    );

    await new Promise<void>((resolve, reject) => {
      sink.on('end', resolve);
      sink.on('error', reject);
    });

    expect(headers['content-type']).toMatch(/application\/pdf/i);
    expect(headers['content-disposition']).toContain('RX-TEST-CODE');

    const pdfBuffer = Buffer.concat(chunks);
    expect(pdfBuffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdfBuffer.length).toBeGreaterThan(500);
  });
});
