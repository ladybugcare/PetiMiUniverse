import React, { useMemo } from 'react';
import type { BoardingDayBoardItem } from '../../api/hubBoardingApi';
import { PORTE_LABELS, type PetBodyPorteValue } from '../../utils/hubServiceTypesPricingMatrix';
import {
  BOARDING_BOARD_COLUMNS,
  BOARDING_STAGE_LABELS,
  getBoardingItemStage,
  boardingItemKey,
  type BoardingStage,
} from './boardingStages';

function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateRange(from?: string | null, to?: string | null): string {
  const fmt = (iso: string | null | undefined) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };
  if (from && to) return `${fmt(from)} → ${fmt(to)}`;
  return fmt(from);
}

function porteLabel(tier?: string | null): string | null {
  if (!tier) return null;
  return PORTE_LABELS[tier as PetBodyPorteValue] ?? tier;
}

function pillClass(stage: BoardingStage): string {
  if (stage === 'checked_in') return 'hub-clientes__pill hub-clinic-queue__pill--progress';
  if (stage === 'checked_out') return 'hub-clientes__pill hub-clinic-queue__pill--done';
  return 'hub-clientes__pill hub-clinic-queue__pill--waiting';
}

function modeLabel(mode: string): string {
  if (mode === 'hotel') return 'Hotel';
  if (mode === 'daycare') return 'Creche';
  return mode;
}

type DroppableColumnProps = {
  colId: string;
  title: string;
  count: number;
  children: React.ReactNode;
};

const BoardingColumn: React.FC<DroppableColumnProps> = ({ title, count, children }) => (
  <section className="hub-clinic-queue__col">
    <h3 className="hub-clinic-queue__col-title">
      {title} <span className="hub-clinic-queue__count">{count}</span>
    </h3>
    <div className="hub-clinic-queue__cards">{children}</div>
  </section>
);

type Props = {
  items: BoardingDayBoardItem[];
  canWrite: boolean;
  searchQ: string;
  onSelect: (item: BoardingDayBoardItem) => void;
  onCheckIn: (item: BoardingDayBoardItem) => void | Promise<void>;
  onCheckOut: (item: BoardingDayBoardItem) => void | Promise<void>;
};

const BoardingDayBoard: React.FC<Props> = ({
  items,
  canWrite,
  searchQ,
  onSelect,
  onCheckIn,
  onCheckOut,
}) => {
  const q = searchQ.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? items.filter((i) => {
            const pet = (i.pet?.name || '').toLowerCase();
            const tutor = (i.guardian?.full_name || '').toLowerCase();
            return pet.includes(q) || tutor.includes(q);
          })
        : items,
    [items, q],
  );

  const renderCard = (item: BoardingDayBoardItem) => {
    const petName = item.pet?.name || 'Sem pet';
    const tutor = item.guardian?.full_name || '—';
    const stage = getBoardingItemStage(item);
    const porte = porteLabel(item.pet?.size_tier);
    const mode = modeLabel(item.mode);
    const isLate = Boolean(item.is_late);
    const isWalkIn = Boolean(item.is_walk_in);
    const nights = item.nights_count;
    const key = boardingItemKey(item);

    return (
      <article key={key} className="hub-clinic-queue__card">
        <div className="hub-clinic-queue__card-top">
          <div className="hub-clinic-queue__card-meta">
            <span className={pillClass(stage)}>{BOARDING_STAGE_LABELS[stage] ?? stage}</span>
            <span className="hub-clientes__pill hub-clientes__pill--neutral">{mode}</span>
            {isLate && (
              <span className="hub-clientes__pill hub-clinic-queue__pill--late" title="Atraso no check-out">
                Atrasado
              </span>
            )}
            {isWalkIn && (
              <span className="hub-clientes__pill hub-clientes__pill--neutral" title="Avulso">
                Avulso
              </span>
            )}
          </div>
        </div>

        <div className="hub-clinic-queue__card-body" style={{ display: 'flex', gap: 10 }}>
          {item.pet?.avatar_url ? (
            <img
              src={item.pet.avatar_url}
              alt={petName}
              className="hub-boarding-card__avatar"
            />
          ) : (
            <span className="hub-boarding-card__avatar-placeholder" aria-hidden>🐾</span>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
          <strong className="hub-clinic-queue__pet-name">{petName}</strong>
          {porte && <span className="hub-clientes__muted hub-clinic-queue__porte"> · {porte}</span>}
          <div className="hub-clientes__muted hub-clinic-queue__tutor">{tutor}</div>

          {(item.mode === 'hotel' || item.mode === 'all') ? (
            <div className="hub-clientes__muted hub-clinic-queue__time">
              {formatDateRange(item.starts_at, item.ends_at)}
              {nights != null && nights > 0 && (
                <span> · {nights} {nights === 1 ? 'diária' : 'diárias'}</span>
              )}
            </div>
          ) : (
            <div className="hub-clientes__muted hub-clinic-queue__time">
              {formatTime(item.starts_at)} → {formatTime(item.ends_at)}
            </div>
          )}

          {item.service_type?.name && (
            <div className="hub-clientes__muted">{item.service_type.name}</div>
          )}

          {item.clinical_tags && item.clinical_tags.length > 0 && (
            <div className="hub-clinic-queue__card-tags">
              {item.clinical_tags.map((tag) => (
                <span key={tag.key} className="hub-clientes__pill hub-clientes__pill--alert" title={tag.label}>
                  {tag.label}
                </span>
              ))}
            </div>
          )}
          </div>
        </div>

        <div className="hub-clinic-queue__card-actions">
          {canWrite && stage === 'reserved' && (
            <button
              type="button"
              className="hub-btn hub-btn--primary hub-btn--sm"
              onClick={() => void onCheckIn(item)}
            >
              Check-in
            </button>
          )}
          {canWrite && stage === 'checked_in' && (
            <button
              type="button"
              className="hub-btn hub-btn--secondary hub-btn--sm"
              onClick={() => void onCheckOut(item)}
            >
              Check-out
            </button>
          )}
          <button
            type="button"
            className="hub-btn hub-btn--ghost hub-btn--sm"
            onClick={() => onSelect(item)}
          >
            Detalhes
          </button>
        </div>
      </article>
    );
  };

  return (
    <div className="hub-clinic-queue hub-boarding-queue hub-boarding-queue--3col">
      {BOARDING_BOARD_COLUMNS.map((col) => {
        const colItems = filtered.filter((i) => col.stages.includes(getBoardingItemStage(i)));
        return (
          <BoardingColumn key={col.id} colId={col.id} title={col.title} count={colItems.length}>
            {colItems.length === 0 ? (
              <p className="hub-clientes__muted hub-clinic-queue__empty">Nenhum nesta coluna.</p>
            ) : (
              colItems.map((item) => renderCard(item))
            )}
          </BoardingColumn>
        );
      })}
    </div>
  );
};

export default BoardingDayBoard;
