import { brDateToIso, isoDateToBr } from '../pages/clientes/formatters';

/** Formata digitação para dd/mm/aaaa (até 8 dígitos). */
export function normalizeBrDateTyping(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export { brDateToIso, isoDateToBr };
