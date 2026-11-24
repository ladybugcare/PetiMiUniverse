import { apiBaseUrl, qaStagingPassword, supabaseAuthConfig } from './config';
import { QA_USERS } from './constants';

const tokenCache = new Map<string, string>();

export async function loginQaToken(
  email: keyof typeof QA_USERS | string = QA_USERS.CFINANCE,
): Promise<string> {
  const resolved = email.includes('@') ? email : QA_USERS[email as keyof typeof QA_USERS];
  const hit = tokenCache.get(resolved);
  if (hit) return hit;

  const pw = qaStagingPassword();
  if (!pw) throw new Error('QA_STAGING_PASSWORD ausente (backend/.env.smoke.preprod.local)');

  const { url, anonKey } = supabaseAuthConfig();
  let lastMsg = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * attempt));
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resolved, password: pw }),
    });
    const body = (await res.json()) as { access_token?: string; error_description?: string; msg?: string };
    if (res.ok && body.access_token) {
      tokenCache.set(resolved, body.access_token);
      return body.access_token;
    }
    lastMsg = body.error_description || body.msg || String(res.status);
    if (!/rate|indisponível|too many|429/i.test(lastMsg) && res.status !== 429) break;
  }
  throw new Error(`Login QA falhou (${resolved}): ${lastMsg}`);
}

export async function pingApiHealth(): Promise<void> {
  const base = apiBaseUrl();
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * Math.min(attempt, 5)));
    try {
      const res = await fetch(`${base}/api/hub/health`);
      if (res.ok) return;
      lastErr = new Error(`API indisponível em ${base}/api/hub/health (${res.status})`);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastErr ?? new Error(`API indisponível em ${base}/api/hub/health`);
}