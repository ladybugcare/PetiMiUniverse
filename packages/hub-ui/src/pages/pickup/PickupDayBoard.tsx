import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpFromLine, MapPin } from 'lucide-react';
import { formatBrPhoneDisplay } from '../../utils/formatBrPhone';
import type { PickupDayBoardItem, PickupDirection, PickupStopStatus } from '../../api/hubPickupApi';

// ─── Colunas baseadas no status da parada ─────────────────────────────────

export type PickupBoardColumn = 'todo' | 'en_route' | 'on_site' | 'done';

const COLUMN_LABELS: Record<PickupBoardColumn, string> = {
  todo: 'A fazer',
  en_route: 'Em deslocamento',
  on_site: 'No local / a bordo',
  done: 'Concluídas',
};

function resolveItemColumn(item: PickupDayBoardItem): PickupBoardColumn {
  const ss = item.stop_status;
  if (ss) {
    if (ss === 'pending') return 'todo';
    if (ss === 'en_route') return 'en_route';
    if (ss === 'arrived' || ss === 'in_transit') return 'on_site';
    if (ss === 'completed' || ss === 'failed') return 'done';
  }
  // Perna solta: fallback no status do agendamento
  const appt = item.status;
  if (appt === 'in_progress') return 'en_route';
  if (appt === 'done' || appt === 'paid') return 'done';
  return 'todo';
}

// ─── Ações por sentido e status ───────────────────────────────────────────

function getCardAction(
  item: PickupDayBoardItem,
): { nextStatus: PickupStopStatus; label: string } | null {
  const ss = (item.stop_status ?? 'pending') as PickupStopStatus;
  const dir = item.direction;
  switch (ss) {
    case 'pending':    return { nextStatus: 'en_route', label: 'A caminho' };
    case 'en_route':   return { nextStatus: 'arrived', label: 'No endereço' };
    case 'arrived':
      if (dir === 'pickup') return { nextStatus: 'in_transit', label: 'Pet a bordo' };
      return { nextStatus: 'completed', label: 'Entregue' };
    case 'in_transit': return { nextStatus: 'completed', label: 'Na clínica' };
    default:           return null;
  }
}

// ─── Labels de status por sentido ─────────────────────────────────────────

const STOP_STATUS_LABELS_PICKUP: Record<PickupStopStatus, string> = {
  pending:    'A fazer',
  en_route:   'A caminho',
  arrived:    'No endereço',
  in_transit: 'Pet a bordo',
  completed:  'Na clínica',
  failed:     'Falhou',
};

const STOP_STATUS_LABELS_DELIVERY: Record<PickupStopStatus, string> = {
  pending:    'A fazer',
  en_route:   'A caminho',
  arrived:    'No endereço',
  in_transit: 'A bordo',
  completed:  'Entregue',
  failed:     'Falhou',
};

function stopStatusLabel(status: PickupStopStatus, direction: PickupDirection): string {
  if (direction === 'delivery') return STOP_STATUS_LABELS_DELIVERY[status] ?? status;
  return STOP_STATUS_LABELS_PICKUP[status] ?? status;
}

function pillClass(ss: PickupStopStatus): string {
  if (ss === 'en_route' || ss === 'arrived' || ss === 'in_transit')
    return 'hub-clientes__pill hub-clinic-queue__pill--progress';
  if (ss === 'completed') return 'hub-clientes__pill hub-clinic-queue__pill--done';
  if (ss === 'failed')    return 'hub-clientes__pill hub-clinic-queue__pill--cancelled';
  return 'hub-clientes__pill hub-clinic-queue__pill--waiting';
}

// ─── Utilitários ──────────────────────────────────────────────────────────

function directionLabel(direction: PickupDirection): string {
  if (direction === 'pickup')   return 'Coleta';
  if (direction === 'delivery') return 'Entrega';
  return 'L&T';
}

function DirectionPill({ direction }: { direction: PickupDirection }) {
  const Icon = direction === 'delivery' ? ArrowUpFromLine : ArrowDownToLine;
  return (
    <span
      className={`hub-clientes__pill hub-pickup-card__direction-pill hub-pickup-card__direction-pill--${direction || 'unknown'}`}
    >
      <Icon size={11} aria-hidden />
      {directionLabel(direction)}
    </span>
  );
}

function formatTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

type ColumnProps = { title: string; count: number; children: React.ReactNode };

const PickupColumn: React.FC<ColumnProps> = ({ title, count, children }) => (
  <section className="hub-clinic-queue__col">
    <h3 className="hub-clinic-queue__col-title">
      {title} <span className="hub-clinic-queue__count">{count}</span>
    </h3>
    <div className="hub-clinic-queue__cards">{children}</div>
  </section>
);

// ─── Props ────────────────────────────────────────────────────────────────

type Props = {
  items: PickupDayBoardItem[];
  canWrite: boolean;
  searchQ: string;
  onStatusChange: (item: PickupDayBoardItem, status: PickupStopStatus) => void;
  onSelect?: (item: PickupDayBoardItem) => void;
};

export default function PickupDayBoard({ items, canWrite, searchQ, onStatusChange, onSelect }: Props) {
  const q = searchQ.toLowerCase().trim();

  const filtered = useMemo(
    () =>
      q
        ? items.filter(
            (i) =>
              i.pet?.name?.toLowerCase().includes(q) ||
              i.guardian?.full_name?.toLowerCase().includes(q) ||
              i.address?.toLowerCase().includes(q),
          )
        : items,
    [items, q],
  );

  // Mapa de pareamento: appointment_id → perna irmã (mesmo parent, sentido oposto)
  const siblingMap = useMemo(() => {
    const byParent = new Map<string, PickupDayBoardItem[]>();
    for (const item of items) {
      if (item.parent_appointment_id) {
        const list = byParent.get(item.parent_appointment_id) ?? [];
        list.push(item);
        byParent.set(item.parent_appointment_id, list);
      }
    }
    const sibling = new Map<string, PickupDayBoardItem>();
    for (const [, legs] of byParent) {
      if (legs.length === 2) {
        sibling.set(legs[0].appointment_id, legs[1]);
        sibling.set(legs[1].appointment_id, legs[0]);
      }
    }
    return sibling;
  }, [items]);

  const columns: Record<PickupBoardColumn, PickupDayBoardItem[]> = {
    todo: [], en_route: [], on_site: [], done: [],
  };
  for (const item of filtered) {
    columns[resolveItemColumn(item)].push(item);
  }

  const columnOrder: PickupBoardColumn[] = ['todo', 'en_route', 'on_site', 'done'];

  const renderCard = (item: PickupDayBoardItem) => {
    const petName = item.pet?.name ?? 'Sem pet';
    const tutor = item.guardian?.full_name ?? '—';
    const phone = item.guardian?.phone ? formatBrPhoneDisplay(item.guardian.phone) : null;
    const currentStatus = (item.stop_status ?? 'pending') as PickupStopStatus;
    const action = canWrite ? getCardAction(item) : null;
    const agendaDate = item.starts_at?.slice(0, 10);
    const sibling = siblingMap.get(item.appointment_id);

    return (
      <article
        key={item.appointment_id}
        className="hub-clinic-queue__card"
        onClick={onSelect ? () => onSelect(item) : undefined}
        onKeyDown={
          onSelect
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(item);
                }
              }
            : undefined
        }
        role={onSelect ? 'button' : undefined}
        tabIndex={onSelect ? 0 : undefined}
      >
        <div className="hub-clinic-queue__card-top">
          {item.pet?.avatar_url ? (
            <img src={item.pet.avatar_url} alt="" className="hub-pickup-card__avatar" />
          ) : (
            <span className="hub-pickup-card__avatar-placeholder" aria-hidden>🐾</span>
          )}
          <div className="hub-pickup-card__head-text">
            <p className="hub-clinic-queue__pet">{petName}</p>
            <span className={pillClass(currentStatus)}>
              {stopStatusLabel(currentStatus, item.direction)}
            </span>
          </div>
        </div>

        <div className="hub-pickup-card__tags">
          <DirectionPill direction={item.direction} />
          {!item.route_id ? (
            <span className="hub-clientes__pill hub-pickup-card__loose-pill" title="Ainda sem rota montada">
              Solta
            </span>
          ) : null}
          {sibling ? (
            <span
              className="hub-clientes__pill hub-pickup-card__pair-pill"
              title={`Par: ${sibling.direction === 'pickup' ? 'coleta' : 'retorno'} às ${formatTime(sibling.starts_at)}`}
            >
              Par {sibling.direction === 'pickup' ? '↓' : '↑'} {formatTime(sibling.starts_at)}
            </span>
          ) : null}
        </div>

        <p className="hub-clientes__muted hub-clinic-queue__meta">
          {tutor}
          {phone ? ` · ${phone}` : ''}
        </p>

        {item.address ? (
          <p className="hub-clientes__muted hub-clinic-queue__meta hub-pickup-card__address" title={item.address}>
            <MapPin size={12} aria-hidden />
            {item.address}
          </p>
        ) : null}

        <p className="hub-clientes__muted hub-clinic-queue__meta">
          {formatTime(item.starts_at)} – {formatTime(item.ends_at)}
          {item.service_type?.name ? ` · ${item.service_type.name}` : ''}
        </p>

        <div className="hub-clinic-queue__actions">
          {action ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
              onClick={(e) => {
                e.stopPropagation();
                onStatusChange(item, action.nextStatus);
              }}
            >
              {action.label}
            </button>
          ) : null}

          {onSelect ? (
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
          ) : null}

          {item.appointment_id ? (
            <Link
              to={`/hub/appointments?highlight=${item.appointment_id}${agendaDate ? `&date=${encodeURIComponent(agendaDate)}` : ''}`}
              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
              onClick={(e) => e.stopPropagation()}
            >
              Agenda
            </Link>
          ) : null}
        </div>
      </article>
    );
  };

  return (
    <div className="hub-clinic-queue hub-pickup-queue hub-pickup-queue--4col">
      {columnOrder.map((col) => (
        <PickupColumn key={col} title={COLUMN_LABELS[col]} count={columns[col].length}>
          {columns[col].length === 0 ? (
            <p className="hub-clientes__muted hub-clinic-queue__empty">Nenhuma nesta coluna.</p>
          ) : (
            columns[col].map((item) => renderCard(item))
          )}
        </PickupColumn>
      ))}
    </div>
  );
}
