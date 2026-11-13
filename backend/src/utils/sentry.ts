/**
 * Sentry opcional na API. Sem SENTRY_DSN a app sobe normalmente.
 */
let sentryEnabled = false;

export async function initSentry(): Promise<void> {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;

  try {
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
    });
    sentryEnabled = true;
  } catch (e) {
    console.warn('[sentry] @sentry/node indisponível — seguindo sem telemetria', e);
  }
}

export async function captureException(
  err: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  if (!sentryEnabled) return;
  try {
    const Sentry = await import('@sentry/node');
    Sentry.withScope((scope) => {
      if (context) {
        Object.entries(context).forEach(([k, v]) => {
          scope.setExtra(k, v);
        });
      }
      Sentry.captureException(err);
    });
  } catch {
    /* ignore */
  }
}

export function isSentryEnabled(): boolean {
  return sentryEnabled;
}
