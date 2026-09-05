import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@petimi/web-core', () => ({
  apiRequest: vi.fn(),
  getApiBaseUrl: () => 'http://localhost:3000',
  getSupabase: () => ({}),
}));

import { apiRequest } from '@petimi/web-core';
import { hubComandaApi, isTransientComandaOpenError } from './hubComandaApi';

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

  it('não tenta recuperar erro de negócio', async () => {
    apiRequestMock.mockRejectedValueOnce(new Error('Já existe cobrança para esta origem'));
    await expect(hubComandaApi.openComanda(OPEN_BODY)).rejects.toThrow('Já existe cobrança');
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
  });
});
