import crypto from 'crypto';

const MP_API = 'https://api.mercadopago.com';

export type MercadoPagoPreapproval = {
  id: string;
  status: string;
  init_point?: string;
  sandbox_init_point?: string;
  external_reference?: string | null;
  next_payment_date?: string | null;
  reason?: string;
};

export function mercadoPagoAccessToken(): string | null {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  return token || null;
}

export function mercadoPagoConfigured(): boolean {
  return Boolean(mercadoPagoAccessToken());
}

/** Manifest do Mercado Pago: id, request-id e ts, HMAC-SHA256 em hex. */
export function isValidMercadoPagoSignature(input: {
  signatureHeader: string | undefined;
  requestId: string | undefined;
  dataId: string | undefined;
  secret: string;
}): boolean {
  const header = input.signatureHeader?.trim();
  const dataId = input.dataId?.trim();
  if (!header || !dataId || !input.secret) return false;

  const parts = new Map<string, string>();
  for (const chunk of header.split(',')) {
    const eq = chunk.indexOf('=');
    if (eq <= 0) continue;
    parts.set(chunk.slice(0, eq).trim(), chunk.slice(eq + 1).trim());
  }
  const ts = parts.get('ts');
  const v1 = parts.get('v1');
  if (!ts || !v1 || !/^[0-9a-f]+$/i.test(v1)) return false;

  const id = /^[a-zA-Z0-9]+$/.test(dataId) ? dataId.toLowerCase() : dataId;
  const requestId = input.requestId?.trim() || '';
  const manifest = `id:${id};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', input.secret).update(manifest).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(v1.toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function webhookUrl(): string | undefined {
  const base = process.env.BACKEND_PUBLIC_URL?.trim().replace(/\/$/, '');
  if (!base) return undefined;
  return `${base}/api/public/mercadopago/webhook`;
}

export async function createMercadoPagoPreapproval(input: {
  reason: string;
  clinicId: string;
  payerEmail: string;
  amountReais: number;
  backUrl: string;
}): Promise<MercadoPagoPreapproval> {
  const token = mercadoPagoAccessToken();
  if (!token) {
    throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado');
  }

  const start = new Date(Date.now() + 60_000).toISOString();
  const body: Record<string, unknown> = {
    reason: input.reason.slice(0, 256),
    external_reference: input.clinicId,
    payer_email: input.payerEmail,
    back_url: input.backUrl,
    status: 'pending',
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      start_date: start,
      transaction_amount: Number(input.amountReais.toFixed(2)),
      currency_id: 'BRL',
    },
  };
  const notification = webhookUrl();
  if (notification) body.notification_url = notification;

  const res = await fetch(`${MP_API}/preapproval`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as MercadoPagoPreapproval & {
    message?: string;
    cause?: Array<{ description?: string }>;
  };
  if (!res.ok || !data.id) {
    const detail =
      data.cause?.map((c) => c.description).filter(Boolean).join('; ') ||
      data.message ||
      `Mercado Pago respondeu ${res.status}`;
    throw new Error(detail);
  }
  return data;
}

export function preapprovalCheckoutUrl(preapproval: MercadoPagoPreapproval): string | null {
  const token = mercadoPagoAccessToken() || '';
  if (token.startsWith('TEST-')) {
    return preapproval.sandbox_init_point || preapproval.init_point || null;
  }
  return preapproval.init_point || preapproval.sandbox_init_point || null;
}

export async function fetchMercadoPagoPreapproval(id: string): Promise<MercadoPagoPreapproval> {
  const token = mercadoPagoAccessToken();
  if (!token) throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado');
  const res = await fetch(`${MP_API}/preapproval/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json().catch(() => ({}))) as MercadoPagoPreapproval & { message?: string };
  if (!res.ok || !data.id) {
    throw new Error(data.message || `Mercado Pago respondeu ${res.status}`);
  }
  return data;
}
