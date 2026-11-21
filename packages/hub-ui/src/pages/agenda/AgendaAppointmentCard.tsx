import React from 'react';
import {
  AlertTriangle,
  DollarSign,
  RefreshCw,
  Truck,
  Zap,
} from 'lucide-react';
import { ServiceGroupIcon } from '../../components/ServiceGroupIcon';
import { CareLocationBadge } from '../../components/CareLocationFields';
import { resolveServiceAccentColor } from '../../utils/serviceTypeSlug';
import {
  type AgendaAppointment,
  type AgendaCardSize,
  STATUS_META,
  agendaCardSizeFromHeight,
  formatHm,
  guardianFirstName,
  isPartnerCareLocation,
} from './agendaModel';

export type AgendaAppointmentCardVariant = 'day' | 'week' | 'month' | 'stay';

export interface AgendaAppointmentCardProps {
  appointment: AgendaAppointment;
  variant?: AgendaAppointmentCardVariant;
  heightPx?: number;
  /** Largura estimada do card na lane (para modo mínimo/compacto/completo). */
  widthPx?: number;
  /** Variante `stay`: período relativo ao dia (ex.: «entra 08:30»). */
  periodLabel?: string;
  selected?: boolean;
  draggable?: boolean;
  dragging?: boolean;
  showProfessional?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}

/** Fundo opaco (as linhas da grade não atravessam o card). */
function cardAccentStyle(color: string, tintPct = 7): React.CSSProperties {
  return {
    backgroundColor: `color-mix(in srgb, ${color} ${tintPct}%, #fff)`,
    borderLeft: `4px solid ${color}`,
    color: '#2d2424',
  };
}

function CardBadges({
  appt,
  compact,
  criticalOnly,
}: {
  appt: AgendaAppointment;
  compact?: boolean;
  /** Só conflito e encaixe/emergência (cards estreitos). */
  criticalOnly?: boolean;
}) {
  const badges: React.ReactNode[] = [];

  if (appt.isRecurring && !criticalOnly) {
    badges.push(
      <span key="recur" className="hub-agenda-card__badge" title="Parte de série recorrente">
        <RefreshCw size={compact ? 10 : 11} aria-hidden />
      </span>,
    );
  }

  if (!criticalOnly && appt.visitGroupSize != null && appt.visitGroupSize > 1) {
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

  if (!criticalOnly && appt.pickupPackage?.hasBefore) {
    badges.push(
      <span key="pickup-before" className="hub-agenda-card__badge" title="Leva e traz: busca">
        <Truck size={compact ? 10 : 11} aria-hidden />
      </span>,
    );
  }

  if (!criticalOnly && appt.pickupPackage?.hasAfter) {
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

  if (!criticalOnly && appt.financial_adjustment_pending) {
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

  if (!criticalOnly && isPartnerCareLocation(appt)) {
    badges.push(
      <span key="partner" className="hub-agenda-card__badge hub-agenda-card__badge--partner">
        <CareLocationBadge
          care_location_kind={appt.care_location_kind}
          partner_clinic={appt.partnerClinic ?? null}
        />
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
  widthPx,
  periodLabel,
  selected = false,
  draggable = false,
  dragging = false,
  showProfessional = false,
  onClick,
  onDragStart,
  onDragEnd,
}: AgendaAppointmentCardProps) {
  const color = resolveServiceAccentColor(a.agendaColor, a.group);
  const st = STATUS_META[a.status];
  const serviceLabel = a.displayServiceLabel ?? a.serviceName;
  const isWeek = variant === 'week';
  const isMonth = variant === 'month';
  const isStay = variant === 'stay';
  const accent = cardAccentStyle(color, isWeek || isMonth ? 7 : 11);
  const narrow = widthPx != null && widthPx < 140;

  const size: AgendaCardSize = isWeek || isMonth || isStay
    ? 'medium'
    : heightPx != null
      ? agendaCardSizeFromHeight(heightPx, widthPx)
      : 'tall';

  const classNames = [
    'hub-agenda-card',
    isWeek ? 'hub-agenda-card--week' : '',
    isMonth ? 'hub-agenda-card--month' : '',
    isStay ? 'hub-agenda-card--stay' : `hub-agenda-card--${size}`,
    selected ? 'hub-agenda-card--selected' : '',
    a.conflict ? 'hub-agenda-card--conflict' : '',
    isPartnerCareLocation(a) ? 'hub-agenda-card--partner' : '',
    draggable ? 'hub-agenda-card--draggable' : '',
    dragging ? 'hub-agenda-card--dragging' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const statusAria = st.label;
  const dragAttrs = {
    draggable,
    onDragStart,
    onDragEnd,
    title: draggable ? 'Arraste para remarcar horário ou dia' : undefined,
    'aria-label': `${a.petName}, ${serviceLabel}, ${formatHm(a.start)}, ${statusAria}`,
  };

  if (isStay) {
    return (
      <button
        type="button"
        {...dragAttrs}
        aria-label={`${a.petName}, ${serviceLabel}, ${periodLabel ?? formatHm(a.start)}, ${statusAria}`}
        className={classNames}
        style={accent}
        onClick={onClick}
      >
        <GroupIcons appt={a} color={color} size={12} />
        <span className="hub-agenda-card__pet hub-agenda-card__pet--inline">{a.petName}</span>
        {periodLabel ? <span className="hub-agenda-card__period">{periodLabel}</span> : null}
        <span
          className={`hub-agenda-card__status-dot hub-agenda-card__status-dot--${a.status}`}
          title={st.label}
        />
        <CardBadges appt={a} compact criticalOnly />
      </button>
    );
  }

  if (isMonth) {
    return (
      <button type="button" {...dragAttrs} className={classNames} style={accent} onClick={onClick}>
        <span className="hub-agenda-card__time hub-agenda-card__time--inline">{formatHm(a.start)}</span>
        <span className="hub-agenda-card__pet hub-agenda-card__pet--inline">{a.petName}</span>
        <span
          className={`hub-agenda-card__status-dot hub-agenda-card__status-dot--${a.status}`}
          title={st.label}
        />
      </button>
    );
  }

  if (isWeek) {
    return (
      <button type="button" {...dragAttrs} className={classNames} style={accent} onClick={onClick}>
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
      <button type="button" {...dragAttrs} className={classNames} style={accent} onClick={onClick}>
        <div className="hub-agenda-card__row hub-agenda-card__row--compact">
          {!narrow ? (
            <span className="hub-agenda-card__time hub-agenda-card__time--inline">{formatHm(a.start)}</span>
          ) : null}
          <span className="hub-agenda-card__pet hub-agenda-card__pet--inline">{a.petName}</span>
          <span
            className={`hub-agenda-card__status-dot hub-agenda-card__status-dot--${a.status}`}
            title={st.label}
          />
          <CardBadges appt={a} compact criticalOnly={narrow} />
        </div>
      </button>
    );
  }

  if (size === 'medium') {
    return (
      <button type="button" {...dragAttrs} className={classNames} style={accent} onClick={onClick}>
        <div className="hub-agenda-card__row hub-agenda-card__row--head">
          {!narrow ? <GroupIcons appt={a} color={color} size={14} /> : null}
          <span className="hub-agenda-card__time">
            {narrow ? formatHm(a.start) : `${formatHm(a.start)} – ${formatHm(a.end)}`}
          </span>
          <span
            className={`hub-agenda-card__status-dot hub-agenda-card__status-dot--${a.status}`}
            title={st.label}
          />
          <CardBadges appt={a} compact={narrow} criticalOnly={narrow} />
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
    <button type="button" {...dragAttrs} className={classNames} style={accent} onClick={onClick}>
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
