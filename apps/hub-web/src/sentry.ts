/**
 * Inicialização opcional do Sentry no Hub web.
 * Sem VITE_SENTRY_DSN, não carrega o SDK.
 */
export async function initHubSentry(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn?.trim()) return;

  try {
    const Sentry = await import('@sentry/react');
    Sentry.init({
      dsn: dsn.trim(),
      environment:
        (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ||
        import.meta.env.MODE ||
        'development',
      tracesSampleRate: 0,
    });
  } catch (e) {
    console.warn('[hub-sentry] pacote @sentry/react indisponível', e);
  }
}
