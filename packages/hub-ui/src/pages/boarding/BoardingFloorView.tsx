import React, { useMemo, useState } from 'react';
import { CheckCircle, Loader, RefreshCw } from 'lucide-react';
import type { BoardingOpsBoardResponse, BoardingOpsStay, BoardingTask } from '../../api/hubBoardingApi';
import BoardingTaskList, { type BoardingTaskAction } from './BoardingTaskList';
import {
  OUTCOMES_BY_KIND,
  OUTCOME_BUTTON_LABELS,
  SOCIABILITY_LABELS,
  TASK_NOW_WINDOW_MIN,
  boardingModeLabel,
  formatBoardingTaskDetails,
  formatHm,
  handlingNeedsAttention,
  isTaskOverdue,
  petInitials,
  sortStays,
} from './boardingCareUi';
import type { StayPanelTab } from './BoardingStayPanel';

type FloorTab = 'tasks' | 'pets' | 'moves';

function taskTime(t: BoardingTask): number {
  return t.scheduled_for ? new Date(t.scheduled_for).getTime() : Number.POSITIVE_INFINITY;
}

/** Tarefa em destaque: a atrasada mais antiga; senão a próxima dentro da janela de "agora"; senão a próxima do dia. */
export function pickFeaturedTask(tasks: BoardingTask[], nowMs = Date.now()): BoardingTask | null {
  const pending = tasks.filter((t) => t.status === 'pending').sort((a, b) => taskTime(a) - taskTime(b));
  if (!pending.length) return null;
  const overdue = pending.find((t) => isTaskOverdue(t, nowMs));
  if (overdue) return overdue;
  const soon = pending.find((t) => taskTime(t) <= nowMs + TASK_NOW_WINDOW_MIN * 60_000);
  return soon ?? pending[0];
}

/** Só o que está atrasado ou dentro da janela de agora. Tarefa distante não ocupa o card. */
export function pickUrgentTask(tasks: BoardingTask[], nowMs = Date.now()): BoardingTask | null {
  const pending = tasks.filter((t) => t.status === 'pending').sort((a, b) => taskTime(a) - taskTime(b));
  const overdue = pending.find((t) => isTaskOverdue(t, nowMs));
  if (overdue) return overdue;
  return pending.find((t) => taskTime(t) <= nowMs + TASK_NOW_WINDOW_MIN * 60_000) ?? null;
}

export type FloorMoveStay = {
  key: string;
  stage: string;
  is_late: boolean;
  is_departure: boolean;
  starts_at: string;
  ends_at: string;
  plan_pendencies?: { label: string }[];
  open_incidents?: unknown[];
  attention?: { key: string; label: string }[];
};

export type FloorSpotlight<T extends FloorMoveStay = FloorMoveStay> =
  | { kind: 'task'; task: BoardingTask }
  | { kind: 'late_checkout'; stay: T }
  | { kind: 'departure'; stay: T }
  | { kind: 'arrival'; stay: T }
  | { kind: 'plan'; stay: T; label: string }
  | { kind: 'incident'; stay: T; label: string };

function byIso<T>(get: (item: T) => string) {
  return (a: T, b: T) => String(get(a)).localeCompare(String(get(b)));
}

/**
 * O que o card do piso mostra: tarefa atrasada ou da hora, senão saída atrasada,
 * próxima saída, próxima chegada, plano incompleto, intercorrência.
 * Tarefa mais tarde no dia só entra se não houver movimento.
 */
export function pickFloorSpotlight<T extends FloorMoveStay>(
  tasks: BoardingTask[],
  stays: T[],
  nowMs = Date.now(),
): FloorSpotlight<T> | null {
  const urgent = pickUrgentTask(tasks, nowMs);
  if (urgent) return { kind: 'task', task: urgent };

  const present = stays.filter((s) => s.stage === 'checked_in');
  const late = [...present].filter((s) => s.is_late).sort(byIso((s) => s.ends_at));
  if (late[0]) return { kind: 'late_checkout', stay: late[0] };

  const departures = present.filter((s) => s.is_departure).sort(byIso((s) => s.ends_at));
  if (departures[0]) return { kind: 'departure', stay: departures[0] };

  const arrivals = stays.filter((s) => s.stage === 'reserved').sort(byIso((s) => s.starts_at));
  if (arrivals[0]) return { kind: 'arrival', stay: arrivals[0] };

  const plan = present.find((s) => (s.plan_pendencies?.length ?? 0) > 0);
  if (plan?.plan_pendencies?.[0]) return { kind: 'plan', stay: plan, label: plan.plan_pendencies[0].label };

  const incident = present.find(
    (s) => (s.open_incidents?.length ?? 0) > 0 || Boolean(s.attention?.some((a) => a.key === 'incident')),
  );
  if (incident) {
    const label = incident.attention?.find((a) => a.key === 'incident')?.label ?? 'Intercorrência aberta';
    return { kind: 'incident', stay: incident, label };
  }

  const later = pickFeaturedTask(tasks, nowMs);
  if (later) return { kind: 'task', task: later };
  return null;
}

export function resolveBoardingFloorAction(
  stay: Pick<BoardingOpsStay, 'stage' | 'reservation_id' | 'appointment_id'>,
  canWrite: boolean,
): 'check_in' | 'check_out' | null {
  if (!canWrite) return null;
  if (stay.stage === 'reserved') return 'check_in';
  if (stay.stage === 'checked_in' && stay.reservation_id) return 'check_out';
  return null;
}

export type BoardingFloorViewProps = {
  board: BoardingOpsBoardResponse | null;
  dateLabel: string;
  loading?: boolean;
  canWrite: boolean;
  canDailyReport: boolean;
  busyTaskId?: string | null;
  handoffPending?: boolean;
  onRefresh: () => void;
  onTaskAction: (task: BoardingTask, action: BoardingTaskAction) => void;
  onAttachPhoto?: (task: BoardingTask, file: File) => void;
  onOpenStay: (stay: BoardingOpsStay | null, reservationId: string, tab?: StayPanelTab) => void;
  onCheckIn: (stay: BoardingOpsStay) => void;
  onCheckOut: (stay: BoardingOpsStay) => void;
  onOpenHandoff: () => void;
  onOpenGroupActivity: () => void;
  nowMs?: number;
};

const BoardingFloorView: React.FC<BoardingFloorViewProps> = ({
  board,
  dateLabel,
  loading,
  canWrite,
  canDailyReport,
  busyTaskId,
  handoffPending,
  onRefresh,
  onTaskAction,
  onAttachPhoto,
  onOpenStay,
  onCheckIn,
  onCheckOut,
  onOpenHandoff,
  onOpenGroupActivity,
  nowMs = Date.now(),
}) => {
  const [tab, setTab] = useState<FloorTab>('tasks');
  const stays = board?.stays ?? [];
  const tasks = board?.tasks ?? [];

  const present = useMemo(() => sortStays(stays.filter((s) => s.stage === 'checked_in')), [stays]);
  const moves = useMemo(
    () =>
      stays
        .filter((s) => s.stage === 'reserved' || (s.stage === 'checked_in' && s.is_departure))
        .sort((a, b) => {
          const ta = a.stage === 'reserved' ? a.starts_at : a.ends_at;
          const tb = b.stage === 'reserved' ? b.starts_at : b.ends_at;
          return String(ta).localeCompare(String(tb));
        }),
    [stays],
  );
  const spotlight = useMemo(() => pickFloorSpotlight(tasks, stays, nowMs), [tasks, stays, nowMs]);
  const featured = spotlight?.kind === 'task' ? spotlight.task : null;
  const featuredStay = featured ? stays.find((s) => s.reservation_id === featured.hub_boarding_reservation_id) ?? null : null;
  const featuredDetailsText = featured ? formatBoardingTaskDetails(featured.details) : null;
  const featuredTitleText = featured && typeof featured.title === 'string' ? featured.title : '';
  const moveStay = spotlight && spotlight.kind !== 'task' ? spotlight.stay : null;
  const moveAction = moveStay ? resolveBoardingFloorAction(moveStay, canWrite) : null;

  const pendingCount = tasks.filter((t) => t.status === 'pending').length;
  const overdueCount = tasks.filter((t) => isTaskOverdue(t, nowMs)).length;
  const tabs: { id: FloorTab; label: string; count: number }[] = [
    { id: 'tasks', label: 'Tarefas', count: pendingCount },
    { id: 'pets', label: 'Pets', count: present.length },
    { id: 'moves', label: 'Entradas e saídas', count: moves.length },
  ];

  return (
    <div className="hub-grooming-floor hub-boarding-floor">
      <div className="hub-grooming-floor__header">
        <div className="hub-grooming-floor__header-text">
          <span className="hub-grooming-floor__date">{dateLabel}</span>
          <span className="hub-grooming-floor__progress">
            {present.length} {present.length === 1 ? 'presente' : 'presentes'} · {pendingCount}{' '}
            {pendingCount === 1 ? 'tarefa' : 'tarefas'}
            {overdueCount ? ` · ${overdueCount} ${overdueCount === 1 ? 'atrasada' : 'atrasadas'}` : ''}
          </span>
        </div>
        <div className="hub-grooming-floor__header-actions">
          <button type="button" className="hub-grooming-floor__chip" onClick={onOpenHandoff}>
            Passagem
          </button>
          <button
            type="button"
            className="hub-grooming-floor__icon-btn"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Atualizar"
          >
            <RefreshCw size={16} aria-hidden />
          </button>
        </div>
      </div>

      {handoffPending ? (
        <div className="hub-clinic-banner hub-clinic-banner--warning hub-boarding-floor__banner">
          <p>Passagem de turno sem ciência.</p>
          <button type="button" className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm" onClick={onOpenHandoff}>
            Ler
          </button>
        </div>
      ) : null}

      {loading && !board ? (
        <div className="hub-grooming-floor__card hub-grooming-floor__card--empty">
          <Loader size={18} className="spin" aria-hidden />
          <span>Carregando…</span>
        </div>
      ) : featured ? (
        <div className={`hub-grooming-floor__card hub-boarding-floor__featured${isTaskOverdue(featured, nowMs) ? ' hub-boarding-floor__featured--late' : ''}`}>
          <span className="hub-grooming-floor__card-label">
            {isTaskOverdue(featured, nowMs) ? 'Atrasada' : 'Agora'}
            {featured.scheduled_for ? ` · ${formatHm(featured.scheduled_for)}` : ''}
          </span>
          <button
            type="button"
            className="hub-grooming-floor__card-pet-row hub-boarding-floor__pet-link"
            onClick={() => onOpenStay(featuredStay, featured.hub_boarding_reservation_id, 'routine')}
          >
            {featuredStay?.pet?.avatar_url ? (
              <img src={featuredStay.pet.avatar_url} alt="" className="hub-grooming-floor__avatar" />
            ) : (
              <span className="hub-boarding-card__avatar-placeholder hub-boarding-floor__avatar-fallback" aria-hidden>
                {petInitials(featured.pet_name ?? 'Pet')}
              </span>
            )}
            <span className="hub-grooming-floor__pet-name">{featured.pet_name ?? 'Pet'}</span>
          </button>
          <p className="hub-boarding-floor__task-title">{featuredTitleText}</p>
          {featuredDetailsText ? <p className="hub-grooming-floor__meta">{featuredDetailsText}</p> : null}
          {featuredStay && handlingNeedsAttention(featuredStay.handling) ? (
            <div className="hub-grooming-floor__badges">
              <span className="hub-grooming-drawer__flag hub-grooming-drawer__flag--priority">
                {featuredStay.handling?.sociability ? SOCIABILITY_LABELS[featuredStay.handling.sociability] : 'Manejo'}
              </span>
              {typeof featuredStay.handling?.contact_restrictions === 'string' &&
              featuredStay.handling.contact_restrictions.trim() ? (
                <span className="hub-grooming-floor__meta">{featuredStay.handling.contact_restrictions}</span>
              ) : null}
            </div>
          ) : null}
          {canDailyReport ? (
            <div className="hub-grooming-floor__actions">
              {OUTCOMES_BY_KIND[featured.kind].map((outcome, idx) => (
                <button
                  key={outcome}
                  type="button"
                  className={`hub-grooming-floor__action-btn ${idx === 0 ? 'hub-grooming-floor__action-btn--advance' : 'hub-grooming-floor__action-btn--ghost'}`}
                  disabled={busyTaskId === featured.id}
                  onClick={() => onTaskAction(featured, { type: 'outcome', outcome })}
                >
                  {busyTaskId === featured.id && idx === 0 ? <Loader size={16} className="spin" aria-hidden /> : null}
                  {OUTCOME_BUTTON_LABELS[outcome]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : moveStay && spotlight && spotlight.kind !== 'task' ? (
        <div
          className={`hub-grooming-floor__card hub-boarding-floor__featured${spotlight.kind === 'late_checkout' ? ' hub-boarding-floor__featured--late' : ''}`}
        >
          <span className="hub-grooming-floor__card-label">
            {spotlight.kind === 'late_checkout'
              ? 'Saída atrasada'
              : spotlight.kind === 'departure'
                ? 'Saída prevista'
                : spotlight.kind === 'arrival'
                  ? 'Chegada prevista'
                  : spotlight.kind === 'plan'
                    ? 'Plano de cuidados'
                    : 'Intercorrência'}
          </span>
          <button
            type="button"
            className="hub-grooming-floor__card-pet-row hub-boarding-floor__pet-link"
            disabled={!moveStay.reservation_id}
            onClick={() =>
              onOpenStay(
                moveStay,
                moveStay.reservation_id ?? '',
                spotlight.kind === 'plan' || spotlight.kind === 'arrival' ? 'care' : 'routine',
              )
            }
          >
            {moveStay.pet?.avatar_url ? (
              <img src={moveStay.pet.avatar_url} alt="" className="hub-grooming-floor__avatar" />
            ) : (
              <span className="hub-boarding-card__avatar-placeholder hub-boarding-floor__avatar-fallback" aria-hidden>
                {petInitials(moveStay.pet?.name || 'Pet')}
              </span>
            )}
            <span className="hub-grooming-floor__pet-name">{moveStay.pet?.name || 'Pet'}</span>
          </button>
          <p className="hub-boarding-floor__task-title">
            {spotlight.kind === 'plan' || spotlight.kind === 'incident'
              ? spotlight.label
              : spotlight.kind === 'arrival'
                ? `Chega ${formatHm(moveStay.starts_at)}`
                : `Sai ${formatHm(moveStay.ends_at)}`}
          </p>
          <p className="hub-grooming-floor__meta">
            {[boardingModeLabel(moveStay.mode), moveStay.guardian?.full_name].filter(Boolean).join(' · ')}
          </p>
          {spotlight.kind === 'plan' || spotlight.kind === 'incident' ? (
            <div className="hub-grooming-floor__actions">
              <button
                type="button"
                className="hub-grooming-floor__action-btn hub-grooming-floor__action-btn--advance"
                disabled={!moveStay.reservation_id}
                onClick={() =>
                  onOpenStay(moveStay, moveStay.reservation_id ?? '', spotlight.kind === 'plan' ? 'care' : 'routine')
                }
              >
                {spotlight.kind === 'plan' ? 'Abrir cuidados' : 'Ver rotina'}
              </button>
            </div>
          ) : moveAction ? (
            <div className="hub-grooming-floor__actions">
              <button
                type="button"
                className="hub-grooming-floor__action-btn hub-grooming-floor__action-btn--advance"
                onClick={() => (moveAction === 'check_in' ? onCheckIn(moveStay) : onCheckOut(moveStay))}
              >
                {moveAction === 'check_in' ? 'Check-in' : 'Check-out'}
              </button>
            </div>
          ) : null}
        </div>
      ) : present.length ? (
        <div className="hub-grooming-floor__card hub-grooming-floor__card--empty">
          <div className="hub-grooming-floor__all-done">
            <CheckCircle size={20} aria-hidden />
            <span>Rotina em dia.</span>
          </div>
        </div>
      ) : (
        <div className="hub-grooming-floor__card hub-grooming-floor__card--empty">
          <p>Nenhum pet hospedado agora.</p>
        </div>
      )}

      <div className="hub-grooming-floor__tabs hub-boarding-floor__tabs" role="tablist" aria-label="Minha fila">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`hub-grooming-floor__tab${tab === t.id ? ' hub-grooming-floor__tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.count > 0 ? <span className="hub-grooming-floor__tab-count">{t.count}</span> : null}
          </button>
        ))}
      </div>

      <div className="hub-grooming-floor__queue">
        {tab === 'tasks' ? (
          <>
            {canDailyReport && present.length > 1 ? (
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm hub-boarding-floor__group-btn"
                onClick={onOpenGroupActivity}
              >
                Registrar atividade em grupo
              </button>
            ) : null}
            <BoardingTaskList
              tasks={tasks}
              showPet
              grouped
              canExecute={canDailyReport}
              busyTaskId={busyTaskId}
              onAction={onTaskAction}
              onAttachPhoto={canDailyReport ? onAttachPhoto : undefined}
              onOpenPet={(t) =>
                onOpenStay(stays.find((s) => s.reservation_id === t.hub_boarding_reservation_id) ?? null, t.hub_boarding_reservation_id, 'routine')
              }
              emptyLabel="Nenhuma tarefa para hoje."
              nowMs={nowMs}
            />
          </>
        ) : null}

        {tab === 'pets' ? (
          present.length ? (
            present.map((s) => (
              <button
                key={s.key}
                type="button"
                className="hub-grooming-floor__queue-item hub-boarding-floor__pet-item"
                onClick={() => s.reservation_id && onOpenStay(s, s.reservation_id, 'routine')}
              >
                <span className="hub-grooming-floor__queue-pet">
                  {s.pet?.name || 'Pet'}
                  {s.attention.length ? <span className="hub-boarding-floor__dot" aria-label="Precisa de atenção" /> : null}
                </span>
                <span className="hub-grooming-floor__queue-meta">
                  {[
                    boardingModeLabel(s.mode),
                    s.space?.name,
                    s.next_task ? `${s.next_task.scheduled_for ? `${formatHm(s.next_task.scheduled_for)} ` : ''}${s.next_task.title}` : 'Rotina em dia',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {s.attention.length ? (
                  <span className="hub-grooming-floor__queue-meta hub-boarding-floor__reasons">
                    {s.attention.map((a) => a.label).join(' · ')}
                  </span>
                ) : null}
              </button>
            ))
          ) : (
            <p className="hub-clientes__muted hub-grooming-floor__empty">Nenhum pet hospedado agora.</p>
          )
        ) : null}

        {tab === 'moves' ? (
          moves.length ? (
            moves.map((s) => {
              const action = resolveBoardingFloorAction(s, canWrite);
              const arriving = s.stage === 'reserved';
              return (
                <div key={s.key} className="hub-grooming-floor__queue-item hub-grooming-floor__queue-item--row">
                  <button
                    type="button"
                    className="hub-grooming-floor__queue-select"
                    onClick={() => onOpenStay(s, s.reservation_id ?? '', arriving ? 'care' : 'routine')}
                    disabled={!s.reservation_id}
                  >
                    <span className="hub-grooming-floor__queue-pet">{s.pet?.name || 'Pet'}</span>
                    <span className="hub-grooming-floor__queue-meta">
                      {arriving ? `Chega ${formatHm(s.starts_at)}` : `Sai ${formatHm(s.ends_at)}`} · {boardingModeLabel(s.mode)}
                      {s.guardian?.full_name ? ` · ${s.guardian.full_name}` : ''}
                    </span>
                  </button>
                  {action ? (
                    <button
                      type="button"
                      className="hub-grooming-floor__queue-action"
                      onClick={() => (action === 'check_in' ? onCheckIn(s) : onCheckOut(s))}
                    >
                      {action === 'check_in' ? 'Check-in' : 'Check-out'}
                    </button>
                  ) : null}
                </div>
              );
            })
          ) : (
            <p className="hub-clientes__muted hub-grooming-floor__empty">Sem entradas ou saídas pendentes hoje.</p>
          )
        ) : null}
      </div>
    </div>
  );
};

export default BoardingFloorView;
