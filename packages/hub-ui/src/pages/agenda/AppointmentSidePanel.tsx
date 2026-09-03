import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { getStoredClinicId } from '@petimi/web-core';
import {
  Calendar,
  Clock,
  User,
  Stethoscope,
  Pencil,
  Dog,
  ExternalLink,
} from 'lucide-react';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { FinancialAdjustmentPendingBadge } from '../../components/FinancialAdjustmentPendingBadge';
import { useAlert } from '../../components/AlertProvider';
import { hubAgendaApi, type HubAppointment, type HubSeriesEndingSoon } from '../../api/hubAgendaApi';
import type { HubStaffMember } from '../../api/hubStaffApi';
import type { HubServiceType } from '../../api/hubServiceTypesApi';
import {
  STATUS_META,
  canEditAgendaAppointment,
  formatHm,
  isPartnerCareLocation,
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
import { mapExtraBlocksToInitial } from './extraBlockAgendaUtils';
import { NewAppointmentModal } from './NewAppointmentModal';
import { PetBehaviorTagsDisplay } from '../pets/PetBehaviorTagsDisplay';
import {
  COAT_TYPE_LABELS,
  PORTE_LABELS,
  type CoatTypeValue,
  type PorteValue,
} from '../../utils/hubServiceTypesPricingMatrix';
import './new-appointment-modal.css';
import '../pets/pets-page.css';

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
  onViewComanda?: (comandaId: string) => void;
  onOpenInClinic?: (appointmentId: string) => void | Promise<void>;
  onOpenInGrooming?: (appointmentId: string) => void | Promise<void>;
  onOpenInBoarding?: (appointmentId: string) => void | Promise<void>;
  canViewFinancial?: boolean;
  staffOptions: HubStaffMember[];
  serviceTypes: HubServiceType[];
  onUpdated: (appointment: HubAppointment) => void;
  extraBlockChildren?: AgendaAppointment[];
  seriesEndingInfo?: HubSeriesEndingSoon | null;
  onRenewSeries?: () => void;
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
  onViewComanda,
  onOpenInClinic,
  onOpenInGrooming,
  onOpenInBoarding,
  canViewFinancial = false,
  staffOptions,
  serviceTypes,
  onUpdated,
  extraBlockChildren = [],
  seriesEndingInfo = null,
  onRenewSeries,
}) => {
  const { showError } = useAlert();
  const clinicId = getStoredClinicId();
  const [staffSaving, setStaffSaving] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesDraft, setNotesDraft] = useState(appt.notes ?? '');
  const [seriesStaffPickerOpen, setSeriesStaffPickerOpen] = useState(false);
  const pendingStaffIdRef = useRef<string | null>(null);

  useEffect(() => {
    setNotesDraft(appt.notes ?? '');
  }, [appt.id, appt.notes]);

  const editable = canEditAgendaAppointment(appt, { canWrite });
  const statusMeta = STATUS_META[appt.status];
  const accentColor = resolveServiceAccentColor(appt.agendaColor, appt.group);
  const durationMin = Math.round((appt.end.getTime() - appt.start.getTime()) / 60_000);
  const serviceLines = appt.services?.filter((s) => s.name || s.saleAmount != null || s.isAddon) ?? [];

  const petMetaChips = useMemo(() => {
    const chips: string[] = [];
    if (appt.petSpecies) chips.push(appt.petSpecies);
    if (appt.petBreed) chips.push(appt.petBreed);
    if (appt.petSizeTier) {
      chips.push(PORTE_LABELS[appt.petSizeTier as PorteValue] ?? appt.petSizeTier);
    }
    if (appt.petCoatType) {
      chips.push(COAT_TYPE_LABELS[appt.petCoatType as CoatTypeValue] ?? appt.petCoatType);
    }
    return chips;
  }, [appt.petSpecies, appt.petBreed, appt.petSizeTier, appt.petCoatType]);

  const notesDirty = notesDraft.trim() !== (appt.notes ?? '').trim();

  const staffComboOptions = useMemo<HubComboboxOption[]>(() => {
    const eligible = staffOptions.filter((s) => s.active && s.accepts_appointments);
    const rows: HubComboboxOption[] = [{ value: '', label: 'Não atribuído' }];
    for (const s of eligible) {
      rows.push({ value: s.id, label: s.display_name ?? s.full_name });
    }
    if (appt.professionalId && !rows.some((r) => r.value === appt.professionalId)) {
      rows.push({ value: appt.professionalId, label: appt.professionalName || 'Profissional atual' });
    }
    return rows;
  }, [staffOptions, appt.professionalId, appt.professionalName]);

  const operationalModule = useMemo(() => {
    const mod = resolveOperationalModuleForAppointment(appt);
    if (mod === 'clinical' && !onOpenInClinic) return null;
    if (mod === 'grooming' && !onOpenInGrooming) return null;
    if (mod === 'boarding' && !onOpenInBoarding) return null;
    return mod;
  }, [appt, onOpenInClinic, onOpenInGrooming, onOpenInBoarding]);

  const existingComandaId = appt.comanda_id ?? null;

  const handlers = useMemo(
    () => ({
      onConfirm: () => void onStatusChange('confirmed'),
      onCheckIn: () => void onStatusChange('checked_in'),
      onComplete: () => void onStatusChange('done'),
      onOpenCheckout: () => undefined,
      onOpenComanda: () => void onOpenComanda?.(appt.id),
      onViewComanda: () => {
        if (existingComandaId) onViewComanda?.(existingComandaId);
      },
      onOpenInClinic: () => void onOpenInClinic?.(appt.id),
      onOpenInGrooming: () => void onOpenInGrooming?.(appt.id),
      onOpenInBoarding: () => void onOpenInBoarding?.(appt.id),
      onDuplicate,
      onCancel,
    }),
    [
      onStatusChange,
      onOpenComanda,
      onViewComanda,
      onOpenInClinic,
      onOpenInGrooming,
      onOpenInBoarding,
      appt.id,
      existingComandaId,
      onDuplicate,
      onCancel,
    ],
  );

  const canOpenComanda = !!onOpenComanda;
  const { primary, comanda, utilities } = useMemo(
    () =>
      buildPanelActions(
        appt.status,
        canWrite,
        handlers,
        operationalModule,
        canOpenComanda,
        existingComandaId,
        !!onViewComanda,
      ),
    [appt.status, canWrite, handlers, operationalModule, canOpenComanda, existingComandaId, onViewComanda],
  );

  const patchStaff = async (staffId: string, scope: 'this' | 'future' | 'all') => {
    if (!clinicId || !canWrite) return;
    setStaffSaving(true);
    try {
      const { appointment } = await hubAgendaApi.patch(
        appt.id,
        {
          clinic_id: clinicId,
          hub_staff_member_id: staffId || null,
        },
        { scope },
      );
      onUpdated(appointment);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao atualizar profissional');
    } finally {
      setStaffSaving(false);
      setSeriesStaffPickerOpen(false);
      pendingStaffIdRef.current = null;
    }
  };

  const onStaffChange = (nextId: string) => {
    if (!editable || !clinicId) return;
    const current = appt.professionalId ?? '';
    if (nextId === current) return;
    if (appt.series_id) {
      pendingStaffIdRef.current = nextId;
      setSeriesStaffPickerOpen(true);
      return;
    }
    void patchStaff(nextId, 'this');
  };

  const saveNotes = async () => {
    if (!clinicId || !canWrite || !notesDirty) return;
    setNotesSaving(true);
    try {
      const { appointment } = await hubAgendaApi.patch(appt.id, {
        clinic_id: clinicId,
        notes: notesDraft.trim() || null,
      });
      onUpdated(appointment);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar observações');
    } finally {
      setNotesSaving(false);
    }
  };

  if (mode === 'edit') {
    return (
      <NewAppointmentModal
        open={open}
        mode="edit"
        appointmentId={appt.id}
        seriesId={appt.series_id ?? null}
        initial={{
          ...mapAgendaToAppointmentInitial(appt),
          extra_blocks: mapExtraBlocksToInitial(extraBlockChildren),
        }}
        onClose={onBackToView}
        onCreated={() => undefined}
        onUpdated={onUpdated}
        staffOptions={staffOptions}
        serviceTypes={serviceTypes}
      />
    );
  }

  const footer = (
    <div className="hub-agenda-appt-panel__footer-actions">
      {utilities.map((item) => (
        <button
          key={item.key}
          type="button"
          className={
            item.variant === 'ghost' || item.key === 'cancel'
              ? 'hub-btn hub-btn--ghost'
              : 'hub-btn hub-btn--secondary'
          }
          disabled={item.disabled}
          onClick={item.onClick}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
      {comanda ? (
        <button
          type="button"
          className="hub-btn hub-btn--secondary"
          disabled={comanda.disabled}
          onClick={comanda.onClick}
        >
          {comanda.icon}
          {comanda.label}
        </button>
      ) : null}
      {primary ? (
        <button
          type="button"
          className="hub-btn hub-btn--primary"
          disabled={primary.disabled}
          onClick={primary.onClick}
        >
          {primary.icon}
          {primary.label}
        </button>
      ) : null}
    </div>
  );

  const seriesStaffOverlay = seriesStaffPickerOpen
    ? createPortal(
        <div className="hub-agenda-series-scope" role="dialog" aria-modal="true" aria-label="Escopo da série">
          <div className="hub-agenda-series-scope__card">
            <h3 className="hub-agenda-series-scope__title">Aplicar troca de profissional em</h3>
            <p className="hub-agenda-series-scope__hint">Este agendamento faz parte de uma série recorrente.</p>
            <div className="hub-agenda-series-scope__actions">
              <button
                type="button"
                className="hub-btn hub-btn--secondary"
                disabled={staffSaving}
                onClick={() => {
                  const id = pendingStaffIdRef.current;
                  if (id != null) void patchStaff(id, 'this');
                }}
              >
                Só este agendamento
              </button>
              <button
                type="button"
                className="hub-btn hub-btn--secondary"
                disabled={staffSaving}
                onClick={() => {
                  const id = pendingStaffIdRef.current;
                  if (id != null) void patchStaff(id, 'future');
                }}
              >
                Este e os futuros
              </button>
              <button
                type="button"
                className="hub-btn hub-btn--primary"
                disabled={staffSaving}
                onClick={() => {
                  const id = pendingStaffIdRef.current;
                  if (id != null) void patchStaff(id, 'all');
                }}
              >
                Toda a série
              </button>
            </div>
            <button
              type="button"
              className="hub-agenda-series-scope__cancel"
              onClick={() => {
                setSeriesStaffPickerOpen(false);
                pendingStaffIdRef.current = null;
              }}
            >
              Voltar
            </button>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <HubSidePanel
        open={open}
        onClose={onClose}
        title={displayAppointmentTitle(appt)}
        titleIcon={<Calendar size={22} strokeWidth={2} aria-hidden />}
        subtitle={`${formatPanelDate(appt.start)} · ${formatHm(appt.start)}–${formatHm(appt.end)}`}
        headerActions={
          editable ? (
            <button
              type="button"
              className="hub-side-panel__header-btn"
              onClick={onEdit}
              aria-label="Editar agendamento"
              title="Editar agendamento"
            >
              <Pencil size={16} aria-hidden />
            </button>
          ) : null
        }
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

          <div className="hub-agenda-appt-panel__strip">
            <span className={`hub-agenda__pill ${statusMeta.pillClass}`}>{statusMeta.label}</span>
            <span className="hub-agenda-appt-panel__strip-sep" aria-hidden>
              ·
            </span>
            <span>{serviceGroupLabel(appt.group)}</span>
            <span className="hub-agenda-appt-panel__strip-sep" aria-hidden>
              ·
            </span>
            <span className="hub-agenda-appt-panel__strip-time">
              <Clock size={14} aria-hidden />
              {formatHm(appt.start)}–{formatHm(appt.end)} ({durationMin} min)
            </span>
          </div>

          {serviceLines.length > 0 ? (
            <div className="nam-section hub-agenda-appt-panel__sec">
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

          <div className="nam-section hub-agenda-appt-panel__sec">
            <div className="hub-agenda-appt-panel__sec-head">
              <h3 className="nam-section-title">Pet e tutor</h3>
              {appt.petId ? (
                <Link to={`/hub/pets/${appt.petId}`} className="hub-agenda-appt-panel__pet-link">
                  Ver ficha
                  <ExternalLink size={12} aria-hidden />
                </Link>
              ) : null}
            </div>
            <div className="nam-quick-card hub-agenda-appt-panel__card">
              <div className="hub-agenda-appt-panel__identity">
                <div className="nam-readonly-row">
                  <Dog size={16} aria-hidden />
                  <span>
                    <strong>{appt.petName}</strong>
                    {petMetaChips.length > 0 ? (
                      <span className="hub-agenda-appt-panel__meta"> · {petMetaChips.join(' · ')}</span>
                    ) : null}
                  </span>
                </div>
                <div className="nam-readonly-row">
                  <User size={16} aria-hidden />
                  <span>{appt.guardianName}</span>
                </div>
              </div>
              {(appt.petBehaviorTags?.length ?? 0) > 0 ? (
                <PetBehaviorTagsDisplay tags={appt.petBehaviorTags ?? []} />
              ) : (
                <p className="hub-agenda-appt-panel__empty-hint">
                  Sem tags de comportamento na ficha do pet.
                </p>
              )}
              {appt.hubEncounterId ? (
                <p className="hub-agenda-appt-panel__encounter">
                  Atendimento clínico:{' '}
                  <Link to={`/hub/clinica/atendimentos/${appt.hubEncounterId}`}>
                    {appt.hubEncounterStatus || 'aberto'}
                  </Link>
                </p>
              ) : null}
            </div>
          </div>

          <div className="nam-section hub-agenda-appt-panel__sec">
            <h3 className="nam-section-title">Observações do atendimento</h3>
            <div className="nam-quick-card hub-agenda-appt-panel__card">
              {canWrite ? (
                <>
                  <textarea
                    className="nam-textarea hub-agenda-appt-panel__notes"
                    rows={2}
                    maxLength={8000}
                    placeholder="Comportamento no dia, avisos da recepção, preferências…"
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    disabled={notesSaving}
                  />
                  {notesDirty ? (
                    <div className="hub-agenda-appt-panel__notes-actions">
                      <button
                        type="button"
                        className="hub-btn hub-btn--ghost"
                        disabled={notesSaving}
                        onClick={() => setNotesDraft(appt.notes ?? '')}
                      >
                        Descartar
                      </button>
                      <button
                        type="button"
                        className="hub-btn hub-btn--secondary"
                        disabled={notesSaving}
                        onClick={() => void saveNotes()}
                      >
                        {notesSaving ? 'Salvando…' : 'Salvar observações'}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : appt.notes ? (
                <div className="nam-quick-card--pre" style={{ padding: 0, border: 'none', boxShadow: 'none' }}>
                  {appt.notes}
                </div>
              ) : (
                <p className="hub-agenda-appt-panel__empty-hint">Nenhuma observação neste atendimento.</p>
              )}
            </div>
          </div>

          <div className="nam-section hub-agenda-appt-panel__sec">
            <h3 className="nam-section-title">Equipe e local</h3>
            <div className="nam-quick-card hub-agenda-appt-panel__card">
              {editable ? (
                <div className="nam-field hub-agenda-appt-panel__staff-field">
                  <label className="nam-label" htmlFor="hub-appt-quick-staff">
                    Profissional
                  </label>
                  <HubSearchableCombobox
                    id="hub-appt-quick-staff"
                    options={staffComboOptions}
                    value={appt.professionalId ?? ''}
                    onChange={onStaffChange}
                    clearable={false}
                    disabled={staffSaving}
                    triggerIcon={<Stethoscope size={18} strokeWidth={2} aria-hidden />}
                    ariaLabel="Trocar profissional"
                  />
                </div>
              ) : (
                <div className="nam-readonly-row">
                  <Stethoscope size={16} aria-hidden />
                  <span>{appt.professionalName}</span>
                </div>
              )}
              <div className="hub-agenda-appt-panel__kv-grid">
                <div className="nam-readonly-kv">
                  <span className="hub-clientes__muted">Recurso</span>
                  <span>{appt.resourceLabel}</span>
                </div>
                <div className="nam-readonly-kv">
                  <span className="hub-clientes__muted">Unidade</span>
                  <span>
                    {isPartnerCareLocation(appt)
                      ? `Parceira${appt.partnerClinic?.name ? `: ${appt.partnerClinic.name}` : ''}`
                      : appt.unitName}
                  </span>
                </div>
                <div className="nam-readonly-kv">
                  <span className="hub-clientes__muted">Tipo</span>
                  <span>{appointmentKindLabel(appt.appointment_kind)}</span>
                </div>
              </div>
              {editable ? (
                <button type="button" className="hub-agenda-appt-panel__link-btn" onClick={onEdit}>
                  Editar horário, serviços e demais detalhes
                </button>
              ) : null}
            </div>
          </div>

          {appt.financial_notes ? (
            <div className="nam-section hub-agenda-appt-panel__sec">
              <h3 className="nam-section-title">
                Notas financeiras <span className="hub-agenda__internal-badge">interno</span>
              </h3>
              <div className="nam-quick-card hub-agenda-appt-panel__card nam-quick-card--pre">{appt.financial_notes}</div>
            </div>
          ) : null}

          {seriesEndingInfo ? (
            <div className="nam-section hub-agenda-appt-panel__alert hub-agenda-appt-panel__alert--info">
              <h3 className="nam-section-title">Série recorrente a terminar</h3>
              <p>
                Restam {seriesEndingInfo.remaining_count}{' '}
                {seriesEndingInfo.remaining_count === 1 ? 'ocorrência' : 'ocorrências'} nesta série. Renove para
                continuar o agendamento recorrente.
              </p>
              {canWrite && onRenewSeries ? (
                <button type="button" className="hub-btn hub-btn--secondary" onClick={onRenewSeries}>
                  Renovar série
                </button>
              ) : null}
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
      {seriesStaffOverlay}
    </>
  );
};
