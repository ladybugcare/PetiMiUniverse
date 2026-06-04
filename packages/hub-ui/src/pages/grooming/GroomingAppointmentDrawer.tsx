import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { HubSidePanel } from '../../components/HubSidePanel';
import {
  hubGroomingApi,
  type GroomingDayBoardItem,
  type GroomingSessionDrawerResponse,
  type GroomingSessionEvent,
} from '../../api/hubGroomingApi';
import { getStoredClinicId } from '@petimi/web-core';
import { petAgeDetailedLabel } from '../pets/petAge';
import { PORTE_LABELS, type PetBodyPorteValue } from '../../utils/hubServiceTypesPricingMatrix';
import {
  GROOMING_NEXT_STAGE,
  GROOMING_STAGE_LABELS,
  getItemBoardStage,
  type GroomingStage,
} from './groomingStages';
import type { GroomingQuickAction } from './GroomingQueueBoard';
import { FinancialAdjustmentPendingBadge } from '../../components/FinancialAdjustmentPendingBadge';

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

function whatsappReadyLink(phone: string, petName: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  const brDigits = digits.startsWith('55') ? digits : `55${digits}`;
  const text = encodeURIComponent(`Olá! ${petName} já está pronto(a) para retirada. PetMi`);
  return `https://wa.me/${brDigits}?text=${text}`;
}

function resolveDrawerQuickAction(item: GroomingDayBoardItem, canWrite: boolean): GroomingQuickAction | null {
  if (!canWrite) return null;
  const stage = getItemBoardStage(item);
  if (!item.session_id && item.appointment_id && item.appointment_status === 'pending_confirm') {
    return { type: 'confirm_appointment' };
  }
  if (!item.session_id && item.appointment_id && stage === 'scheduled') {
    return { type: 'check_in' };
  }
  if (item.session_id && GROOMING_NEXT_STAGE[stage]) {
    return { type: 'advance' };
  }
  return null;
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
  onOpenCheckout,
  checkoutEnabled = false,
  canViewFinancial = false,
  busy,
}) => {
  const clinicId = getStoredClinicId();
  const [events, setEvents] = useState<GroomingSessionEvent[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [drawer, setDrawer] = useState<GroomingSessionDrawerResponse | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [operationalDraft, setOperationalDraft] = useState('');
  const [operationalBusy, setOperationalBusy] = useState(false);
  const [checklistBusyKey, setChecklistBusyKey] = useState<string | null>(null);
  const [lineBusyId, setLineBusyId] = useState<string | null>(null);
  const [extraAddonId, setExtraAddonId] = useState('');
  const [extraBusy, setExtraBusy] = useState(false);

  const stage = item ? getItemBoardStage(item) : 'scheduled';
  const quick = item ? resolveDrawerQuickAction(item, canWrite) : null;
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
    if (quick.type === 'check_in') return 'Check-in';
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

  const saveOperationalNotes = async () => {
    if (!clinicId || !item?.session_id) return;
    setOperationalBusy(true);
    try {
      await hubGroomingApi.patchSession(item.session_id, {
        clinic_id: clinicId,
        operational_notes: operationalDraft.trim() || null,
      });
      await refreshDrawer();
      onSessionUpdated?.();
    } finally {
      setOperationalBusy(false);
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
    } finally {
      setExtraBusy(false);
    }
  };

  const tags = useMemo(() => {
    const fromDrawer = drawer?.clinical_tags ?? [];
    if (fromDrawer.length) return fromDrawer;
    return item?.clinical_tags ?? [];
  }, [drawer?.clinical_tags, item?.clinical_tags]);

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

  if (!item) return null;

  const petName = item.pet?.name || 'Pet';
  const tutor = item.guardian?.full_name || '—';
  const phone = item.guardian?.phone?.trim();
  const notifyTutorHref = phone && stage === 'ready' ? whatsappReadyLink(phone, petName) : null;
  const porte =
    item.pet?.size_tier && PORTE_LABELS[item.pet.size_tier as PetBodyPorteValue]
      ? PORTE_LABELS[item.pet.size_tier as PetBodyPorteValue]
      : item.pet?.size_tier || '—';

  const addNote = async () => {
    if (!clinicId || !item.session_id || !noteDraft.trim()) return;
    setNoteBusy(true);
    try {
      await hubGroomingApi.addNote(item.session_id, clinicId, noteDraft.trim());
      setNoteDraft('');
      const res = await hubGroomingApi.listEvents(item.session_id, clinicId);
      setEvents(res.events ?? []);
    } finally {
      setNoteBusy(false);
    }
  };

  const footer = (
    <div className="hub-grooming-drawer__footer">
      {pauseEligible ? (
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--ghost"
          disabled={busy}
          onClick={() => void onPauseToggle?.(item)}
        >
          {item.paused_at ? 'Retomar atendimento' : 'Pausar atendimento'}
        </button>
      ) : null}
      {primaryLabel && quick ? (
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--primary"
          disabled={busy}
          onClick={() => void onQuickAction(item, quick)}
        >
          {primaryLabel}
        </button>
      ) : null}
      {item.session_id && checkoutEnabled && onOpenCheckout ? (
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--ghost"
          disabled={busy}
          onClick={() => void onOpenCheckout()}
        >
          Abrir checkout
        </button>
      ) : null}
      {item.appointment_id ? (
        <Link
          to={`/hub/appointments?date=${encodeURIComponent(item.starts_at.slice(0, 10))}`}
          className="hub-clientes__btn hub-clientes__btn--ghost"
        >
          Ver na agenda
        </Link>
      ) : null}
    </div>
  );

  const lastVisitLabel = drawer?.last_grooming_closed_at
    ? formatDate(drawer.last_grooming_closed_at)
    : '—';

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title={petName}
      subtitle={`${formatDate(item.starts_at)} · ${formatHm(item.starts_at)}${item.ends_at !== item.starts_at ? ` – ${formatHm(item.ends_at)}` : ''}`}
      footer={footer}
    >
      <div className="hub-grooming-drawer">
        <p className="hub-grooming-drawer__status">
          Estágio: <strong>{GROOMING_STAGE_LABELS[stage]}</strong>
          {item.paused_at ? (
            <span className="hub-grooming-queue__badge hub-grooming-queue__badge--paused"> Pausado</span>
          ) : null}
          {item.is_late ? <span className="hub-grooming-queue__late-tag"> · Em atraso</span> : null}
        </p>

        <FinancialAdjustmentPendingBadge
          pending={Boolean(item.financial_adjustment_pending)}
          showCaixaLink={canViewFinancial}
        />

        {tags.length > 0 ? (
          <div className="hub-grooming-tags" aria-label="Alertas e preferências">
            {tags.map((t) => (
              <span key={t.key} className="hub-grooming-tags__pill">
                {t.label}
              </span>
            ))}
          </div>
        ) : null}

        <section className="hub-grooming-drawer__section">
          <h4 className="hub-grooming-drawer__heading">Última visita (Banho & Tosa encerrada)</h4>
          <p className="hub-clientes__muted">{item.session_id ? (drawerLoading ? 'Carregando…' : lastVisitLabel) : '—'}</p>
        </section>

        <section className="hub-grooming-drawer__section">
          <h4 className="hub-grooming-drawer__heading">Tutor</h4>
          <p>{tutor}</p>
          {phone ? <p className="hub-clientes__muted">Tel.: {phone}</p> : null}
          {notifyTutorHref ? (
            <a
              className="hub-clientes__btn hub-clientes__btn--primary"
              href={notifyTutorHref}
              target="_blank"
              rel="noreferrer"
              style={{ marginTop: 10 }}
            >
              Avisar tutor
            </a>
          ) : null}
        </section>

        <section className="hub-grooming-drawer__section">
          <h4 className="hub-grooming-drawer__heading">Pet</h4>
          <p className="hub-clientes__muted">
            {item.pet?.breed || 'Raça não informada'}
            {item.pet?.birth_date ? ` · ${petAgeDetailedLabel(item.pet.birth_date)}` : ''}
          </p>
          <p className="hub-clientes__muted">Porte: {porte}</p>
        </section>

        <section className="hub-grooming-drawer__section">
          <h4 className="hub-grooming-drawer__heading">Serviços agendados</h4>
          {item.session_id && drawer && drawer.appointment_lines.length > 0 ? (
            <ul className="hub-grooming-drawer__lines">
              {drawer.appointment_lines.map((ln) => (
                <li key={ln.id} className="hub-grooming-drawer__line">
                  <span className="hub-grooming-drawer__line-name">{ln.name}</span>
                  {showOperationalPricing && ln.sale_amount_applied != null ? (
                    <span className="hub-clientes__muted hub-grooming-drawer__line-price">
                      {formatBrl(ln.sale_amount_applied)}
                    </span>
                  ) : null}
                  {canWrite ? (
                    <label className="hub-grooming-drawer__executed">
                      <input
                        type="checkbox"
                        checked={!!ln.executed_at}
                        disabled={lineBusyId === ln.id}
                        onChange={(e) => void toggleLineExecuted(ln.id, e.target.checked)}
                      />
                      <span>Executado</span>
                    </label>
                  ) : ln.executed_at ? (
                    <span className="hub-clientes__muted">Executado</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : item.session_id && drawer && !drawerLoading && item.appointment_id && drawer.appointment_lines.length === 0 ? (
            <>
              <p className="hub-clientes__muted hub-grooming-drawer__sync-hint">
                Estes serviços vêm da Agenda. Para marcar <strong>Executado</strong> aqui, o agendamento precisa de
                linhas de serviço do grupo <strong>Banho & Tosa</strong> gravadas na Agenda. Abra o compromisso na
                Agenda e confirme as linhas (o tipo principal sozinho pode não criar linha editável neste painel).
              </p>
              <ul className="hub-grooming-drawer__list">
                {(item.services?.length ? item.services : [{ name: item.service_type?.name || 'Serviço' }]).map(
                  (s, i) => (
                    <li key={`${s.name}-${i}`}>{s.name}</li>
                  ),
                )}
              </ul>
            </>
          ) : (
            <ul className="hub-grooming-drawer__list">
              {(item.services?.length ? item.services : [{ name: item.service_type?.name || 'Serviço' }]).map(
                (s, i) => (
                  <li key={`${s.name}-${i}`}>{s.name}</li>
                ),
              )}
            </ul>
          )}
          {item.estimated_duration_minutes ? (
            <p className="hub-clientes__muted">Duração estimada: ~{item.estimated_duration_minutes} min</p>
          ) : null}
        </section>

        {item.session_id && canWrite && drawer && drawer.available_addons.length > 0 ? (
          <section className="hub-grooming-drawer__section">
            <h4 className="hub-grooming-drawer__heading">Adicionais</h4>
            <div className="hub-grooming-drawer__extra-row">
              <select
                className="hub-clientes__select"
                value={extraAddonId}
                onChange={(e) => setExtraAddonId(e.target.value)}
                aria-label="Selecionar adicional"
              >
                <option value="">Selecione…</option>
                {drawer.available_addons.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {showOperationalPricing && a.sale_amount != null ? ` (${formatBrl(a.sale_amount)})` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                disabled={extraBusy || !extraAddonId}
                onClick={() => void addExtra()}
              >
                {extraBusy ? '…' : 'Adicionar'}
              </button>
            </div>
            {drawer.extras.length > 0 ? (
              <ul className="hub-grooming-drawer__list hub-grooming-drawer__list--compact">
                {drawer.extras.map((ex) => (
                  <li key={ex.id}>
                    {ex.name_snapshot}
                    {showOperationalPricing && ex.sale_amount_snapshot != null
                      ? ` · ${formatBrl(ex.sale_amount_snapshot)}`
                      : ''}
                  </li>
                ))}
              </ul>
            ) : null}
            {showOperationalPricing && extrasTotal != null ? (
              <p className="hub-clientes__muted">
                Subtotal referência (linhas + adicionais): <strong>{formatBrl(extrasTotal)}</strong>
              </p>
            ) : null}
          </section>
        ) : null}

        {item.session_id && drawer && checklistRows.length > 0 ? (
          <section className="hub-grooming-drawer__section">
            <h4 className="hub-grooming-drawer__heading">Checklist</h4>
            <ul className="hub-grooming-drawer__checklist">
              {checklistRows.map((row) => (
                <li key={row.key}>
                  <label>
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

        <section className="hub-grooming-drawer__section">
          <h4 className="hub-grooming-drawer__heading">Equipe</h4>
          <p>{item.staff_member?.full_name || 'Sem profissional atribuído'}</p>
        </section>

        {item.pet?.notes?.trim() || item.notes?.trim() || item.description?.trim() ? (
          <section className="hub-grooming-drawer__section hub-grooming-drawer__section--highlight">
            <h4 className="hub-grooming-drawer__heading">Observações do tutor / agendamento</h4>
            {item.pet?.notes?.trim() ? <p>{item.pet.notes.trim()}</p> : null}
            {item.description?.trim() ? <p className="hub-clientes__muted">{item.description.trim()}</p> : null}
            {item.notes?.trim() ? <p className="hub-clientes__muted">{item.notes.trim()}</p> : null}
          </section>
        ) : null}

        {item.session_id && canWrite ? (
          <section className="hub-grooming-drawer__section">
            <h4 className="hub-grooming-drawer__heading">Notas do atendimento</h4>
            <textarea
              className="hub-clientes__textarea"
              rows={3}
              value={operationalDraft}
              onChange={(e) => setOperationalDraft(e.target.value)}
              placeholder="Resumo para a equipe (persistido na sessão)…"
            />
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
              disabled={operationalBusy}
              onClick={() => void saveOperationalNotes()}
            >
              {operationalBusy ? 'Salvando…' : 'Salvar notas'}
            </button>
          </section>
        ) : null}

        {item.session_id && canWrite ? (
          <section className="hub-grooming-drawer__section">
            <h4 className="hub-grooming-drawer__heading">Nota na timeline</h4>
            <textarea
              className="hub-clientes__textarea"
              rows={2}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Comportamento, intercorrência…"
            />
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
              disabled={noteBusy || !noteDraft.trim()}
              onClick={() => void addNote()}
            >
              {noteBusy ? 'Salvando…' : 'Adicionar nota'}
            </button>
          </section>
        ) : null}

        {item.session_id ? (
          <section className="hub-grooming-drawer__section">
            <h4 className="hub-grooming-drawer__heading">Timeline</h4>
            {events.length === 0 ? (
              <p className="hub-clientes__muted">Nenhum evento registrado.</p>
            ) : (
              <ul className="hub-grooming-drawer__timeline">
                {events.map((ev) => (
                  <li key={ev.id} className="hub-grooming-drawer__timeline-item">
                    <p className="hub-grooming-drawer__timeline-title">{ev.title}</p>
                    <p className="hub-clientes__muted hub-grooming-drawer__timeline-meta">
                      {formatEventAt(ev.created_at)}
                    </p>
                    {ev.body?.trim() ? <p className="hub-grooming-drawer__timeline-body">{ev.body}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {item.appointment_kind === 'pickup_route' ? (
          <p className="hub-grooming-queue__badge">Agendamento com leva e traz</p>
        ) : null}
      </div>
    </HubSidePanel>
  );
};

export default GroomingAppointmentDrawer;
