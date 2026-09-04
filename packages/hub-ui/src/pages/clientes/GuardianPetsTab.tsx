import React from 'react';
import { Link } from 'react-router-dom';
import { Bird, Cat, Dog, Pencil, Plus } from 'lucide-react';
import type { HubGuardianPet } from '../../api/hubGuardiansApi';
import { profileInitials } from '../../components/HubProfileAvatar';
import { petAgeDetailedLabel } from '../pets/petAge';
import {
  COAT_TYPE_LABELS,
  PORTE_LABELS,
  type CoatTypeValue,
  type PetBodyPorteValue,
} from '../../utils/hubServiceTypesPricingMatrix';

type Props = {
  pets: HubGuardianPet[];
  guardianId: string;
  canWritePets: boolean;
  isPage: boolean;
};

type SpeciesKind = 'dog' | 'cat' | 'other';

function sexLabel(sex: HubGuardianPet['sex']): string | null {
  if (sex === 'M') return 'Macho';
  if (sex === 'F') return 'Fêmea';
  if (sex === 'U') return 'Indefinido';
  return null;
}

function speciesKind(species: string): SpeciesKind {
  const s = species.trim().toLowerCase();
  if (/gato|cat|felin/.test(s)) return 'cat';
  if (/c[aã]o|dog|canin/.test(s)) return 'dog';
  return 'other';
}

function SpeciesIcon({ kind }: { kind: SpeciesKind }) {
  const props = { size: 18, strokeWidth: 2, 'aria-hidden': true as const };
  if (kind === 'cat') return <Cat {...props} />;
  if (kind === 'dog') return <Dog {...props} />;
  return <Bird {...props} />;
}

function petChips(p: HubGuardianPet): string[] {
  const chips: string[] = [];
  const age = petAgeDetailedLabel(p.birth_date);
  if (age !== '—') chips.push(age);
  const sex = sexLabel(p.sex);
  if (sex) chips.push(sex);
  const porte = PORTE_LABELS[p.size_tier as PetBodyPorteValue];
  if (porte) chips.push(porte);
  const coat =
    p.coat_type && COAT_TYPE_LABELS[p.coat_type as CoatTypeValue]
      ? COAT_TYPE_LABELS[p.coat_type as CoatTypeValue]
      : null;
  if (coat) chips.push(coat);
  if (p.coat_color?.trim()) chips.push(p.coat_color.trim());
  return chips;
}

function addPetHref(guardianId: string): string {
  return `/hub/pets/novo?guardianId=${encodeURIComponent(guardianId)}&returnTo=${encodeURIComponent(`/hub/clientes/${guardianId}?tab=pets`)}`;
}

function editPetHref(petId: string, guardianId: string): string {
  return `/hub/pets/${petId}/editar?returnTo=${encodeURIComponent(`/hub/clientes/${guardianId}?tab=pets`)}`;
}

const AddPetButton: React.FC<{ guardianId: string; variant: 'page' | 'panel' }> = ({
  guardianId,
  variant,
}) => {
  const className =
    variant === 'page'
      ? 'hub-meu-perfil__btn-outline'
      : 'hub-clientes__btn hub-clientes__btn--outline hub-clientes__btn--sm';
  return (
    <Link to={addPetHref(guardianId)} className={className}>
      <Plus size={16} strokeWidth={2} aria-hidden />
      Adicionar pet
    </Link>
  );
};

export const GuardianPetsTab: React.FC<Props> = ({ pets, guardianId, canWritePets, isPage }) => {
  const list =
    pets.length === 0 ? (
      <div className="hub-clientes__pet-empty">
        <span className="hub-clientes__pet-empty-icon" aria-hidden>
          <Dog size={28} strokeWidth={1.75} />
        </span>
        <p className="hub-clientes__pet-empty-title">Nenhum pet vinculado</p>
        <p className="hub-clientes__pet-empty-text">
          Cadastre o primeiro pet deste cliente para agendar serviços e manter a ficha em dia.
        </p>
        {canWritePets ? (
          <Link
            to={addPetHref(guardianId)}
            className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
          >
            <Plus size={16} strokeWidth={2} aria-hidden />
            Adicionar pet
          </Link>
        ) : null}
      </div>
    ) : (
      <ul className="hub-clientes__pet-list">
        {pets.map((p) => {
          const breed = p.breed?.trim() || 'SRD';
          const chips = petChips(p);
          const kind = speciesKind(p.species);
          return (
            <li key={`${p.id}-${p.role}`} className={`hub-clientes__pet-card hub-clientes__pet-card--${kind}`}>
              <Link to={`/hub/pets/${p.id}`} className="hub-clientes__pet-card-main" aria-label={`Abrir ficha de ${p.name}`}>
                <span className={`hub-clientes__avatar hub-clientes__pet-card-avatar hub-clientes__pet-card-avatar--${kind}`} aria-hidden>
                  <span className="hub-clientes__pet-card-avatar-initials">{profileInitials(p.name)}</span>
                  <span className="hub-clientes__pet-card-avatar-badge">
                    <SpeciesIcon kind={kind} />
                  </span>
                </span>
                <div className="hub-clientes__pet-card-body">
                  <div className="hub-clientes__pet-card-title-row">
                    <span className="hub-clientes__pet-card-name">{p.name}</span>
                    <span
                      className={`hub-clientes__tag ${
                        p.role === 'primary' ? 'hub-clientes__tag--primary' : 'hub-clientes__tag--secondary'
                      }`}
                    >
                      {p.role === 'primary' ? 'Principal' : 'Co-tutor'}
                    </span>
                  </div>
                  <p className="hub-clientes__pet-card-meta">
                    <span className="hub-clientes__pet-card-species">{p.species}</span>
                    <span className="hub-clientes__pet-card-dot" aria-hidden>
                      ·
                    </span>
                    <span>{breed}</span>
                  </p>
                  {chips.length > 0 ? (
                    <ul className="hub-clientes__pet-card-chips" aria-label={`Detalhes de ${p.name}`}>
                      {chips.map((chip) => (
                        <li key={chip} className="hub-clientes__pet-card-chip">
                          {chip}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </Link>
              {canWritePets ? (
                <div className="hub-clientes__pet-card-actions">
                  <Link
                    to={editPetHref(p.id, guardianId)}
                    className="hub-clientes__pet-card-action hub-clientes__pet-card-action--edit"
                    title="Editar"
                    aria-label={`Editar ${p.name}`}
                  >
                    <Pencil size={16} strokeWidth={2} aria-hidden />
                  </Link>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    );

  if (isPage) {
    return (
      <section className="hub-meu-perfil__panel">
        <header className="hub-meu-perfil__panel-head">
          <div>
            <h2 className="hub-meu-perfil__panel-title">Pets</h2>
            <p className="hub-meu-perfil__panel-sub">
              {pets.length === 0
                ? 'Cadastre o primeiro pet deste cliente.'
                : pets.length === 1
                  ? '1 pet vinculado a este cliente.'
                  : `${pets.length} pets vinculados a este cliente.`}
            </p>
          </div>
          {canWritePets && pets.length > 0 ? <AddPetButton guardianId={guardianId} variant="page" /> : null}
        </header>
        {list}
      </section>
    );
  }

  return (
    <div className="hub-clientes__section">
      <div className="hub-clientes__section-head hub-clientes__pet-toolbar">
        <h3 className="hub-clientes__contact-card-title">Pets</h3>
        {canWritePets && pets.length > 0 ? <AddPetButton guardianId={guardianId} variant="panel" /> : null}
      </div>
      {list}
    </div>
  );
};
