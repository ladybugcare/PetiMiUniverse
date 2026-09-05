import React, { useEffect } from 'react';
import type { CaseAfterCompleteChoice, CaseAfterCompletePrompt } from './caseAfterCompletePrompt';

type Props = {
  open: boolean;
  prompt: CaseAfterCompletePrompt | null;
  saving?: boolean;
  onChoose: (choice: CaseAfterCompleteChoice) => void;
};

const CompleteEncounterCasePrompt: React.FC<Props> = ({ open, prompt, saving, onChoose }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onChoose('keep_open');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, saving, onChoose]);

  if (!open || !prompt) return null;

  const keepLabel = prompt.status === 'monitoring' ? 'Manter em monitoramento' : 'Manter aberto';
  const showMonitoring = prompt.status === 'active';

  return (
    <div
      className="hub-clinic-amend-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="case-after-complete-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onChoose('keep_open');
      }}
    >
      <div className="hub-clinic-amend-modal">
        <h3 id="case-after-complete-title">Atendimento finalizado</h3>
        <p className="hub-clientes__muted">
          Este atendimento faz parte do caso «{prompt.title}». O que você quer fazer com o caso?
        </p>
        {prompt.pendingExamsCount > 0 ? (
          <p className="hub-clinic-case-prompt__hint">
            {prompt.pendingExamsCount === 1
              ? 'Há 1 exame ainda pendente neste atendimento. Monitoramento costuma ser o mais adequado.'
              : `Há ${prompt.pendingExamsCount} exames ainda pendentes neste atendimento. Monitoramento costuma ser o mais adequado.`}
          </p>
        ) : null}
        <div className="hub-clinic-case-prompt__choices">
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={saving}
            autoFocus
            onClick={() => onChoose('keep_open')}
          >
            {keepLabel}
          </button>
          {showMonitoring ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--outline"
              disabled={saving}
              onClick={() => onChoose('monitoring')}
            >
              Passar para monitoramento
            </button>
          ) : null}
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost"
            disabled={saving}
            onClick={() => onChoose('resolved')}
          >
            Marcar como resolvido
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompleteEncounterCasePrompt;
