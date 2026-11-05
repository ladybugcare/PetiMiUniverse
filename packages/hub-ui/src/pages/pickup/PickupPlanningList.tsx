import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpFromLine, MapPin, PlusCircle } from 'lucide-react';
import type { PickupDayBoardItem, PickupDirection } from '../../api/hubPickupApi';

function formatTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function sortByStartsAt(a: PickupDayBoardItem, b: PickupDayBoardItem): number {
  const ta = a.starts_at ? new Date(a.starts_at).getTime() : Number.POSITIVE_INFINITY;
  const tb = b.starts_at ? new Date(b.starts_at).getTime() : Number.POSITIVE_INFINITY;
  if (ta !== tb) return ta - tb;
  return a.appointment_id.localeCompare(b.appointment_id);
}

function directionLabel(direction: PickupDirection): string {
  if (direction === 'pickup') return 'Coleta';
  if (direction === 'delivery') return 'Entrega';
  return 'L&T';
}

function toStopCandidate(
  item: PickupDayBoardItem,
): PickupDayBoardItem & { _direction: 'pickup' | 'delivery' } {
  const dir = item.direction === 'delivery' ? 'delivery' : 'pickup';
  return { ...item, _direction: dir };
}

export type PickupPlanningListProps = {
  items: PickupDayBoardItem[];
  /** Todas as pernas do dia (sem filtro de rota) — para empty states corretos. */
  allDayItems: PickupDayBoardItem[];
  canManage: boolean;
  searchQ: string;
  selectedIds: Set<string>;
  onToggleSelect: (appointmentId: string) => void;
  onSelectAll: (ids: string[]) => void;
  onClearSelection: () => void;
  onAddToRoute: (items: (PickupDayBoardItem & { _direction: 'pickup' | 'delivery' })[]) => void;
  onSelectItem: (item: PickupDayBoardItem) => void;
  onClearSearch?: () => void;
};

const PickupPlanningList: React.FC<PickupPlanningListProps> = ({
  items,
  allDayItems,
  canManage,
  searchQ,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onAddToRoute,
  onSelectItem,
  onClearSearch,
}) => {
  const q = searchQ.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      q
        ? items.filter((i) => {
            const pet = (i.pet?.name || '').toLowerCase();
            const tutor = (i.guardian?.full_name || '').toLowerCase();
            const addr = (i.address || '').toLowerCase();
            return pet.includes(q) || tutor.includes(q) || addr.includes(q);
          })
        : items,
    [items, q],
  );

  const sorted = useMemo(() => [...filtered].sort(sortByStartsAt), [filtered]);
  const selectedCount = selectedIds.size;
  const allVisibleSelected =
    sorted.length > 0 && sorted.every((i) => selectedIds.has(i.appointment_id));

  if (q && sorted.length === 0) {
    return (
      <div className="hub-grooming-page__empty-filters" role="status">
        <p className="hub-clientes__muted">Nenhum pet, tutor ou endereço corresponde à busca.</p>
        {onClearSearch ? (
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
            onClick={onClearSearch}
          >
            Limpar busca
          </button>
        ) : null}
      </div>
    );
  }

  if (sorted.length === 0) {
    const hasAnyLegs = allDayItems.length > 0;
    const allAssigned = hasAnyLegs && allDayItems.every((i) => i.route_id);
    if (allAssigned) {
      return (
        <p className="hub-pickup-planning__empty-compact" role="status">
          Todas as pernas já estão em rota — acompanhe os lotes abaixo.
        </p>
      );
    }
    return (
      <div className="hub-grooming-page__empty-day hub-pickup-planning__empty" role="status">
        <div className="hub-grooming-page__empty-day-icon" aria-hidden>
          <MapPin size={28} />
        </div>
        <h2 className="hub-grooming-page__empty-day-title">Nenhuma perna para planejar</h2>
        <p className="hub-grooming-page__empty-day-text">
          As pernas de Leva e Traz criadas na Agenda aparecem aqui automaticamente.
        </p>
        <div className="hub-grooming-page__empty-day-actions">
          <Link to="/hub/appointments" className="hub-clientes__btn hub-clientes__btn--primary">
            Abrir Agenda
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="hub-pickup-planning">
      <div className="hub-pickup-planning__header">
        <h3 className="hub-grooming-day-list__section-title">
          A planejar <span className="hub-grooming-day-list__count">{sorted.length}</span>
        </h3>
        {canManage ? (
          <div className="hub-pickup-planning__header-actions">
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
              onClick={() => {
                if (allVisibleSelected) onClearSelection();
                else onSelectAll(sorted.map((i) => i.appointment_id));
              }}
            >
              {allVisibleSelected ? 'Limpar seleção' : 'Selecionar todas'}
            </button>
            {selectedCount > 0 ? (
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                onClick={() => {
                  const chosen = sorted
                    .filter((i) => selectedIds.has(i.appointment_id))
                    .map(toStopCandidate);
                  onAddToRoute(chosen);
                }}
              >
                <PlusCircle size={14} aria-hidden />
                Montar rota ({selectedCount})
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <ul className="hub-grooming-day-list__rows hub-pickup-planning__rows">
        {sorted.map((item) => {
          const petName = item.pet?.name || 'Sem pet';
          const tutor = item.guardian?.full_name || '—';
          const time = formatTime(item.starts_at);
          const dir = item.direction;
          const Icon = dir === 'delivery' ? ArrowUpFromLine : ArrowDownToLine;
          const checked = selectedIds.has(item.appointment_id);
          const serviceName = item.service_type?.name || item.resource_label || null;

          return (
            <li key={item.appointment_id}>
              <div
                className={`hub-grooming-day-list__row hub-pickup-planning__row${checked ? ' hub-pickup-planning__row--selected' : ''}`}
                onClick={() => onSelectItem(item)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectItem(item);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                {canManage ? (
                  <label
                    className="hub-pickup-planning__check"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleSelect(item.appointment_id)}
                      aria-label={`Selecionar ${petName}`}
                    />
                  </label>
                ) : null}

                <div className="hub-grooming-day-list__time" aria-label={`Horário ${time}`}>
                  {time}
                </div>

                <div className="hub-grooming-day-list__main">
                  <div className="hub-grooming-day-list__identity">
                    {item.pet?.avatar_url ? (
                      <img
                        src={item.pet.avatar_url}
                        alt=""
                        className="hub-grooming-day-list__avatar"
                      />
                    ) : (
                      <span
                        className="hub-grooming-day-list__avatar hub-grooming-day-list__avatar--empty"
                        aria-hidden
                      />
                    )}
                    <div className="hub-grooming-day-list__names">
                      <p className="hub-grooming-day-list__pet">{petName}</p>
                      <p className="hub-grooming-day-list__tutor">{tutor}</p>
                    </div>
                  </div>

                  <div className="hub-grooming-day-list__badges" aria-label="Tipo">
                    <span
                      className={`hub-clientes__pill hub-pickup-card__direction-pill hub-pickup-card__direction-pill--${dir || 'unknown'}`}
                    >
                      <Icon size={11} aria-hidden />
                      {directionLabel(dir)}
                    </span>
                    {serviceName ? (
                      <span className="hub-grooming-queue__badge">{serviceName}</span>
                    ) : null}
                  </div>

                  <div className="hub-grooming-day-list__meta">
                    {item.address ? (
                      <span className="hub-grooming-day-list__service" title={item.address}>
                        <MapPin size={12} aria-hidden /> {item.address}
                      </span>
                    ) : (
                      <span className="hub-clientes__muted">Sem endereço</span>
                    )}
                  </div>
                </div>

                {canManage ? (
                  <div className="hub-grooming-day-list__actions hub-clinic-queue__actions">
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddToRoute([toStopCandidate(item)]);
                      }}
                    >
                      Adicionar à rota
                    </button>
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectItem(item);
                      }}
                    >
                      Detalhes
                    </button>
                  </div>
                ) : (
                  <div className="hub-grooming-day-list__actions hub-clinic-queue__actions">
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectItem(item);
                      }}
                    >
                      Detalhes
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default PickupPlanningList;
