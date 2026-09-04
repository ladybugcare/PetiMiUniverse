import React from 'react';
import { FileSearch } from 'lucide-react';
import type { HubPet } from '../../../api/hubPetsApi';
import { petAgeDetailedLabel } from '../../pets/petAge';
import { petInitials } from '../vet-cockpit/vetCockpitUtils';

type Props = {
  pets: HubPet[];
  selectedId: string;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (petId: string) => void;
  loading?: boolean;
};

const ClinicRecordsPetList: React.FC<Props> = ({
  pets,
  selectedId,
  search,
  onSearchChange,
  onSelect,
  loading,
}) => {
  return (
    <div className="hub-clinic-records__queue">
      <h2 className="hub-clinic-records__queue-title">
        Pets
        {!loading && pets.length > 0 ? (
          <span className="hub-clinic-records__queue-count">{pets.length}</span>
        ) : null}
      </h2>

      <div className="hub-clinic-records__search">
        <FileSearch size={16} aria-hidden />
        <input
          type="search"
          placeholder="Buscar pelo nome…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Buscar pet"
        />
      </div>

      {loading ? (
        <p className="hub-clientes__muted">Carregando pets…</p>
      ) : pets.length === 0 ? (
        <p className="hub-clientes__muted">
          {search.trim() ? 'Nenhum pet encontrado com esse nome.' : 'Nenhum pet cadastrado.'}
        </p>
      ) : (
        <ul className="hub-clinic-records__queue-list">
          {pets.map((pet) => {
            const selected = selectedId === pet.id;
            const meta = [pet.species, petAgeDetailedLabel(pet.birth_date ?? null)]
              .filter((part) => part && part !== '—')
              .join(' · ');
            const guardian = pet.primary_guardian?.guardian_name;

            return (
              <li key={pet.id}>
                <button
                  type="button"
                  className={[
                    'hub-clinic-records__queue-item',
                    selected ? 'hub-clinic-records__queue-item--selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onSelect(pet.id)}
                  aria-current={selected ? 'true' : undefined}
                >
                  <div className="hub-clinic-records__queue-identity">
                    <div className="hub-clinic-records__avatar" aria-hidden>
                      {petInitials(pet.name)}
                    </div>
                    <div className="hub-clinic-records__queue-text">
                      <span className="hub-clinic-records__queue-pet">{pet.name}</span>
                      {meta ? <span className="hub-clinic-records__queue-meta">{meta}</span> : null}
                      {guardian ? (
                        <span className="hub-clinic-records__queue-guardian">{guardian}</span>
                      ) : null}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default ClinicRecordsPetList;
