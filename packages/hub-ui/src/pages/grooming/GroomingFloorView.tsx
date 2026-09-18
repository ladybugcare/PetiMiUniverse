import React, { useMemo, useState } from 'react';
import { CheckCircle, Loader, RefreshCw } from 'lucide-react';
import type { GroomingDayBoardItem } from '../../api/hubGroomingApi';
import { PORTE_LABELS, type PetBodyPorteValue } from '../../utils/hubServiceTypesPricingMatrix';
import {
  GROOMING_STAGE_LABELS,
  getItemBoardStage,
  itemBoardKey,
  resolveGroomingQuickAction,
  type GroomingQuickAction,
  type GroomingStage,
} from './groomingStages';

const ADVANCE_LABEL: Partial<Record<GroomingStage, string>> = {
  scheduled: 'Check-in',
  checked_in: 'Para fila',
  queued: 'Iniciar',
  in_service: 'Finalizar',
  finishing: 'Pronto',
  ready: 'Entregar',
  delivered: 'Encerrar',
};

type FloorTab = 'chegando' | 'fila' | 'servico' | 'pronto';

const FLOOR_TABS: { id: FloorTab; label: string; stages: GroomingStage[] }[] = [
  { id: 'chegando', label: 'Chegando', stages: ['scheduled', 'checked_in'] },
  { id: 'fila', label: 'Fila', stages: ['queued'] },
  { id: 'servico', label: 'Em serviço', stages: ['in_service', 'finishing'] },
  { id: 'pronto', label: 'Pronto', stages: ['ready'] },
];

const DONE_STAGES: GroomingStage[] = ['delivered', 'closed'];

function formatTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function servicesLabel(item: GroomingDayBoardItem): string {
  const lines = item.services?.map((s) => s.name).filter(Boolean);
  if (lines?.length) return lines.join(' · ');
  return item.service_type?.name || item.title || 'Banho & Tosa';
}

function porteLabel(tier?: string): string | null {
  if (!tier) return null;
  return PORTE_LABELS[tier as PetBodyPorteValue] ?? tier;
}

function quickActionLabel(action: GroomingQuickAction, item: GroomingDayBoardItem): string {
  if (action.type === 'confirm_appointment') return 'Confirmar';
  if (action.type === 'check_in') {
    const stage = getItemBoardStage(item);
    if (stage === 'queued') return 'Iniciar';
    if (stage === 'checked_in') return 'Para fila';
    return 'Check-in';
  }
  const stage = getItemBoardStage(item);
  return ADVANCE_LABEL[stage] || 'Avançar';
}

function sortByStartsAt(a: GroomingDayBoardItem, b: GroomingDayBoardItem): number {
  return String(a.starts_at).localeCompare(String(b.starts_at));
}

/** Pet em destaque: em atendimento/finalização; senão próximo na fila/check-in; senão agendado; senão pronto. */
export function pickFeaturedItem(items: GroomingDayBoardItem[]): GroomingDayBoardItem | null {
  const active = items
    .filter((i) => {
      const s = getItemBoardStage(i);
      return s === 'in_service' || s === 'finishing';
    })
    .sort(sortByStartsAt);
  if (active[0]) return active[0];

  const waiting = items
    .filter((i) => {
      const s = getItemBoardStage(i);
      return s === 'queued' || s === 'checked_in';
    })
    .sort(sortByStartsAt);
  if (waiting[0]) return waiting[0];

  const arriving = items
    .filter((i) => getItemBoardStage(i) === 'scheduled')
    .sort(sortByStartsAt);
  if (arriving[0]) return arriving[0];

  const ready = items.filter((i) => getItemBoardStage(i) === 'ready').sort(sortByStartsAt);
  return ready[0] ?? null;
}

export type GroomingFloorViewProps = {
  items: GroomingDayBoardItem[];
  dateLabel: string;
  loading?: boolean;
  busy?: boolean;
  canWrite: boolean;
  canPauseQueue?: boolean;
  filterMineOnly: boolean;
  onFilterMineOnlyChange: (value: boolean) => void;
  showMineFilter: boolean;
  /** Abre o drawer para pedir outro serviço à recepção. */
  canRequestServices?: boolean;
  onRefresh: () => void;
  onSelect: (item: GroomingDayBoardItem) => void;
  onQuickAction: (item: GroomingDayBoardItem, action: GroomingQuickAction) => void | Promise<void>;
  onPauseToggle?: (item: GroomingDayBoardItem) => void | Promise<void>;
  featuredOverride?: GroomingDayBoardItem | null;
  onFeaturedOverride?: (item: GroomingDayBoardItem | null) => void;
};

const GroomingFloorView: React.FC<GroomingFloorViewProps> = ({
  items,
  dateLabel,
  loading,
  busy,
  canWrite,
  canPauseQueue = false,
  filterMineOnly,
  onFilterMineOnlyChange,
  showMineFilter,
  canRequestServices = false,
  onRefresh,
  onSelect,
  onQuickAction,
  onPauseToggle,
  featuredOverride,
  onFeaturedOverride,
}) => {
  const [tab, setTab] = useState<FloorTab>('servico');
  const [showDone, setShowDone] = useState(false);

  const doneCount = useMemo(
    () => items.filter((i) => DONE_STAGES.includes(getItemBoardStage(i))).length,
    [items],
  );
  const activeCount = items.length - doneCount;

  const autoFeatured = useMemo(() => pickFeaturedItem(items), [items]);
  const featured = useMemo(() => {
    if (featuredOverride) {
      const stillThere = items.some((i) => itemBoardKey(i) === itemBoardKey(featuredOverride));
      if (stillThere) return featuredOverride;
    }
    return autoFeatured;
  }, [featuredOverride, items, autoFeatured]);

  const tabCounts = useMemo(() => {
    const counts: Record<FloorTab, number> = { chegando: 0, fila: 0, servico: 0, pronto: 0 };
    for (const item of items) {
      const stage = getItemBoardStage(item);
      for (const t of FLOOR_TABS) {
        if (t.stages.includes(stage)) counts[t.id] += 1;
      }
    }
    return counts;
  }, [items]);

  const listItems = useMemo(() => {
    const stages = FLOOR_TABS.find((t) => t.id === tab)?.stages ?? [];
    return items.filter((i) => stages.includes(getItemBoardStage(i))).sort(sortByStartsAt);
  }, [items, tab]);

  const doneItems = useMemo(
    () => items.filter((i) => DONE_STAGES.includes(getItemBoardStage(i))).sort(sortByStartsAt),
    [items],
  );

  const featuredStage = featured ? getItemBoardStage(featured) : null;
  const featuredQuick = featured ? resolveGroomingQuickAction(featured, canWrite) : null;
  const canPauseFeatured =
    Boolean(canPauseQueue && onPauseToggle && featured?.session_id) &&
    (featuredStage === 'in_service' || featuredStage === 'finishing');

  return (
    <div className="hub-grooming-floor">
      <div className="hub-grooming-floor__header">
        <div className="hub-grooming-floor__header-text">
          <span className="hub-grooming-floor__date">{dateLabel}</span>
          <span className="hub-grooming-floor__progress">
            {doneCount}/{items.length || 0} finalizados
          </span>
        </div>
        <div className="hub-grooming-floor__header-actions">
          {showMineFilter ? (
            <button
              type="button"
              className={`hub-grooming-floor__chip${filterMineOnly ? ' hub-grooming-floor__chip--active' : ''}`}
              onClick={() => onFilterMineOnlyChange(!filterMineOnly)}
            >
              Só os meus
            </button>
          ) : null}
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
              <span>Todos os pets ativos foram concluídos!</span>
            </div>
          )}
        </div>
      ) : (
        <div className="hub-grooming-floor__card">
          <span className="hub-grooming-floor__card-label">
            {GROOMING_STAGE_LABELS[featuredStage!]}
            {featured.paused_at ? ' · Pausado' : ''}
            {featured.is_late ? ' · Em atraso' : ''}
          </span>
          <div className="hub-grooming-floor__card-pet-row">
            {featured.pet?.avatar_url ? (
              <img
                src={featured.pet.avatar_url}
                alt=""
                className="hub-grooming-floor__avatar"
              />
            ) : null}
            <span className="hub-grooming-floor__pet-name">{featured.pet?.name || 'Sem pet'}</span>
          </div>
          <p className="hub-grooming-floor__meta">{servicesLabel(featured)}</p>
          <p className="hub-grooming-floor__meta">
            {formatTime(featured.starts_at)}
            {featured.guardian?.full_name ? ` · ${featured.guardian.full_name}` : ''}
            {porteLabel(featured.pet?.size_tier) ? ` · ${porteLabel(featured.pet?.size_tier)}` : ''}
          </p>
          {featured.staff_member?.full_name ? (
            <p className="hub-grooming-floor__meta">Profissional: {featured.staff_member.full_name}</p>
          ) : null}
          <div className="hub-grooming-floor__badges">
            {featured.pet?.is_first_grooming_visit ? (
              <span className="hub-grooming-queue__badge hub-grooming-queue__badge--first">1ª visita B&T</span>
            ) : null}
            {featured.is_walk_in ? <span className="hub-grooming-queue__badge">Avulso</span> : null}
            {featured.appointment_kind === 'pickup_route' ? (
              <span className="hub-grooming-queue__badge">Leva e traz</span>
            ) : null}
            {(featured.priority ?? 0) > 0 ? (
              <span className="hub-grooming-queue__priority-tag">Prioritário</span>
            ) : null}
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
            {canRequestServices ? (
              <button
                type="button"
                className="hub-grooming-floor__action-btn hub-grooming-floor__action-btn--ghost"
                onClick={() => onSelect(featured)}
              >
                Pedir serviço
              </button>
            ) : null}
            {canPauseFeatured ? (
              <button
                type="button"
                className="hub-grooming-floor__action-btn hub-grooming-floor__action-btn--ghost"
                disabled={busy}
                onClick={() => void onPauseToggle?.(featured)}
              >
                {featured.paused_at ? 'Retomar' : 'Pausar'}
              </button>
            ) : null}
            {featuredQuick ? (
              <button
                type="button"
                className="hub-grooming-floor__action-btn hub-grooming-floor__action-btn--advance"
                disabled={busy}
                onClick={() => void onQuickAction(featured, featuredQuick)}
              >
                {busy ? <Loader size={16} className="spin" aria-hidden /> : null}
                {quickActionLabel(featuredQuick, featured)}
              </button>
            ) : null}
          </div>
        </div>
      )}

      <div className="hub-grooming-floor__tabs" role="tablist" aria-label="Status da fila">
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
          {FLOOR_TABS.find((t) => t.id === tab)?.label}
          {activeCount >= 0 ? ` · ${listItems.length}` : ''}
        </p>
        {listItems.length === 0 ? (
          <p className="hub-clientes__muted hub-grooming-floor__empty">Nenhum pet neste status.</p>
        ) : (
          listItems.map((item) => {
            const stage = getItemBoardStage(item);
            const isFeatured = featured ? itemBoardKey(item) === itemBoardKey(featured) : false;
            return (
              <button
                key={itemBoardKey(item)}
                type="button"
                className={`hub-grooming-floor__queue-item${isFeatured ? ' hub-grooming-floor__queue-item--current' : ''}`}
                onClick={() => onFeaturedOverride?.(item)}
              >
                <span className="hub-grooming-floor__queue-pet">{item.pet?.name || 'Sem pet'}</span>
                <span className="hub-grooming-floor__queue-meta">
                  {formatTime(item.starts_at)} · {GROOMING_STAGE_LABELS[stage]}
                </span>
              </button>
            );
          })
        )}
      </div>

      {doneItems.length > 0 ? (
        <div className="hub-grooming-floor__done">
          <button
            type="button"
            className="hub-grooming-floor__done-toggle"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
          >
            Finalizados ({doneItems.length}) {showDone ? '▾' : '▸'}
          </button>
          {showDone
            ? doneItems.map((item) => (
                <button
                  key={itemBoardKey(item)}
                  type="button"
                  className="hub-grooming-floor__queue-item hub-grooming-floor__queue-item--done"
                  onClick={() => onSelect(item)}
                >
                  <span className="hub-grooming-floor__queue-pet">{item.pet?.name || 'Sem pet'}</span>
                  <span className="hub-grooming-floor__queue-meta">
                    {GROOMING_STAGE_LABELS[getItemBoardStage(item)]}
                  </span>
                </button>
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
};

export default GroomingFloorView;
