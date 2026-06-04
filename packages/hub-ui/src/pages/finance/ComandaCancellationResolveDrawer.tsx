import { useCallback, useEffect, useState } from 'react';
import { HubSidePanel } from '../../components/HubSidePanel';
import { hubComandaApi, type CancellationResolution } from '../../api/hubComandaApi';
import { hubFinancialApi } from '../../api/hubFinancialApi';

function formatBrl(n: number): string {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export type ComandaCancellationResolveDrawerProps = {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  unitId: string;
  comanda: Record<string, unknown> | null;
  onResolved?: () => void;
};

export function ComandaCancellationResolveDrawer({
  open,
  onClose,
  clinicId,
  unitId,
  comanda,
  onResolved,
}: ComandaCancellationResolveDrawerProps) {
  const [resolution, setResolution] = useState<CancellationResolution>('refund');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cashSessionId, setCashSessionId] = useState<string | null>(null);

  const comandaId = comanda?.id as string | undefined;
  const paidTotal = Number(comanda?.paid_total ?? 0);
  const guardianName = (comanda?.guardian as { full_name?: string } | null)?.full_name ?? '—';
  const petName = (comanda?.pet as { name?: string } | null)?.name ?? '—';
  const originType = String(comanda?.cancellation_operational_type ?? comanda?.origin_type ?? '—');
  const cancelledAt = comanda?.cancellation_operational_at
    ? new Date(String(comanda.cancellation_operational_at)).toLocaleString('pt-BR')
    : '—';

  useEffect(() => {
    if (!open) {
      setReason('');
      setResolution('refund');
      setError(null);
      return;
    }
    if (resolution !== 'customer_credit') return;
    let cancelled = false;
    void (async () => {
      try {
        const { cash_session } = await hubFinancialApi.getCashSessionOpen(clinicId, unitId);
        if (!cancelled) setCashSessionId(cash_session?.id ?? null);
      } catch {
        if (!cancelled) setCashSessionId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, resolution, clinicId, unitId]);

  const onSubmit = useCallback(async () => {
    if (!comandaId) return;
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setError('Informe o motivo (mínimo 3 caracteres).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await hubComandaApi.resolveCancellation(comandaId, {
        clinic_id: clinicId,
        resolution,
        reason: trimmed,
        cash_session_id: resolution === 'customer_credit' ? cashSessionId : undefined,
      });
      onResolved?.();
      onClose();
    } catch (e: unknown) {
      setError((e as Error)?.message || 'Erro ao resolver cancelamento');
    } finally {
      setBusy(false);
    }
  }, [comandaId, clinicId, resolution, reason, cashSessionId, onResolved, onClose]);

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title="Resolver cancelamento"
      subtitle="Escolha como tratar o pagamento já recebido na comanda."
    >
      {comanda ? (
        <div className="hub-finance-page__card-panel hub-finance-page__card-panel--stack">
          <p className="hub-clientes__muted" style={{ margin: 0 }}>
            <strong>{guardianName}</strong> · {petName}
          </p>
          <p className="hub-clientes__muted" style={{ margin: 0 }}>
            Origem: {originType} · Cancelado em {cancelledAt}
          </p>
          <p style={{ margin: '8px 0 0' }}>
            Valor pago na comanda: <strong>{formatBrl(paidTotal)}</strong>
          </p>

          <fieldset className="hub-finance-page__resolve-options">
            <legend className="hub-clientes__label">Resolução</legend>
            <label className="hub-finance-page__resolve-option">
              <input
                type="radio"
                name="cancellation-resolution"
                value="refund"
                checked={resolution === 'refund'}
                onChange={() => setResolution('refund')}
              />
              Reembolso — estorna pagamentos nos recebíveis
            </label>
            <label className="hub-finance-page__resolve-option">
              <input
                type="radio"
                name="cancellation-resolution"
                value="customer_credit"
                checked={resolution === 'customer_credit'}
                onChange={() => setResolution('customer_credit')}
              />
              Crédito para o tutor — estorna pagamentos e credita saldo de loja
            </label>
            <label className="hub-finance-page__resolve-option">
              <input
                type="radio"
                name="cancellation-resolution"
                value="keep_billing"
                checked={resolution === 'keep_billing'}
                onChange={() => setResolution('keep_billing')}
              />
              Manter cobrança — pagamentos permanecem (ex.: no-show cobrado)
            </label>
          </fieldset>

          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="resolve-reason">
              Motivo (obrigatório)
            </label>
            <textarea
              id="resolve-reason"
              className="hub-clientes__input"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Descreva a decisão financeira"
            />
          </div>

          {error ? (
            <p className="hub-clientes__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="hub-finance-page__resolve-actions">
            <button type="button" className="hub-clientes__btn" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              onClick={() => void onSubmit()}
              disabled={busy || !comandaId}
            >
              {busy ? 'Salvando…' : 'Confirmar resolução'}
            </button>
          </div>
        </div>
      ) : (
        <p className="hub-clientes__muted">Selecione uma comanda na fila.</p>
      )}
    </HubSidePanel>
  );
}
