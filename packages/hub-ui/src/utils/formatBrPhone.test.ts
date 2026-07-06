import { describe, expect, it } from 'vitest';
import { digitsOnlyBrPhone, formatBrPhoneFromApi, formatBrPhoneDisplay, formatBrPhoneInput } from './formatBrPhone';

describe('formatBrPhone', () => {
  it('formata celular com 11 dígitos', () => {
    expect(formatBrPhoneInput('11988888888')).toBe('(11) 98888-8888');
  });

  it('formata fixo com 10 dígitos', () => {
    expect(formatBrPhoneInput('1134567890')).toBe('(11) 3456-7890');
  });

  it('limita a 11 dígitos', () => {
    expect(formatBrPhoneInput('119888888881234')).toBe('(11) 98888-8888');
  });

  it('reformata valor já mascarado', () => {
    expect(formatBrPhoneInput('(11) 98888-8888')).toBe('(11) 98888-8888');
  });

  it('digitsOnlyBrPhone remove não-dígitos', () => {
    expect(digitsOnlyBrPhone('(11) 98888-8888')).toBe('11988888888');
  });

  it('formatBrPhoneDisplay trata null e fallback', () => {
    expect(formatBrPhoneDisplay(null)).toBe('—');
    expect(formatBrPhoneDisplay('11988888888')).toBe('(11) 98888-8888');
    expect(formatBrPhoneDisplay('', 'N/A')).toBe('N/A');
  });
});
