import React from 'react';
import { Link } from 'react-router-dom';
import { Bird, Cat, Dog, Footprints, Lightbulb } from 'lucide-react';
import type { HubGuardianPet } from '../../../api/hubGuardiansApi';
import type { PetWizardState } from './types';
import { petAgeLabel } from '../petAge';

function sexLabel(s: HubGuardianPet['sex'] | PetWizardState['sex']): string {
  if (s === 'M') return 'Macho';
  if (s === 'F') return 'Fêmea';
  if (s === 'U') return 'Indefinido';
  return '—';
}

function speciesKind(species: string): 'dog' | 'cat' | 'other' {
  const s = species.trim().toLowerCase();
  if (/gato|cat|felin/.test(s)) return 'cat';
  if (/c[aã]o|dog|canin/.test(s)) return 'dog';
  return 'other';
}

function SpeciesIcon({ species }: { species: string }) {
  const kind = speciesKind(species);
  const props = { size: 16, strokeWidth: 2, 'aria-hidden': true as const };
  if (kind === 'cat') return <Cat {...props} />;
  if (kind === 'dog') return <Dog {...props} />;
  return <Bird {...props} />;
}

type Props = {
  state: PetWizardState;
  photoPreview: string | null;
  primaryName: string;
  guardianPets: HubGuardianPet[];
  guardianPetsLoading: boolean;
  /** Em edição, oculta o pet atual da lista de irmãos. */
  excludePetId?: string | null;
};

export const PetWizardSummary: React.FC<Props> = ({
  state,
  photoPreview,
  primaryName,
  guardianPets,
  guardianPetsLoading,
  excludePetId = null,
}) => {
  const hasGuardian = Boolean(state.primary_guardian_id);
  const draftName = state.name.trim() || 'Pet em cadastro';
  const draftBreed = state.isSRD ? 'SRD' : state.breed.trim() || null;
  const draftMeta = [state.species.trim() || null, draftBreed, state.sex ? sexLabel(state.sex) : null]
    .filter(Boolean)
    .join(' · ');

  const siblings = excludePetId
    ? guardianPets.filter((p) => p.id !== excludePetId)
    : guardianPets;

  return (
    <aside className="pet-wizard__aside">
      <div className="pet-wizard__summary">
        <div className="pet-wizard__summary-draft">
          <div className="pet-wizard__summary-preview pet-wizard__summary-preview--sm" aria-hidden>
            {photoPreview ? (
              <img src={photoPreview} alt="" />
            ) : (
              <span className="pet-wizard__summary-preview-placeholder">
                <Footprints size={22} strokeWidth={1.75} />
              </span>
            )}
          </div>
          <div className="pet-wizard__summary-draft-text">
            <p className="pet-wizard__summary-draft-label">Cadastrando agora</p>
            <h3 className="pet-wizard__summary-draft-name">{draftName}</h3>
            {draftMeta ? <p className="pet-wizard__summary-draft-meta">{draftMeta}</p> : null}
          </div>
        </div>

        <div className="pet-wizard__guardian-pets">
          <h3 className="pet-wizard__summary-title pet-wizard__summary-title--left">
            {hasGuardian && primaryName
              ? `Pets de ${primaryName}`
              : 'Pets do tutor'}
            {hasGuardian && !guardianPetsLoading ? (
              <span className="pet-wizard__guardian-pets-count">{siblings.length}</span>
            ) : null}
          </h3>

          {!hasGuardian ? (
            <p className="pet-wizard__guardian-pets-empty">
              Selecione o tutor principal para ver os pets já cadastrados.
            </p>
          ) : guardianPetsLoading ? (
            <p className="pet-wizard__guardian-pets-empty">Carregando pets…</p>
          ) : siblings.length === 0 ? (
            <p className="pet-wizard__guardian-pets-empty">
              {excludePetId && guardianPets.some((p) => p.id === excludePetId)
                ? 'Nenhum outro pet cadastrado para este tutor.'
                : 'Nenhum pet cadastrado para este tutor ainda.'}
            </p>
          ) : (
            <ul className="pet-wizard__guardian-pets-list">
              {siblings.map((p) => {
                const meta = [
                  p.species,
                  p.breed || null,
                  p.sex ? sexLabel(p.sex) : null,
                  petAgeLabel(p.birth_date),
                ]
                  .filter((x) => x && x !== '—')
                  .join(' · ');
                return (
                  <li key={p.id} className="pet-wizard__guardian-pets-item">
                    <span className="pet-wizard__guardian-pets-icon" aria-hidden>
                      <SpeciesIcon species={p.species} />
                    </span>
                    <div className="pet-wizard__guardian-pets-body">
                      <Link to={`/hub/pets/${p.id}`} className="pet-wizard__guardian-pets-name">
                        {p.name}
                      </Link>
                      {meta ? <p className="pet-wizard__guardian-pets-meta">{meta}</p> : null}
                      {p.role === 'secondary' ? (
                        <span className="pet-wizard__guardian-pets-role">Co-tutor</span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="pet-wizard__tip" role="note">
          <Lightbulb className="pet-wizard__tip-icon" size={18} strokeWidth={2} aria-hidden />
          <p className="pet-wizard__tip-text">
            Confira a lista para evitar cadastros duplicados quando o tutor já tem vários pets.
          </p>
        </div>
      </div>
    </aside>
  );
};
