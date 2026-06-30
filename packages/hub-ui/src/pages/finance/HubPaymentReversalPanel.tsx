import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import { hubFinancialApi, type HubCashSessionSummary } from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

export const HubPaymentReversalPanel: React.FC = () => {
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();
  const { hasPermission } = usePermissions();
  const { showError, showSuccess } = useAlert();

  const [cashSummary, setCashSummary] = useState<HubCashSessionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [reversePaymentId, setReversePaymentId] = useState('');
  const [reverseTargetId, setReverseTargetId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState('');

  const load = useCallback(async () => {
    if (!clinicId || !unitId) {
      setCashSummary(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { cash_session } = await hubFinancialApi.getCashSessionOpen(clinicId, unitId);
      if (cash_session?.id) {
        setCashSummary(await hubFinancialApi.getCashSessionSummary(cash_session.id, clinicId));
      } else {
        setCashSummary(null);
      }
    } catch {
      setCashSummary(null);
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onReverseConfirm = async () => {
    if (!clinicId) return;
    if (!hasPermission('hub.financial.write')) {
      showError('Sem permissão para estornar pagamentos.');
      return;
    }
    const paymentId = (reverseTargetId ?? reversePaymentId).trim();
    if (!paymentId) {
      showError('Informe o ID do pagamento.');
      return;
    }
    if (!reverseReason.trim() || reverseReason.trim().length < 3) {
      showError('Informe o motivo do estorno (mín. 3 caracteres).');
      return;
    }
    try {
      const res = await hubFinancialApi.reversePayment(paymentId, {
        clinic_id: clinicId,
        reason: reverseReason.trim(),
      });
      showSuccess(res.warning || 'Pagamento estornado e recebível recalculado.');
      setReversePaymentId('');
      setReverseReason('');
      setReverseTargetId(null);
      await load();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao estornar pagamento');
    }
  };

  return (
    <section className="hub-finance-page__section">
      <h2 className="hub-clientes__form-title">Estorno de pagamento</h2>
      <p className="hub-clientes__muted" style={{ marginTop: 0 }}>
        Para estornos de comanda, abra a ficha em{' '}
        <Link to="/hub/financeiro" className="hub-clientes__link-btn">
          Recebíveis → Comanda
        </Link>
        . Use esta seção para estornos avulsos por UUID do pagamento.
      </p>

      {loading ? (
        <HubLoading variant="block" label="Carregando pagamentos…" />
      ) : cashSummary?.payments?.length ? (
        <div className="hub-finance-page__panel-section" style={{ marginBottom: 20 }}>
          <h3 className="hub-finance-page__subsection-title">Recebimentos em dinheiro (sessão aberta)</h3>
          <div className="hub-clientes__table-wrap">
            <table className="hub-clientes__table hub-finance-page__table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th className="hub-finance-page__th-num">Valor</th>
                  <th className="hub-clientes__th-actions">Ação</th>
                </tr>
              </thead>
              <tbody>
                {(cashSummary.payments ?? []).map((p) => (
                  <tr key={p.id}>
                    <td>{p.payment_date ? new Date(p.payment_date).toLocaleString('pt-BR') : '—'}</td>
                    <td className="hub-finance-page__td-num">{formatBrl(Number(p.amount ?? 0))}</td>
                    <td className="hub-clientes__td-actions">
                      <button
                        type="button"
                        className="hub-servicos__btn-ghost-sm"
                        onClick={() => {
                          setReverseTargetId(p.id);
                          setReverseReason('');
                        }}
                      >
                        Estornar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <p className="hub-clientes__muted" style={{ marginBottom: 12 }}>
        Ou informe manualmente o UUID do pagamento.
      </p>
      <div className="hub-finance-page__card-panel hub-finance-page__card-panel--stack">
        {reverseTargetId ? (
          <p className="hub-clientes__muted">
            Estornando pagamento <strong>{reverseTargetId.slice(0, 8)}…</strong>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
              style={{ marginLeft: 8 }}
              onClick={() => setReverseTargetId(null)}
            >
              Trocar
            </button>
          </p>
        ) : (
          <div className="hub-clientes__field hub-finance-page__field-grow">
            <label className="hub-clientes__label" htmlFor="fin-reverse-payment">
              ID do pagamento
            </label>
            <input
              id="fin-reverse-payment"
              className="hub-clientes__input"
              value={reversePaymentId}
              onChange={(e) => setReversePaymentId(e.target.value)}
              placeholder="UUID do hub_payments"
            />
          </div>
        )}
        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="fin-reverse-reason">
            Motivo do estorno
          </label>
          <textarea
            id="fin-reverse-reason"
            className="hub-clientes__input"
            rows={2}
            value={reverseReason}
            onChange={(e) => setReverseReason(e.target.value)}
            placeholder="Descreva o motivo (mín. 3 caracteres)"
          />
        </div>
        <div>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={!reverseReason.trim() || reverseReason.trim().length < 3}
            onClick={() => void onReverseConfirm()}
          >
            Confirmar estorno
          </button>
        </div>
      </div>
    </section>
  );
};

export default HubPaymentReversalPanel;
