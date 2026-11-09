import React from 'react';
import type { BoardingOpsStay } from '../../api/hubBoardingApi';
import {
  SOCIABILITY_LABELS,
  boardingModeLabel,
  daycarePeriodLabel,
  formatDayMonth,
  formatHm,
  handlingNeedsAttention,
  petInitials,
  stayStageLabel,
  stayStageVariant,
} from './boardingCareUi';

type Props = {
  stay: BoardingOpsStay;
  canWrite: boolean;
  busy?: boolean;
  onOpen: (stay: BoardingOpsStay) => void;
  onCheckIn: (stay: BoardingOpsStay) => void;
  onCheckOut: (stay: BoardingOpsStay) => void;
};

function stayWhen(stay: BoardingOpsStay): string {
  if (stay.stage === 'reserved') {
    return stay.mode === 'hotel' ? `Chega ${formatDayMonth(stay.starts_at)} às ${formatHm(stay.starts_at)}` : `Chega às ${formatHm(stay.starts_at)}`;
  }
  if (stay.stage === 'checked_out') return `Saiu às ${formatHm(stay.checked_out_at)}`;
  if (stay.mode === 'hotel') {
    const n = stay.nights_count;
    return `Até ${formatDayMonth(stay.ends_at)}${n > 0 ? ` · ${n} ${n === 1 ? 'diária' : 'diárias'}` : ''}`;
  }
  return [stay.daycare_shift?.label, daycarePeriodLabel(stay.daycare_period), stay.ends_at ? `até ${formatHm(stay.ends_at)}` : null]
    .filter(Boolean)
    .join(' · ');
}

const BoardingStayCard: React.FC<Props> = ({ stay, canWrite, busy, onOpen, onCheckIn, onCheckOut }) => {
  const name = stay.pet?.name || 'Pet';
  const high = stay.attention.some((a) => a.severity === 'high');
  const handling = stay.handling;
  const ts = stay.tasks_summary;

  return (
    <article
      className={[
        'hub-clinic-queue__card',
        'hub-boarding-card',
        stay.attention.length ? 'hub-boarding-card--attention' : '',
        high ? 'hub-boarding-card--high' : '',
        stay.stage === 'checked_out' ? 'hub-boarding-card--done' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button type="button" className="hub-boarding-card__open" onClick={() => onOpen(stay)} aria-label={`Abrir estadia de ${name}`}>
        <div className="hub-clinic-queue__card-top">
          <div className="hub-boarding-card__identity">
            {stay.pet?.avatar_url ? (
              <img src={stay.pet.avatar_url} alt="" className="hub-boarding-card__avatar" />
            ) : (
              <span className="hub-boarding-card__avatar-placeholder" aria-hidden>
                {petInitials(name)}
              </span>
            )}
            <div>
              <p className="hub-clinic-queue__pet">{name}</p>
              <p className="hub-clinic-queue__meta hub-clientes__muted">
                {boardingModeLabel(stay.mode)}
                {stay.space?.name ? ` · ${stay.space.name}` : ''}
                {stay.guardian?.full_name ? ` · ${stay.guardian.full_name}` : ''}
              </p>
            </div>
          </div>
          <span className={`hub-grooming-drawer__stage hub-grooming-drawer__stage--${stayStageVariant(stay.stage)}`}>
            {stayStageLabel(stay.stage)}
          </span>
        </div>

        <p className="hub-clinic-queue__meta">{stayWhen(stay)}</p>

        {stay.attention.length ? (
          <ul className="hub-boarding-card__reasons">
            {stay.attention.slice(0, 3).map((a) => (
              <li key={a.key} className={`hub-boarding-card__reason hub-boarding-card__reason--${a.severity}`}>
                {a.label}
              </li>
            ))}
            {stay.attention.length > 3 ? (
              <li className="hub-boarding-card__reason hub-boarding-card__reason--low">+{stay.attention.length - 3}</li>
            ) : null}
          </ul>
        ) : null}

        {(stay.stage === 'checked_in' ||
          stay.stage === 'checkout_preparing' ||
          stay.stage === 'ready_for_handoff') &&
        stay.next_task ? (
          <p className="hub-boarding-card__next">
            <span className="hub-boarding-card__next-label">Próxima</span>
            {stay.next_task.scheduled_for ? `${formatHm(stay.next_task.scheduled_for)} · ` : ''}
            {stay.next_task.title}
          </p>
        ) : null}

        <div className="hub-boarding-card__chips">
          {stay.stage === 'checkout_preparing' ? (
            <span className="hub-grooming-drawer__flag hub-grooming-drawer__flag--priority">Preparando saída</span>
          ) : null}
          {stay.stage === 'ready_for_handoff' ? (
            <span className="hub-grooming-drawer__flag hub-grooming-drawer__flag--priority">Aguardando recepção</span>
          ) : null}
          {stay.is_departure && stay.stage === 'checked_in' ? (
            <span className="hub-grooming-drawer__chip">Sai hoje</span>
          ) : null}
          {(stay.stage === 'checked_in' ||
            stay.stage === 'checkout_preparing' ||
            stay.stage === 'ready_for_handoff') &&
          ts.total ? (
            <span className="hub-grooming-drawer__chip">
              {ts.done}/{ts.total} tarefas
            </span>
          ) : null}
          {handlingNeedsAttention(handling) ? (
            <span className="hub-grooming-drawer__flag hub-grooming-drawer__flag--priority">
              {handling?.sociability ? SOCIABILITY_LABELS[handling.sociability] : 'Manejo'}
              {handling?.group_play_allowed === false ? ' · sem grupo' : ''}
            </span>
          ) : null}
          {stay.belongings_count ? (
            <span className="hub-grooming-drawer__chip">
              {stay.belongings_count} {stay.belongings_count === 1 ? 'pertence' : 'pertences'}
            </span>
          ) : null}
          {stay.clinical_tags.slice(0, 2).map((t) => (
            <span key={t.key} className="hub-grooming-tags__pill">
              {t.label}
            </span>
          ))}
        </div>
      </button>

      {canWrite &&
      (stay.stage === 'reserved' ||
        stay.stage === 'checked_in' ||
        stay.stage === 'checkout_preparing' ||
        stay.stage === 'ready_for_handoff') ? (
        <div className="hub-clinic-queue__actions">
          {stay.stage === 'reserved' ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
              disabled={busy}
              onClick={() => onCheckIn(stay)}
            >
              Check-in
            </button>
          ) : (
            <button
              type="button"
              className={`hub-clientes__btn hub-clientes__btn--sm ${
                stay.is_departure || stay.stage === 'checkout_preparing' || stay.stage === 'ready_for_handoff'
                  ? 'hub-clientes__btn--primary'
                  : 'hub-clientes__btn--ghost'
              }`}
              disabled={busy || !stay.reservation_id}
              onClick={() => onCheckOut(stay)}
            >
              {stay.stage === 'ready_for_handoff'
                ? 'Ver saída'
                : stay.stage === 'checkout_preparing'
                  ? 'Continuar saída'
                  : 'Saída'}
            </button>
          )}
        </div>
      ) : null}
    </article>
  );
};

export default BoardingStayCard;
