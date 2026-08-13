import React, { useCallback, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { hubComandaApi } from '@petimi/hub-ui';
import { useHubCashSession } from '../contexts/HubCashSessionContext';
import { useHubUnit } from '../contexts/HubUnitContext';

function ymdToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function handoffOpenComandas(clinicId: string, unitId: string): Promise<{ count: number; errors: string[] }> {
  const res = await hubComandaApi.listComandas({
    clinic_id: clinicId,
    unit_id: unitId,
    status: 'aberta',
    enrich: true,
  });
  const abertas = (res.comandas ?? []).filter(
    (c) => !c.finance_handoff_at && c.status === 'aberta',
  );

  const today = ymdToday();
  const errors: string[] = [];
  let count = 0;

  for (const c of abertas) {
    try {
      await hubComandaApi.checkout(String(c.id), {
        clinic_id: clinicId,
        grouping: 'all',
        action: 'leave_pending',
        due_date: today,
        payment_timing: 'on_checkout',
      });
      count++;
    } catch (e: unknown) {
      errors.push(`#${String(c.id).slice(0, 8)}: ${(e as Error)?.message ?? 'Erro'}`);
    }
  }

  return { count, errors };
}

/**
 * Intercepta navegação para fora de /hub/caixa* quando o caixa está aberto
 * e há pendências. Renderiza um modal de saída com três opções.
 * Deve ser montado dentro de HubAppShell (acesso ao router e ao contexto).
 */
export function useCaixaExitGuard() {
  const { isOpen, pendingBillingCount, refresh } = useHubCashSession();
  const { clinicId, selectedUnit } = useHubUnit();
  const unitId = selectedUnit?.id ?? null;
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);

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
      return leavingCaixa && isOpen && pendingBillingCount > 0;
    },
    [isOpen, pendingBillingCount],
  );

  const blocker = useBlocker(shouldBlock);
  const isBlocked = blocker.state === 'blocked';

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
      const { errors } = await handoffOpenComandas(clinicId, unitId);
      if (errors.length > 0) {
        setHandoffError(`Falha em ${errors.length} comanda(s):\n${errors.join('\n')}`);
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
            Caixa aberto com pendências
          </h2>
          <p style={{ margin: '0 0 20px', fontSize: 14, color: '#555', lineHeight: 1.5 }}>
            O caixa está aberto e há{' '}
            <strong>{pendingBillingCount} item(ns)</strong> pendente(s) de cobrança.
            O que deseja fazer antes de sair?
          </p>
          {handoffError && (
            <p style={{ margin: '-8px 0 16px', fontSize: 13, color: '#dc2626' }}>{handoffError}</p>
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
  }, [isBlocked, pendingBillingCount, handoffBusy, handoffError, handleStay, handleHandoffAndLeave, handleLeaveAnyway]);

  return { ExitGuardModal };
}
