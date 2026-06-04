import React from 'react';
import { useAlert } from '../components/AlertProvider';

const btnPrimary: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 10,
  border: 'none',
  background: '#c86a4d',
  color: '#fff',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  ...btnPrimary,
  background: '#fff',
  color: '#4a3b3a',
  border: '1px solid #d6d6d6',
};

/** Exemplos de toast de sucesso para o catálogo do design system (requer `AlertProvider` no ancestral). */
export const HubToastShowcase: React.FC = () => {
  const { showSuccess } = useAlert();

  return (
    <section className="hub-ds__section" aria-labelledby="hub-ds-toast-title">
      <h2 id="hub-ds-toast-title" className="hub-ds__section-title">
        Toast de sucesso
      </h2>
      <p className="hub-ds__section-desc">
        Feedbacks de sucesso com um único OK usam toast fixo no canto inferior direito via{' '}
        <code>showSuccess</code> do <code>AlertProvider</code>. Erros, confirmações e sucesso com mais de
        uma ação (ex.: dois botões) continuam no modal <code>Alert</code>.
      </p>

      <div className="hub-ds__card">
        <p className="hub-ds__example-label">Disparar exemplos</p>
        <div className="hub-ds__btn-row">
          <button type="button" style={btnPrimary} onClick={() => showSuccess('Operação concluída.')}>
            Padrão (título &quot;Sucesso!&quot;)
          </button>
          <button
            type="button"
            style={btnSecondary}
            onClick={() => showSuccess('Registo guardado.', 'Título personalizado')}
          >
            Título + mensagem
          </button>
          <button
            type="button"
            style={btnSecondary}
            onClick={() => {
              showSuccess('Primeira notificação');
              showSuccess('Segunda notificação (pilha)');
            }}
          >
            Duas na pilha
          </button>
        </div>

        <pre className="hub-ds__code">
          <code>{`import { useAlert } from '@petimi/hub-ui';

const { showSuccess } = useAlert();
showSuccess('Convertido em cliente (tutor + pets)');

// Opcional: duração e callback ao fechar (timeout ou X)
showSuccess('Guardado', 'Sucesso!', { durationMs: 6000, onDismiss: () => { /* … */ } });`}</code>
        </pre>
      </div>
    </section>
  );
};

export default HubToastShowcase;
