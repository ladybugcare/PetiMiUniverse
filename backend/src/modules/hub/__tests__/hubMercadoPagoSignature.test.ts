import crypto from 'crypto';
import { isValidMercadoPagoSignature } from '../hubMercadoPago';

describe('isValidMercadoPagoSignature', () => {
  it('aceita o HMAC do manifesto id/request-id/ts', () => {
    const secret = 'segredo-teste';
    const dataId = 'ABC123';
    const requestId = 'req-1';
    const ts = '1700000000';
    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
    const v1 = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

    expect(
      isValidMercadoPagoSignature({
        signatureHeader: `ts=${ts},v1=${v1}`,
        requestId,
        dataId,
        secret,
      }),
    ).toBe(true);
  });

  it('recusa assinatura trocada', () => {
    expect(
      isValidMercadoPagoSignature({
        signatureHeader: 'ts=1700000000,v1=aaaa',
        requestId: 'req-1',
        dataId: 'abc',
        secret: 'segredo-teste',
      }),
    ).toBe(false);
  });
});
