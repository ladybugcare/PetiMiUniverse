import React from 'react';

type Props = { children: React.ReactNode };

type State = { hasError: boolean; message: string | null };

/**
 * Boundary de UI do Hub. Integra Sentry quando VITE_SENTRY_DSN está definido
 * (carregamento dinâmico para não exigir o pacote em builds sem observabilidade).
 */
class HubErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || 'Erro inesperado' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
    if (!dsn) {
      console.error('[HubErrorBoundary]', error, info.componentStack);
      return;
    }
    void import('@sentry/react')
      .then((Sentry) => {
        Sentry.captureException(error, {
          contexts: { react: { componentStack: info.componentStack } },
        });
      })
      .catch(() => {
        console.error('[HubErrorBoundary]', error, info.componentStack);
      });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="hub-login-page-root" style={{ padding: 32 }}>
          <div className="hub-login-page-card" style={{ maxWidth: 480 }}>
            <h1 className="hub-login-page-welcome">Algo deu errado</h1>
            <p className="hub-login-page-subwelcome">
              Ocorreu um erro inesperado na interface. Tente recarregar a página. Se o problema
              continuar, fale com o suporte.
            </p>
            {this.state.message ? (
              <p className="hub-login-page-msg hub-login-page-msg--error">{this.state.message}</p>
            ) : null}
            <button
              type="button"
              className="hub-login-page-submit"
              onClick={() => window.location.assign('/hub')}
            >
              Recarregar o Hub
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default HubErrorBoundary;
