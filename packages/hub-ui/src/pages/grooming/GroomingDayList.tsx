import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
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

export type { GroomingQuickAction };

const ADVANCE_LABEL: Partial<Record<GroomingStage, string>> = {
  scheduled: 'Check-in',
  checked_in: 'Para fila',
  queued: 'Iniciar',
  in_service: 'Pronto',
  finishing: 'Pronto',
  ready: 'Encerrar',
  delivered: 'Encerrar',
};

function formatTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function pillClass(stage: GroomingStage): string {
  if (stage === 'in_service' || stage === 'finishing') {
    return 'hub-clientes__pill hub-clinic-queue__pill--progress';
  }
  if (stage === 'delivered' || stage === 'closed' || stage === 'ready') {
    return 'hub-clientes__pill hub-clinic-queue__pill--done';
  }
  return 'hub-clientes__pill hub-clinic-queue__pill--waiting';
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

function isDoneStage(stage: GroomingStage): boolean {
  return stage === 'ready' || stage === 'delivered' || stage === 'closed';
}

function needsAttention(item: GroomingDayBoardItem): boolean {
  if (isDoneStage(getItemBoardStage(item))) return false;
  if (item.is_late) return true;
  if ((item.priority ?? 0) > 0) return true;
  if (!item.staff_member?.full_name) return true;
  return false;
}

function sortByStartsAt(a: GroomingDayBoardItem, b: GroomingDayBoardItem): number {
  const ta = a.starts_at ? new Date(a.starts_at).getTime() : Number.POSITIVE_INFINITY;
  const tb = b.starts_at ? new Date(b.starts_at).getTime() : Number.POSITIVE_INFINITY;
  if (ta !== tb) return ta - tb;
  return itemBoardKey(a).localeCompare(itemBoardKey(b));
}

type Props = {
  items: GroomingDayBoardItem[];
  canWrite: boolean;
  searchQ: string;
  onSelect: (item: GroomingDayBoardItem) => void;
  onQuickAction: (item: GroomingDayBoardItem, action: GroomingQuickAction) => void;
  onClearSearch?: () => void;
};

const GroomingDayList: React.FC<Props> = ({
  items,
  canWrite,
  searchQ,
  onSelect,
  onQuickAction,
  onClearSearch,
}) => {
  const [doneCollapsed, setDoneCollapsed] = useState(true);
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

  const { attention, agenda, done } = useMemo(() => {
    const attentionList: GroomingDayBoardItem[] = [];
    const agendaList: GroomingDayBoardItem[] = [];
    const doneList: GroomingDayBoardItem[] = [];

    for (const item of filtered) {
      const stage = getItemBoardStage(item);
      if (isDoneStage(stage)) {
        doneList.push(item);
        continue;
      }
      if (needsAttention(item)) {
        attentionList.push(item);
      } else {
        agendaList.push(item);
      }
    }

    attentionList.sort(sortByStartsAt);
    agendaList.sort(sortByStartsAt);
    doneList.sort(sortByStartsAt);
    return { attention: attentionList, agenda: agendaList, done: doneList };
  }, [filtered]);

  const renderRow = (item: GroomingDayBoardItem) => {
    const petName = item.pet?.name || 'Sem pet';
    const tutor = item.guardian?.full_name || '—';
    const prof = item.staff_member?.full_name || 'Sem profissional';
    const stage = getItemBoardStage(item);
    const time = formatTime(item.starts_at);
    const porte = porteLabel(item.pet?.size_tier);
    const duration =
      item.estimated_duration_minutes != null && item.estimated_duration_minutes > 0
        ? `~${item.estimated_duration_minutes} min`
        : null;
    const quick = resolveGroomingQuickAction(item, canWrite);
    const priority = (item.priority ?? 0) > 0;
    const paused = Boolean(item.paused_at);

    return (
      <li key={itemBoardKey(item)}>
        <div
          className={`hub-grooming-day-list__row${item.is_late ? ' hub-grooming-day-list__row--late' : ''}${priority ? ' hub-grooming-day-list__row--priority' : ''}${paused ? ' hub-grooming-day-list__row--paused' : ''}`}
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
                <span className="hub-grooming-day-list__avatar hub-grooming-day-list__avatar--empty" aria-hidden />
              )}
              <div className="hub-grooming-day-list__names">
                <p className="hub-grooming-day-list__pet">{petName}</p>
                <p className="hub-grooming-day-list__tutor">{tutor}</p>
              </div>
            </div>

            <div className="hub-grooming-day-list__badges" aria-label="Alertas">
              {item.is_late ? <span className="hub-grooming-queue__late-tag">Em atraso</span> : null}
              {priority ? <span className="hub-grooming-queue__priority-tag">Prioritário</span> : null}
              {paused ? (
                <span className="hub-grooming-queue__badge hub-grooming-queue__badge--paused">Pausado</span>
              ) : null}
              {item.pet?.is_first_grooming_visit ? (
                <span className="hub-grooming-queue__badge hub-grooming-queue__badge--first">1ª visita B&T</span>
              ) : null}
              {item.is_walk_in ? <span className="hub-grooming-queue__badge">Avulso</span> : null}
              {item.has_pickup_legs || item.appointment_kind === 'pickup_route' ? (
                <span className="hub-grooming-queue__badge">Leva e traz</span>
              ) : null}
              {item.clinical_tags?.slice(0, 2).map((t) => (
                <span key={t.key} className="hub-grooming-tags__pill">
                  {t.label}
                </span>
              ))}
            </div>

            <div className="hub-grooming-day-list__meta">
              <span className="hub-grooming-day-list__service">{servicesLabel(item)}</span>
              {porte ? <span className="hub-grooming-day-list__dot-meta">{porte}</span> : null}
              <span className="hub-grooming-day-list__dot-meta">{prof}</span>
              {duration ? <span className="hub-grooming-day-list__dot-meta">{duration}</span> : null}
            </div>
          </div>

          <div className="hub-grooming-day-list__status">
            <span className={pillClass(stage)}>{GROOMING_STAGE_LABELS[stage]}</span>
          </div>

          <div className="hub-grooming-day-list__actions hub-clinic-queue__actions">
            {quick ? (
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                onClick={(e) => {
                  e.stopPropagation();
                  void onQuickAction(item, quick);
                }}
              >
                {quickActionLabel(quick, item)}
              </button>
            ) : null}
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
  };

  if (q && filtered.length === 0) {
    return (
      <div className="hub-grooming-page__empty-filters" role="status">
        <p className="hub-clientes__muted">Nenhum pet ou tutor corresponde à busca.</p>
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

  return (
    <div className="hub-grooming-day-list">
      {attention.length > 0 ? (
        <section className="hub-grooming-day-list__section hub-grooming-day-list__section--attention">
          <h3 className="hub-grooming-day-list__section-title">
            Atenção <span className="hub-grooming-day-list__count">{attention.length}</span>
          </h3>
          <ul className="hub-grooming-day-list__rows">{attention.map(renderRow)}</ul>
        </section>
      ) : null}

      <section className="hub-grooming-day-list__section">
        <h3 className="hub-grooming-day-list__section-title">
          Agenda do dia <span className="hub-grooming-day-list__count">{agenda.length}</span>
        </h3>
        {agenda.length === 0 ? (
          <p className="hub-clientes__muted hub-grooming-day-list__empty">
            {attention.length > 0
              ? 'Os atendimentos ativos estão em Atenção.'
              : 'Nenhum atendimento ativo neste horário.'}
          </p>
        ) : (
          <ul className="hub-grooming-day-list__rows">{agenda.map(renderRow)}</ul>
        )}
      </section>

      {done.length > 0 ? (
        <section className="hub-grooming-day-list__section hub-grooming-day-list__section--done">
          <button
            type="button"
            className="hub-grooming-day-list__section-toggle"
            onClick={() => setDoneCollapsed((v) => !v)}
            aria-expanded={!doneCollapsed}
          >
            {doneCollapsed ? <ChevronRight size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
            <span className="hub-grooming-day-list__section-title">
              Finalizados <span className="hub-grooming-day-list__count">{done.length}</span>
            </span>
          </button>
          {!doneCollapsed ? <ul className="hub-grooming-day-list__rows">{done.map(renderRow)}</ul> : null}
        </section>
      ) : null}
    </div>
  );
};

export default GroomingDayList;
