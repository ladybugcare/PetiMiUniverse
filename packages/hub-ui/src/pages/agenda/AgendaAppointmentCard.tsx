import React, { useRef } from 'react';
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
import { AGENDA_DRAG_THRESHOLD_PX } from './agendaPointerDrag';
import { clinicalAgendaOriginLabel } from './appointmentPanelActions';

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
  /** Pode iniciar arraste (cursor grab + handlers). */
  draggable?: boolean;
  dragging?: boolean;
  /** Motivo (tooltip) quando o card não pode ser arrastado. */
  dragBlockedReason?: string | null;
  showProfessional?: boolean;
  /** Exibe recurso/sala no card (útil fora da vista agrupada por recurso). */
  showResource?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  /** Pointer-based drag (substitui HTML5 DnD). */
  onDragPointerDown?: (e: React.PointerEvent) => void;
}

function resourceDisplayLabel(label: string | null | undefined): string | null {
  const t = (label ?? '').trim();
  if (!t || t === '—') return null;
  return t;
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
        <span className={`nam-visit-group-badge${compact ? ' nam-visit-group-badge--compact' : ''}`}>
          {compact ? appt.visitGroupSize : `${appt.visitGroupSize} pets`}
        </span>
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

  const clinicalOrigin = clinicalAgendaOriginLabel({
    appointment_kind: appt.appointment_kind,
    status: appt.status,
    serviceGroup: appt.group,
  });
  if (
    clinicalOrigin ||
    appt.appointment_kind === 'walk_in' ||
    appt.appointment_kind === 'clinical_walk_in' ||
    appt.appointment_kind === 'clinical_emergency'
  ) {
    badges.push(
      <span
        key="kind"
        className="hub-agenda-card__badge hub-agenda-card__badge--warn"
        title={clinicalOrigin || (appt.appointment_kind === 'clinical_emergency' ? 'Emergência' : 'Encaixe')}
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

function AgendaCardShell({
  className,
  style,
  ariaLabel,
  title,
  draggable,
  dragging,
  dragBlocked,
  onClick,
  onDragPointerDown,
  children,
}: {
  className: string;
  style: React.CSSProperties;
  ariaLabel: string;
  title?: string;
  draggable: boolean;
  dragging: boolean;
  dragBlocked: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onDragPointerDown?: (e: React.PointerEvent) => void;
  children: React.ReactNode;
}) {
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
    if (draggable && onDragPointerDown) {
      onDragPointerDown(e);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const start = pointerStartRef.current;
    if (!start || e.buttons === 0) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (dx * dx + dy * dy >= AGENDA_DRAG_THRESHOLD_PX * AGENDA_DRAG_THRESHOLD_PX) {
      movedRef.current = true;
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (dragging || movedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      movedRef.current = false;
      pointerStartRef.current = null;
      return;
    }
    onClick?.(e);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onClick?.(e as unknown as React.MouseEvent);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={className}
      style={style}
      title={title}
      aria-label={ariaLabel}
      aria-grabbed={draggable ? dragging : undefined}
      data-drag-blocked={dragBlocked ? 'true' : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {children}
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
  dragBlockedReason = null,
  showProfessional = false,
  showResource = false,
  onClick,
  onDragPointerDown,
}: AgendaAppointmentCardProps) {
  const color = resolveServiceAccentColor(a.agendaColor, a.group);
  const st = STATUS_META[a.status];
  const serviceLabel = a.displayServiceLabel ?? a.serviceName;
  const resourceLabel = showResource ? resourceDisplayLabel(a.resourceLabel) : null;
  const isWeek = variant === 'week';
  const isMonth = variant === 'month';
  const isStay = variant === 'stay';
  const accent = cardAccentStyle(color, isWeek || isMonth ? 7 : 11);
  const narrow = widthPx != null && widthPx < 140;
  const dragBlocked = Boolean(dragBlockedReason) && !draggable;

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
    dragBlocked ? 'hub-agenda-card--drag-blocked' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const statusAria = st.label;
  const title = draggable
    ? 'Arraste para remarcar horário ou dia'
    : dragBlockedReason || undefined;
  const ariaLabel = isStay
    ? `${a.petName}, ${serviceLabel}, ${periodLabel ?? formatHm(a.start)}, ${statusAria}`
    : [a.petName, serviceLabel, resourceLabel, formatHm(a.start), statusAria].filter(Boolean).join(', ');

  const shellProps = {
    className: classNames,
    style: accent,
    ariaLabel,
    title,
    draggable,
    dragging,
    dragBlocked,
    onClick,
    onDragPointerDown,
  };

  if (isStay) {
    return (
      <AgendaCardShell {...shellProps}>
        <GroupIcons appt={a} color={color} size={12} />
        <span className="hub-agenda-card__pet hub-agenda-card__pet--inline">{a.petName}</span>
        {periodLabel ? <span className="hub-agenda-card__period">{periodLabel}</span> : null}
        <span
          className={`hub-agenda-card__status-dot hub-agenda-card__status-dot--${a.status}`}
          title={st.label}
        />
        <CardBadges appt={a} compact criticalOnly />
      </AgendaCardShell>
    );
  }

  if (isMonth) {
    return (
      <AgendaCardShell {...shellProps}>
        <span className="hub-agenda-card__time hub-agenda-card__time--inline">{formatHm(a.start)}</span>
        <span className="hub-agenda-card__pet hub-agenda-card__pet--inline">{a.petName}</span>
        <span
          className={`hub-agenda-card__status-dot hub-agenda-card__status-dot--${a.status}`}
          title={st.label}
        />
      </AgendaCardShell>
    );
  }

  if (isWeek) {
    return (
      <AgendaCardShell {...shellProps}>
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
        {resourceLabel ? <div className="hub-agenda-card__resource">{resourceLabel}</div> : null}
      </AgendaCardShell>
    );
  }

  if (size === 'compact') {
    // Uma linha só: altura baixa (densidade C) não comporta 2ª/3ª linha sem cortar.
    const compactPet = resourceLabel && !narrow ? `${a.petName} · ${resourceLabel}` : a.petName;
    return (
      <AgendaCardShell {...shellProps}>
        <div className="hub-agenda-card__row hub-agenda-card__row--compact">
          {!narrow ? (
            <span className="hub-agenda-card__time hub-agenda-card__time--inline">{formatHm(a.start)}</span>
          ) : null}
          <span className="hub-agenda-card__pet hub-agenda-card__pet--inline">{compactPet}</span>
          <span
            className={`hub-agenda-card__status-dot hub-agenda-card__status-dot--${a.status}`}
            title={st.label}
          />
          <CardBadges appt={a} compact criticalOnly={narrow} />
        </div>
      </AgendaCardShell>
    );
  }

  if (size === 'medium') {
    return (
      <AgendaCardShell {...shellProps}>
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
          {resourceLabel ? (
            <span className="hub-agenda-card__resource-inline"> · {resourceLabel}</span>
          ) : null}
          {a.guardianName && a.guardianName !== '—' ? (
            <span className="hub-agenda-card__guardian"> · {guardianFirstName(a.guardianName)}</span>
          ) : null}
        </div>
      </AgendaCardShell>
    );
  }

  return (
    <AgendaCardShell {...shellProps}>
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
      {resourceLabel ? <div className="hub-agenda-card__resource">{resourceLabel}</div> : null}
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
    </AgendaCardShell>
  );
}
