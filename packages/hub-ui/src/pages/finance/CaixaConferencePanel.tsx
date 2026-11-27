import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Coins, ExternalLink, Pencil, SendHorizonal, UserCheck } from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { HubSidePanel } from '../../components/HubSidePanel';
import { hubClinicalApi } from '../../api/hubClinicalApi';
import { hubComandaApi } from '../../api/hubComandaApi';
import { hubGroomingApi } from '../../api/hubGroomingApi';
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

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

const GROOMING_DONE = new Set(['ready', 'delivered', 'closed']);

const sectionStyle: React.CSSProperties = {
  padding: '14px 14px 12px',
  borderRadius: 12,
  border: '1px solid var(--hub-border, #e8e4de)',
  background: 'var(--hub-surface, #fff)',
};

export type CaixaConferencePanelProps = {
  open: boolean;
  comanda: Record<string, unknown> | null;
  onClose: () => void;
  /** Após mutação operacional / executor — recarregar listas do caixa. */
  onRefresh: () => void | Promise<void>;
  onCheckout: (comandaId: string) => void;
  onEditComanda: (comandaId: string) => void;
  onSendToFinanceiro: (comandaId: string) => void | Promise<void>;
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
  showError,
  showSuccess,
  busy = false,
}) => {
  const clinicId = getStoredClinicId();
  const { hasPermission } = usePermissions();
  const [actionBusy, setActionBusy] = useState(false);
  const [executorOpen, setExecutorOpen] = useState(false);
  const [executorSaved, setExecutorSaved] = useState<MarkExecutionSavedResult | null>(null);

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
      }),
    [originType, kind, permissions, moduleHref],
  );

  useEffect(() => {
    if (!open) {
      setExecutorOpen(false);
      setExecutorSaved(null);
    }
  }, [open]);

  useEffect(() => {
    setExecutorOpen(false);
    setExecutorSaved(null);
  }, [comandaId]);

  // Auto-abre executor quando o bloqueio é só comissão.
  useEffect(() => {
    if (open && kind === 'needs_executor' && plan.showMarkExecution) {
      setExecutorOpen(true);
    }
  }, [open, kind, plan.showMarkExecution, comandaId]);

  const guardian = (comanda?.guardian as { full_name?: string } | null) ?? null;
  const pet = (comanda?.pet as { name?: string } | null) ?? null;
  const tutorPet = [guardian?.full_name, pet?.name].filter(Boolean).join(' / ') || 'Conferência';
  const amount = Number(comanda?.balance_due ?? comanda?.total_amount ?? 0);
  const servicesTitle = comanda ? formatComandaListTitle(comanda) : '';
  const originLabel = formatComandaOriginLabel(originType);

  const badgeClass =
    kind === 'ready'
      ? 'hub-dayboard__badge hub-dayboard__badge--open'
      : kind === 'needs_executor'
        ? 'hub-dayboard__badge hub-dayboard__badge--warn'
        : 'hub-dayboard__badge hub-dayboard__badge--pending';

  const originStatusHint =
    originType === 'appointment' && originStatus
      ? `Status na agenda: ${appointmentStatusLabelPt(originStatus)}.`
      : null;

  const syncThenRefresh = async () => {
    if (clinicId && comandaId) {
      try {
        await hubComandaApi.syncComandaFromOrigin(comandaId, clinicId, 'caixa');
      } catch {
        // sync é best-effort; refresh ainda atualiza enrich light
      }
    }
    await onRefresh();
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
        await hubClinicalApi.complete(originId, clinicId);
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
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: 'flex-end',
        width: '100%',
      }}
    >
      {plan.showCharge ? (
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--ghost"
          disabled={busy || actionBusy}
          onClick={() => onCheckout(comandaId)}
        >
          <Coins size={15} strokeWidth={2} aria-hidden />
          Cobrar
        </button>
      ) : null}
      {plan.showHandoff ? (
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--ghost"
          disabled={busy || actionBusy || !plan.handoffEnabled}
          title={plan.handoffDisabledReason ?? 'Enviar ao financeiro sem receber agora'}
          onClick={() => {
            if (!plan.handoffEnabled) return;
            void onSendToFinanceiro(comandaId);
          }}
        >
          <SendHorizonal size={15} strokeWidth={2} aria-hidden />
          Enviar ao financeiro
        </button>
      ) : null}
      <button
        type="button"
        className="hub-clientes__btn hub-clientes__btn--ghost"
        disabled={busy || actionBusy}
        onClick={() => onEditComanda(comandaId)}
      >
        <Pencil size={15} strokeWidth={2} aria-hidden />
        Editar comanda
      </button>
    </div>
  ) : null;

  return (
    <HubSidePanel
      open={open && !!comanda}
      onClose={onClose}
      title={tutorPet}
      subtitle={[originLabel, servicesTitle].filter(Boolean).join(' · ') || undefined}
      size="default"
      contentKey={comandaId || 'conference'}
      footer={footer}
    >
      {comanda ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span className={badgeClass}>{caixaCarryoverConferenceLabel(kind)}</span>
            <span style={{ fontSize: 15, fontWeight: 600 }}>
              {formatBrl(amount)}
              <span className="hub-clientes__muted" style={{ fontWeight: 400, marginLeft: 6, fontSize: 13 }}>
                a receber
              </span>
            </span>
          </div>

          {!plan.handoffEnabled && plan.handoffDisabledReason ? (
            <p
              className="hub-clientes__muted"
              style={{ margin: 0, fontSize: 12, lineHeight: 1.4 }}
            >
              {plan.handoffDisabledReason}
            </p>
          ) : null}

          <section style={sectionStyle}>
            <h3 className="hub-clientes__form-title" style={{ fontSize: 14, margin: '0 0 6px' }}>
              1. Operação
            </h3>
            <p className="hub-clientes__muted" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.45 }}>
              {plan.operationalHint}
              {originStatusHint ? ` ${originStatusHint}` : ''}
              {plan.operationalAction === 'conclude_appointment' &&
              originStatus &&
              (originStatus === 'confirmed' || originStatus === 'pending_confirm')
                ? ' O caixa fará o check-in e em seguida concluirá.'
                : ''}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
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
                  {actionBusy
                    ? 'Aplicando…'
                    : plan.operationalAction === 'conclude_appointment' &&
                        (originStatus === 'confirmed' || originStatus === 'pending_confirm')
                      ? 'Check-in e concluir'
                      : plan.operationalLabel}
                </button>
              ) : null}
              {plan.operationalAction === 'open_module' && plan.moduleHref ? (
                <a
                  className="hub-clientes__btn hub-clientes__btn--ghost"
                  href={plan.moduleHref}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
                >
                  <ExternalLink size={14} strokeWidth={2} aria-hidden />
                  {plan.operationalLabel ?? 'Abrir módulo operacional'}
                </a>
              ) : null}
              {plan.operationalAction === 'none' ? (
                <span
                  className="hub-clientes__muted"
                  style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <CheckCircle2 size={14} strokeWidth={2} aria-hidden />
                  Nada pendente na operação
                </span>
              ) : null}
              {plan.moduleHref &&
              plan.operationalAction !== 'open_module' &&
              plan.operationalAction !== 'none' ? (
                <a className="hub-clientes__link" href={plan.moduleHref} style={{ fontSize: 13 }}>
                  Abrir módulo
                </a>
              ) : null}
            </div>
          </section>

          <section style={sectionStyle}>
            <h3 className="hub-clientes__form-title" style={{ fontSize: 14, margin: '0 0 6px' }}>
              2. Executor
            </h3>
            {plan.showMarkExecution && originId ? (
              <>
                <p className="hub-clientes__muted" style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.45 }}>
                  Quem executou o serviço (base de comissões).
                </p>
                {!executorOpen && executorSaved ? (
                  <div
                    role="status"
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: '#ecfdf5',
                      border: '1px solid #a7f3d0',
                      color: '#065f46',
                      fontSize: 13,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircle2 size={15} strokeWidth={2} aria-hidden />
                      <strong>{executorSaved.staffLabel}</strong>
                      <span style={{ fontWeight: 400 }}>· execução salva</span>
                    </span>
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                      onClick={() => setExecutorOpen(true)}
                    >
                      Ver / editar
                    </button>
                  </div>
                ) : null}
                {!executorOpen && !executorSaved ? (
                  <button
                    type="button"
                    className="hub-clientes__btn hub-clientes__btn--ghost"
                    disabled={busy || actionBusy}
                    onClick={() => setExecutorOpen(true)}
                  >
                    <UserCheck size={15} strokeWidth={2} aria-hidden />
                    Marcar execução
                  </button>
                ) : null}
                {executorOpen ? (
                  <MarkExecutionForm
                    open={executorOpen}
                    item={{
                      origin_type: originType,
                      origin_id: originId,
                      pet,
                      guardian,
                    }}
                    variant="compact"
                    idPrefix={`conf-exec-${comandaId.slice(0, 8)}`}
                    onCancel={() => setExecutorOpen(false)}
                    onDone={async (result) => {
                      if (result) setExecutorSaved(result);
                      await syncThenRefresh();
                    }}
                    showError={showError}
                    showSuccess={showSuccess}
                  />
                ) : null}
              </>
            ) : (
              <p className="hub-clientes__muted" style={{ margin: 0, fontSize: 13 }}>
                {permissions.canMarkExecution
                  ? 'Esta origem não exige marcar executor no caixa.'
                  : 'Sem permissão para marcar executor (financeiro ou criar recebível).'}
              </p>
            )}
          </section>
        </div>
      ) : null}
    </HubSidePanel>
  );
};

export default CaixaConferencePanel;
