const CLINIC_TZ = 'America/Sao_Paulo';

/** Dia civil YYYY-MM-DD no fuso da clínica. */
export function clinicCivilDateKey(isoOrDate: string | Date = new Date()): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ }).format(new Date());
  }
  return new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ }).format(d);
}

/** Receita só pode ter conteúdo editado no mesmo dia civil da prescrição. */
export function isPrescriptionContentEditableToday(opts: {
  prescribedAt?: string | null;
  createdAt?: string | null;
  status?: string | null;
}): boolean {
  if (opts.status === 'cancelled') return false;
  const anchor = opts.prescribedAt || opts.createdAt;
  if (!anchor) return true;
  return clinicCivilDateKey(anchor) === clinicCivilDateKey(new Date());
}
