export const PET_OPEN_CLINICAL_CODE = 'PET_OPEN_CLINICAL_PRESENCE';

export const PET_OPEN_CLINICAL_CONFIRM_TITLE = 'Pet já em atendimento';

export const PET_OPEN_CLINICAL_CONFIRM_MESSAGE =
  'Este pet já possui um atendimento ou encaixe clínico em aberto. Deseja registrar outro mesmo assim?';

type ApiErrorLike = {
  message?: string;
  code?: string;
  body?: { code?: string; error?: string };
};

export function isPetOpenClinicalPresenceError(err: unknown): boolean {
  const e = err as ApiErrorLike | null | undefined;
  if (!e) return false;
  if (e.code === PET_OPEN_CLINICAL_CODE || e.body?.code === PET_OPEN_CLINICAL_CODE) return true;
  const msg = e.body?.error || e.message || '';
  return /atendimento ou encaixe clínico em aberto/i.test(msg);
}

export function petOpenClinicalPresenceMessage(err: unknown): string {
  const e = err as ApiErrorLike | null | undefined;
  return e?.body?.error || e?.message || PET_OPEN_CLINICAL_CONFIRM_MESSAGE;
}
