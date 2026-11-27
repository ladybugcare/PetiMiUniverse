import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import {
  caixaExitPromptCopy,
  enviarPendentesAoFinanceiro,
  isPreviousDaySaoPaulo,
  shouldPromptCaixaExitOnLeave,
  type CaixaExitPromptDecision,
  type HubPublicBusinessHours,
} from '@petimi/hub-ui';
import { useHubCashSession } from '../contexts/HubCashSessionContext';
import { useHubUnit } from '../contexts/HubUnitContext';
import { hubClinicPublicProfileApi } from '../services/hubClinicPublicProfileApi';

/**
 * Intercepta navegação para fora de /hub/caixa* quando o caixa está aberto
 * com pendências **e** estamos perto/fora do fechamento (ou turno de dia anterior).
 * No meio do expediente não bloqueia — pendências são esperadas.
 */
export function useCaixaExitGuard() {
  const { isOpen, pendingBillingCount, openedAt, refresh, isStatusFresh } = useHubCashSession();
  const { clinicId, selectedUnit } = useHubUnit();
  const unitId = selectedUnit?.id ?? null;
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [businessHours, setBusinessHours] = useState<HubPublicBusinessHours | null>(null);
  const [promptDecision, setPromptDecision] = useState<CaixaExitPromptDecision>({
    prompt: false,
    reason: 'none',
    closeHm: null,
  });

  const isPreviousDay = isPreviousDaySaoPaulo(openedAt);

  useEffect(() => {
    if (!clinicId) {
      setBusinessHours(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await hubClinicPublicProfileApi.getEditor(clinicId);
        if (cancelled) return;
        setBusinessHours((res.profile?.business_hours as HubPublicBusinessHours) ?? null);
      } catch {
        if (!cancelled) setBusinessHours(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId]);

  const evaluatePrompt = useCallback(
    (now = new Date()) =>
      shouldPromptCaixaExitOnLeave({
        isOpen,
        pendingBillingCount,
        isPreviousDay,
        businessHours,
        now,
      }),
    [isOpen, pendingBillingCount, isPreviousDay, businessHours],
  );

  const shouldBlock = useCallback(
    ({
      currentLocation,
      nextLocation,
    }: {
      currentLocation: { pathname: string };
      nextLocation: { pathname: string };
    }) => {
      const leavingCaixa =
        currentLocation.pathname.startsWith('/hub/caixa') &&
        !nextLocation.pathname.startsWith('/hub/caixa');
      if (!leavingCaixa) return false;
      return evaluatePrompt().prompt;
    },
    [evaluatePrompt],
  );

  const blocker = useBlocker(shouldBlock);
  const isBlocked = blocker.state === 'blocked';

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    setPromptDecision(evaluatePrompt());
  }, [blocker.state, evaluatePrompt]);

  // Revalida só quando o status local pode estar atrasado (ex.: pós-fechamento).
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (isStatusFresh()) return;

    let cancelled = false;
    const proceed = blocker.proceed;
    void (async () => {
      const status = await refresh();
      if (cancelled) return;
      if (status && (!status.isOpen || status.pendingBillingCount <= 0)) {
        proceed?.();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blocker.state, blocker.proceed, refresh, isStatusFresh]);

  const handleStay = useCallback(() => {
    setHandoffError(null);
    blocker.reset?.();
  }, [blocker]);

  const handleHandoffAndLeave = useCallback(async () => {
    if (!clinicId || !unitId) {
      blocker.proceed?.();
      return;
    }
    setHandoffBusy(true);
    setHandoffError(null);
    try {
      const { errors } = await enviarPendentesAoFinanceiro(clinicId, unitId);
      if (errors.length > 0) {
        setHandoffError(`Falha em ${errors.length} item(ns):\n${errors.join('\n')}`);
        setHandoffBusy(false);
        return;
      }
      await refresh();
      blocker.proceed?.();
    } catch {
      setHandoffError('Erro ao enviar pendentes. Tente novamente.');
      setHandoffBusy(false);
    }
  }, [blocker, clinicId, unitId, refresh]);

  const handleLeaveAnyway = useCallback(() => {
    setHandoffError(null);
    blocker.proceed?.();
  }, [blocker]);

  const copy = useMemo(
    () => caixaExitPromptCopy(promptDecision.reason, promptDecision.closeHm),
    [promptDecision.reason, promptDecision.closeHm],
  );

  const ExitGuardModal: React.FC = useCallback(() => {
    if (!isBlocked) return null;

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="caixa-exit-guard-title"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.45)',
        }}
      >
        <div
          style={{
            background: '#fff',
            borderRadius: 16,
            padding: '28px 32px',
            maxWidth: 420,
            width: '100%',
            margin: '0 16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          }}
        >
          <h2
            id="caixa-exit-guard-title"
            style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: '#1a1a1a' }}
          >
            {copy.title}
          </h2>
          <p style={{ margin: '0 0 20px', fontSize: 14, color: '#555', lineHeight: 1.5 }}>
            {copy.bodyLead} Há{' '}
            <strong>{pendingBillingCount} item(ns)</strong> pendente(s) de cobrança. O que deseja
            fazer antes de sair?
          </p>
          {handoffError && (
            <p
              style={{
                margin: '-8px 0 16px',
                fontSize: 13,
                color: '#dc2626',
                whiteSpace: 'pre-line',
              }}
            >
              {handoffError}
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              type="button"
              onClick={handleStay}
              disabled={handoffBusy}
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: '1px solid #e5e5e5',
                background: '#f5f5f5',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              Voltar ao Caixa e resolver
            </button>
            <button
              type="button"
              onClick={() => void handleHandoffAndLeave()}
              disabled={handoffBusy}
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: '1px solid #fcd34d',
                background: '#fffbeb',
                fontWeight: 600,
                fontSize: 14,
                cursor: handoffBusy ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                color: '#92400e',
                opacity: handoffBusy ? 0.6 : 1,
              }}
            >
              {handoffBusy ? 'Enviando…' : 'Enviar pendentes ao financeiro e sair'}
            </button>
            <button
              type="button"
              onClick={handleLeaveAnyway}
              disabled={handoffBusy}
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: 'none',
                background: 'transparent',
                fontWeight: 400,
                fontSize: 13,
                cursor: 'pointer',
                textAlign: 'left',
                color: '#888',
              }}
            >
              Sair mesmo assim (caixa continua aberto)
            </button>
          </div>
        </div>
      </div>
    );
  }, [
    isBlocked,
    pendingBillingCount,
    handoffBusy,
    handoffError,
    handleStay,
    handleHandoffAndLeave,
    handleLeaveAnyway,
    copy.title,
    copy.bodyLead,
  ]);

  return { ExitGuardModal };
}
