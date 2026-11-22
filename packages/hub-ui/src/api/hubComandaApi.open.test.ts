import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@petimi/web-core', () => ({
  apiRequest: vi.fn(),
  getApiBaseUrl: () => 'http://localhost:3000',
  getSupabase: () => ({}),
}));

import { apiRequest } from '@petimi/web-core';
import { hubComandaApi, isExistingOpenComandaError, isTransientComandaOpenError } from './hubComandaApi';

const apiRequestMock = vi.mocked(apiRequest);

const OPEN_BODY = {
  clinic_id: '11111111-1111-4111-8111-111111111111',
  origin_type: 'appointment' as const,
  origin_id: '22222222-2222-4222-8222-222222222222',
};

describe('isTransientComandaOpenError', () => {
  it('reconhece falha de conexão da API', () => {
    expect(
      isTransientComandaOpenError(
        new Error('Não foi possível conectar ao servidor. Verifique se a API está em execução e tente novamente.'),
      ),
    ).toBe(true);
    expect(isTransientComandaOpenError(new Error('Já existe comanda aberta para esta origem'))).toBe(false);
  });
});

describe('isExistingOpenComandaError', () => {
  it('reconhece 409 e corrida de unique constraint', () => {
    expect(isExistingOpenComandaError(new Error('Já existe comanda aberta para esta origem'))).toBe(true);
    expect(
      isExistingOpenComandaError(
        new Error('duplicate key value violates unique constraint "uniq_hub_comandas_active_origin"'),
      ),
    ).toBe(true);
    expect(isExistingOpenComandaError(new Error('Já existe cobrança para esta origem'))).toBe(false);
  });
});

describe('hubComandaApi.openComanda', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('após queda de rede, reusa a comanda já criada pela origem', async () => {
    vi.useFakeTimers();
    apiRequestMock
      .mockRejectedValueOnce(
        new Error('Não foi possível conectar ao servidor. Verifique se a API está em execução e tente novamente.'),
      )
      .mockRejectedValueOnce(
        new Error('Não foi possível conectar ao servidor. Verifique se a API está em execução e tente novamente.'),
      )
      .mockResolvedValueOnce({ comanda: { id: 'comanda-existente' }, items: [] });

    const pending = hubComandaApi.openComanda(OPEN_BODY);
    await vi.advanceTimersByTimeAsync(500);
    const detail = await pending;

    expect(detail.comanda).toMatchObject({ id: 'comanda-existente' });
    expect(apiRequestMock).toHaveBeenCalledTimes(3);
    expect(String(apiRequestMock.mock.calls[2]?.[0])).toContain('/by-origin');
    vi.useRealTimers();
  });

  it('reabre por origem quando o open bate em unique constraint', async () => {
    apiRequestMock
      .mockRejectedValueOnce(
        new Error('duplicate key value violates unique constraint "uniq_hub_comandas_active_origin"'),
      )
      .mockResolvedValueOnce({ comanda: { id: 'comanda-ativa' }, items: [{ id: 'i1' }] });

    const detail = await hubComandaApi.openComanda({
      ...OPEN_BODY,
      origin_type: 'quote',
    });
    expect(detail.comanda).toMatchObject({ id: 'comanda-ativa' });
    expect(apiRequestMock).toHaveBeenCalledTimes(2);
    expect(String(apiRequestMock.mock.calls[1]?.[0])).toContain('/by-origin');
  });

  it('não tenta recuperar erro de negócio', async () => {
    apiRequestMock.mockRejectedValueOnce(new Error('Já existe cobrança para esta origem'));
    await expect(hubComandaApi.openComanda(OPEN_BODY)).rejects.toThrow('Já existe cobrança');
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
  });
});

describe('hubComandaApi.applyPackage', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('desembrulha { detail } da API apply-package', async () => {
    apiRequestMock.mockResolvedValueOnce({
      detail: {
        comanda: { id: 'comanda-1', pet: { id: 'pet-1', name: 'Pet A' } },
        items: [{ id: 'item-1', line_total: 0, package_balance_id: 'bal-1' }],
        pets: [{ id: 'pet-1', name: 'Pet A' }],
      },
    });

    const detail = await hubComandaApi.applyPackage('comanda-1', {
      clinic_id: '11111111-1111-4111-8111-111111111111',
      item_id: 'item-1',
      package_balance_id: 'bal-1',
      edit_context: 'caixa',
    });

    expect(detail.comanda).toMatchObject({ id: 'comanda-1' });
    expect(detail.items?.[0]).toMatchObject({ line_total: 0, package_balance_id: 'bal-1' });
    expect(String(apiRequestMock.mock.calls[0]?.[0])).toContain('/apply-package');
  });
});
