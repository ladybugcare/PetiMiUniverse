import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpFromLine, HelpCircle } from 'lucide-react';
import { getStoredClinicId } from '@petimi/web-core';
import type { PickupDayBoardItem, PickupDirection } from '../../api/hubPickupApi';
import { buildWhatsappLink } from '../../utils/whatsappLink';
import { renderTemplate } from '../../utils/hubMessageTemplates';
import { useMessageTemplates } from '../../utils/useMessageTemplates';
import { logMessageAttempt } from '../../api/hubMessageLogsApi';

// Colunas operacionais (status → coluna)
export type PickupBoardColumn = 'todo' | 'en_route' | 'done';

const COLUMN_LABELS: Record<PickupBoardColumn, string> = {
  todo: 'A fazer',
  en_route: 'Em rota',
  done: 'Concluídas',
};

const STATUS_TO_COLUMN: Record<string, PickupBoardColumn> = {
  pending_confirm: 'todo',
  confirmed: 'todo',
  in_progress: 'en_route',
  done: 'done',
  paid: 'done',
};

function resolveColumn(status: string): PickupBoardColumn {
  return STATUS_TO_COLUMN[status] ?? 'todo';
}

const PICKUP_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'in_progress', label: 'Em rota' },
  { value: 'done', label: 'Concluído' },
];

function formatTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function DirectionBadge({ direction }: { direction: PickupDirection }) {
  if (direction === 'pickup') {
    return (
      <span className="hub-pickup-card__direction hub-pickup-card__direction--pickup">
        <ArrowDownToLine size={11} aria-hidden />
        Coleta
      </span>
    );
  }
  if (direction === 'delivery') {
    return (
      <span className="hub-pickup-card__direction hub-pickup-card__direction--delivery">
        <ArrowUpFromLine size={11} aria-hidden />
        Entrega
      </span>
    );
  }
  return (
    <span className="hub-pickup-card__direction hub-pickup-card__direction--unknown">
      <HelpCircle size={11} aria-hidden />
      L&amp;T
    </span>
  );
}

function PickupCard({
  item,
  canWrite,
  templateOverrides,
  onStatusChange,
  onSelect,
}: {
  item: PickupDayBoardItem;
  canWrite: boolean;
  templateOverrides: Record<string, string>;
  onStatusChange: (item: PickupDayBoardItem, status: string) => void;
  onSelect?: (item: PickupDayBoardItem) => void;
}) {
  const clinicId = getStoredClinicId();
  const petName = item.pet?.name ?? '';
  const onTheWayHref =
    item.status === 'in_progress'
      ? buildWhatsappLink(
          item.guardian?.phone,
          renderTemplate('pet_on_the_way', { tutor: item.guardian?.full_name, pet: petName }, templateOverrides),
        )
      : null;

  return (
    <div
      className="hub-pickup-card"
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect ? () => onSelect(item) : undefined}
      onKeyDown={onSelect ? (e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(item); } : undefined}
      style={onSelect ? { cursor: 'pointer' } : undefined}
    >
      <div className="hub-pickup-card__header">
        <span className="hub-pickup-card__pet-name">{item.pet?.name ?? '—'}</span>
        <DirectionBadge direction={item.direction} />
      </div>

      <div className="hub-pickup-card__meta">
        {item.guardian?.full_name ?? '—'}
        {item.guardian?.phone ? ` · ${item.guardian.phone}` : ''}
      </div>

      {item.address ? (
        <div className="hub-pickup-card__address" title={item.address}>
          {item.address}
        </div>
      ) : null}

      <div className="hub-pickup-card__meta">
        {formatTime(item.starts_at)} – {formatTime(item.ends_at)}
        {item.service_type ? ` · ${item.service_type.name}` : ''}
      </div>

      <div className="hub-pickup-card__footer">
        {canWrite ? (
          <select
            className="hub-pickup-card__status-select"
            value={item.status}
            onChange={(e) => onStatusChange(item, e.target.value)}
            aria-label="Status da parada"
          >
            {PICKUP_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="hub-clientes__pill">{item.status}</span>
        )}

        {onTheWayHref ? (
          <a
            className="hub-pickup-card__wa-btn"
            href={onTheWayHref}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              void logMessageAttempt({
                clinic_id: clinicId ?? '',
                guardian_id: item.guardian?.id ?? null,
                pet_id: item.pet?.id ?? null,
                channel: 'whatsapp_link',
                template_key: 'pet_on_the_way',
              });
            }}
          >
            Avisar que está a caminho
          </a>
        ) : null}

        <Link
          to={`/hub/appointments?highlight=${item.appointment_id}`}
          className="hub-pickup-card__agenda-link"
        >
          Ver na agenda
        </Link>
      </div>
    </div>
  );
}

type Props = {
  items: PickupDayBoardItem[];
  canWrite: boolean;
  searchQ: string;
  onStatusChange: (item: PickupDayBoardItem, status: string) => void;
  onSelect?: (item: PickupDayBoardItem) => void;
};

export default function PickupDayBoard({ items, canWrite, searchQ, onStatusChange, onSelect }: Props) {
  const templateOverrides = useMessageTemplates();
  const q = searchQ.toLowerCase().trim();

  const filtered = q
    ? items.filter(
        (i) =>
          i.pet?.name.toLowerCase().includes(q) ||
          i.guardian?.full_name.toLowerCase().includes(q) ||
          i.address?.toLowerCase().includes(q),
      )
    : items;

  const columns: Record<PickupBoardColumn, PickupDayBoardItem[]> = {
    todo: [],
    en_route: [],
    done: [],
  };
  for (const item of filtered) {
    columns[resolveColumn(item.status)].push(item);
  }

  const columnOrder: PickupBoardColumn[] = ['todo', 'en_route', 'done'];

  return (
    <div className="hub-pickup-board">
      {columnOrder.map((col) => (
        <div key={col} className="hub-pickup-board__col">
          <div className="hub-pickup-board__col-header">
            <span className="hub-pickup-board__col-title">{COLUMN_LABELS[col]}</span>
            <span className="hub-pickup-board__col-count">{columns[col].length}</span>
          </div>
          {columns[col].map((item) => (
            <PickupCard
              key={item.appointment_id}
              item={item}
              canWrite={canWrite}
              templateOverrides={templateOverrides}
              onStatusChange={onStatusChange}
              onSelect={onSelect}
            />
          ))}
          {columns[col].length === 0 ? (
            <p className="hub-clientes__muted" style={{ fontSize: '0.8125rem', textAlign: 'center', padding: '1rem 0' }}>
              Nenhuma parada
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
