import React from 'react';
import type { HubGuardian } from '../../api/hubGuardiansApi';
import { formatBrPhoneDisplay } from '../../utils/formatBrPhone';
import { AddPetAndOverflowMenu } from './AddPetAndOverflowMenu';

type ClientesMainTab = 'tutores' | 'empresas';

interface ClientesTableProps {
  mainTab: ClientesMainTab;
  rows: HubGuardian[];
  selectedId: string | null;
  onSelect: (g: HubGuardian) => void;
  onEdit?: (g: HubGuardian) => void;
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
  mainTab,
  rows,
  selectedId,
  onSelect,
  onEdit,
  onArchive,
  canWrite,
}) => {
  const nameColumnLabel = mainTab === 'empresas' ? 'Empresa' : 'Tutor';
  const renderRowMeta = (g: HubGuardian) => {
    const pets = g.pets ?? [];
    const hasPrimary = pets.some((p) => p.role === 'primary');
    const onlySecondary = pets.length > 0 && !hasPrimary;
    const isCompany = g.client_kind === 'company';
    const active = g.client_status === 'active';

    return { pets, hasPrimary, onlySecondary, isCompany, active };
  };

  return (
    <>
      <div className="hub-clientes__table-wrap hub-clientes__table-wrap--desktop">
        <table className="hub-clientes__table">
          <thead>
            <tr>
              <th>{nameColumnLabel}</th>
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
                const { pets, onlySecondary, isCompany, active } = renderRowMeta(g);
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
                      <div style={{ fontSize: 13 }}>{formatBrPhoneDisplay(g.phone)}</div>
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
                      {canWrite ? (
                        <div className="hub-clientes__td-actions-inner">
                          <AddPetAndOverflowMenu
                            guardianId={g.id}
                            onEdit={onEdit ? () => onEdit(g) : undefined}
                            onArchive={onArchive ? () => onArchive(g) : undefined}
                            compact
                          />
                        </div>
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

      <div className="hub-clientes__mobile-list" aria-label="Lista de clientes">
        {rows.length === 0 ? (
          <p className="hub-clientes__muted hub-clientes__mobile-list-empty">
            Nenhum cliente encontrado com os filtros actuais.
          </p>
        ) : (
          rows.map((g) => {
            const { pets, onlySecondary, isCompany, active } = renderRowMeta(g);
            return (
              <button
                key={g.id}
                type="button"
                className={`hub-clientes__mobile-card${selectedId === g.id ? ' hub-clientes__mobile-card--selected' : ''}`}
                onClick={() => onSelect(g)}
              >
                <div className="hub-clientes__mobile-card-top">
                  <span className="hub-clientes__avatar">{initials(g.full_name)}</span>
                  <div className="hub-clientes__mobile-card-main">
                    <span className="hub-clientes__mobile-card-name">{g.full_name}</span>
                    <span className="hub-clientes__muted hub-clientes__mobile-card-contact">
                      {formatBrPhoneDisplay(g.phone)}
                      {g.email ? ` · ${g.email}` : ''}
                    </span>
                  </div>
                  <span
                    className={`hub-clientes__pill ${active ? 'hub-clientes__pill--active' : 'hub-clientes__pill--inactive'}`}
                  >
                    {active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div className="hub-clientes__mobile-card-foot">
                  {isCompany ? <span className="hub-clientes__tag hub-clientes__tag--company">Empresa</span> : null}
                  {!isCompany && pets.length > 0 ? (
                    <span
                      className={`hub-clientes__tag ${
                        onlySecondary ? 'hub-clientes__tag--secondary' : 'hub-clientes__tag--primary'
                      }`}
                    >
                      {onlySecondary ? 'Co-tutor' : 'Principal'}
                    </span>
                  ) : null}
                  <span className="hub-clientes__muted hub-clientes__mobile-card-pets">
                    {pets.length > 0 ? `${pets.length} pet${pets.length !== 1 ? 's' : ''}` : 'Sem pets'}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </>
  );
};
