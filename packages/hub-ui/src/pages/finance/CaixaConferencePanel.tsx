import React, { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Coins,
  Loader2,
  Dog,
  ExternalLink,
  MessageCircle,
  Pencil,
  Phone,
  SendHorizonal,
  User,
  UserCheck,
} from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubLoading } from '../../components/HubLoading';
import { hubEncountersApi } from '../../api/hubClinicalApi';
import {
  hubComandaApi,
  type HubComandaDetailResponse,
  type HubComandaGuardianEmbed,
  type HubPublicComandaPet,
} from '../../api/hubComandaApi';
import { hubGroomingApi } from '../../api/hubGroomingApi';
import { hubFinancialApi, type HubServiceExecutionLine } from '../../api/hubFinancialApi';
import { useMyStaffMember } from '../../hooks/useMyStaffMember';
import {
  caixaCarryoverConferenceLabel,
  resolveCaixaCarryoverConferenceKind,
  resolveComandaOperationalHref,
} from './hubComandaEditUtils';
import {
  resolveCaixaConferenceActionPlan,
  type CaixaConferencePermissions,
} from './caixaConferenceActions';
import {
  appointmentStatusLabelPt,
  concludeAppointmentForCaixa,
} from './caixaConferenceAppointmentAdvance';
import { formatComandaListTitle, formatComandaOriginLabel } from './comandaListPreview';
import { MarkExecutionForm, type MarkExecutionSavedResult } from './MarkExecutionForm';
import { sizeTierLabelPt } from '../orcamentos/hubQuoteViewUtils';
import { waMeBaseUrl } from './hubComandaShareUtils';
import { formatBrPhoneDisplay } from '../../utils/formatBrPhone';

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function formatDateTimeRange(startIso: string | null, endIso: string | null): string | null {
  if (!startIso) return null;
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return null;
  const day = start.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
  const t = (d: Date) =>
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  const end = endIso ? new Date(endIso) : null;
  return end && !Number.isNaN(end.getTime()) ? `${day} · ${t(start)}–${t(end)}` : `${day} · ${t(start)}`;
}

const SPECIES_PT: Record<string, string> = { dog: 'Cão', cat: 'Gato', bird: 'Ave', other: 'Outro' };

const GROOMING_DONE = new Set(['ready', 'delivered', 'closed']);

const GROOMING_STAGE_PT: Record<string, string> = {
  scheduled: 'Agendado',
  checked_in: 'Check-in',
  queued: 'Aguardando',
  in_service: 'Em atendimento',
  finishing: 'Finalização',
  ready: 'Pronto',
  delivered: 'Entregue',
  closed: 'Encerrado',
};

type OriginContext = {
  starts_at: string | null;
  ends_at: string | null;
  staff_id: string | null;
  staff_name: string | null;
};

type StepState = 'done' | 'current' | 'blocked';

const cardStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  border: '1px solid var(--hub-border, #e8e4de)',
  background: 'var(--hub-surface, #fff)',
};

const dangerBtnStyle: React.CSSProperties = {
  background: '#dc2626',
  borderColor: '#dc2626',
  color: '#fff',
};

const cancelledBadgeStyle: React.CSSProperties = {
  background: '#fee2e2',
  color: '#b91c1c',
  borderColor: '#fca5a5',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  color: 'var(--hub-text-muted, #8a7f76)',
  margin: '0 0 6px',
};

const StepHeader: React.FC<{ index: number; title: string; state: StepState; summary?: string | null }> = ({
  index,
  title,
  state,
  summary,
}) => {
  const color = state === 'done' ? '#047857' : state === 'current' ? '#c2410c' : '#9ca3af';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <span
        aria-hidden
        style={{
          width: 24,
          height: 24,
          borderRadius: 999,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 700,
          color: state === 'done' ? '#fff' : color,
          background: state === 'done' ? '#059669' : 'transparent',
          border: state === 'done' ? 'none' : `2px solid ${color}`,
          flexShrink: 0,
        }}
      >
        {state === 'done' ? <CheckCircle2 size={14} strokeWidth={2.5} /> : index}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
        {summary ? (
          <div style={{ fontSize: 12, color, marginTop: 1 }}>{summary}</div>
        ) : null}
      </div>
    </div>
  );
};

export type CaixaConferencePanelProps = {
  open: boolean;
  comanda: Record<string, unknown> | null;
  onClose: () => void;
  /** Após mutação operacional / executor — recarregar listas do caixa. */
  onRefresh: () => void | Promise<void>;
  onCheckout: (comandaId: string) => void;
  onEditComanda: (comandaId: string) => void;
  onSendToFinanceiro: (comandaId: string) => void | Promise<unknown>;
  /** Posição 1-based da comanda na fila de conferência (null se fora da fila). */
  queuePosition?: number | null;
  queueTotal?: number;
  onPrev?: () => void;
  onNext?: () => void;
  /** Comanda saiu da conferência (ex.: anulada) — avançar para a próxima. */
  onResolved?: (comandaId: string) => void;
  /** Envio ao financeiro desta comanda em andamento. */
  sendingToFinanceiro?: boolean;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  busy?: boolean;
};

export const CaixaConferencePanel: React.FC<CaixaConferencePanelProps> = ({
  open,
  comanda,
  onClose,
  onRefresh,
  onCheckout,
  onEditComanda,
  onSendToFinanceiro,
  queuePosition = null,
  queueTotal = 0,
  onPrev,
  onNext,
  onResolved,
  sendingToFinanceiro = false,
  showError,
  showSuccess,
  busy = false,
}) => {
  const clinicId = getStoredClinicId();
  const { hasPermission } = usePermissions();
  const [actionBusy, setActionBusy] = useState(false);
  const [executorOpen, setExecutorOpen] = useState(false);
  const [executorSaved, setExecutorSaved] = useState<MarkExecutionSavedResult | null>(null);
  const [detail, setDetail] = useState<HubComandaDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTick, setDetailTick] = useState(0);
  const [execLines, setExecLines] = useState<HubServiceExecutionLine[] | null>(null);
  const { staffList } = useMyStaffMember();

  const permissions: CaixaConferencePermissions = useMemo(
    () => ({
      canAppointmentsWrite: hasPermission('hub.appointments.write'),
      canGroomingManage: hasPermission('grooming.queue.manage'),
      canClinicWrite: hasPermission('hub.clinic.write'),
      canMarkExecution:
        hasPermission('hub.financial.write') || hasPermission('hub.receivables.create'),
      canCreateReceivable: hasPermission('hub.receivables.create'),
    }),
    [hasPermission],
  );

  const kind = comanda ? resolveCaixaCarryoverConferenceKind(comanda) : 'ready';
  const originType = String(comanda?.origin_type ?? '');
  const originId = String(comanda?.origin_id ?? '');
  const comandaId = String(comanda?.id ?? '');
  const originStatus = (comanda?.origin_status as string | null | undefined) ?? null;
  const originContext = (comanda?.origin_context as OriginContext | null | undefined) ?? null;
  const moduleHref = comanda
    ? resolveComandaOperationalHref(comanda, { markExecution: kind === 'needs_executor' })
    : null;

  const plan = useMemo(
    () =>
      resolveCaixaConferenceActionPlan({
        originType,
        conferenceKind: kind,
        permissions,
        moduleHref,
        paidTotal: Number(comanda?.paid_total ?? 0),
      }),
    [originType, kind, permissions, moduleHref, comanda?.paid_total],
  );
  const [voidConfirm, setVoidConfirm] = useState(false);
  const [focusLineId, setFocusLineId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setExecutorOpen(false);
      setExecutorSaved(null);
    }
  }, [open]);

  useEffect(() => {
    setExecutorOpen(false);
    setExecutorSaved(null);
    setDetail(null);
    setVoidConfirm(false);
  }, [comandaId]);

  useEffect(() => {
    if (!open || !clinicId || !comandaId) return;
    let cancelled = false;
    setDetailLoading(true);
    void hubComandaApi
      .getComandaDetail(comandaId, clinicId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, clinicId, comandaId, detailTick]);

  useEffect(() => {
    if (!open || !clinicId || !originId || !plan.showMarkExecution) {
      setExecLines(null);
      return;
    }
    let cancelled = false;
    void hubFinancialApi
      .getServiceExecutionLines(clinicId, originType, originId)
      .then((res) => {
        if (!cancelled) setExecLines(res.lines ?? []);
      })
      .catch(() => {
        if (!cancelled) setExecLines(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, clinicId, originType, originId, plan.showMarkExecution, detailTick]);

  // Auto-abre executor quando o bloqueio é só comissão.
  useEffect(() => {
    if (open && kind === 'needs_executor' && plan.showMarkExecution) {
      setExecutorOpen(true);
    }
  }, [open, kind, plan.showMarkExecution, comandaId]);

  const detailComanda = (detail?.comanda ?? null) as Record<string, unknown> | null;
  const guardian =
    ((detailComanda?.guardian as HubComandaGuardianEmbed | null) ??
      (comanda?.guardian as HubComandaGuardianEmbed | null)) ||
    null;
  const pets: HubPublicComandaPet[] = detail?.pets?.length
    ? detail.pets
    : comanda?.pet
      ? [comanda.pet as HubPublicComandaPet]
      : [];
  const primaryPet = pets[0] ?? null;
  const primaryPetId = primaryPet?.id ?? null;
  const guardianId = guardian?.id ?? null;
  // Objeto estável: o formulário recarrega as linhas quando `item` muda.
  const executionItem = useMemo(
    () => ({ origin_type: originType, origin_id: originId, pet: primaryPet, guardian }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [originType, originId, primaryPetId, guardianId],
  );
  const amount = Number(detail?.balance_due ?? comanda?.balance_due ?? comanda?.total_amount ?? 0);
  const servicesTitle = comanda ? formatComandaListTitle(comanda) : '';
  const originLabel = formatComandaOriginLabel(originType);
  const items = detail?.items ?? [];
  const phoneDisplay = guardian?.phone ? formatBrPhoneDisplay(guardian.phone, '') : '';
  const wa = guardian?.phone ? waMeBaseUrl(guardian.phone) : null;
  const whenLabel = formatDateTimeRange(originContext?.starts_at ?? null, originContext?.ends_at ?? null);
  const openedLabel = comanda?.opened_at
    ? new Date(String(comanda.opened_at)).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : null;

  const originStatusLabel =
    originType === 'appointment'
      ? appointmentStatusLabelPt(originStatus)
      : originType === 'grooming_session'
        ? GROOMING_STAGE_PT[String(originStatus ?? '')] ?? originStatus
        : originStatus;

  const badgeClass =
    kind === 'ready'
      ? 'hub-dayboard__badge hub-dayboard__badge--open'
      : kind === 'needs_executor'
        ? 'hub-dayboard__badge hub-dayboard__badge--warn'
        : 'hub-dayboard__badge hub-dayboard__badge--pending';

  const needsCheckIn =
    plan.operationalAction === 'conclude_appointment' &&
    (originStatus === 'confirmed' || originStatus === 'pending_confirm');

  const staffNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of staffList) m.set(s.id, s.full_name || s.display_name || 'Profissional');
    return m;
  }, [staffList]);
  const executedLines = (execLines ?? []).filter((l) => l.executed_by_staff_id);
  const pendingExecLines = (execLines ?? []).filter(
    (l) => l.commission_requires_executor && !l.executed_by_staff_id,
  );
  const executorNames = Array.from(
    new Set(
      executedLines.map((l) => staffNameById.get(String(l.executed_by_staff_id)) ?? 'Profissional'),
    ),
  );
  const executorSummaryText = executorNames.length
    ? executorNames.length <= 2
      ? executorNames.join(' e ')
      : `${executorNames.slice(0, 2).join(', ')} +${executorNames.length - 2}`
    : null;

  const operationState: StepState = kind === 'operational_incomplete' ? 'current' : 'done';
  const executorDone = kind === 'ready' || Boolean(executorSaved);
  const executorState: StepState = executorDone
    ? 'done'
    : kind === 'needs_executor'
      ? 'current'
      : 'blocked';

  const syncThenRefresh = async () => {
    if (clinicId && comandaId) {
      try {
        await hubComandaApi.syncComandaFromOrigin(comandaId, clinicId, 'caixa');
      } catch {
        // sync é best-effort; refresh ainda atualiza enrich light
      }
    }
    await onRefresh();
    setDetailTick((t) => t + 1);
  };

  const runVoidComanda = async () => {
    if (!clinicId || !comandaId) return;
    setActionBusy(true);
    try {
      await hubComandaApi.checkout(comandaId, {
        clinic_id: clinicId,
        grouping: 'all',
        action: 'cancel',
        waive_reason: 'Atendimento cancelado — comanda anulada na conferência do caixa',
      });
      showSuccess('Comanda anulada.');
      await onRefresh();
      onResolved?.(comandaId);
    } catch (e) {
      showError((e as Error)?.message || 'Não foi possível anular a comanda.');
    } finally {
      setActionBusy(false);
      setVoidConfirm(false);
    }
  };

  const runOperational = async () => {
    if (!clinicId || !originId || !comanda) return;
    setActionBusy(true);
    try {
      if (plan.operationalAction === 'conclude_appointment') {
        const { stepsApplied } = await concludeAppointmentForCaixa({
          appointmentId: originId,
          clinicId,
          currentStatus: originStatus,
        });
        showSuccess(
          stepsApplied.includes('checked_in')
            ? 'Check-in feito e agendamento concluído.'
            : 'Agendamento concluído.',
        );
        await syncThenRefresh();
        setExecutorOpen(true);
        return;
      }
      if (plan.operationalAction === 'complete_encounter') {
        await hubEncountersApi.complete(originId, clinicId);
        showSuccess('Atendimento clínico finalizado.');
        await syncThenRefresh();
        setExecutorOpen(true);
        return;
      }
      if (plan.operationalAction === 'advance_grooming') {
        let stage = '';
        for (let i = 0; i < 6; i += 1) {
          const res = await hubGroomingApi.advanceSession(originId, clinicId, { skipResource: true });
          stage = String(res.session?.grooming_stage ?? '');
          if (GROOMING_DONE.has(stage)) break;
        }
        if (!GROOMING_DONE.has(stage)) {
          showError(
            'Não foi possível avançar até Pronto. Abra Banho & Tosa para concluir o estágio.',
          );
          await onRefresh();
          return;
        }
        showSuccess('Sessão de Banho & Tosa avançada até Pronto.');
        await syncThenRefresh();
        setExecutorOpen(true);
        return;
      }
    } catch (e) {
      showError((e as Error)?.message || 'Não foi possível concluir a operação.');
    } finally {
      setActionBusy(false);
    }
  };

  const footer = comanda ? (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', width: '100%' }}>
      <button
        type="button"
        className="hub-clientes__btn hub-clientes__btn--ghost"
        disabled={busy || actionBusy}
        onClick={() => onEditComanda(comandaId)}
      >
        <Pencil size={15} strokeWidth={2} aria-hidden />
        Editar comanda
      </button>
      <span style={{ flex: 1 }} />
      {plan.showHandoff ? (
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--ghost"
          disabled={busy || actionBusy || sendingToFinanceiro || !plan.handoffEnabled}
          aria-busy={sendingToFinanceiro}
          title={plan.handoffDisabledReason ?? 'Enviar ao financeiro sem receber agora'}
          onClick={() => {
            if (!plan.handoffEnabled) return;
            void onSendToFinanceiro(comandaId);
          }}
        >
          {sendingToFinanceiro ? (
            <Loader2 size={15} strokeWidth={2} className="hub-finance-page__spin" aria-hidden />
          ) : (
            <SendHorizonal size={15} strokeWidth={2} aria-hidden />
          )}
          {sendingToFinanceiro ? 'Enviando…' : 'Enviar ao financeiro'}
        </button>
      ) : null}
      {plan.showCharge ? (
        <button
          type="button"
          className={
            kind === 'ready'
              ? 'hub-clientes__btn hub-clientes__btn--primary'
              : 'hub-clientes__btn hub-clientes__btn--ghost'
          }
          disabled={busy || actionBusy}
          onClick={() => onCheckout(comandaId)}
        >
          <Coins size={15} strokeWidth={2} aria-hidden />
          Cobrar {formatBrl(amount)}
        </button>
      ) : null}
    </div>
  ) : null;

  return (
    <HubSidePanel
      open={open && !!comanda}
      onClose={onClose}
      title="Conferência da comanda"
      subtitle={[originLabel, servicesTitle].filter(Boolean).join(' · ') || undefined}
      size="default"
      contentKey={comandaId || 'conference'}
      footer={footer}
    >
      {comanda ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {queueTotal > 1 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: 13,
              }}
            >
              <span className="hub-clientes__muted">
                Pendência{' '}
                <strong style={{ color: 'var(--hub-text, #2b2520)' }}>
                  {queuePosition ?? '–'}/{queueTotal}
                </strong>{' '}
                da conferência
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                  disabled={busy || actionBusy || !onPrev}
                  onClick={onPrev}
                  aria-label="Pendência anterior"
                  title="Anterior"
                >
                  <ChevronLeft size={15} strokeWidth={2} aria-hidden />
                </button>
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                  disabled={busy || actionBusy || !onNext}
                  onClick={onNext}
                  aria-label="Próxima pendência"
                  title="Próxima"
                >
                  Próxima
                  <ChevronRight size={15} strokeWidth={2} aria-hidden />
                </button>
              </div>
            </div>
          ) : null}
          {/* Resumo */}
          <div
            style={{
              ...cardStyle,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              background: 'var(--hub-surface-muted, #faf8f5)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span
                className={badgeClass}
                style={{
                  alignSelf: 'flex-start',
                  ...(kind === 'origin_cancelled' ? cancelledBadgeStyle : null),
                }}
              >
                {caixaCarryoverConferenceLabel(kind)}
              </span>
              {openedLabel ? (
                <span className="hub-clientes__muted" style={{ fontSize: 12 }}>
                  Comanda aberta em {openedLabel}
                </span>
              ) : null}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>{formatBrl(amount)}</div>
              <div className="hub-clientes__muted" style={{ fontSize: 12 }}>
                a receber
              </div>
            </div>
          </div>

          {/* Tutor + Pet */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div style={cardStyle}>
              <p style={labelStyle}>Tutor</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                <User size={15} strokeWidth={2} aria-hidden />
                {guardian?.full_name || '—'}
              </div>
              {phoneDisplay ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8, fontSize: 13 }}>
                  <a
                    className="hub-clientes__link"
                    href={`tel:${String(guardian?.phone ?? '').replace(/\D/g, '')}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <Phone size={13} aria-hidden />
                    {phoneDisplay}
                  </a>
                  {wa ? (
                    <a
                      className="hub-clientes__link"
                      href={wa}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <MessageCircle size={13} aria-hidden />
                      WhatsApp
                    </a>
                  ) : null}
                </div>
              ) : detailLoading ? null : (
                <div className="hub-clientes__muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Sem telefone cadastrado
                </div>
              )}
            </div>
            <div style={cardStyle}>
              <p style={labelStyle}>{pets.length > 1 ? `Pets (${pets.length})` : 'Pet'}</p>
              {pets.length === 0 ? (
                <span className="hub-clientes__muted">—</span>
              ) : (
                pets.map((p) => {
                  const meta = [
                    p.species ? SPECIES_PT[p.species] ?? p.species : null,
                    p.breed,
                    p.size_tier ? sizeTierLabelPt(p.size_tier) : null,
                  ].filter(Boolean);
                  return (
                    <div key={p.id} style={{ marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                        <Dog size={15} strokeWidth={2} aria-hidden />
                        {p.name}
                      </div>
                      {meta.length ? (
                        <div className="hub-clientes__muted" style={{ fontSize: 12, marginTop: 2 }}>
                          {meta.join(' · ')}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Atendimento */}
          <div style={cardStyle}>
            <p style={labelStyle}>Atendimento</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 13, marginBottom: 10 }}>
              <span style={{ fontWeight: 600 }}>{originLabel}</span>
              {whenLabel ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <CalendarClock size={13} aria-hidden />
                  {whenLabel}
                </span>
              ) : null}
              {originContext?.staff_name ? (
                <span className="hub-clientes__muted">Agendado com {originContext.staff_name}</span>
              ) : null}
              {originStatusLabel ? (
                <span className="hub-clientes__pill">{originStatusLabel}</span>
              ) : null}
            </div>
            {detailLoading && !detail ? (
              <HubLoading variant="inline" label="Carregando serviços…" />
            ) : items.length > 0 ? (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map((it) => (
                  <li
                    key={it.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      fontSize: 13,
                      paddingBottom: 6,
                      borderBottom: '1px dashed var(--hub-border, #eee7df)',
                    }}
                  >
                    <span>
                      {it.quantity > 1 ? `${it.quantity}× ` : ''}
                      {it.description}
                      {it.pet_name && pets.length > 1 ? (
                        <span className="hub-clientes__muted"> · {it.pet_name}</span>
                      ) : null}
                    </span>
                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{formatBrl(Number(it.line_total ?? 0))}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="hub-clientes__muted" style={{ fontSize: 13 }}>
                {servicesTitle || 'Sem itens'}
              </span>
            )}
          </div>

          {kind === 'origin_cancelled' ? (
            <section
              style={{
                ...cardStyle,
                borderColor: '#fca5a5',
                background: '#fef2f2',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#b91c1c' }}>
                <Ban size={16} strokeWidth={2.2} aria-hidden />
                Atendimento {originStatus === 'no_show' ? 'com falta' : 'cancelado'}
              </div>
              <p style={{ margin: '6px 0 12px', fontSize: 13, lineHeight: 1.45, color: '#7f1d1d' }}>
                {plan.operationalHint}
              </p>
              {plan.operationalAction === 'void_comanda' ? (
                voidConfirm ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#7f1d1d' }}>
                      Anular {formatBrl(amount)}? Não gera cobrança.
                    </span>
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--primary"
                      style={dangerBtnStyle}
                      disabled={busy || actionBusy}
                      onClick={() => void runVoidComanda()}
                    >
                      {actionBusy ? 'Anulando…' : 'Confirmar anulação'}
                    </button>
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--ghost"
                      disabled={actionBusy}
                      onClick={() => setVoidConfirm(false)}
                    >
                      Voltar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="hub-clientes__btn hub-clientes__btn--primary"
                    style={dangerBtnStyle}
                    disabled={busy || actionBusy}
                    onClick={() => setVoidConfirm(true)}
                  >
                    <Ban size={15} strokeWidth={2} aria-hidden />
                    Anular comanda
                  </button>
                )
              ) : plan.operationalAction === 'resolve_cancellation' ? (
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary"
                  disabled={busy || actionBusy}
                  onClick={() => onEditComanda(comandaId)}
                >
                  <Pencil size={15} strokeWidth={2} aria-hidden />
                  {plan.operationalLabel}
                </button>
              ) : (
                <p className="hub-clientes__muted" style={{ margin: 0, fontSize: 12 }}>
                  Sem permissão para anular — peça a quem opera o caixa.
                </p>
              )}
            </section>
          ) : (
          <>
          {/* Passo 1: Operação */}
          <section
            style={{
              ...cardStyle,
              borderColor: operationState === 'current' ? '#fdba74' : cardStyle.border as string,
            }}
          >
            <StepHeader
              index={1}
              title="Operação"
              state={operationState}
              summary={
                operationState === 'done'
                  ? 'Concluída'
                  : originStatusLabel
                    ? `Atual: ${originStatusLabel}`
                    : 'Pendente'
              }
            />
            {operationState === 'current' ? (
              <>
                <p className="hub-clientes__muted" style={{ margin: '0 0 12px 34px', fontSize: 13, lineHeight: 1.45 }}>
                  {needsCheckIn
                    ? 'O agendamento ainda está como confirmado. O caixa faz o check-in e conclui em seguida.'
                    : plan.operationalHint}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginLeft: 34 }}>
                  {plan.operationalAction !== 'none' &&
                  plan.operationalAction !== 'open_module' &&
                  plan.operationalLabel ? (
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--primary"
                      disabled={busy || actionBusy || !originId}
                      onClick={() => void runOperational()}
                    >
                      <CheckCircle2 size={15} strokeWidth={2} aria-hidden />
                      {actionBusy ? 'Aplicando…' : needsCheckIn ? 'Fazer check-in e concluir' : plan.operationalLabel}
                    </button>
                  ) : null}
                  {plan.moduleHref ? (
                    <a
                      className={
                        plan.operationalAction === 'open_module'
                          ? 'hub-clientes__btn hub-clientes__btn--ghost'
                          : 'hub-clientes__link'
                      }
                      href={plan.moduleHref}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, textDecoration: 'none' }}
                    >
                      <ExternalLink size={14} strokeWidth={2} aria-hidden />
                      {plan.operationalAction === 'open_module'
                        ? plan.operationalLabel ?? 'Abrir módulo operacional'
                        : 'Abrir no módulo'}
                    </a>
                  ) : null}
                </div>
              </>
            ) : null}
          </section>

          {/* Passo 2: Executor */}
          <section
            style={{
              ...cardStyle,
              borderColor: executorState === 'current' ? '#fdba74' : cardStyle.border as string,
              opacity: executorState === 'blocked' && !executorOpen ? 0.85 : 1,
            }}
          >
            <StepHeader
              index={2}
              title="Executor"
              state={executorState}
              summary={
                executorSummaryText && pendingExecLines.length === 0
                  ? executorSummaryText
                  : executorSaved
                    ? `${executorSaved.staffLabel} · salvo`
                  : executorState === 'done'
                    ? executorSummaryText ?? 'Registrado'
                    : executorState === 'current'
                      ? 'Falta marcar quem executou'
                      : 'Marque após concluir a operação (ou já, se souber)'
              }
            />
            {plan.showMarkExecution && originId ? (
              <div style={{ marginLeft: 34 }}>
                {!executorOpen && execLines && execLines.length > 0 ? (
                  <ul
                    style={{
                      listStyle: 'none',
                      margin: 0,
                      padding: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      fontSize: 13,
                    }}
                  >
                    {execLines.map((l) => {
                      const who = l.executed_by_staff_id
                        ? staffNameById.get(l.executed_by_staff_id) ?? 'Profissional'
                        : null;
                      return (
                        <li
                          key={l.id}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
                        >
                          <span style={{ minWidth: 0 }}>
                            <span style={{ fontWeight: 600 }}>{l.name}</span>
                            {who ? (
                              <span
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  marginTop: 2,
                                  fontSize: 12,
                                  color: '#047857',
                                }}
                              >
                                <CheckCircle2 size={12} aria-hidden />
                                {who}
                              </span>
                            ) : (
                              <span
                                style={{
                                  display: 'block',
                                  marginTop: 2,
                                  fontSize: 12,
                                  color: l.commission_requires_executor ? '#c2410c' : undefined,
                                }}
                                className={l.commission_requires_executor ? undefined : 'hub-clientes__muted'}
                              >
                                {l.commission_requires_executor ? 'Sem executor' : 'Executor opcional'}
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            className={
                              who
                                ? 'hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm'
                                : 'hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm'
                            }
                            disabled={busy || actionBusy}
                            onClick={() => {
                              setFocusLineId(l.id);
                              setExecutorOpen(true);
                            }}
                          >
                            <UserCheck size={14} strokeWidth={2} aria-hidden />
                            {who ? 'Alterar executor' : 'Marcar executor'}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : !executorOpen ? (
                  <button
                    type="button"
                    className={
                      executorState === 'current'
                        ? 'hub-clientes__btn hub-clientes__btn--primary'
                        : 'hub-clientes__btn hub-clientes__btn--ghost'
                    }
                    disabled={busy || actionBusy}
                    onClick={() => {
                      setFocusLineId(null);
                      setExecutorOpen(true);
                    }}
                  >
                    <UserCheck size={15} strokeWidth={2} aria-hidden />
                    {executorDone || executedLines.length > 0 ? 'Alterar executor' : 'Marcar execução'}
                  </button>
                ) : executorOpen ? (
                  <MarkExecutionForm
                    open={executorOpen}
                    item={executionItem}
                    variant="compact"
                    idPrefix={`conf-exec-${comandaId.slice(0, 8)}`}
                    defaultStaffId={
                      (focusLineId
                        ? execLines?.find((l) => l.id === focusLineId)?.executed_by_staff_id
                        : null) ??
                      originContext?.staff_id ??
                      null
                    }
                    focusLineId={focusLineId}
                    keepOpenAfterSave={false}
                    onCancel={() => setExecutorOpen(false)}
                    onDone={async (result) => {
                      if (result) {
                        setExecutorSaved(result);
                        const saved = new Set(result.lineIds);
                        setExecLines((prev) =>
                          prev
                            ? prev.map((l) =>
                                saved.has(l.id)
                                  ? { ...l, executed_by_staff_id: result.staffId, executed_at: new Date().toISOString() }
                                  : l,
                              )
                            : prev,
                        );
                      }
                      setExecutorOpen(false);
                      await syncThenRefresh();
                    }}
                    showError={showError}
                    showSuccess={showSuccess}
                  />
                ) : null}
              </div>
            ) : (
              <p className="hub-clientes__muted" style={{ margin: '0 0 0 34px', fontSize: 13 }}>
                {permissions.canMarkExecution
                  ? 'Esta origem não exige marcar executor no caixa.'
                  : 'Sem permissão para marcar executor.'}
              </p>
            )}
          </section>

          {/* Passo 3: Fechamento */}
          <section style={cardStyle}>
            <StepHeader
              index={3}
              title="Cobrar ou enviar ao financeiro"
              state={kind === 'ready' ? 'current' : 'blocked'}
              summary={
                kind === 'ready'
                  ? 'Tudo certo — escolha no rodapé.'
                  : plan.handoffDisabledReason ?? 'Resolva os passos acima.'
              }
            />
            {kind !== 'ready' ? (
              <p
                className="hub-clientes__muted"
                style={{ margin: '0 0 0 34px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Circle size={10} aria-hidden />
                Cobrar já é possível; enviar ao financeiro libera quando a conferência estiver pronta.
              </p>
            ) : null}
          </section>
          </>
          )}
        </div>
      ) : null}
    </HubSidePanel>
  );
};

export default CaixaConferencePanel;
