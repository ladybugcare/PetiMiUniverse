import type { BrowserContext } from '@playwright/test';

/**
 * Aplica bypass de Vercel Deployment Protection só em requests ao Hub
 * (domínio petmi / vercel.app). Não injeta o header em chamadas à API Railway —
 * senão o CORS pré-flight quebra o login (`net::ERR_FAILED`).
 */
export async function attachVercelProtectionBypass(context: BrowserContext): Promise<void> {
  const oidc =
    process.env.VERCEL_OIDC_TOKEN || process.env.E2E_VERCEL_OIDC_TOKEN || '';
  const bypass =
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET ||
    process.env.E2E_VERCEL_PROTECTION_BYPASS ||
    '';
  if (!oidc && !bypass) return;

  await context.route('**/*', async (route) => {
    const url = route.request().url();
    const isHubSurface =
      /hub-staging\.petmi\.app/i.test(url) ||
      /hub\.petmi\.app/i.test(url) ||
      /\.vercel\.app/i.test(url);
    if (!isHubSurface) {
      await route.continue();
      return;
    }
    const headers = { ...route.request().headers() };
    if (oidc) headers['x-vercel-trusted-oidc-idp-token'] = oidc;
    if (bypass) {
      headers['x-vercel-protection-bypass'] = bypass;
      // Cookie complementar exigido por alguns modos de bypass da Vercel.
      const cookie = headers.cookie ? `${headers.cookie}; ` : '';
      headers.cookie = `${cookie}x-vercel-protection-bypass=${bypass}`;
    }
    await route.continue({ headers });
  });
}
