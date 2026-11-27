import { describe, expect, it } from 'vitest';
import {
  firstZodFieldMessage,
  isValidBrPhone,
  isValidBrTaxId,
  isValidCnpj,
  isValidCpf,
  normalizeBrTaxId,
} from '../brTaxId';

describe('brTaxId', () => {
  it('normalizeBrTaxId remove máscara', () => {
    expect(normalizeBrTaxId('111.111.111-11')).toBe('11111111111');
  });

  it('rejeita CPF com dígitos repetidos', () => {
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidBrTaxId('111.111.111-11')).toBe(false);
  });

  it('aceita CPF válido conhecido', () => {
    expect(isValidCpf('26290449800')).toBe(true);
    expect(isValidBrTaxId('262.904.498-00')).toBe(true);
  });

  it('aceita CNPJ válido conhecido', () => {
    expect(isValidCnpj('11222333000181')).toBe(true);
  });

  it('valida telefone BR por quantidade de dígitos', () => {
    expect(isValidBrPhone('(11) 98888-8888')).toBe(true);
    expect(isValidBrPhone('(11) 3456-7890')).toBe(true);
    expect(isValidBrPhone('123')).toBe(false);
    expect(isValidBrPhone('')).toBe(false);
  });

  it('firstZodFieldMessage prioriza fieldErrors', () => {
    expect(
      firstZodFieldMessage({
        formErrors: [],
        fieldErrors: { phone: ['Telefone inválido (use DDD + número)'] },
      }),
    ).toBe('Telefone inválido (use DDD + número)');
  });
});
