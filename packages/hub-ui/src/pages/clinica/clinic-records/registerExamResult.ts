import type { HubClinicalAttachment, HubClinicalExam } from '../../../api/hubClinicalApi';

/** Pedidos ainda sem resultado — elegíveis a «Registrar resultado» no prontuário. */
export function canRegisterExamResult(exam: Pick<HubClinicalExam, 'status'>): boolean {
  return exam.status === 'requested' || exam.status === 'collected' || exam.status === 'sent';
}

/**
 * Resultado já gravado, mas sem PDF/anexo vinculado — permite reenviar o arquivo
 * sem criar outro pedido e sem retificar o texto.
 */
export function examNeedsResultAttachment(
  exam: Pick<HubClinicalExam, 'id' | 'status' | 'external_result_url' | 'metadata'>,
  attachments: Array<Pick<HubClinicalAttachment, 'hub_exam_id'>>,
): boolean {
  if (exam.status !== 'result_received' && exam.status !== 'completed') return false;
  if (exam.external_result_url) return false;
  const meta = exam.metadata && typeof exam.metadata === 'object' ? exam.metadata : {};
  if (meta.result_attachment_id || meta.result_storage_path) return false;
  return !attachments.some((a) => a.hub_exam_id === exam.id);
}

export type RegisterExamResultDeps = {
  patchExam: (
    id: string,
    payload: {
      clinic_id: string;
      status?: HubClinicalExam['status'];
      result_text?: string | null;
      result_at?: string | null;
      external_result_url?: string | null;
      metadata?: Record<string, unknown>;
    },
  ) => Promise<{ exam: HubClinicalExam }>;
  uploadAttachment: (params: {
    clinicId: string;
    petId: string;
    encounterId?: string | null;
    examId?: string | null;
    file: File;
    title?: string;
  }) => Promise<{ attachment: { id: string; storage_path: string } }>;
};

export type RegisterExamResultInput = {
  clinicId: string;
  petId: string;
  exam: HubClinicalExam;
  resultText: string;
  file?: File | null;
  /** Só reenvia o PDF no pedido já marcado como result_received. */
  attachmentOnly?: boolean;
  nowIso?: string;
};

export type RegisterExamResultOutcome = {
  exam: HubClinicalExam;
  resultSaved: boolean;
  attachmentSaved: boolean;
  attachmentSkipped: boolean;
  attachmentError: string | null;
};

function asMeta(exam: HubClinicalExam): Record<string, unknown> {
  return exam.metadata && typeof exam.metadata === 'object' ? { ...exam.metadata } : {};
}

/**
 * Atualiza o pedido original (PATCH) e, se houver arquivo, anexa o PDF.
 * Em falha parcial (texto OK / anexo falhou), não cria outro exame.
 */
export async function registerExamResult(
  input: RegisterExamResultInput,
  deps: RegisterExamResultDeps,
): Promise<RegisterExamResultOutcome> {
  const text = input.resultText.trim();
  if (!input.attachmentOnly && !text) {
    throw new Error('Informe o texto do resultado.');
  }

  let exam = input.exam;
  let resultSaved = false;

  if (!input.attachmentOnly) {
    const { exam: patched } = await deps.patchExam(exam.id, {
      clinic_id: input.clinicId,
      status: 'result_received',
      result_at: input.nowIso ?? new Date().toISOString(),
      result_text: text,
    });
    exam = patched;
    resultSaved = true;
  } else {
    // Retry de PDF: o texto já foi persistido no pedido original.
    resultSaved = true;
  }

  const file = input.file ?? null;
  if (!file) {
    return {
      exam,
      resultSaved,
      attachmentSaved: false,
      attachmentSkipped: true,
      attachmentError: null,
    };
  }

  try {
    const { attachment } = await deps.uploadAttachment({
      clinicId: input.clinicId,
      petId: input.petId,
      encounterId: exam.hub_encounter_id,
      examId: exam.id,
      file,
      title: `Resultado: ${exam.exam_type}`,
    });
    const url = attachment.storage_path;
    const isHttp = /^https?:\/\//i.test(url);
    const { exam: withMeta } = await deps.patchExam(exam.id, {
      clinic_id: input.clinicId,
      status: 'result_received',
      ...(isHttp ? { external_result_url: url } : {}),
      metadata: {
        ...asMeta(exam),
        result_attachment_id: attachment.id,
        result_storage_path: url,
      },
    });
    return {
      exam: withMeta,
      resultSaved: true,
      attachmentSaved: true,
      attachmentSkipped: false,
      attachmentError: null,
    };
  } catch (e: unknown) {
    return {
      exam,
      resultSaved: true,
      attachmentSaved: false,
      attachmentSkipped: false,
      attachmentError: (e as Error)?.message || 'Erro ao anexar o PDF do resultado',
    };
  }
}
