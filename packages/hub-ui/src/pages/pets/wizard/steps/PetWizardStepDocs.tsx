import React from 'react';
import { ClipboardList, Dog, FolderOpen, Info } from 'lucide-react';
import type { PetWizardState } from '../types';
import { PetBehaviorTagsPicker } from '../../PetBehaviorTagsPicker';

type Props = {
  state: PetWizardState;
  update: (p: Partial<PetWizardState>) => void;
};

export const PetWizardStepDocs: React.FC<Props> = ({ state, update }) => {
  const otherObs = state.otherObservations.trim();

  return (
    <div className="pet-wizard__step-pane">
      <div className="pet-wizard__block-head">
        <span className="pet-wizard__block-head-icon pet-wizard__block-head-icon--brand" aria-hidden>
          <Dog size={22} strokeWidth={2} />
        </span>
        <div>
          <h3 className="pet-wizard__block-title">Comportamento e alertas</h3>
          <p className="pet-wizard__block-sub">Selecione os que se aplicam ao pet. Aparecem na ficha para toda a equipe.</p>
        </div>
      </div>

      <PetBehaviorTagsPicker
        value={state.behaviorTags}
        onChange={(behaviorTags) => update({ behaviorTags })}
        variant="pet-wizard"
      />

      <div className="pet-wizard__basics-divider" />

      <div className="pet-wizard__block-head">
        <span className="pet-wizard__block-head-icon" aria-hidden>
          <ClipboardList size={22} strokeWidth={2} />
        </span>
        <div>
          <h3 className="pet-wizard__block-title">Observações gerais</h3>
          <p className="pet-wizard__block-sub">Anotações livres sobre preferências, cuidados ou contexto administrativo.</p>
        </div>
      </div>

      {otherObs ? (
        <div className="pet-wizard__tip" style={{ marginBottom: 16 }}>
          <span className="pet-wizard__tip-icon" aria-hidden>
            <Info size={18} strokeWidth={2} />
          </span>
          <p className="pet-wizard__tip-text">
            <strong>Observações do passo 1</strong> serão incluídas automaticamente nas notas do pet:
            <br />
            <em style={{ display: 'block', marginTop: 6, whiteSpace: 'pre-wrap' }}>
              {otherObs.length > 200 ? `${otherObs.slice(0, 200)}…` : otherObs}
            </em>
          </p>
        </div>
      ) : null}

      <div className="pet-wizard__fields">
        <div className="pet-wizard__field--full">
          <label className="pet-wizard__label">Observações e alertas</label>
          <textarea
            className="pet-wizard__textarea"
            value={state.notes}
            onChange={(e) => update({ notes: e.target.value })}
            placeholder="Ex.: Agressivo com outros cães, alérgico a X, precisa de atenção especial ao banhar…"
            rows={6}
          />
          <p className="pet-wizard__field-hint">
            <Info size={14} strokeWidth={2} aria-hidden />
            Visíveis para toda a equipe no perfil do pet, junto com as observações do passo 1 (se existirem).
          </p>
        </div>
      </div>

      <div className="pet-wizard__basics-divider" />

      <div className="pet-wizard__docs-soon">
        <div className="pet-wizard__docs-soon-head">
          <span className="pet-wizard__block-head-icon" aria-hidden>
            <FolderOpen size={20} strokeWidth={2} />
          </span>
          <div className="pet-wizard__docs-soon-title-wrap">
            <h4 className="pet-wizard__docs-soon-title">Documentos e arquivos</h4>
            <span className="pet-wizard__docs-soon-badge">Em breve</span>
          </div>
        </div>
        <p className="pet-wizard__docs-soon-text">
          Histórico de vacinas, atestados e outros arquivos do pet ficarão disponíveis neste painel.
        </p>
      </div>
    </div>
  );
};
