import { describe, expect, it, vi } from 'vitest';
import type { HubClinicalExam } from '../../../api/hubClinicalApi';
import {
  canRegisterExamResult,
  examNeedsResultAttachment,
  registerExamResult,
} from './registerExamResult';

function baseExam(overrides: Partial<HubClinicalExam> = {}): HubClinicalExam {
  return {
    id: 'exam-1',
    clinic_id: 'clinic-a',
    pet_id: 'pet-1',
    hub_case_id: 'case-1',
    hub_encounter_id: 'enc-1',
    exam_type: 'Hemograma QA',
    lab_kind: 'external',
    lab_name: null,
    external_lab_name: 'Lab QA',
    external_order_code: null,
    external_result_url: null,
    status: 'requested',
    requested_at: '2026-11-21T12:00:00.000Z',
    collected_at: null,
    result_at: null,
    result_text: null,
    requested_by: null,
    notes: null,
    metadata: {},
    created_at: '2026-11-21T12:00:00.000Z',
    updated_at: '2026-11-21T12:00:00.000Z',
    ...overrides,
  };
}

describe('registerExamResult helpers', () => {
  it('marca pedidos pendentes como elegíveis', () => {
    expect(canRegisterExamResult({ status: 'requested' })).toBe(true);
    expect(canRegisterExamResult({ status: 'collected' })).toBe(true);
    expect(canRegisterExamResult({ status: 'sent' })).toBe(true);
    expect(canRegisterExamResult({ status: 'result_received' })).toBe(false);
    expect(canRegisterExamResult({ status: 'cancelled' })).toBe(false);
  });

  it('detecta resultado sem PDF para reenvio', () => {
    expect(
      examNeedsResultAttachment(baseExam({ status: 'result_received', result_text: 'ok' }), []),
    ).toBe(true);
    expect(
      examNeedsResultAttachment(baseExam({ status: 'result_received', result_text: 'ok' }), [
        { hub_exam_id: 'exam-1' },
      ]),
    ).toBe(false);
    expect(
      examNeedsResultAttachment(
        baseExam({
          status: 'result_received',
          metadata: { result_attachment_id: 'att-1' },
        }),
        [],
      ),
    ).toBe(false);
  });
});

describe('registerExamResult', () => {
  it('grava texto e status no mesmo pedido', async () => {
    const exam = baseExam();
    const patched = baseExam({
      status: 'result_received',
      result_text: 'Laudo QA',
      result_at: '2026-11-21T15:00:00.000Z',
    });
    const patchExam = vi.fn().mockResolvedValue({ exam: patched });
    const uploadAttachment = vi.fn();

    const outcome = await registerExamResult(
      {
        clinicId: 'clinic-a',
        petId: 'pet-1',
        exam,
        resultText: 'Laudo QA',
        nowIso: '2026-11-21T15:00:00.000Z',
      },
      { patchExam, uploadAttachment },
    );

    expect(patchExam).toHaveBeenCalledWith('exam-1', {
      clinic_id: 'clinic-a',
      status: 'result_received',
      result_at: '2026-11-21T15:00:00.000Z',
      result_text: 'Laudo QA',
    });
    expect(uploadAttachment).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      resultSaved: true,
      attachmentSaved: false,
      attachmentSkipped: true,
      attachmentError: null,
    });
    expect(outcome.exam.status).toBe('result_received');
  });

  it('em falha de anexo mantém o texto e permite retry no mesmo id', async () => {
    const exam = baseExam();
    const patched = baseExam({
      status: 'result_received',
      result_text: 'Laudo QA',
      result_at: '2026-11-21T15:00:00.000Z',
    });
    const patchExam = vi.fn().mockResolvedValue({ exam: patched });
    const uploadAttachment = vi.fn().mockRejectedValue(new Error('upload falhou'));

    const outcome = await registerExamResult(
      {
        clinicId: 'clinic-a',
        petId: 'pet-1',
        exam,
        resultText: 'Laudo QA',
        file: new File(['pdf'], 'laudo.pdf', { type: 'application/pdf' }),
        nowIso: '2026-11-21T15:00:00.000Z',
      },
      { patchExam, uploadAttachment },
    );

    expect(outcome.resultSaved).toBe(true);
    expect(outcome.attachmentSaved).toBe(false);
    expect(outcome.attachmentError).toContain('upload falhou');
    expect(outcome.exam.id).toBe('exam-1');
    expect(patchExam).toHaveBeenCalledTimes(1);

    const withFile = baseExam({
      status: 'result_received',
      result_text: 'Laudo QA',
      result_at: '2026-11-21T15:00:00.000Z',
      metadata: { result_attachment_id: 'att-9', result_storage_path: 'path/laudo.pdf' },
    });
    patchExam.mockResolvedValue({ exam: withFile });
    uploadAttachment.mockResolvedValue({
      attachment: { id: 'att-9', storage_path: 'path/laudo.pdf' },
    });

    const retry = await registerExamResult(
      {
        clinicId: 'clinic-a',
        petId: 'pet-1',
        exam: patched,
        resultText: 'Laudo QA',
        file: new File(['pdf'], 'laudo.pdf', { type: 'application/pdf' }),
        attachmentOnly: true,
      },
      { patchExam, uploadAttachment },
    );

    expect(uploadAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ examId: 'exam-1', petId: 'pet-1' }),
    );
    expect(retry.attachmentSaved).toBe(true);
    expect(retry.exam.id).toBe('exam-1');
    // 1ª chamada: texto; 2ª: metadata após upload no retry
    expect(patchExam).toHaveBeenCalledTimes(2);
  });
});
