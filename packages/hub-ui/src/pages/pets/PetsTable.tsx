import React from 'react';
import { Star } from 'lucide-react';
import type { HubPet } from '../../api/hubPetsApi';
import { PetTableActions } from './PetTableActions';
import { petAgeLabel } from './petAge';

interface PetsTableProps {
  rows: HubPet[];
  selectedId: string | null;
  onSelect: (p: HubPet) => void;
  onEdit: (p: HubPet) => void;
  onArchive: (p: HubPet) => void;
  canWrite: boolean;
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export const PetsTable: React.FC<PetsTableProps> = ({
  rows,
  selectedId,
  onSelect,
  onEdit,
  onArchive,
  canWrite,
}) => {
  return (
    <div className="hub-clientes__table-wrap">
      <table className="hub-clientes__table">
        <thead>
          <tr>
            <th>Pet</th>
            <th>Tutor</th>
            <th>Espécie / Raça</th>
            <th>Idade</th>
            <th>Último atendimento</th>
            <th className="hub-clientes__th-status">Situação</th>
            <th className="hub-clientes__th-actions">Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="hub-clientes__muted" style={{ textAlign: 'center', padding: 28 }}>
                Nenhum pet encontrado com os filtros actuais.
              </td>
            </tr>
          ) : (
            rows.map((p) => {
              const active = !p.deleted_at;
              return (
                <tr
                  key={p.id}
                  className={selectedId === p.id ? 'hub-clientes__row--selected' : undefined}
                  onClick={() => onSelect(p)}
                >
                  <td>
                    <div className="hub-clientes__tutor-cell">
                      <span className="hub-clientes__avatar hub-pets-table-avatar">{initials(p.name)}</span>
                      <div>
                        <div className="hub-pets-name-with-star">
                          <button
                            type="button"
                            className="hub-clientes__tutor-name"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelect(p);
                            }}
                          >
                            {p.name}
                          </button>
                          <Star size={14} className="hub-pets-star" fill="currentColor" strokeWidth={0} aria-hidden />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: 13 }}>{p.primary_guardian?.guardian_name || '—'}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: 13 }}>{p.species}</div>
                    {p.breed ? (
                      <div className="hub-clientes__muted" style={{ fontSize: 12, marginTop: 2 }}>
                        {p.breed}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <span style={{ fontSize: 13 }}>{petAgeLabel(p.birth_date)}</span>
                  </td>
                  <td>
                    <span className="hub-clientes__muted">—</span>
                    <div className="hub-clientes__muted" style={{ fontSize: 11, marginTop: 2 }}>
                      Sem dados de agenda
                    </div>
                  </td>
                  <td className="hub-clientes__td-status">
                    <span
                      className={`hub-clientes__pill ${active ? 'hub-clientes__pill--active' : 'hub-clientes__pill--inactive'}`}
                    >
                      {active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="hub-clientes__td-actions" onClick={(e) => e.stopPropagation()}>
                    {canWrite ? (
                      <div className="hub-clientes__td-actions-inner">
                        <PetTableActions onEdit={() => onEdit(p)} onArchive={() => onArchive(p)} />
                      </div>
                    ) : (
                      <span className="hub-clientes__muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};
