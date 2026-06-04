import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, Clock, Heart, User, Stethoscope, MoreHorizontal, Copy, Ban } from 'lucide-react';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import {
  STATUS_OPTIONS,
  formatHm,
  serviceGroupLabel,
  type AgendaAppointment,
  type AgendaStatus,
} from './agendaModel';
import { isOperationalClinicalGroup } from '../../utils/serviceTypeSlug';
import { FinancialAdjustmentPendingBadge } from '../../components/FinancialAdjustmentPendingBadge';

export type AppointmentDetailPanelProps = {
  appointment: AgendaAppointment;
  canWrite: boolean;
  onClose: () => void;
  onStatusChange: (status: AgendaStatus) => void | Promise<void>;
  onDuplicate: () => void;
  onCancel: () => void;
  /** Abre o drawer de checkout (comanda) para este agendamento. */
  onOpenCheckout?: (appointmentId: string) => void | Promise<void>;
  /** Abre atendimento clínico (serviços do grupo clínica). */
  onOpenInClinic?: (appointmentId: string) => void | Promise<void>;
  /** Link «Ver no Caixa» no badge de ajuste financeiro. */
  canViewFinancial?: boolean;
};

function formatPanelDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function appointmentKindLabel(kind: string | undefined): string {
  if (kind === 'hotel_stay') return 'Hotel / hospedagem';
  if (kind === 'daycare_block') return 'Creche';
  if (kind === 'pickup_route') return 'Leva e traz';
  if (kind === 'clinical_walk_in') return 'Encaixe clínico (atendimento imediato)';
  if (kind === 'clinical_emergency') return 'Emergência na agenda';
  if (kind === 'standard') return 'Agendamento';
  return 'Atendimento';
}

function displayTitle(appt: AgendaAppointment): string {
  const pet = appt.petName && appt.petName !== '—' ? appt.petName : null;
  const svc = appt.serviceName || 'Serviço';
  if (!pet) return svc;
  const petSuffix = ` — ${pet}`;
  if (svc.endsWith(petSuffix)) return svc;
  return `${svc} — ${pet}`;
}

type PanelAction = {
  key: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'menu';
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
};

function buildPanelActions(
  status: AgendaStatus,
  canWrite: boolean,
  handlers: {
    onConfirm: () => void;
    onCheckIn: () => void;
    onComplete: () => void;
    onOpenCheckout: () => void;
    onOpenInClinic: () => void;
    onDuplicate: () => void;
    onCancel: () => void;
  },
  onOpenInClinic?: (id: string) => void,
): { primary: PanelAction | null; secondary: PanelAction | null; menu: PanelAction[] } {
  const dup: PanelAction = {
    key: 'duplicate',
    label: 'Duplicar',
    variant: 'menu',
    icon: <Copy size={14} />,
    onClick: handlers.onDuplicate,
    disabled: !canWrite,
  };
  const cancel: PanelAction = {
    key: 'cancel',
    label: 'Cancelar',
    variant: 'menu',
    icon: <Ban size={14} />,
    onClick: handlers.onCancel,
    disabled: !canWrite,
  };

  switch (status) {
    case 'pending_confirm':
      return {
        primary: canWrite
          ? { key: 'confirm', label: 'Confirmar', variant: 'primary', onClick: handlers.onConfirm }
          : null,
        secondary: null,
        menu: [dup, cancel],
      };
    case 'confirmed':
      return {
        primary: canWrite
          ? { key: 'checkin', label: 'Check-in', variant: 'primary', onClick: handlers.onCheckIn }
          : null,
        secondary: canWrite ? dup : null,
        menu: [cancel],
      };
    case 'checked_in':
      return {
        primary: canWrite && onOpenInClinic
          ? { key: 'open-clinic', label: 'Iniciar atendimento', variant: 'primary', onClick: handlers.onOpenInClinic }
          : canWrite
          ? { key: 'complete', label: 'Concluir', variant: 'primary', onClick: handlers.onComplete }
          : null,
        secondary: null,
        menu: [cancel],
      };
    case 'in_progress':
      return {
        primary: canWrite && onOpenInClinic
          ? { key: 'open-clinic', label: 'Continuar atendimento', variant: 'primary', onClick: handlers.onOpenInClinic }
          : canWrite
          ? { key: 'complete', label: 'Concluir', variant: 'primary', onClick: handlers.onComplete }
          : null,
        secondary: null,
        menu: [cancel],
      };
    case 'done':
      return {
        primary: canWrite
          ? { key: 'open-checkout', label: 'Abrir checkout', variant: 'primary', onClick: handlers.onOpenCheckout }
          : null,
        secondary: canWrite ? dup : null,
        menu: [],
      };
    case 'paid':
      return {
        primary: canWrite ? { ...dup, variant: 'primary' as const } : null,
        secondary: null,
        menu: [],
      };
    case 'cancelled':
      return {
        primary: canWrite ? { ...dup, variant: 'primary' as const } : null,
        secondary: null,
        menu: [],
      };
    default:
      return { primary: null, secondary: null, menu: [] };
  }
}

export const AppointmentDetailPanel: React.FC<AppointmentDetailPanelProps> = ({
  appointment: appt,
  canWrite,
  onClose,
  onStatusChange,
  onDuplicate,
  onCancel,
  onOpenCheckout,
  onOpenInClinic,
  canViewFinancial = false,
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

  const statusOptions = useMemo<HubComboboxOption[]>(
    () => STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label })),
    [],
  );

  const durationMin = Math.round((appt.end.getTime() - appt.start.getTime()) / 60_000);
  const serviceLines = appt.services?.filter((s) => s.name) ?? [];

  const handlers = useMemo(
    () => ({
      onConfirm: () => void onStatusChange('confirmed'),
      onCheckIn: () => void onStatusChange('checked_in'),
      onComplete: () => void onStatusChange('done'),
      onOpenCheckout: () => void onOpenCheckout?.(appt.id),
      onOpenInClinic: () => void onOpenInClinic?.(appt.id),
      onDuplicate,
      onCancel,
    }),
    [onStatusChange, onOpenCheckout, onOpenInClinic, appt.id, onDuplicate, onCancel],
  );

  const { primary, secondary, menu } = useMemo(() => {
    const base = buildPanelActions(appt.status, canWrite, handlers, onOpenInClinic);
    if (appt.status === 'done' && !onOpenCheckout) {
      return { ...base, primary: null };
    }
    return base;
  }, [appt.status, canWrite, handlers, onOpenCheckout, onOpenInClinic]);

  const secondaryAsButton =
    secondary && secondary.key === 'duplicate'
      ? { ...secondary, variant: 'secondary' as const }
      : secondary;

  return (
    <aside className="hub-agenda__panel" aria-label="Detalhe do atendimento">
      <div className="hub-agenda__panel-scroll">
        <div className="hub-agenda__panel-head">
          <div className="hub-agenda__panel-head-text">
            <h2 className="hub-agenda__panel-title">{displayTitle(appt)}</h2>
            <p className="hub-agenda__panel-subtitle">
              {formatPanelDate(appt.start)} · {formatHm(appt.start)}–{formatHm(appt.end)}
            </p>
          </div>
          <button type="button" className="hub-agenda__panel-close" aria-label="Fechar painel" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <FinancialAdjustmentPendingBadge
          pending={Boolean(appt.financial_adjustment_pending)}
          showCaixaLink={canViewFinancial}
        />

        <div className="hub-agenda__panel-status-row">
          <label className="hub-agenda__panel-status-label" htmlFor="hub-appt-status">
            Situação
          </label>
          <HubSearchableCombobox
            id="hub-appt-status"
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

        {serviceLines.length > 0 ? (
          <div className="hub-agenda__panel-section">
            <h4>Serviços</h4>
            <ul className="hub-agenda__service-list">
              {serviceLines.map((s) => (
                <li key={s.id} className="hub-agenda__service-list-item">
                  <span className="hub-agenda__service-list-name">{s.name}</span>
                  <span className="hub-agenda__service-list-meta">
                    {s.durationMin} min
                    {s.saleAmount != null ? ` · ${formatBrl(s.saleAmount)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            {appt.saleTotal != null && appt.saleTotal > 0 ? (
              <p className="hub-agenda__service-total">
                Total estimado: <strong>{formatBrl(appt.saleTotal)}</strong>
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="hub-agenda__panel-section">
          <h4>Horário e duração</h4>
          <div className="hub-agenda__panel-kv">
            <Clock size={14} className="hub-agenda__panel-kv-icon" aria-hidden />
            {formatHm(appt.start)} – {formatHm(appt.end)} ({durationMin} min)
          </div>
        </div>

        <div className="hub-agenda__panel-section">
          <h4>Pet e tutor</h4>
          <div className="hub-agenda__panel-kv">
            <Heart size={14} className="hub-agenda__panel-kv-icon" aria-hidden />
            {appt.petName}
            <br />
            <User size={14} className="hub-agenda__panel-kv-icon" aria-hidden />
            {appt.guardianName}
          </div>
          {appt.petId ? (
            <p className="hub-agenda__panel-actions">
              <Link
                to={`/hub/clinica/prontuarios?petId=${encodeURIComponent(appt.petId)}`}
                className="hub-clientes__link"
              >
                Ver prontuário clínico
              </Link>
            </p>
          ) : null}
          {appt.hubEncounterId ? (
            <p className="hub-clientes__muted" style={{ marginTop: 8 }}>
              Atendimento clínico:{' '}
              <Link to={`/hub/clinica/atendimentos/${appt.hubEncounterId}`}>
                {appt.hubEncounterStatus || 'aberto'}
              </Link>
            </p>
          ) : null}
        </div>

        <div className="hub-agenda__panel-section">
          <h4>Equipe e local</h4>
          <div className="hub-agenda__panel-kv">
            <Stethoscope size={14} className="hub-agenda__panel-kv-icon" aria-hidden />
            {appt.professionalName}
            <br />
            <span className="hub-clientes__muted">Recurso:</span> {appt.resourceLabel}
            <br />
            <span className="hub-clientes__muted">Unidade:</span> {appt.unitName}
            <br />
            <span className="hub-clientes__muted">Grupo:</span> {serviceGroupLabel(appt.group)}
            <br />
            <span className="hub-clientes__muted">Tipo:</span> {appointmentKindLabel(appt.appointment_kind)}
          </div>
        </div>

        {appt.notes ? (
          <div className="hub-agenda__panel-section">
            <h4>Notas do atendimento</h4>
            <div className="hub-agenda__panel-kv hub-agenda__panel-kv--pre">{appt.notes}</div>
          </div>
        ) : null}

        {appt.financial_notes ? (
          <div className="hub-agenda__panel-section">
            <h4>
              Notas financeiras{' '}
              <span className="hub-agenda__internal-badge">interno</span>
            </h4>
            <div className="hub-agenda__panel-kv hub-agenda__panel-kv--pre">{appt.financial_notes}</div>
          </div>
        ) : null}

        {appt.conflict ? (
          <div className="hub-agenda__panel-section hub-agenda__panel-section--alert">
            <h4>Conflito de horário</h4>
            <div className="hub-agenda__panel-kv">
              Este horário sobrepõe outro atendimento no mesmo profissional ou recurso. Ajuste horário ou
              recurso antes de confirmar.
            </div>
          </div>
        ) : null}

        {canWrite && appt.status === 'confirmed' ? (
          <p className="hub-agenda__panel-hint">Arraste o card na grelha para reagendar.</p>
        ) : null}

        {isOperationalClinicalGroup(appt.group) ? (
          <div className="hub-agenda__panel-section">
            {appt.hubEncounterId ? (
              <Link
                to={`/hub/clinica/atendimentos/${appt.hubEncounterId}`}
                className="hub-agenda__action hub-agenda__action--primary"
              >
                Continuar na Clínica
              </Link>
            ) : onOpenInClinic ? (
              <button
                type="button"
                className="hub-agenda__action hub-agenda__action--primary"
                disabled={!canWrite}
                onClick={() => void onOpenInClinic(appt.id)}
              >
                Abrir na Clínica
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="hub-agenda__panel-actions">
          {primary ? (
            <button
              type="button"
              className="hub-agenda__action hub-agenda__action--primary"
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
              className="hub-agenda__action"
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
            <div className="hub-agenda__action-menu-wrap" ref={menuRef}>
              <button
                type="button"
                className="hub-agenda__action hub-agenda__action--icon"
                aria-label="Mais acções"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
              >
                <MoreHorizontal size={16} />
              </button>
              {menuOpen ? (
                <div className="hub-agenda__action-menu" role="menu">
                  {menu.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      role="menuitem"
                      className="hub-agenda__action-menu-item"
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
        </div>
      </div>
    </aside>
  );
};
