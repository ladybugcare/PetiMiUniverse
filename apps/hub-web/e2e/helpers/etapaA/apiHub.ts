import { randomUUID } from 'node:crypto';
import { apiBaseUrl } from './config';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown>,
    message: string,
  ) {
    super(message);
  }
}

export async function hubApi<T = Record<string, unknown>>(
  token: string,
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const url = `${apiBaseUrl()}${path}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));
    let res: Response;
    try {
      res = await fetch(url, {
        method: opts.method || 'GET',
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      // tsx watch reinicia a API no meio do request — retenta.
      continue;
    }
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      data = { raw: text };
    }
    if (res.ok) return data as T;
    const msg =
      (typeof data.error === 'string' && data.error) ||
      (typeof data.message === 'string' && data.message) ||
      `HTTP ${res.status}`;
    lastErr = new ApiError(res.status, data, msg);
    const retryable =
      res.status === 429 ||
      res.status === 503 ||
      /temporariamente indisponível|rate|too many/i.test(msg);
    if (!retryable) throw lastErr;
  }
  throw lastErr ?? new Error('hubApi falhou');
}

export function todayYmd(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

export function newFixtureMarker(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}`;
}
