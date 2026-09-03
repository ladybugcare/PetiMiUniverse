import React from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Plus } from 'lucide-react';
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

function sexLabel(sex: HubGuardianPet['sex']): string | null {
  if (sex === 'M') return 'Macho';
  if (sex === 'F') return 'Fêmea';
  if (sex === 'U') return 'Indefinido';
  return null;
}

function petFacts(p: HubGuardianPet): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = [];
  const age = petAgeDetailedLabel(p.birth_date);
  if (age !== '—') facts.push({ label: 'Idade', value: age });
  const sex = sexLabel(p.sex);
  if (sex) facts.push({ label: 'Sexo', value: sex });
  const porte = PORTE_LABELS[p.size_tier as PetBodyPorteValue];
  if (porte) facts.push({ label: 'Porte', value: porte });
  const coat =
    p.coat_type && COAT_TYPE_LABELS[p.coat_type as CoatTypeValue]
      ? COAT_TYPE_LABELS[p.coat_type as CoatTypeValue]
      : null;
  if (coat) facts.push({ label: 'Pelagem', value: coat });
  if (p.coat_color?.trim()) facts.push({ label: 'Cor', value: p.coat_color.trim() });
  return facts;
}

function addPetHref(guardianId: string): string {
  return `/hub/pets/novo?guardianId=${encodeURIComponent(guardianId)}`;
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
      <div className="hub-clientes__empty-state">Este cliente ainda não tem pets associados.</div>
    ) : (
      <ul className="hub-clientes__pet-list">
        {pets.map((p) => {
          const breed = p.breed?.trim() || 'SRD';
          const facts = petFacts(p);
          return (
            <li key={`${p.id}-${p.role}`} className="hub-clientes__pet-list-item">
              <span className="hub-clientes__avatar hub-clientes__pet-list-avatar" aria-hidden>
                {profileInitials(p.name)}
              </span>
              <div className="hub-clientes__pet-list-body">
                <div className="hub-clientes__pet-list-top">
                  <div className="hub-clientes__pet-list-title-row">
                    <Link to={`/hub/pets/${p.id}`} className="hub-clientes__pet-list-link">
                      {p.name}
                    </Link>
                    <span
                      className={`hub-clientes__tag ${
                        p.role === 'primary' ? 'hub-clientes__tag--primary' : 'hub-clientes__tag--secondary'
                      }`}
                    >
                      {p.role === 'primary' ? 'Principal' : 'Co-tutor'}
                    </span>
                  </div>
                  {canWritePets ? (
                    <Link
                      to={editPetHref(p.id, guardianId)}
                      className="hub-clientes__link-btn hub-clientes__link-btn--with-icon hub-clientes__pet-list-edit"
                      aria-label={`Editar ${p.name}`}
                    >
                      <Pencil size={15} strokeWidth={2} aria-hidden />
                      Editar
                    </Link>
                  ) : null}
                </div>
                <p className="hub-clientes__muted hub-clientes__pet-list-meta">
                  {[p.species, breed].filter(Boolean).join(' · ')}
                </p>
                {facts.length > 0 ? (
                  <dl className="hub-clientes__pet-facts">
                    {facts.map((f) => (
                      <div key={f.label} className="hub-clientes__pet-fact">
                        <dt className="hub-clientes__pet-fact-label">{f.label}</dt>
                        <dd className="hub-clientes__pet-fact-value">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
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
          {canWritePets ? <AddPetButton guardianId={guardianId} variant="page" /> : null}
        </header>
        {list}
      </section>
    );
  }

  return (
    <div className="hub-clientes__section">
      <div className="hub-clientes__section-head hub-clientes__pet-toolbar">
        <h3 className="hub-clientes__contact-card-title">Pets</h3>
        {canWritePets ? <AddPetButton guardianId={guardianId} variant="panel" /> : null}
      </div>
      {list}
    </div>
  );
};
