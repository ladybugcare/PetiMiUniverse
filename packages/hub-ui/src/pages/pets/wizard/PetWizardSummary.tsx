import React from 'react';
import { Bookmark, Lightbulb } from 'lucide-react';
import type { PetWizardState } from './types';
import { petAgeLabel } from '../petAge';
import {
  COAT_TYPE_LABELS,
  COAT_TYPE_VALUES,
  PET_BODY_PORTE_VALUES,
  PORTE_LABELS,
  type CoatTypeValue,
  type PetBodyPorteValue,
} from '../../../utils/hubServiceTypesPricingMatrix';

function sexLabel(s: string): string {
  if (s === 'M') return 'Macho';
  if (s === 'F') return 'Fêmea';
  if (s === 'U') return 'Indefinido';
  return '—';
}

type Row = { k: string; v: string };

type Props = {
  state: PetWizardState;
  photoPreview: string | null;
  primaryName: string;
  secondaryName: string;
  onSaveLater?: () => void;
  saveLaterDisabled?: boolean;
};

export const PetWizardSummary: React.FC<Props> = ({
  state,
  photoPreview,
  primaryName,
  secondaryName,
  onSaveLater,
  saveLaterDisabled = true,
}) => {
  const rows: Row[] = [
    { k: 'Nome', v: state.name || '—' },
    { k: 'Apelido', v: state.nickname || '—' },
    { k: 'Espécie', v: state.species || '—' },
    { k: 'Raça', v: state.isSRD ? 'SRD' : state.breed || '—' },
    { k: 'Sexo', v: sexLabel(state.sex) },
    { k: 'Castrado(a)', v: state.neutered === 'Y' ? 'Sim' : state.neutered === 'N' ? 'Não' : '—' },
    { k: 'Nascimento', v: state.birth_date || '—' },
    { k: 'Idade', v: petAgeLabel(state.birth_date || null) },
    { k: 'Cor', v: state.coatColor || '—' },
    {
      k: 'Pelagem',
      v:
        state.coatType && COAT_TYPE_VALUES.includes(state.coatType as CoatTypeValue)
          ? COAT_TYPE_LABELS[state.coatType as CoatTypeValue]
          : '—',
    },
    {
      k: 'Porte',
      v:
        state.size && PET_BODY_PORTE_VALUES.includes(state.size as PetBodyPorteValue)
          ? PORTE_LABELS[state.size as PetBodyPorteValue]
          : '—',
    },
    { k: 'Peso', v: state.weightKg ? `${state.weightKg} kg` : '—' },
    { k: 'Altura', v: state.heightCm ? `${state.heightCm} cm` : '—' },
    { k: 'Microchip', v: state.microchip || '—' },
    { k: 'Como nos conheceu', v: state.referralSource || '—' },
    { k: 'Outros locais', v: state.visitsOther === 'Y' ? 'Sim' : state.visitsOther === 'N' ? 'Não' : '—' },
    { k: 'Tutor principal', v: primaryName || '—' },
    { k: 'Tutor secundário', v: secondaryName || '—' },
  ];

  return (
    <aside className="pet-wizard__aside">
      <div className="pet-wizard__summary">
        <div className="pet-wizard__summary-preview" aria-hidden>
          {photoPreview ? (
            <img src={photoPreview} alt="" />
          ) : (
            <span className="pet-wizard__summary-preview-placeholder">Sem foto</span>
          )}
        </div>
        <h3 className="pet-wizard__summary-title">Resumo do pet</h3>
        <ul className="pet-wizard__summary-list">
          {rows.map((r) => (
            <li key={r.k}>
              <span className="pet-wizard__summary-k">{r.k}</span>
              <span className="pet-wizard__summary-v">{r.v}</span>
            </li>
          ))}
        </ul>
        <div className="pet-wizard__tip" role="note">
          <Lightbulb className="pet-wizard__tip-icon" size={18} strokeWidth={2} aria-hidden />
          <p className="pet-wizard__tip-text">
            Dica: Preencher corretamente os dados do pet ajuda a personalizar atendimentos e cuidados.
          </p>
        </div>
        <button
          type="button"
          className="pet-wizard__summary-save-later"
          disabled={saveLaterDisabled}
          title="Rascunhos serão suportados em uma versão futura"
          onClick={onSaveLater}
        >
          <Bookmark size={18} strokeWidth={2} aria-hidden />
          Salvar e continuar depois
        </button>
      </div>
    </aside>
  );
};
