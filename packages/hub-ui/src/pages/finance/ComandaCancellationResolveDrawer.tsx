import { useCallback, useEffect, useState } from 'react';
import { Undo2 } from 'lucide-react';
import { HubCancelButton } from '../../components/HubCancelButton';
import { HubSidePanel } from '../../components/HubSidePanel';
import { hubComandaApi, type CancellationResolution } from '../../api/hubComandaApi';
import { hubFinancialApi } from '../../api/hubFinancialApi';
import { formatComandaOriginLabel } from './comandaListPreview';

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
  const originType = formatComandaOriginLabel(
    comanda?.cancellation_operational_type ?? comanda?.origin_type ?? '',
  );
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
      titleIcon={<Undo2 size={20} strokeWidth={1.75} aria-hidden />}
      subtitle="Escolha como tratar o pagamento já recebido na comanda."
      contentKey={comandaId ?? 'empty'}
      footer={
        comanda ? (
          <div className="hub-finance-page__drawer-footer">
            <HubCancelButton onClick={onClose} disabled={busy} />
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              onClick={() => void onSubmit()}
              disabled={busy || !comandaId || reason.trim().length < 3}
            >
              {busy ? 'Salvando…' : 'Confirmar resolução'}
            </button>
          </div>
        ) : null
      }
    >
      {comanda ? (
        <>
          <div className="hub-adjustments__facts" aria-label="Comanda cancelada">
            <div>
              <span>Tutor</span>
              <strong>{guardianName}</strong>
            </div>
            <div>
              <span>Pet</span>
              <strong>{petName}</strong>
            </div>
            <div>
              <span>Origem</span>
              <strong>{originType}</strong>
            </div>
            <div>
              <span>Pago</span>
              <strong>{formatBrl(paidTotal)}</strong>
            </div>
          </div>
          <p className="hub-clientes__muted" style={{ marginTop: 0 }}>
            Cancelado em {cancelledAt}
          </p>

          <fieldset className="hub-finance-page__resolve-options">
            <legend className="hub-clientes__label">Como tratar o valor</legend>
            <label className={`hub-finance-page__resolve-option${resolution === 'refund' ? ' hub-finance-page__resolve-option--active' : ''}`}>
              <input
                type="radio"
                name="cancellation-resolution"
                value="refund"
                checked={resolution === 'refund'}
                onChange={() => setResolution('refund')}
              />
              <span>
                <strong>Reembolso</strong>
                <span>Estorna os pagamentos da cobrança.</span>
              </span>
            </label>
            <label className={`hub-finance-page__resolve-option${resolution === 'customer_credit' ? ' hub-finance-page__resolve-option--active' : ''}`}>
              <input
                type="radio"
                name="cancellation-resolution"
                value="customer_credit"
                checked={resolution === 'customer_credit'}
                onChange={() => setResolution('customer_credit')}
              />
              <span>
                <strong>Crédito para o tutor</strong>
                <span>Estorna os pagamentos e deixa o valor como saldo na loja.</span>
              </span>
            </label>
            <label className={`hub-finance-page__resolve-option${resolution === 'keep_billing' ? ' hub-finance-page__resolve-option--active' : ''}`}>
              <input
                type="radio"
                name="cancellation-resolution"
                value="keep_billing"
                checked={resolution === 'keep_billing'}
                onChange={() => setResolution('keep_billing')}
              />
              <span>
                <strong>Manter cobrança</strong>
                <span>Os pagamentos continuam valendo, como em um no-show cobrado.</span>
              </span>
            </label>
          </fieldset>

          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="resolve-reason">
              Motivo
            </label>
            <textarea
              id="resolve-reason"
              className="hub-clientes__input"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Descreva a decisão (mín. 3 caracteres)"
            />
          </div>

          {error ? (
            <p className="hub-clientes__error" role="alert">
              {error}
            </p>
          ) : null}
        </>
      ) : (
        <p className="hub-clientes__muted">Selecione uma comanda na fila.</p>
      )}
    </HubSidePanel>
  );
}
