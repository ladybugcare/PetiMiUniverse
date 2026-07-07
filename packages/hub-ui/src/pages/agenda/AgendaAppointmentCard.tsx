import React from 'react';
import {
  AlertTriangle,
  DollarSign,
  RefreshCw,
  Truck,
  Zap,
} from 'lucide-react';
import { ServiceGroupIcon } from '../../components/ServiceGroupIcon';
import { resolveServiceAccentColor } from '../../utils/serviceTypeSlug';
import {
  type AgendaAppointment,
  type AgendaCardSize,
  STATUS_META,
  agendaCardSizeFromHeight,
  formatHm,
  guardianFirstName,
} from './agendaModel';

export type AgendaAppointmentCardVariant = 'day' | 'week';

export interface AgendaAppointmentCardProps {
  appointment: AgendaAppointment;
  variant?: AgendaAppointmentCardVariant;
  heightPx?: number;
  selected?: boolean;
  draggable?: boolean;
  showProfessional?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onDragStart?: (e: React.DragEvent) => void;
}

function CardBadges({
  appt,
  compact,
}: {
  appt: AgendaAppointment;
  compact?: boolean;
}) {
  const badges: React.ReactNode[] = [];

  if (appt.isRecurring) {
    badges.push(
      <span key="recur" className="hub-agenda-card__badge" title="Parte de série recorrente">
        <RefreshCw size={compact ? 10 : 11} aria-hidden />
      </span>,
    );
  }

  if (appt.visitGroupSize != null && appt.visitGroupSize > 1) {
    badges.push(
      <span
        key="visit-group"
        className="hub-agenda-card__badge"
        title={appt.visitGroupLabel ? `Visita multi-pet: ${appt.visitGroupLabel}` : 'Visita multi-pet'}
      >
        <span className="nam-visit-group-badge">{appt.visitGroupSize} pets</span>
      </span>,
    );
  }

  if (appt.pickupPackage?.hasBefore) {
    badges.push(
      <span key="pickup-before" className="hub-agenda-card__badge" title="Leva e traz: busca">
        <Truck size={compact ? 10 : 11} aria-hidden />
      </span>,
    );
  }

  if (appt.pickupPackage?.hasAfter) {
    badges.push(
      <span key="pickup-after" className="hub-agenda-card__badge" title="Leva e traz: retorno">
        <Truck size={compact ? 10 : 11} style={{ transform: 'scaleX(-1)' }} aria-hidden />
      </span>,
    );
  }

  if (appt.conflict) {
    badges.push(
      <span key="conflict" className="hub-agenda-card__badge hub-agenda-card__badge--warn" title="Possível conflito de horário">
        <AlertTriangle size={compact ? 10 : 11} aria-hidden />
      </span>,
    );
  }

  if (appt.financial_adjustment_pending) {
    badges.push(
      <span key="financial" className="hub-agenda-card__badge" title="Ajuste financeiro pendente">
        <DollarSign size={compact ? 10 : 11} aria-hidden />
      </span>,
    );
  }

  if (
    appt.appointment_kind === 'walk_in' ||
    appt.appointment_kind === 'clinical_walk_in' ||
    appt.appointment_kind === 'clinical_emergency'
  ) {
    const isEmergency = appt.appointment_kind === 'clinical_emergency';
    badges.push(
      <span
        key="kind"
        className="hub-agenda-card__badge hub-agenda-card__badge--warn"
        title={isEmergency ? 'Emergência' : 'Encaixe'}
      >
        <Zap size={compact ? 10 : 11} aria-hidden />
      </span>,
    );
  }

  if (badges.length === 0) return null;
  return <div className="hub-agenda-card__badges">{badges}</div>;
}

function GroupIcons({
  appt,
  color,
  size,
}: {
  appt: AgendaAppointment;
  color: string;
  size: number;
}) {
  const groups = appt.serviceGroups?.length ? appt.serviceGroups : [appt.group];
  const shown = groups.slice(0, 2);
  return (
    <div className="hub-agenda-card__icons" aria-hidden>
      {shown.map((g) => (
        <ServiceGroupIcon key={g} group={g} color={color} size={size} strokeWidth={2.2} />
      ))}
    </div>
  );
}

export function AgendaAppointmentCard({
  appointment: a,
  variant = 'day',
  heightPx,
  selected = false,
  draggable = false,
  showProfessional = false,
  onClick,
  onDragStart,
}: AgendaAppointmentCardProps) {
  const color = resolveServiceAccentColor(a.agendaColor, a.group);
  const st = STATUS_META[a.status];
  const serviceLabel = a.displayServiceLabel ?? a.serviceName;
  const isWeek = variant === 'week';

  const size: AgendaCardSize =
    isWeek ? 'medium' : heightPx != null ? agendaCardSizeFromHeight(heightPx) : 'tall';

  const classNames = [
    'hub-agenda-card',
    isWeek ? 'hub-agenda-card--week' : '',
    `hub-agenda-card--${size}`,
    selected ? 'hub-agenda-card--selected' : '',
    a.conflict ? 'hub-agenda-card--conflict' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (isWeek) {
    return (
      <button
        type="button"
        draggable={draggable}
        onDragStart={onDragStart}
        className={classNames}
        style={{
          backgroundColor: `${color}24`,
          borderLeft: `4px solid ${color}`,
          color: '#2d2424',
        }}
        onClick={onClick}
      >
        <div className="hub-agenda-card__row hub-agenda-card__row--head">
          <GroupIcons appt={a} color={color} size={12} />
          <span className="hub-agenda-card__time">{formatHm(a.start)}</span>
          <span
            className={`hub-agenda-card__status-dot hub-agenda-card__status-dot--${a.status}`}
            title={st.label}
          />
          <CardBadges appt={a} compact />
        </div>
        <div className="hub-agenda-card__pet">{a.petName}</div>
        <div className="hub-agenda-card__service hub-agenda-card__service--muted">{serviceLabel}</div>
      </button>
    );
  }

  if (size === 'compact') {
    return (
      <button
        type="button"
        draggable={draggable}
        onDragStart={onDragStart}
        className={classNames}
        style={{
          backgroundColor: `${color}24`,
          borderLeft: `4px solid ${color}`,
          color: '#2d2424',
        }}
        onClick={onClick}
      >
        <div className="hub-agenda-card__row hub-agenda-card__row--compact">
          <GroupIcons appt={a} color={color} size={12} />
          <span className="hub-agenda-card__pet hub-agenda-card__pet--inline">{a.petName}</span>
          <span className="hub-agenda-card__time hub-agenda-card__time--inline">{formatHm(a.start)}</span>
          <span
            className={`hub-agenda-card__status-dot hub-agenda-card__status-dot--${a.status}`}
            title={st.label}
          />
          <CardBadges appt={a} compact />
        </div>
      </button>
    );
  }

  if (size === 'medium') {
    return (
      <button
        type="button"
        draggable={draggable}
        onDragStart={onDragStart}
        className={classNames}
        style={{
          backgroundColor: `${color}24`,
          borderLeft: `4px solid ${color}`,
          color: '#2d2424',
        }}
        onClick={onClick}
      >
        <div className="hub-agenda-card__row hub-agenda-card__row--head">
          <GroupIcons appt={a} color={color} size={14} />
          <span className="hub-agenda-card__time">
            {formatHm(a.start)} – {formatHm(a.end)}
          </span>
          <span
            className={`hub-agenda-card__status-dot hub-agenda-card__status-dot--${a.status}`}
            title={st.label}
          />
          <CardBadges appt={a} />
        </div>
        <div className="hub-agenda-card__pet">{a.petName}</div>
        <div className="hub-agenda-card__service">
          {serviceLabel}
          {a.guardianName && a.guardianName !== '—' ? (
            <span className="hub-agenda-card__guardian"> · {guardianFirstName(a.guardianName)}</span>
          ) : null}
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={onDragStart}
      className={classNames}
      style={{
        backgroundColor: `${color}24`,
        borderLeft: `4px solid ${color}`,
        color: '#2d2424',
      }}
      onClick={onClick}
    >
      <div className="hub-agenda-card__row hub-agenda-card__row--head">
        <GroupIcons appt={a} color={color} size={14} />
        <span className="hub-agenda-card__time">
          {formatHm(a.start)} – {formatHm(a.end)}
        </span>
        <CardBadges appt={a} />
      </div>
      <div className="hub-agenda-card__pet">{a.petName}</div>
      <div className="hub-agenda-card__service">
        {serviceLabel}
        {a.guardianName && a.guardianName !== '—' ? (
          <span className="hub-agenda-card__guardian"> · {a.guardianName}</span>
        ) : null}
      </div>
      {showProfessional && a.professionalName ? (
        <div className="hub-agenda-card__professional">{a.professionalName}</div>
      ) : null}
      <div className="hub-agenda-card__status-row">
        <span
          className={`hub-agenda-card__status-dot hub-agenda-card__status-dot--${a.status}`}
          title={st.label}
        />
        <span className={`hub-agenda__pill ${st.pillClass}`}>{st.label}</span>
      </div>
    </button>
  );
}
