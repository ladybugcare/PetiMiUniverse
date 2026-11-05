import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import type { PickupDayBoardItem, PickupDirection, PickupStopStatus } from '../../api/hubPickupApi';

function formatTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function isInProgress(item: PickupDayBoardItem): boolean {
  const ss = item.stop_status;
  return ss === 'en_route' || ss === 'arrived' || ss === 'in_transit';
}

function directionLabel(direction: PickupDirection): string {
  if (direction === 'pickup') return 'Coleta';
  if (direction === 'delivery') return 'Entrega';
  return 'L&T';
}

const STATUS_LABEL: Partial<Record<PickupStopStatus, string>> = {
  en_route: 'Em deslocamento',
  arrived: 'No endereço',
  in_transit: 'Pet a bordo',
};

type Props = {
  items: PickupDayBoardItem[];
  searchQ: string;
  onSelect: (item: PickupDayBoardItem) => void;
};

const PickupInProgressSection: React.FC<Props> = ({ items, searchQ, onSelect }) => {
  const [collapsed, setCollapsed] = useState(false);
  const q = searchQ.trim().toLowerCase();

  const inProgress = useMemo(() => {
    let list = items.filter(isInProgress);
    if (q) {
      list = list.filter((i) => {
        const pet = (i.pet?.name || '').toLowerCase();
        const tutor = (i.guardian?.full_name || '').toLowerCase();
        return pet.includes(q) || tutor.includes(q);
      });
    }
    return list.sort((a, b) => {
      const ta = a.starts_at ? new Date(a.starts_at).getTime() : 0;
      const tb = b.starts_at ? new Date(b.starts_at).getTime() : 0;
      return ta - tb;
    });
  }, [items, q]);

  if (inProgress.length === 0) return null;

  return (
    <section className="hub-grooming-day-list__section hub-pickup-in-progress">
      <button
        type="button"
        className="hub-grooming-day-list__section-toggle"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
      >
        {collapsed ? <ChevronRight size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
        <span className="hub-grooming-day-list__section-title">
          Em andamento <span className="hub-grooming-day-list__count">{inProgress.length}</span>
        </span>
      </button>
      {!collapsed ? (
        <ul className="hub-grooming-day-list__rows">
          {inProgress.map((item) => {
            const petName = item.pet?.name || 'Sem pet';
            const tutor = item.guardian?.full_name || '—';
            const time = formatTime(item.starts_at);
            const dir = item.direction;
            const Icon = dir === 'delivery' ? ArrowUpFromLine : ArrowDownToLine;
            const statusLabel =
              (item.stop_status && STATUS_LABEL[item.stop_status]) || 'Em andamento';

            return (
              <li key={item.appointment_id}>
                <div
                  className="hub-grooming-day-list__row"
                  onClick={() => onSelect(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(item);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="hub-grooming-day-list__time">{time}</div>
                  <div className="hub-grooming-day-list__main">
                    <div className="hub-grooming-day-list__identity">
                      <div className="hub-grooming-day-list__names">
                        <p className="hub-grooming-day-list__pet">{petName}</p>
                        <p className="hub-grooming-day-list__tutor">{tutor}</p>
                      </div>
                    </div>
                    <div className="hub-grooming-day-list__badges">
                      <span
                        className={`hub-clientes__pill hub-pickup-card__direction-pill hub-pickup-card__direction-pill--${dir || 'unknown'}`}
                      >
                        <Icon size={11} aria-hidden />
                        {directionLabel(dir)}
                      </span>
                    </div>
                    {item.address ? (
                      <div className="hub-grooming-day-list__meta">
                        <span className="hub-grooming-day-list__service">{item.address}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="hub-grooming-day-list__status">
                    <span className="hub-clientes__pill hub-clinic-queue__pill--progress">
                      {statusLabel}
                    </span>
                  </div>
                  <div className="hub-grooming-day-list__actions hub-clinic-queue__actions">
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(item);
                      }}
                    >
                      Detalhes
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
};

export default PickupInProgressSection;
