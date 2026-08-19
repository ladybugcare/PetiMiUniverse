import { apiBaseUrl } from './users';

type Json = Record<string, unknown>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: Json,
    message: string,
  ) {
    super(message);
  }
}

function errorMessage(data: Json, fallback: string): string {
  const err = data.error;
  const msg = data.message;
  if (typeof err === 'string' && err.trim()) return err;
  if (typeof msg === 'string' && msg.trim()) return msg;
  return fallback;
}

export async function apiJson<T = Json>(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  const url = `${apiBaseUrl()}${path}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await res.text();
  let data: Json = {};
  try {
    data = text ? (JSON.parse(text) as Json) : {};
  } catch {
    data = { _raw: text };
  }

  if (!res.ok) {
    const msg = errorMessage(data, `${res.status} ${url}`);
    if (res.status === 429) {
      throw new ApiError(
        429,
        data,
        `${msg} — o limiter de auth é baixo. No backend, use DISABLE_RATE_LIMIT=true no .env.local para e2e.`,
      );
    }
    throw new ApiError(res.status, data, msg);
  }

  return data as T;
}

export async function waitForApi(timeoutMs = 30_000) {
  const base = apiBaseUrl();
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/health/live`);
      if (res.ok) return;
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = (e as Error).message;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(
    `API não respondeu em ${base}/health/live (${last}). Suba o backend com npm run dev:backend.`,
  );
}
