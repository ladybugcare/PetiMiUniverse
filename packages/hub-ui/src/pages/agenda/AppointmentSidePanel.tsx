import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Clock,
  User,
  Stethoscope,
  MoreHorizontal,
  Pencil,
  Dog,
} from 'lucide-react';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { FinancialAdjustmentPendingBadge } from '../../components/FinancialAdjustmentPendingBadge';
import type { HubAppointment } from '../../api/hubAgendaApi';
import type { HubStaffMember } from '../../api/hubStaffApi';
import type { HubServiceType } from '../../api/hubServiceTypesApi';
import {
  STATUS_META,
  STATUS_OPTIONS,
  canEditAgendaAppointment,
  formatHm,
  serviceGroupLabel,
  type AgendaAppointment,
  type AgendaStatus,
} from './agendaModel';
import { isOperationalClinicalGroup } from '../../utils/serviceTypeSlug';
import { resolveServiceAccentColor } from '../../utils/serviceTypeSlug';
import {
  appointmentKindLabel,
  buildPanelActions,
  displayAppointmentTitle,
  formatBrl,
  formatPanelDate,
} from './appointmentPanelActions';
import { resolveOperationalModuleForAppointment } from './walkInUtils';
import { mapAgendaToAppointmentInitial } from './mapHubAgenda';
import { NewAppointmentModal } from './NewAppointmentModal';
import './new-appointment-modal.css';

export type AppointmentSidePanelProps = {
  open: boolean;
  mode: 'view' | 'edit';
  appointment: AgendaAppointment;
  canWrite: boolean;
  onClose: () => void;
  onEdit: () => void;
  onBackToView: () => void;
  onStatusChange: (status: AgendaStatus) => void | Promise<void>;
  onDuplicate: () => void;
  onCancel: () => void;
  onOpenComanda?: (appointmentId: string) => void | Promise<void>;
  onOpenInClinic?: (appointmentId: string) => void | Promise<void>;
  onOpenInGrooming?: (appointmentId: string) => void | Promise<void>;
  onOpenInBoarding?: (appointmentId: string) => void | Promise<void>;
  canViewFinancial?: boolean;
  staffOptions: HubStaffMember[];
  serviceTypes: HubServiceType[];
  onUpdated: (appointment: HubAppointment) => void;
};

export const AppointmentSidePanel: React.FC<AppointmentSidePanelProps> = ({
  open,
  mode,
  appointment: appt,
  canWrite,
  onClose,
  onEdit,
  onBackToView,
  onStatusChange,
  onDuplicate,
  onCancel,
  onOpenComanda,
  onOpenInClinic,
  onOpenInGrooming,
  onOpenInBoarding,
  canViewFinancial = false,
  staffOptions,
  serviceTypes,
  onUpdated,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const editable = canEditAgendaAppointment(appt, { canWrite });
  const statusMeta = STATUS_META[appt.status];
  const accentColor = resolveServiceAccentColor(appt.agendaColor, appt.group);
  const durationMin = Math.round((appt.end.getTime() - appt.start.getTime()) / 60_000);
  const serviceLines = appt.services?.filter((s) => s.name || s.saleAmount != null || s.isAddon) ?? [];

  const statusOptions = useMemo<HubComboboxOption[]>(
    () => STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label })),
    [],
  );

  const operationalModule = useMemo(() => {
    const mod = resolveOperationalModuleForAppointment(appt);
    if (mod === 'clinical' && !onOpenInClinic) return null;
    if (mod === 'grooming' && !onOpenInGrooming) return null;
    if (mod === 'boarding' && !onOpenInBoarding) return null;
    return mod;
  }, [appt, onOpenInClinic, onOpenInGrooming, onOpenInBoarding]);

  const handlers = useMemo(
    () => ({
      onConfirm: () => void onStatusChange('confirmed'),
      onCheckIn: () => void onStatusChange('checked_in'),
      onComplete: () => void onStatusChange('done'),
      onOpenCheckout: () => undefined,
      onOpenComanda: () => void onOpenComanda?.(appt.id),
      onOpenInClinic: () => void onOpenInClinic?.(appt.id),
      onOpenInGrooming: () => void onOpenInGrooming?.(appt.id),
      onOpenInBoarding: () => void onOpenInBoarding?.(appt.id),
      onDuplicate,
      onCancel,
    }),
    [onStatusChange, onOpenComanda, onOpenInClinic, onOpenInGrooming, onOpenInBoarding, appt.id, onDuplicate, onCancel],
  );

  const canOpenComanda = !!onOpenComanda;
  const { primary, secondary, menu } = useMemo(
    () => buildPanelActions(appt.status, canWrite, handlers, operationalModule, canOpenComanda),
    [appt.status, canWrite, handlers, operationalModule, canOpenComanda],
  );

  const secondaryAsButton =
    secondary && secondary.key === 'duplicate' ? { ...secondary, variant: 'secondary' as const } : secondary;

  if (mode === 'edit') {
    return (
      <NewAppointmentModal
        open={open}
        mode="edit"
        appointmentId={appt.id}
        seriesId={appt.series_id ?? null}
        initial={mapAgendaToAppointmentInitial(appt)}
        onClose={onBackToView}
        onCreated={() => undefined}
        onUpdated={onUpdated}
        staffOptions={staffOptions}
        serviceTypes={serviceTypes}
      />
    );
  }

  const footer = (
    <>
      {editable ? (
        <button type="button" className="hub-btn hub-btn--secondary" onClick={onEdit}>
          <Pencil size={16} aria-hidden />
          Editar agendamento
        </button>
      ) : null}
      {primary ? (
        <button
          type="button"
          className="hub-btn hub-btn--primary"
          disabled={primary.disabled}
          onClick={() => {
            setMenuOpen(false);
            primary.onClick();
          }}
        >
          {primary.label}
        </button>
      ) : null}
      {secondaryAsButton ? (
        <button
          type="button"
          className="hub-btn hub-btn--secondary"
          disabled={secondaryAsButton.disabled}
          onClick={() => {
            setMenuOpen(false);
            secondaryAsButton.onClick();
          }}
        >
          {secondaryAsButton.label}
        </button>
      ) : null}
      {menu.length > 0 ? (
        <div className="hub-agenda-appt-panel__menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="hub-btn hub-btn--secondary hub-agenda-appt-panel__menu-btn"
            aria-label="Mais ações"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen ? (
            <div className="hub-agenda-appt-panel__menu" role="menu">
              {menu.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  className="hub-agenda-appt-panel__menu-item"
                  disabled={item.disabled}
                  onClick={() => {
                    setMenuOpen(false);
                    item.onClick();
                  }}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title={displayAppointmentTitle(appt)}
      titleIcon={<Calendar size={22} strokeWidth={2} aria-hidden />}
      subtitle={`${formatPanelDate(appt.start)} · ${formatHm(appt.start)}–${formatHm(appt.end)}`}
      footer={footer}
      aside={
        <div className="nam-aside">
          <p className="nam-aside__label">Resumo</p>
          <div className="nam-aside__section">
            <p className="nam-aside__section-title">Situação</p>
            <span className={`hub-agenda__pill ${statusMeta.pillClass}`}>{statusMeta.label}</span>
          </div>
          {serviceLines.length > 0 ? (
            <div className="nam-aside__section">
              <p className="nam-aside__section-title">Serviços</p>
              {serviceLines.map((s) => (
                <p key={s.id} className="nam-aside__item">
                  {s.isAddon ? `+ ${s.name}` : s.name} · {s.durationMin} min
                  {s.saleAmount != null ? ` · ${formatBrl(s.saleAmount)}` : ''}
                </p>
              ))}
              {appt.saleTotal != null && appt.saleTotal > 0 ? (
                <p className="nam-aside__muted">
                  Total: <strong>{formatBrl(appt.saleTotal)}</strong>
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="nam-aside__section">
            <p className="nam-aside__section-title">Duração</p>
            <p className="nam-aside__item">{durationMin} min</p>
          </div>
        </div>
      }
    >
      <div className="nam-form hub-agenda-appt-panel">
        <FinancialAdjustmentPendingBadge
          pending={Boolean(appt.financial_adjustment_pending)}
          showCaixaLink={canViewFinancial}
        />

        <div
          className="hub-agenda-appt-panel__accent"
          style={{ backgroundColor: `${accentColor}22`, borderLeftColor: accentColor }}
        />

        <div className="nam-section nam-section--quick">
          <div className="nam-quick-card">
            <div className="nam-row nam-row--cols2">
              <div className="nam-field">
                <label className="nam-label" htmlFor="hub-appt-view-status">
                  Situação
                </label>
                <HubSearchableCombobox
                  id="hub-appt-view-status"
                  options={statusOptions}
                  value={appt.status}
                  onChange={(v) => {
                    if (v && v !== appt.status) void onStatusChange(v as AgendaStatus);
                  }}
                  clearable={false}
                  disabled={!canWrite}
                  ariaLabel="Alterar situação do agendamento"
                />
              </div>
              <div className="nam-field">
                <label className="nam-label">Grupo</label>
                <div className="nam-readonly-value">{serviceGroupLabel(appt.group)}</div>
              </div>
            </div>
          </div>
        </div>

        {serviceLines.length > 0 ? (
          <div className="nam-section">
            <h3 className="nam-section-title">Serviços</h3>
            <ul className="hub-agenda-appt-panel__service-list">
              {serviceLines.map((s) => (
                <li key={s.id} className="hub-agenda-appt-panel__service-item">
                  <span>{s.isAddon ? `Adicional: ${s.name || '—'}` : s.name || 'Serviço'}</span>
                  <span className="hub-agenda-appt-panel__service-meta">
                    {s.durationMin} min
                    {s.saleAmount != null ? ` · ${formatBrl(s.saleAmount)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="nam-section">
          <h3 className="nam-section-title">Horário</h3>
          <div className="nam-quick-card">
            <div className="nam-readonly-row">
              <Clock size={16} aria-hidden />
              <span>
                {formatHm(appt.start)} – {formatHm(appt.end)} ({durationMin} min)
              </span>
            </div>
          </div>
        </div>

        <div className="nam-section">
          <h3 className="nam-section-title">Pet e tutor</h3>
          <div className="nam-quick-card">
            <div className="nam-readonly-row">
              <Dog size={16} aria-hidden />
              <span>{appt.petName}</span>
            </div>
            <div className="nam-readonly-row">
              <User size={16} aria-hidden />
              <span>{appt.guardianName}</span>
            </div>
            {appt.petId ? (
              <Link
                to={`/hub/clinica/prontuarios?petId=${encodeURIComponent(appt.petId)}`}
                className="hub-clientes__link hub-agenda-appt-panel__link"
              >
                Ver prontuário clínico
              </Link>
            ) : null}
            {appt.hubEncounterId ? (
              <p className="hub-clientes__muted" style={{ margin: '8px 0 0' }}>
                Atendimento clínico:{' '}
                <Link to={`/hub/clinica/atendimentos/${appt.hubEncounterId}`}>
                  {appt.hubEncounterStatus || 'aberto'}
                </Link>
              </p>
            ) : null}
          </div>
        </div>

        <div className="nam-section">
          <h3 className="nam-section-title">Equipe e local</h3>
          <div className="nam-quick-card">
            <div className="nam-readonly-row">
              <Stethoscope size={16} aria-hidden />
              <span>{appt.professionalName}</span>
            </div>
            <div className="nam-readonly-kv">
              <span className="hub-clientes__muted">Recurso</span>
              <span>{appt.resourceLabel}</span>
            </div>
            <div className="nam-readonly-kv">
              <span className="hub-clientes__muted">Unidade</span>
              <span>{appt.unitName}</span>
            </div>
            <div className="nam-readonly-kv">
              <span className="hub-clientes__muted">Tipo</span>
              <span>{appointmentKindLabel(appt.appointment_kind)}</span>
            </div>
          </div>
        </div>

        {appt.notes ? (
          <div className="nam-section">
            <h3 className="nam-section-title">Notas do atendimento</h3>
            <div className="nam-quick-card nam-quick-card--pre">{appt.notes}</div>
          </div>
        ) : null}

        {appt.financial_notes ? (
          <div className="nam-section">
            <h3 className="nam-section-title">
              Notas financeiras <span className="hub-agenda__internal-badge">interno</span>
            </h3>
            <div className="nam-quick-card nam-quick-card--pre">{appt.financial_notes}</div>
          </div>
        ) : null}

        {appt.conflict ? (
          <div className="nam-section hub-agenda-appt-panel__alert">
            <h3 className="nam-section-title">Conflito de horário</h3>
            <p>
              Este horário sobrepõe outro atendimento no mesmo profissional ou recurso. Ajuste horário ou
              recurso antes de confirmar.
            </p>
          </div>
        ) : null}

        {editable ? (
          <p className="hub-agenda-appt-panel__hint">Você também pode arrastar o card na grade para reagendar.</p>
        ) : null}

        {isOperationalClinicalGroup(appt.group) && (appt.hubEncounterId || onOpenInClinic) ? (
          <div className="hub-agenda-appt-panel__clinic-action">
            {appt.hubEncounterId ? (
              <Link
                to={`/hub/clinica/atendimentos/${appt.hubEncounterId}`}
                className="hub-btn hub-btn--primary hub-agenda-appt-panel__clinic-link"
              >
                <Stethoscope size={16} aria-hidden />
                Continuar na Clínica
              </Link>
            ) : onOpenInClinic ? (
              <button
                type="button"
                className="hub-btn hub-btn--primary hub-agenda-appt-panel__clinic-link"
                disabled={!canWrite}
                onClick={() => void onOpenInClinic(appt.id)}
              >
                <Stethoscope size={16} aria-hidden />
                Abrir na Clínica
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </HubSidePanel>
  );
};
