import React from 'react';
import type { HubGuardian } from '../../api/hubGuardiansApi';
import { AddPetAndOverflowMenu } from './AddPetAndOverflowMenu';

interface ClientesTableProps {
  rows: HubGuardian[];
  selectedId: string | null;
  onSelect: (g: HubGuardian) => void;
  onArchive?: (g: HubGuardian) => void;
  canWrite: boolean;
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export const ClientesTable: React.FC<ClientesTableProps> = ({
  rows,
  selectedId,
  onSelect,
  onArchive,
  canWrite,
}) => {
  return (
    <div className="hub-clientes__table-wrap">
      <table className="hub-clientes__table">
        <thead>
          <tr>
            <th>Tutor</th>
            <th>Contato</th>
            <th>Pets</th>
            <th>Último atendimento</th>
            <th className="hub-clientes__th-status">Status</th>
            <th className="hub-clientes__th-actions">Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="hub-clientes__muted" style={{ textAlign: 'center', padding: 28 }}>
                Nenhum cliente encontrado com os filtros actuais.
              </td>
            </tr>
          ) : (
            rows.map((g) => {
              const pets = g.pets ?? [];
              const hasPrimary = pets.some((p) => p.role === 'primary');
              const onlySecondary = pets.length > 0 && !hasPrimary;
              const isCompany = g.client_kind === 'company';
              const active = g.client_status === 'active';
              return (
                <tr
                  key={g.id}
                  className={selectedId === g.id ? 'hub-clientes__row--selected' : undefined}
                  onClick={() => onSelect(g)}
                >
                  <td>
                    <div className="hub-clientes__tutor-cell">
                      <span className="hub-clientes__avatar">{initials(g.full_name)}</span>
                      <div>
                        <button
                          type="button"
                          className="hub-clientes__tutor-name"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelect(g);
                          }}
                        >
                          {g.full_name}
                        </button>
                        {isCompany && <span className="hub-clientes__tag hub-clientes__tag--company">Empresa</span>}
                        {!isCompany && pets.length > 0 && (
                          <span
                            className={`hub-clientes__tag ${
                              onlySecondary ? 'hub-clientes__tag--secondary' : 'hub-clientes__tag--primary'
                            }`}
                          >
                            {onlySecondary ? 'Co-tutor' : 'Principal'}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: 13 }}>{g.phone || '—'}</div>
                    <div className="hub-clientes__muted" style={{ fontSize: 12 }}>
                      {g.email || '—'}
                    </div>
                  </td>
                  <td>
                    <div className="hub-clientes__pet-dots" style={{ paddingLeft: pets.length ? 6 : 0 }}>
                      {pets.slice(0, 4).map((p) => (
                        <span key={p.id + p.role} className="hub-clientes__pet-dot" title={p.name}>
                          {p.name.slice(0, 1).toUpperCase()}
                        </span>
                      ))}
                      {pets.length === 0 && <span className="hub-clientes__muted">—</span>}
                    </div>
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
                    {canWrite && onArchive ? (
                      <AddPetAndOverflowMenu
                        guardianId={g.id}
                        onArchive={() => onArchive(g)}
                        compact
                      />
                    ) : (
                      <AddPetAndOverflowMenu guardianId={g.id} compact />
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
