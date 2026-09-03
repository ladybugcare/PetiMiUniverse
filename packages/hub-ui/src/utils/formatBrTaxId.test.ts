import { describe, expect, it } from 'vitest';
import {
  digitsOnlyBrTaxId,
  formatBrCnpjInput,
  formatBrCpfInput,
  formatBrTaxIdDisplay,
  formatBrTaxIdFromApi,
  formatBrTaxIdInput,
} from './formatBrTaxId';

describe('formatBrTaxId', () => {
  it('formata CPF completo', () => {
    expect(formatBrCpfInput('26290449800')).toBe('262.904.498-00');
  });

  it('formata CNPJ completo', () => {
    expect(formatBrCnpjInput('11222333000181')).toBe('11.222.333/0001-81');
  });

  it('modo auto troca para CNPJ após 11 dígitos', () => {
    expect(formatBrTaxIdInput('26290449800')).toBe('262.904.498-00');
    expect(formatBrTaxIdInput('11222333000181')).toBe('11.222.333/0001-81');
  });

  it('modo cpf limita a 11 dígitos', () => {
    expect(formatBrTaxIdInput('262904498001234', 'cpf')).toBe('262.904.498-00');
  });

  it('reformata valor já mascarado', () => {
    expect(formatBrTaxIdInput('262.904.498-00')).toBe('262.904.498-00');
    expect(formatBrTaxIdInput('11.222.333/0001-81')).toBe('11.222.333/0001-81');
  });

  it('digitsOnlyBrTaxId remove não-dígitos', () => {
    expect(digitsOnlyBrTaxId('262.904.498-00')).toBe('26290449800');
  });

  it('formatBrTaxIdFromApi e display', () => {
    expect(formatBrTaxIdFromApi('26290449800')).toBe('262.904.498-00');
    expect(formatBrTaxIdDisplay(null)).toBe('—');
    expect(formatBrTaxIdDisplay('', 'N/A')).toBe('N/A');
  });
});
