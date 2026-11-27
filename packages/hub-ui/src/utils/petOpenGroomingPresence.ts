export const PET_OPEN_GROOMING_CODE = 'PET_OPEN_GROOMING_PRESENCE';

export const PET_OPEN_GROOMING_CONFIRM_TITLE = 'Pet já no Banho & Tosa';

export const PET_OPEN_GROOMING_CONFIRM_MESSAGE =
  'Este pet já possui uma sessão ou encaixe de Banho & Tosa em aberto. Deseja registrar outro mesmo assim?';

type ApiErrorLike = {
  message?: string;
  code?: string;
  body?: { code?: string; error?: string };
};

export function isPetOpenGroomingPresenceError(err: unknown): boolean {
  const e = err as ApiErrorLike | null | undefined;
  if (!e) return false;
  if (e.code === PET_OPEN_GROOMING_CODE || e.body?.code === PET_OPEN_GROOMING_CODE) return true;
  const msg = e.body?.error || e.message || '';
  return /Banho & Tosa em aberto/i.test(msg);
}

export function petOpenGroomingPresenceMessage(err: unknown): string {
  const e = err as ApiErrorLike | null | undefined;
  return e?.body?.error || e?.message || PET_OPEN_GROOMING_CONFIRM_MESSAGE;
}
