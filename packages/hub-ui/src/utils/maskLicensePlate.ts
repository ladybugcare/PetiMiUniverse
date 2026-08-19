/**
 * Máscara de placa brasileira: antiga (ABC-1234) ou Mercosul (ABC-1D23).
 * Aceita digitação livre e normaliza para maiúsculas com hífen após as 3 letras.
 */
export function maskLicensePlate(input: string): string {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  let letters = '';
  let rest = '';

  for (const ch of cleaned) {
    if (letters.length < 3) {
      if (/[A-Z]/.test(ch)) letters += ch;
      continue;
    }
    if (rest.length >= 4) break;
    const i = rest.length;
    if (i === 0) {
      if (/[0-9]/.test(ch)) rest += ch;
    } else if (i === 1) {
      // Antiga: dígito · Mercosul: letra
      if (/[A-Z0-9]/.test(ch)) rest += ch;
    } else if (/[0-9]/.test(ch)) {
      rest += ch;
    }
  }

  if (!rest) return letters;
  return `${letters}-${rest}`;
}
