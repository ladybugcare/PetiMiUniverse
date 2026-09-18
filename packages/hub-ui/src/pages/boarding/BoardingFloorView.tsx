import React, { useMemo, useState } from 'react';
import { CheckCircle, Loader, RefreshCw } from 'lucide-react';
import type { BoardingDayBoardItem } from '../../api/hubBoardingApi';
import { PORTE_LABELS, type PetBodyPorteValue } from '../../utils/hubServiceTypesPricingMatrix';
import {
  BOARDING_STAGE_LABELS,
  boardingItemKey,
  getBoardingItemStage,
  type BoardingMode,
  type BoardingStage,
} from './boardingStages';

type FloorTab = 'previstos' | 'hospedados' | 'saidas';

const FLOOR_TABS: { id: FloorTab; label: string; stages: BoardingStage[] }[] = [
  { id: 'previstos', label: 'Previstos', stages: ['reserved'] },
  { id: 'hospedados', label: 'Hospedados', stages: ['checked_in'] },
  { id: 'saidas', label: 'Saídas', stages: ['checked_out'] },
];

const MODE_CHIPS: { id: BoardingMode; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'hotel', label: 'Hotel' },
  { id: 'daycare', label: 'Creche' },
];

function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function porteLabel(tier?: string | null): string | null {
  if (!tier) return null;
  return PORTE_LABELS[tier as PetBodyPorteValue] ?? tier;
}

function modeLabel(mode: string): string {
  if (mode === 'hotel') return 'Hotel';
  if (mode === 'daycare') return 'Creche';
  return mode;
}

function stayMeta(item: BoardingDayBoardItem): string {
  if (item.mode === 'hotel') {
    const range = `${formatDate(item.starts_at)} → ${formatDate(item.ends_at)}`;
    const nights = item.nights_count;
    if (nights != null && nights > 0) {
      return `${range} · ${nights} ${nights === 1 ? 'diária' : 'diárias'}`;
    }
    return range;
  }
  return `${formatTime(item.starts_at)} → ${formatTime(item.ends_at)}`;
}

function sortByStartsAt(a: BoardingDayBoardItem, b: BoardingDayBoardItem): number {
  return String(a.starts_at).localeCompare(String(b.starts_at));
}

function sortHosting(a: BoardingDayBoardItem, b: BoardingDayBoardItem): number {
  if (a.is_late && !b.is_late) return -1;
  if (!a.is_late && b.is_late) return 1;
  return String(a.ends_at || a.starts_at).localeCompare(String(b.ends_at || b.starts_at));
}

/** Pet em destaque: hospedado (atraso primeiro); senão próximo previsto. */
export function pickFeaturedBoardingItem(items: BoardingDayBoardItem[]): BoardingDayBoardItem | null {
  const hosting = items.filter((i) => getBoardingItemStage(i) === 'checked_in').sort(sortHosting);
  if (hosting[0]) return hosting[0];

  const expected = items.filter((i) => getBoardingItemStage(i) === 'reserved').sort(sortByStartsAt);
  return expected[0] ?? null;
}

export function resolveBoardingFloorAction(
  item: BoardingDayBoardItem,
  canWrite: boolean,
): 'check_in' | 'check_out' | null {
  if (!canWrite) return null;
  const stage = getBoardingItemStage(item);
  if (stage === 'reserved') return 'check_in';
  if (stage === 'checked_in') return 'check_out';
  return null;
}

export type BoardingFloorViewProps = {
  items: BoardingDayBoardItem[];
  dateLabel: string;
  loading?: boolean;
  busy?: boolean;
  canWrite: boolean;
  activeMode: BoardingMode;
  onActiveModeChange: (mode: BoardingMode) => void;
  occupancyLabel?: string | null;
  occupancyOver?: boolean;
  onRefresh: () => void;
  onSelect: (item: BoardingDayBoardItem) => void;
  onCheckIn: (item: BoardingDayBoardItem) => void | Promise<void>;
  onCheckOut: (item: BoardingDayBoardItem) => void | Promise<void>;
  featuredOverride?: BoardingDayBoardItem | null;
  onFeaturedOverride?: (item: BoardingDayBoardItem | null) => void;
};

const BoardingFloorView: React.FC<BoardingFloorViewProps> = ({
  items,
  dateLabel,
  loading,
  busy,
  canWrite,
  activeMode,
  onActiveModeChange,
  occupancyLabel,
  occupancyOver,
  onRefresh,
  onSelect,
  onCheckIn,
  onCheckOut,
  featuredOverride,
  onFeaturedOverride,
}) => {
  const [tab, setTab] = useState<FloorTab>('hospedados');

  const departedCount = useMemo(
    () => items.filter((i) => getBoardingItemStage(i) === 'checked_out').length,
    [items],
  );
  const hostingCount = useMemo(
    () => items.filter((i) => getBoardingItemStage(i) === 'checked_in').length,
    [items],
  );

  const autoFeatured = useMemo(() => pickFeaturedBoardingItem(items), [items]);
  const featured = useMemo(() => {
    if (featuredOverride) {
      const stillThere = items.some((i) => boardingItemKey(i) === boardingItemKey(featuredOverride));
      if (stillThere) return featuredOverride;
    }
    return autoFeatured;
  }, [featuredOverride, items, autoFeatured]);

  const tabCounts = useMemo(() => {
    const counts: Record<FloorTab, number> = { previstos: 0, hospedados: 0, saidas: 0 };
    for (const item of items) {
      const stage = getBoardingItemStage(item);
      for (const t of FLOOR_TABS) {
        if (t.stages.includes(stage)) counts[t.id] += 1;
      }
    }
    return counts;
  }, [items]);

  const listItems = useMemo(() => {
    const stages = FLOOR_TABS.find((t) => t.id === tab)?.stages ?? [];
    const list = items.filter((i) => stages.includes(getBoardingItemStage(i)));
    return tab === 'hospedados' ? list.sort(sortHosting) : list.sort(sortByStartsAt);
  }, [items, tab]);

  const featuredStage = featured ? getBoardingItemStage(featured) : null;
  const featuredAction = featured ? resolveBoardingFloorAction(featured, canWrite) : null;

  return (
    <div className="hub-grooming-floor hub-boarding-floor">
      <div className="hub-grooming-floor__header">
        <div className="hub-grooming-floor__header-text">
          <span className="hub-grooming-floor__date">{dateLabel}</span>
          <span className="hub-grooming-floor__progress">
            {hostingCount} hospedados · {departedCount}/{items.length || 0} saídas
          </span>
          {occupancyLabel ? (
            <span
              className={`hub-boarding-page__occupancy-chip${occupancyOver ? ' hub-boarding-page__occupancy-chip--over' : ''}`}
            >
              {occupancyLabel}
            </span>
          ) : null}
        </div>
        <div className="hub-grooming-floor__header-actions">
          <button
            type="button"
            className="hub-grooming-floor__icon-btn"
            onClick={onRefresh}
            disabled={loading || busy}
            aria-label="Atualizar fila"
          >
            <RefreshCw size={16} aria-hidden />
          </button>
        </div>
      </div>

      <div className="hub-boarding-floor__modes" role="tablist" aria-label="Modo de hospedagem">
        {MODE_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            role="tab"
            aria-selected={activeMode === chip.id}
            className={`hub-grooming-floor__chip${activeMode === chip.id ? ' hub-grooming-floor__chip--active' : ''}`}
            onClick={() => onActiveModeChange(chip.id)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {loading && items.length === 0 ? (
        <div className="hub-grooming-floor__card hub-grooming-floor__card--empty">
          <Loader size={18} className="spin" aria-hidden />
          <span>Carregando fila…</span>
        </div>
      ) : !featured ? (
        <div className="hub-grooming-floor__card hub-grooming-floor__card--empty">
          {items.length === 0 ? (
            <p>Nenhum pet na fila deste dia.</p>
          ) : (
            <div className="hub-grooming-floor__all-done">
              <CheckCircle size={20} aria-hidden />
              <span>Todos os pets ativos já saíram!</span>
            </div>
          )}
        </div>
      ) : (
        <div className="hub-grooming-floor__card">
          <span className="hub-grooming-floor__card-label">
            {BOARDING_STAGE_LABELS[featuredStage!]}
            {featured.is_late ? ' · Em atraso' : ''}
          </span>
          <div className="hub-grooming-floor__card-pet-row">
            {featured.pet?.avatar_url ? (
              <img src={featured.pet.avatar_url} alt="" className="hub-grooming-floor__avatar" />
            ) : (
              <span className="hub-boarding-card__avatar-placeholder hub-boarding-floor__avatar-fallback" aria-hidden>
                🐾
              </span>
            )}
            <span className="hub-grooming-floor__pet-name">{featured.pet?.name || 'Sem pet'}</span>
          </div>
          <p className="hub-grooming-floor__meta">{stayMeta(featured)}</p>
          <p className="hub-grooming-floor__meta">
            {featured.guardian?.full_name || '—'}
            {porteLabel(featured.pet?.size_tier) ? ` · ${porteLabel(featured.pet?.size_tier)}` : ''}
            {featured.service_type?.name ? ` · ${featured.service_type.name}` : ''}
          </p>
          <div className="hub-grooming-floor__badges">
            <span className="hub-grooming-queue__badge">{modeLabel(String(featured.mode))}</span>
            {featured.is_walk_in ? <span className="hub-grooming-queue__badge">Avulso</span> : null}
            {featured.is_late ? <span className="hub-grooming-queue__priority-tag">Atrasado</span> : null}
          </div>
          {featured.clinical_tags && featured.clinical_tags.length > 0 ? (
            <div className="hub-grooming-tags hub-grooming-tags--card" aria-label="Alertas">
              {featured.clinical_tags.map((t) => (
                <span key={t.key} className="hub-grooming-tags__pill">
                  {t.label}
                </span>
              ))}
            </div>
          ) : null}

          <div className="hub-grooming-floor__actions">
            <button
              type="button"
              className="hub-grooming-floor__action-btn hub-grooming-floor__action-btn--ghost"
              onClick={() => onSelect(featured)}
            >
              Detalhes
            </button>
            {featuredAction === 'check_in' ? (
              <button
                type="button"
                className="hub-grooming-floor__action-btn hub-grooming-floor__action-btn--advance"
                disabled={busy}
                onClick={() => void onCheckIn(featured)}
              >
                {busy ? <Loader size={16} className="spin" aria-hidden /> : null}
                Check-in
              </button>
            ) : null}
            {featuredAction === 'check_out' ? (
              <button
                type="button"
                className="hub-grooming-floor__action-btn hub-grooming-floor__action-btn--advance"
                disabled={busy}
                onClick={() => void onCheckOut(featured)}
              >
                {busy ? <Loader size={16} className="spin" aria-hidden /> : null}
                Check-out
              </button>
            ) : null}
          </div>
        </div>
      )}

      <div className="hub-grooming-floor__tabs hub-boarding-floor__tabs" role="tablist" aria-label="Status da fila">
        {FLOOR_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`hub-grooming-floor__tab${tab === t.id ? ' hub-grooming-floor__tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {tabCounts[t.id] > 0 ? <span className="hub-grooming-floor__tab-count">{tabCounts[t.id]}</span> : null}
          </button>
        ))}
      </div>

      <div className="hub-grooming-floor__queue">
        <p className="hub-grooming-floor__queue-title">
          {FLOOR_TABS.find((t) => t.id === tab)?.label} · {listItems.length}
        </p>
        {listItems.length === 0 ? (
          <p className="hub-clientes__muted hub-grooming-floor__empty">Nenhum pet neste status.</p>
        ) : (
          listItems.map((item) => {
            const isFeatured = featured ? boardingItemKey(item) === boardingItemKey(featured) : false;
            return (
              <button
                key={boardingItemKey(item)}
                type="button"
                className={`hub-grooming-floor__queue-item${isFeatured ? ' hub-grooming-floor__queue-item--current' : ''}`}
                onClick={() => onFeaturedOverride?.(item)}
              >
                <span className="hub-grooming-floor__queue-pet">{item.pet?.name || 'Sem pet'}</span>
                <span className="hub-grooming-floor__queue-meta">
                  {item.mode === 'hotel' ? formatDate(item.starts_at) : formatTime(item.starts_at)}
                  {' · '}
                  {modeLabel(String(item.mode))}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default BoardingFloorView;
