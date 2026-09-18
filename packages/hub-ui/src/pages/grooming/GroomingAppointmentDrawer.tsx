import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Clock,
  ExternalLink,
  Loader,
  MessageCircle,
  Scissors,
  User,
} from 'lucide-react';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import {
  hubGroomingApi,
  type GroomingDayBoardItem,
  type GroomingSessionDrawerResponse,
  type GroomingSessionEvent,
} from '../../api/hubGroomingApi';
import { getStoredClinicId } from '@petimi/web-core';
import { useAlert } from '../../components/AlertProvider';
import { petAgeDetailedLabel } from '../pets/petAge';
import { PORTE_LABELS, type PetBodyPorteValue } from '../../utils/hubServiceTypesPricingMatrix';
import {
  GROOMING_STAGE_LABELS,
  getItemBoardStage,
  resolveGroomingQuickAction,
  type GroomingQuickAction,
  type GroomingStage,
} from './groomingStages';
import { FinancialAdjustmentPendingBadge } from '../../components/FinancialAdjustmentPendingBadge';
import { buildWhatsappLink } from '../../utils/whatsappLink';
import { formatBrPhoneDisplay } from '../../utils/formatBrPhone';
import { renderTemplate } from '../../utils/hubMessageTemplates';
import { useMessageTemplates } from '../../utils/useMessageTemplates';
import { logMessageAttempt } from '../../api/hubMessageLogsApi';
import { PetOperationalAddAlert } from '../pets/PetOperationalAddAlert';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';

const ADVANCE_LABEL: Partial<Record<GroomingStage, string>> = {
  scheduled: 'Check-in',
  checked_in: 'Enviar para fila',
  queued: 'Iniciar atendimento',
  in_service: 'Ir para finalização',
  finishing: 'Marcar pronto',
  ready: 'Registrar entrega',
  delivered: 'Encerrar',
};

export type GroomingAppointmentDrawerProps = {
  item: GroomingDayBoardItem | null;
  open: boolean;
  canWrite: boolean;
  /** Pausar/retomar sessão (`grooming.queue.manage`); não exige `hub.appointments.write`. */
  canPauseQueue?: boolean;
  onPauseToggle?: (item: GroomingDayBoardItem) => void | Promise<void>;
  /** Mostrar preços R$ no drawer (exige `hub.service_types.write` na página). */
  showOperationalPricing?: boolean;
  onClose: () => void;
  onQuickAction: (item: GroomingDayBoardItem, action: GroomingQuickAction) => void | Promise<void>;
  onSessionUpdated?: () => void;
  busy?: boolean;
  /** Abre checkout (comanda) da sessão de Banho & Tosa. */
  onOpenCheckout?: () => void;
  /** Exibir botão de checkout (ex.: permissão + unidade resolvida). */
  checkoutEnabled?: boolean;
  canViewFinancial?: boolean;
  /** Priorizar/despriorizar sessão (ação movida do card para o drawer). */
  onTogglePriority?: (item: GroomingDayBoardItem) => void | Promise<void>;
  /** Recepção/gestão lança adicional na comanda. */
  canAddExtras?: boolean;
  /** Salão avisa a recepção para pedir autorização de outro serviço. */
  canRequestServices?: boolean;
};

function formatHm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatEventAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatBrl(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function stageBadgeVariant(stage: GroomingStage): string {
  if (stage === 'ready') return 'ready';
  if (stage === 'delivered' || stage === 'closed') return 'done';
  if (stage === 'in_service' || stage === 'finishing') return 'progress';
  if (stage === 'queued' || stage === 'checked_in') return 'waiting';
  return 'neutral';
}

function petInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'P';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

const GroomingAppointmentDrawer: React.FC<GroomingAppointmentDrawerProps> = ({
  item,
  open,
  canWrite,
  canPauseQueue = false,
  onPauseToggle,
  showOperationalPricing = false,
  onClose,
  onQuickAction,
  onSessionUpdated,
  onOpenCheckout: _onOpenCheckout,
  checkoutEnabled: _checkoutEnabled = false,
  canViewFinancial = false,
  onTogglePriority,
  canAddExtras = false,
  canRequestServices = false,
  busy,
}) => {
  const { showError, showSuccess } = useAlert();
  const clinicId = getStoredClinicId();
  const templateOverrides = useMessageTemplates();
  const [events, setEvents] = useState<GroomingSessionEvent[]>([]);
  const [noteBusy, setNoteBusy] = useState(false);
  const [drawer, setDrawer] = useState<GroomingSessionDrawerResponse | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [operationalDraft, setOperationalDraft] = useState('');
  const [operationalBusy, setOperationalBusy] = useState(false);
  const [checklistBusyKey, setChecklistBusyKey] = useState<string | null>(null);
  const [lineBusyId, setLineBusyId] = useState<string | null>(null);
  const [extraAddonId, setExtraAddonId] = useState('');
  const [requestServiceId, setRequestServiceId] = useState('');
  const [extraBusy, setExtraBusy] = useState(false);

  const stage = item ? getItemBoardStage(item) : 'scheduled';
  const quick = item ? resolveGroomingQuickAction(item, canWrite) : null;
  const pauseEligible =
    Boolean(canPauseQueue && onPauseToggle && item?.session_id) &&
    (stage === 'in_service' || stage === 'finishing');

  const auditStaffId = item?.hub_staff_member_id ?? null;

  const refreshDrawer = useCallback(async () => {
    if (!clinicId || !item?.session_id) return;
    setDrawerLoading(true);
    try {
      const d = await hubGroomingApi.sessionDrawer(item.session_id, clinicId);
      setDrawer(d);
      setOperationalDraft((d.session?.operational_notes as string | null) ?? '');
    } catch {
      setDrawer(null);
    } finally {
      setDrawerLoading(false);
    }
  }, [clinicId, item?.session_id]);

  useEffect(() => {
    if (!open || !item?.session_id || !clinicId) {
      setEvents([]);
      setDrawer(null);
      return;
    }
    void hubGroomingApi
      .listEvents(item.session_id, clinicId)
      .then((r) => setEvents(r.events ?? []))
      .catch(() => setEvents([]));
    void refreshDrawer();
  }, [open, item?.session_id, clinicId, item?.grooming_stage, item?.paused_at, refreshDrawer]);

  const primaryLabel = useMemo(() => {
    if (!quick || !item) return null;
    if (quick.type === 'confirm_appointment') return 'Confirmar agendamento';
    if (quick.type === 'check_in') {
      if (stage === 'queued') return 'Iniciar';
      if (stage === 'checked_in') return 'Enviar para fila';
      return 'Check-in';
    }
    return ADVANCE_LABEL[stage] || 'Avançar';
  }, [quick, item, stage]);

  const checklistRows = drawer?.checklist ?? [];

  const persistChecklistKey = async (key: string, done: boolean) => {
    if (!clinicId || !item?.session_id) return;
    setChecklistBusyKey(key);
    try {
      const cur = (drawer?.session?.checklist as Record<string, { done: boolean }> | undefined) ?? {};
      const next = { ...cur, [key]: { done } };
      await hubGroomingApi.patchSession(item.session_id, { clinic_id: clinicId, checklist: next });
      await refreshDrawer();
      onSessionUpdated?.();
    } finally {
      setChecklistBusyKey(null);
    }
  };

  const toggleLineExecuted = async (lineId: string, executed: boolean) => {
    if (!clinicId) return;
    setLineBusyId(lineId);
    try {
      await hubGroomingApi.patchAppointmentServiceLine(lineId, {
        clinic_id: clinicId,
        executed,
        executed_by_staff_id: auditStaffId,
      });
      await refreshDrawer();
      onSessionUpdated?.();
    } finally {
      setLineBusyId(null);
    }
  };

  const addExtra = async () => {
    if (!clinicId || !item?.session_id || !extraAddonId) return;
    setExtraBusy(true);
    try {
      await hubGroomingApi.postSessionExtra(item.session_id, {
        clinic_id: clinicId,
        hub_service_type_id: extraAddonId,
        created_by_staff_id: auditStaffId,
      });
      setExtraAddonId('');
      await refreshDrawer();
      onSessionUpdated?.();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao adicionar adicional');
    } finally {
      setExtraBusy(false);
    }
  };

  const requestService = async () => {
    if (!clinicId || !item?.session_id || !requestServiceId) return;
    const service = (drawer?.requestable_services ?? []).find((s) => s.id === requestServiceId);
    if (!service) return;
    setExtraBusy(true);
    try {
      await hubGroomingApi.requestSessionExtra(item.session_id, {
        clinic_id: clinicId,
        extra_name: service.name,
        hub_service_type_id: requestServiceId,
        created_by_staff_id: auditStaffId,
      });
      setRequestServiceId('');
      const res = await hubGroomingApi.listEvents(item.session_id, clinicId);
      setEvents(res.events ?? []);
      showSuccess('Recepção avisada. Ela pede autorização ao tutor e inclui o serviço.');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao avisar a recepção');
    } finally {
      setExtraBusy(false);
    }
  };

  const tags = useMemo(() => {
    const fromDrawer = drawer?.clinical_tags ?? [];
    if (fromDrawer.length) return fromDrawer;
    return item?.clinical_tags ?? [];
  }, [drawer?.clinical_tags, item?.clinical_tags]);

  const extraRequests = useMemo(
    () => events.filter((e) => e.event_type === 'extra_request'),
    [events],
  );

  const extrasTotal = useMemo(() => {
    if (!showOperationalPricing) return null;
    const rows = drawer?.extras ?? [];
    let sum = 0;
    let any = false;
    for (const e of rows) {
      if (e.sale_amount_snapshot != null) {
        sum += Number(e.sale_amount_snapshot);
        any = true;
      }
    }
    for (const ln of drawer?.appointment_lines ?? []) {
      if (ln.sale_amount_applied != null) {
        sum += Number(ln.sale_amount_applied);
        any = true;
      }
    }
    return any ? sum : null;
  }, [drawer?.extras, drawer?.appointment_lines, showOperationalPricing]);

  const requestServiceOptions = useMemo<HubComboboxOption[]>(
    () =>
      (drawer?.requestable_services ?? []).map((s) => ({
        value: s.id,
        label: s.is_addon ? `${s.name} (adicional)` : s.name,
      })),
    [drawer?.requestable_services],
  );

  const extraAddonOptions = useMemo<HubComboboxOption[]>(
    () =>
      (drawer?.available_addons ?? []).map((a) => ({
        value: a.id,
        label:
          showOperationalPricing && a.sale_amount != null
            ? `${a.name} (${formatBrl(a.sale_amount)})`
            : a.name,
      })),
    [drawer?.available_addons, showOperationalPricing],
  );

  if (!item) return null;

  const petName = item.pet?.name || 'Pet';
  const tutor = item.guardian?.full_name || '—';
  const phone = item.guardian?.phone?.trim();
  const notifyTutorHref =
    stage === 'ready'
      ? buildWhatsappLink(phone, renderTemplate('pet_ready', { tutor, pet: petName }, templateOverrides))
      : null;
  const porte =
    item.pet?.size_tier && PORTE_LABELS[item.pet.size_tier as PetBodyPorteValue]
      ? PORTE_LABELS[item.pet.size_tier as PetBodyPorteValue]
      : item.pet?.size_tier || null;
  const ageLabel = item.pet?.birth_date ? petAgeDetailedLabel(item.pet.birth_date) : null;
  const heroMeta = [item.pet?.breed || null, ageLabel, porte, item.pet?.coat_type || null]
    .filter(Boolean)
    .join(' · ');
  const timeRange = `${formatHm(item.starts_at)}${item.ends_at !== item.starts_at ? ` – ${formatHm(item.ends_at)}` : ''}`;
  const lastVisitLabel = drawer?.last_grooming_closed_at
    ? formatDate(drawer.last_grooming_closed_at)
    : '—';
  const executedCount = drawer?.appointment_lines.filter((ln) => ln.executed_at).length ?? 0;
  const linesCount = drawer?.appointment_lines.length ?? 0;
  const checklistDone = checklistRows.filter((r) => r.done).length;
  const waitingDrawer = Boolean(item.session_id && drawerLoading && !drawer);

  const saveNote = async () => {
    if (!clinicId || !item.session_id || !operationalDraft.trim()) return;
    setOperationalBusy(true);
    setNoteBusy(true);
    try {
      await hubGroomingApi.patchSession(item.session_id, {
        clinic_id: clinicId,
        operational_notes: operationalDraft.trim() || null,
      });
      await hubGroomingApi.addNote(item.session_id, clinicId, operationalDraft.trim());
      const res = await hubGroomingApi.listEvents(item.session_id, clinicId);
      setEvents(res.events ?? []);
      await refreshDrawer();
      onSessionUpdated?.();
    } finally {
      setOperationalBusy(false);
      setNoteBusy(false);
    }
  };

  const logReadyMessage = () => {
    void logMessageAttempt({
      clinic_id: clinicId ?? '',
      guardian_id: item.guardian?.id ?? null,
      pet_id: item.pet?.id ?? null,
      channel: 'whatsapp_link',
      template_key: 'pet_ready',
    });
  };

  const footer = (
    <div className="hub-grooming-drawer__footer">
      {primaryLabel && quick ? (
        <button
          type="button"
          className="hub-grooming-drawer__advance-btn"
          disabled={busy}
          onClick={() => void onQuickAction(item, quick)}
        >
          {busy ? <Loader size={16} className="spin" aria-hidden /> : null}
          {primaryLabel}
        </button>
      ) : null}
      {pauseEligible || (canWrite && item.session_id && onTogglePriority) ? (
        <div className="hub-grooming-drawer__footer-secondary">
          {pauseEligible ? (
            <button
              type="button"
              className="hub-grooming-drawer__secondary-btn"
              disabled={busy}
              onClick={() => void onPauseToggle?.(item)}
            >
              {item.paused_at ? 'Retomar' : 'Pausar'}
            </button>
          ) : null}
          {canWrite && item.session_id && onTogglePriority ? (
            <button
              type="button"
              className="hub-grooming-drawer__secondary-btn"
              disabled={busy}
              onClick={() => void onTogglePriority(item)}
            >
              {(item.priority ?? 0) > 0 ? 'Tirar prioridade' : 'Priorizar'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title={petName}
      titleIcon={<Scissors size={16} aria-hidden />}
      subtitle={`${formatDate(item.starts_at)} · ${timeRange}`}
      contentKey={item.session_id ?? item.appointment_id ?? petName}
      footer={footer}
    >
      <div className="hub-grooming-drawer">
        <HubRefreshingBanner show={Boolean(drawer && drawerLoading)} label="Atualizando detalhes…" />

        <div className="hub-grooming-drawer__hero">
          {item.pet?.avatar_url ? (
            <img src={item.pet.avatar_url} alt="" className="hub-grooming-drawer__avatar" />
          ) : (
            <div className="hub-grooming-drawer__avatar hub-grooming-drawer__avatar--fallback" aria-hidden>
              {petInitials(petName)}
            </div>
          )}
          <div className="hub-grooming-drawer__hero-info">
            <p className="hub-grooming-drawer__hero-name">{petName}</p>
            {heroMeta ? <p className="hub-grooming-drawer__hero-meta">{heroMeta}</p> : null}
            <div className="hub-grooming-drawer__badges">
              <span
                className={`hub-grooming-drawer__stage hub-grooming-drawer__stage--${stageBadgeVariant(stage)}`}
              >
                {GROOMING_STAGE_LABELS[stage]}
              </span>
              {item.paused_at ? (
                <span className="hub-grooming-drawer__stage hub-grooming-drawer__stage--paused">Pausado</span>
              ) : null}
              {item.is_late ? (
                <span className="hub-grooming-drawer__flag hub-grooming-drawer__flag--late">Em atraso</span>
              ) : null}
              {(item.priority ?? 0) > 0 ? (
                <span className="hub-grooming-drawer__flag hub-grooming-drawer__flag--priority">Prioritário</span>
              ) : null}
              {item.is_walk_in ? <span className="hub-grooming-drawer__flag">Avulso</span> : null}
              {item.appointment_kind === 'pickup_route' ? (
                <span className="hub-grooming-drawer__flag">Leva e traz</span>
              ) : null}
              {item.pet?.is_first_grooming_visit ? (
                <span className="hub-grooming-drawer__flag hub-grooming-drawer__flag--first">1ª visita</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className={`hub-grooming-drawer__contact${phone ? '' : ' hub-grooming-drawer__contact--no-phone'}`}>
          <div className="hub-grooming-drawer__contact-info">
            <p className="hub-grooming-drawer__contact-kicker">Tutor</p>
            <p className="hub-grooming-drawer__contact-name">{tutor}</p>
            {phone ? (
              <p className="hub-grooming-drawer__contact-phone">{formatBrPhoneDisplay(phone)}</p>
            ) : (
              <p className="hub-grooming-drawer__contact-phone hub-grooming-drawer__contact-phone--empty">
                Sem telefone
              </p>
            )}
          </div>
          {notifyTutorHref ? (
            <a
              className="hub-grooming-drawer__whatsapp"
              href={notifyTutorHref}
              target="_blank"
              rel="noreferrer"
              onClick={logReadyMessage}
            >
              <MessageCircle size={16} aria-hidden />
              Avisar tutor
            </a>
          ) : null}
        </div>

        {stage === 'ready' ? (
          <div className="hub-grooming-drawer__ready-banner" role="status">
            {notifyTutorHref
              ? `${petName} está pronto para retirada. Avise o tutor pelo WhatsApp.`
              : `${petName} está pronto para retirada. Sem telefone do tutor para avisar.`}
          </div>
        ) : null}

        <div className="hub-grooming-drawer__facts">
          <div className="hub-grooming-drawer__fact">
            <Clock size={14} className="hub-grooming-drawer__fact-icon" aria-hidden />
            <span className="hub-grooming-drawer__fact-label">Horário</span>
            <span className="hub-grooming-drawer__fact-value">{timeRange}</span>
          </div>
          <div className="hub-grooming-drawer__fact">
            <User size={14} className="hub-grooming-drawer__fact-icon" aria-hidden />
            <span className="hub-grooming-drawer__fact-label">Profissional</span>
            <span className="hub-grooming-drawer__fact-value">
              {item.staff_member?.full_name || 'Sem profissional'}
            </span>
          </div>
          {item.estimated_duration_minutes ? (
            <div className="hub-grooming-drawer__fact">
              <Clock size={14} className="hub-grooming-drawer__fact-icon" aria-hidden />
              <span className="hub-grooming-drawer__fact-label">Duração</span>
              <span className="hub-grooming-drawer__fact-value">~{item.estimated_duration_minutes} min</span>
            </div>
          ) : null}
          {item.session_id ? (
            <div className="hub-grooming-drawer__fact">
              <Calendar size={14} className="hub-grooming-drawer__fact-icon" aria-hidden />
              <span className="hub-grooming-drawer__fact-label">Última visita</span>
              <span className="hub-grooming-drawer__fact-value">
                {drawerLoading && !drawer ? '…' : lastVisitLabel}
              </span>
            </div>
          ) : null}
        </div>

        <FinancialAdjustmentPendingBadge
          pending={Boolean(item.financial_adjustment_pending)}
          showCaixaLink={canViewFinancial}
        />

        {waitingDrawer ? (
          <HubLoading variant="block" label="Carregando detalhes…" className="hub-grooming-drawer__loading" />
        ) : null}

        {tags.length > 0 ? (
          <section className="hub-grooming-drawer__section" aria-label="Alertas e preferências">
            <h4 className="hub-grooming-drawer__heading">Alertas</h4>
            <div className="hub-grooming-tags hub-grooming-tags--drawer">
              {tags.map((t) => (
                <span key={t.key} className="hub-grooming-tags__pill">
                  {t.label}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {(canWrite || canPauseQueue) && clinicId && item.pet_id ? (
          <PetOperationalAddAlert
            clinicId={clinicId}
            petId={item.pet_id}
            source="grooming"
            existingFlagKeys={tags.map((t) => t.key).filter((k) => !k.startsWith('behavior:') && k !== 'no_dryer')}
            onAdded={() => {
              void refreshDrawer();
              onSessionUpdated?.();
            }}
          />
        ) : null}

        {item.pet?.notes?.trim() || item.notes?.trim() || item.description?.trim() ? (
          <section className="hub-grooming-drawer__section hub-grooming-drawer__callout hub-grooming-drawer__callout--notes">
            <h4 className="hub-grooming-drawer__heading">Observações do tutor</h4>
            {item.pet?.notes?.trim() ? <p>{item.pet.notes.trim()}</p> : null}
            {item.description?.trim() ? <p className="hub-grooming-drawer__muted">{item.description.trim()}</p> : null}
            {item.notes?.trim() ? <p className="hub-grooming-drawer__muted">{item.notes.trim()}</p> : null}
          </section>
        ) : null}

        <section className="hub-grooming-drawer__section">
          <div className="hub-grooming-drawer__heading-row">
            <h4 className="hub-grooming-drawer__heading">Serviços</h4>
            {linesCount > 0 ? (
              <span className="hub-grooming-drawer__count">
                {executedCount}/{linesCount} feitos
              </span>
            ) : null}
          </div>
          {item.session_id && drawer && drawer.appointment_lines.length > 0 ? (
            <ul className="hub-grooming-drawer__lines">
              {drawer.appointment_lines.map((ln) => {
                const done = Boolean(ln.executed_at);
                return (
                  <li
                    key={ln.id}
                    className={`hub-grooming-drawer__line${done ? ' hub-grooming-drawer__line--done' : ''}`}
                  >
                    {canWrite ? (
                      <label className="hub-grooming-drawer__executed">
                        <input
                          type="checkbox"
                          checked={done}
                          disabled={lineBusyId === ln.id}
                          onChange={(e) => void toggleLineExecuted(ln.id, e.target.checked)}
                        />
                        <span className="hub-grooming-drawer__line-name">{ln.name}</span>
                      </label>
                    ) : (
                      <span className="hub-grooming-drawer__line-name">{ln.name}</span>
                    )}
                    {showOperationalPricing && ln.sale_amount_applied != null ? (
                      <span className="hub-grooming-drawer__line-price">{formatBrl(ln.sale_amount_applied)}</span>
                    ) : null}
                    {!canWrite && done ? <span className="hub-grooming-drawer__line-state">Feito</span> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="hub-grooming-drawer__service-list">
              {(item.services?.length ? item.services : [{ name: item.service_type?.name || 'Serviço' }]).map(
                (s, i) => (
                  <li key={`${s.name}-${i}`}>{s.name}</li>
                ),
              )}
            </ul>
          )}
          {item.session_id && drawer && !drawerLoading && item.appointment_id && drawer.appointment_lines.length === 0 ? (
            <p className="hub-grooming-drawer__hint">
              Para marcar os serviços como feitos, o agendamento precisa das linhas de Banho & Tosa gravadas na
              Agenda.
            </p>
          ) : null}
        </section>

        {item.session_id && drawer && checklistRows.length > 0 ? (
          <section className="hub-grooming-drawer__section">
            <div className="hub-grooming-drawer__heading-row">
              <h4 className="hub-grooming-drawer__heading">Checklist</h4>
              <span className="hub-grooming-drawer__count">
                {checklistDone}/{checklistRows.length}
              </span>
            </div>
            <ul className="hub-grooming-drawer__checklist">
              {checklistRows.map((row) => (
                <li key={row.key}>
                  <label className={row.done ? 'hub-grooming-drawer__check-row hub-grooming-drawer__check-row--done' : 'hub-grooming-drawer__check-row'}>
                    <input
                      type="checkbox"
                      checked={row.done}
                      disabled={!canWrite || checklistBusyKey === row.key}
                      onChange={(e) => void persistChecklistKey(row.key, e.target.checked)}
                    />
                    <span>{row.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {item.session_id && drawer && (canRequestServices || extraRequests.length > 0) ? (
          <section className="hub-grooming-drawer__section hub-grooming-drawer__callout hub-grooming-drawer__callout--request">
            <h4 className="hub-grooming-drawer__heading">
              {canRequestServices ? 'Pedir serviço à recepção' : 'Autorização pendente'}
            </h4>
            {canRequestServices ? (
              <p className="hub-grooming-drawer__hint">
                Se no salão aparecer outro serviço (ex.: desembolo), avise a recepção. Ela pede autorização ao
                tutor e inclui no atendimento.
              </p>
            ) : (
              <p className="hub-grooming-drawer__hint">
                O salão pediu autorização do tutor para incluir serviço. Confirme e lance na Agenda.
              </p>
            )}
            {extraRequests.length > 0 ? (
              <ul className="hub-grooming-drawer__request-list" aria-label="Pedidos à recepção">
                {extraRequests.map((ev) => (
                  <li key={ev.id}>
                    <span className="hub-grooming-drawer__request-dot" aria-hidden />
                    {ev.body?.trim() || ev.title}
                  </li>
                ))}
              </ul>
            ) : null}
            {canRequestServices && requestServiceOptions.length > 0 ? (
              <div className="hub-grooming-drawer__extra-row">
                <HubSearchableCombobox
                  id="grooming-drawer-request-service"
                  className="hub-combobox--clientes"
                  options={requestServiceOptions}
                  value={requestServiceId}
                  onChange={setRequestServiceId}
                  placeholder="Selecione o serviço…"
                  searchPlaceholder="Buscar serviço…"
                  ariaLabel="Selecionar serviço"
                  disabled={extraBusy}
                />
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                  disabled={extraBusy || !requestServiceId}
                  onClick={() => void requestService()}
                >
                  {extraBusy ? '…' : 'Avisar recepção'}
                </button>
              </div>
            ) : null}
          </section>
        ) : null}

        {item.session_id && drawer && canAddExtras && drawer.available_addons.length > 0 ? (
          <section className="hub-grooming-drawer__section">
            <h4 className="hub-grooming-drawer__heading">Adicionais</h4>
            {drawer.extras.length > 0 ? (
              <ul className="hub-grooming-drawer__chips">
                {drawer.extras.map((ex) => (
                  <li key={ex.id} className="hub-grooming-drawer__chip">
                    {ex.name_snapshot}
                    {showOperationalPricing && ex.sale_amount_snapshot != null
                      ? ` · ${formatBrl(ex.sale_amount_snapshot)}`
                      : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hub-grooming-drawer__hint">Nenhum adicional lançado ainda.</p>
            )}
            <div className="hub-grooming-drawer__extra-row">
              <HubSearchableCombobox
                id="grooming-drawer-extra-addon"
                className="hub-combobox--clientes"
                options={extraAddonOptions}
                value={extraAddonId}
                onChange={setExtraAddonId}
                placeholder="Selecione o adicional…"
                searchPlaceholder="Buscar adicional…"
                ariaLabel="Selecionar adicional"
                disabled={extraBusy}
              />
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                disabled={extraBusy || !extraAddonId}
                onClick={() => void addExtra()}
              >
                {extraBusy ? '…' : 'Adicionar'}
              </button>
            </div>
            {showOperationalPricing && extrasTotal != null ? (
              <p className="hub-grooming-drawer__subtotal">
                Referência (linhas + adicionais): <strong>{formatBrl(extrasTotal)}</strong>
              </p>
            ) : null}
          </section>
        ) : item.session_id && drawer && drawer.extras.length > 0 && !canAddExtras ? (
          <section className="hub-grooming-drawer__section">
            <h4 className="hub-grooming-drawer__heading">Adicionais</h4>
            <ul className="hub-grooming-drawer__chips">
              {drawer.extras.map((ex) => (
                <li key={ex.id} className="hub-grooming-drawer__chip">
                  {ex.name_snapshot}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {item.session_id && canWrite ? (
          <section className="hub-grooming-drawer__section">
            <h4 className="hub-grooming-drawer__heading">Notas da equipe</h4>
            <textarea
              className="hub-clientes__textarea hub-grooming-drawer__notes"
              rows={3}
              value={operationalDraft}
              onChange={(e) => setOperationalDraft(e.target.value)}
              placeholder="Comportamento, intercorrência, recado para a equipe…"
            />
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
              disabled={operationalBusy || noteBusy || !operationalDraft.trim()}
              onClick={() => void saveNote()}
            >
              {operationalBusy || noteBusy ? 'Salvando…' : 'Salvar nota'}
            </button>
          </section>
        ) : null}

        {item.session_id ? (
          <section className="hub-grooming-drawer__section">
            <h4 className="hub-grooming-drawer__heading">Histórico</h4>
            {events.length === 0 ? (
              <p className="hub-grooming-drawer__hint">Nenhum evento registrado ainda.</p>
            ) : (
              <ul className="hub-grooming-drawer__timeline">
                {events.map((ev) => (
                  <li key={ev.id} className="hub-grooming-drawer__timeline-item">
                    <span className="hub-grooming-drawer__timeline-dot" aria-hidden />
                    <div>
                      <p className="hub-grooming-drawer__timeline-title">{ev.title}</p>
                      <p className="hub-grooming-drawer__timeline-meta">{formatEventAt(ev.created_at)}</p>
                      {ev.body?.trim() ? <p className="hub-grooming-drawer__timeline-body">{ev.body}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {item.appointment_id ? (
          <Link
            to={`/hub/appointments?date=${encodeURIComponent(item.starts_at.slice(0, 10))}`}
            className="hub-grooming-drawer__agenda"
          >
            <ExternalLink size={13} aria-hidden />
            Ver na agenda
          </Link>
        ) : null}
      </div>
    </HubSidePanel>
  );
};

export default GroomingAppointmentDrawer;
