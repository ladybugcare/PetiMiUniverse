/** Utilitários de horário HH:mm para HubTimeField. */

const HM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Valida e normaliza `HH:mm`. Retorna null se inválido. */
export function parseHm(value: string): string | null {
  const t = value.trim();
  if (!HM_RE.test(t)) return null;
  return t;
}

export function nowHm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Digitação progressiva → máscara HH:mm (só dígitos). */
export function normalizeHmTyping(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function formatHmDisplay(hm: string): string {
  return parseHm(hm) ?? '';
}

export function splitHm(hm: string): { hour: number; minute: number } | null {
  const parsed = parseHm(hm);
  if (!parsed) return null;
  const [h, m] = parsed.split(':').map(Number);
  return { hour: h, minute: m };
}

export function buildHm(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function hourOptions(): number[] {
  return Array.from({ length: 24 }, (_, i) => i);
}

export function minuteOptions(step = 1): number[] {
  const s = Math.max(1, Math.min(30, Math.floor(step)));
  const out: number[] = [];
  for (let m = 0; m < 60; m += s) out.push(m);
  return out;
}
