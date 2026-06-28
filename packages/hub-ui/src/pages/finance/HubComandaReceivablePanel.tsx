import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageCircle, Receipt, RotateCcw, Trash2 } from 'lucide-react';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import {
  hubFinancialApi,
  openHubPaymentReceiptPdf,
  type HubFinanceReceivableDetail,
  type HubPaymentMethod,
} from '../../api/hubFinancialApi';
import { hubInventoryApi, type HubInventoryItem, type HubInventoryLotRow } from '../../api/hubInventoryApi';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
import { hubComandaApi } from '../../api/hubComandaApi';
import {
  buildWhatsAppMessageChargePending,
  buildWhatsAppMessagePaymentReceipt,
  formatBrlLabel,
  formatDueDateLabel,
  guardianFirstName,
  paymentMethodLabel,
  waMeUrlWithText,
} from './hubComandaShareUtils';
import { useAlert } from '../../components/AlertProvider';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const RECEIVABLE_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  partially_paid: 'Parcial',
  paid: 'Pago',
  cancelled: 'Cancelado',
  refunded: 'Estornado',
};

const LINE_KIND_LABELS: Record<string, string> = {
  quote_line: 'Serviço (orçamento)',
  appointment_service: 'Serviço (agenda)',
  grooming_extra: 'Extra (banho/tosa)',
  manual: 'Manual',
  product: 'Produto (estoque)',
};

const PAYMENT_METHOD_LABELS: Record<HubPaymentMethod, string> = {
  pix: 'Pix',
  cash: 'Dinheiro',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  transfer: 'Transferência',
  payment_link: 'Link de pagamento',
  customer_credit: 'Crédito do tutor',
};

function statusLabel(status: string): string {
  return RECEIVABLE_STATUS_LABELS[status] ?? status;
}

function statusPillClass(status: string): string {
  if (status === 'paid') return 'hub-clientes__pill hub-clientes__pill--active';
  if (status === 'cancelled' || status === 'refunded') return 'hub-clientes__pill hub-clientes__pill--inactive-alert';
  if (status === 'partially_paid') return 'hub-clientes__pill hub-finance-page__pill--warning';
  return 'hub-clientes__pill hub-clientes__pill--inactive';
}

export type HubComandaReceivablePanelProps = {
  comandaId: string;
  receivableIds: string[];
  selectedReceivableId: string;
  onSelectReceivable: (id: string) => void;
  onRefreshComanda?: () => void;
};

export const HubComandaReceivablePanel: React.FC<HubComandaReceivablePanelProps> = ({
  comandaId,
  receivableIds,
  selectedReceivableId,
  onSelectReceivable,
  onRefreshComanda,
}) => {
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();
  const { hasPermission } = usePermissions();
  const { showError, showSuccess, showConfirm } = useAlert();

  const [detail, setDetail] = useState<HubFinanceReceivableDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<HubPaymentMethod>('pix');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [reversePaymentId, setReversePaymentId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [inventoryItems, setInventoryItems] = useState<HubInventoryItem[]>([]);
  const [inventoryLots, setInventoryLots] = useState<HubInventoryLotRow[]>([]);
  const [lineServiceTypes, setLineServiceTypes] = useState<HubServiceType[]>([]);
  const [productItemId, setProductItemId] = useState('');
  const [productLotId, setProductLotId] = useState('');
  const [productQty, setProductQty] = useState('1');
  const [productPrice, setProductPrice] = useState('');

  const activeReceivableId = selectedReceivableId || receivableIds[0] || '';

  const loadDetail = useCallback(async () => {
    if (!clinicId || !activeReceivableId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    try {
      const d = await hubFinancialApi.getReceivableDetail(activeReceivableId, clinicId);
      setDetail(d);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar recebível');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [activeReceivableId, clinicId, showError]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (!clinicId) return;
    void (async () => {
      try {
        const [inv, lots, types] = await Promise.all([
          hubInventoryApi.items.list(clinicId, true),
          hubInventoryApi.lots.list(clinicId),
          hubServiceTypesApi.list(clinicId, false, true),
        ]);
        setInventoryItems(inv.items ?? []);
        setInventoryLots(lots.lots ?? []);
        setLineServiceTypes(types.service_types ?? []);
      } catch {
        setInventoryItems([]);
        setInventoryLots([]);
        setLineServiceTypes([]);
      }
    })();
  }, [clinicId]);

  const lineServiceTypeById = useMemo(
    () => new Map(lineServiceTypes.map((type) => [type.id, type])),
    [lineServiceTypes],
  );

  const selectedProductItem = inventoryItems.find((item) => item.id === productItemId) ?? null;
  const lotsForSelectedItem = inventoryLots.filter((lot) => lot.item_id === productItemId);
  const selectedPayments = detail?.payments ?? [];
  const selectedAdjustments = detail?.adjustments ?? [];
  const selectedPaid = Number(detail?.paid_amount ?? 0);
  const selectedBalance = Number(
    detail?.balance_amount ?? Math.max(0, Number(detail?.final_amount ?? 0) - selectedPaid),
  );

  const lineTypeLabel = useCallback(
    (line: NonNullable<HubFinanceReceivableDetail['lines']>[number]) => {
      if (line.hub_service_type_id) {
        const type = lineServiceTypeById.get(line.hub_service_type_id);
        if (type) return type.name;
      }
      return LINE_KIND_LABELS[line.line_kind] ?? line.line_kind;
    },
    [lineServiceTypeById],
  );

  const onCreatePayment = async () => {
    if (!clinicId || !unitId || !detail) return;
    if (!hasPermission('hub.financial.write')) {
      showError('Sem permissão para registrar pagamentos.');
      return;
    }
    const amount = Number(String(paymentAmount).replace(',', '.'));
    if (Number.isNaN(amount) || amount <= 0) {
      showError('Informe um valor de pagamento válido.');
      return;
    }
    setPaymentLoading(true);
    try {
      let cashSessionId: string | null = null;
      if (paymentMethod === 'cash') {
        const cash = await hubFinancialApi.getCashSessionOpen(clinicId, unitId);
        cashSessionId = cash.cash_session?.id ?? null;
        if (!cashSessionId) {
          showError('Abra o caixa para receber em dinheiro.');
          return;
        }
      }
      await hubFinancialApi.createReceivablePayment(detail.id, {
        clinic_id: clinicId,
        amount,
        payment_method: paymentMethod,
        notes: paymentNotes.trim() || null,
        cash_session_id: cashSessionId,
      });
      showSuccess('Pagamento registrado.');
      setPaymentAmount('');
      setPaymentNotes('');
      await loadDetail();
      onRefreshComanda?.();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao registrar pagamento');
    } finally {
      setPaymentLoading(false);
    }
  };

  const onReversePayment = async () => {
    if (!clinicId || !reversePaymentId) return;
    if (!hasPermission('hub.financial.write')) {
      showError('Sem permissão para estornar pagamentos.');
      return;
    }
    if (!reverseReason.trim() || reverseReason.trim().length < 3) {
      showError('Informe o motivo do estorno (mín. 3 caracteres).');
      return;
    }
    try {
      await hubFinancialApi.reversePayment(reversePaymentId, {
        clinic_id: clinicId,
        reason: reverseReason.trim(),
      });
      showSuccess('Pagamento estornado.');
      setReversePaymentId(null);
      setReverseReason('');
      await loadDetail();
      onRefreshComanda?.();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao estornar pagamento');
    }
  };

  const onAddProductLine = async () => {
    if (!clinicId || !detail) return;
    if (!hasPermission('hub.inventory.write')) {
      showError('Sem permissão para baixar estoque.');
      return;
    }
    const qty = Number(productQty.replace(',', '.'));
    const price = Number((productPrice || String(selectedProductItem?.sale_amount ?? '0')).replace(',', '.'));
    if (!productItemId || !productLotId || Number.isNaN(qty) || qty <= 0 || Number.isNaN(price) || price < 0) {
      showError('Escolha produto, lote, quantidade e preço válidos.');
      return;
    }
    try {
      await hubFinancialApi.addReceivableProductLine(detail.id, {
        clinic_id: clinicId,
        item_id: productItemId,
        lot_id: productLotId,
        quantity: qty,
        unit_sale_amount: price,
      });
      showSuccess('Produto adicionado e estoque baixado.');
      setProductQty('1');
      setProductPrice('');
      await loadDetail();
      onRefreshComanda?.();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao adicionar produto');
    }
  };

  const onRemoveProductLine = async (lineId: string) => {
    if (!clinicId || !detail) return;
    showConfirm('Remover este produto e devolver ao estoque?', async () => {
      try {
        await hubFinancialApi.removeReceivableProductLine(detail.id, lineId, clinicId);
        showSuccess('Produto removido e estoque ajustado.');
        await loadDetail();
        onRefreshComanda?.();
      } catch (e) {
        showError((e as Error)?.message || 'Erro ao remover produto');
      }
    });
  };

  const onCancelReceivable = async () => {
    if (!clinicId || !detail) return;
    if (!hasPermission('hub.financial.write')) {
      showError('Sem permissão para cancelar recebíveis.');
      return;
    }
    const reason = window.prompt('Motivo do cancelamento do recebível:');
    if (!reason?.trim()) return;
    try {
      await hubFinancialApi.cancelReceivable(detail.id, { clinic_id: clinicId, reason: reason.trim() });
      showSuccess('Recebível cancelado.');
      await loadDetail();
      onRefreshComanda?.();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao cancelar recebível');
    }
  };

  const shareWhatsApp = async (mode: 'charge' | 'receipt') => {
    if (!clinicId || !detail?.guardian?.phone?.trim()) {
      showError('Cadastre um telefone válido no tutor para usar o WhatsApp.');
      return;
    }
    try {
      const firstName = guardianFirstName(detail.guardian.full_name);
      let msg: string;
      if (mode === 'charge') {
        const { public_token } = await hubComandaApi.ensurePublicToken(comandaId, clinicId);
        const publicUrl = hubComandaApi.publicLink(public_token);
        msg = buildWhatsAppMessageChargePending(
          firstName,
          formatBrlLabel(selectedBalance > 0 ? selectedBalance : Number(detail.final_amount)),
          formatDueDateLabel(detail.due_date ?? null),
          publicUrl,
        );
      } else {
        const lastPay = selectedPayments[0];
        msg = buildWhatsAppMessagePaymentReceipt(
          firstName,
          formatBrlLabel(Number(lastPay?.amount ?? selectedPaid)),
          paymentMethodLabel(lastPay?.payment_method ?? 'pix'),
        );
      }
      const wa = waMeUrlWithText(detail.guardian.phone, msg);
      if (!wa) {
        showError('Telefone inválido.');
        return;
      }
      window.open(wa, '_blank', 'noopener,noreferrer');
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao preparar WhatsApp');
    }
  };

  if (!receivableIds.length) {
    return (
      <div className="hub-clientes__panel-scroll">
        <h2 className="hub-clientes__panel-title">Cobrança</h2>
        <p className="hub-clientes__muted">Nenhum recebível vinculado a esta comanda.</p>
      </div>
    );
  }

  return (
    <div className="hub-clientes__panel-scroll">
      <div className="hub-clientes__panel-header">
        <div>
          <h2 className="hub-clientes__panel-title">Cobrança</h2>
          <p className="hub-clientes__muted">Recebível da comanda</p>
        </div>
      </div>

      {receivableIds.length > 1 ? (
        <div className="hub-finance-page__panel-section" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {receivableIds.map((rid) => (
            <button
              key={rid}
              type="button"
              className={`hub-clientes__btn hub-clientes__btn--sm ${rid === activeReceivableId ? 'hub-clientes__btn--primary' : 'hub-clientes__btn--outline'}`}
              onClick={() => onSelectReceivable(rid)}
            >
              #{rid.slice(0, 8)}
            </button>
          ))}
        </div>
      ) : null}

      {loading || !detail ? (
        <p className="hub-clientes__muted">{loading ? 'Carregando…' : 'Recebível não encontrado.'}</p>
      ) : (
        <>
          <div className="hub-finance-page__detail-hero">
            <span className={statusPillClass(detail.status)}>{statusLabel(detail.status)}</span>
            <strong>{formatBrl(Number(detail.final_amount))}</strong>
            <span className="hub-clientes__muted">Criado em {formatDateTime(detail.created_at)}</span>
          </div>

          <section className="hub-finance-page__panel-section">
            <h3 className="hub-finance-page__subsection-title">Resumo financeiro</h3>
            <div className="hub-finance-page__detail-grid">
              <div><span>Original</span><strong>{formatBrl(Number(detail.original_amount ?? 0))}</strong></div>
              <div><span>Final</span><strong>{formatBrl(Number(detail.final_amount ?? 0))}</strong></div>
              <div><span>Pago</span><strong>{formatBrl(selectedPaid)}</strong></div>
              <div><span>Saldo</span><strong>{formatBrl(selectedBalance)}</strong></div>
            </div>
          </section>

          <section className="hub-finance-page__panel-section">
            <h3 className="hub-finance-page__subsection-title">Enviar ao cliente</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['pending', 'partially_paid', 'partial'].includes(detail.status) && selectedBalance > 0.009 ? (
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--outline hub-clientes__btn--sm"
                  onClick={() => void shareWhatsApp('charge')}
                >
                  <MessageCircle size={15} strokeWidth={2} />
                  Cobrança por WhatsApp
                </button>
              ) : null}
              {selectedPaid > 0 ? (
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--outline hub-clientes__btn--sm"
                  onClick={() => void shareWhatsApp('receipt')}
                >
                  <MessageCircle size={15} strokeWidth={2} />
                  Comprovante por WhatsApp
                </button>
              ) : null}
            </div>
          </section>

          <section className="hub-finance-page__panel-section">
            <h3 className="hub-finance-page__subsection-title">Linhas do recebível</h3>
            {detail.lines?.length ? (
              <div className="hub-clientes__table-wrap hub-finance-page__panel-table-wrap">
                <table className="hub-clientes__table hub-finance-page__table hub-finance-page__panel-table">
                  <thead>
                    <tr>
                      <th>Linha</th>
                      <th>Tipo</th>
                      <th className="hub-finance-page__th-num">Qtd.</th>
                      <th className="hub-finance-page__th-num">Total</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((line) => (
                      <tr key={line.id}>
                        <td><strong>{line.description || lineTypeLabel(line)}</strong></td>
                        <td>{lineTypeLabel(line)}</td>
                        <td className="hub-finance-page__td-num">{Number(line.quantity ?? 0)}</td>
                        <td className="hub-finance-page__td-num">{formatBrl(Number(line.line_total ?? 0))}</td>
                        <td className="hub-clientes__td-actions">
                          {line.line_kind === 'product' ? (
                            <button
                              type="button"
                              className="hub-servicos__icon-btn hub-servicos__icon-btn--danger"
                              title="Remover produto"
                              aria-label="Remover produto"
                              onClick={() => void onRemoveProductLine(line.id)}
                            >
                              <Trash2 size={16} strokeWidth={2} />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="hub-clientes__muted">Sem linhas carregadas.</p>
            )}
          </section>

          {hasPermission('hub.financial.write') && !['cancelled', 'refunded', 'paid'].includes(detail.status) ? (
            <section className="hub-finance-page__panel-section">
              <h3 className="hub-finance-page__subsection-title">Registrar pagamento</h3>
              <div className="hub-finance-page__panel-form-grid">
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="comanda-fin-payment-amount">Valor</label>
                  <input
                    id="comanda-fin-payment-amount"
                    className="hub-clientes__input"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder={formatBrl(Number(detail.final_amount))}
                  />
                </div>
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="comanda-fin-payment-method">Método</label>
                  <select
                    id="comanda-fin-payment-method"
                    className="hub-clientes__select-input"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as HubPaymentMethod)}
                  >
                    {(Object.keys(PAYMENT_METHOD_LABELS) as HubPaymentMethod[]).map((method) => (
                      <option key={method} value={method}>{PAYMENT_METHOD_LABELS[method]}</option>
                    ))}
                  </select>
                </div>
                <div className="hub-clientes__field hub-finance-page__panel-form-span">
                  <label className="hub-clientes__label" htmlFor="comanda-fin-payment-notes">Observações</label>
                  <input
                    id="comanda-fin-payment-notes"
                    className="hub-clientes__input"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    placeholder="Opcional"
                  />
                </div>
              </div>
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary hub-finance-page__panel-primary"
                disabled={paymentLoading}
                onClick={() => void onCreatePayment()}
              >
                {paymentLoading ? 'Registrando…' : 'Registrar pagamento'}
              </button>
            </section>
          ) : null}

          <section className="hub-finance-page__panel-section">
            <h3 className="hub-finance-page__subsection-title">Pagamentos</h3>
            {selectedPayments.length === 0 ? (
              <p className="hub-clientes__muted">Nenhum pagamento registrado.</p>
            ) : (
              <div className="hub-clientes__table-wrap hub-finance-page__panel-table-wrap">
                <table className="hub-clientes__table hub-finance-page__table hub-finance-page__panel-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Método</th>
                      <th className="hub-finance-page__th-num">Valor</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPayments.map((payment) => (
                      <tr key={payment.id}>
                        <td>{formatDateTime(payment.payment_date)}</td>
                        <td>{PAYMENT_METHOD_LABELS[payment.payment_method] ?? payment.payment_method}</td>
                        <td className="hub-finance-page__td-num">{formatBrl(Number(payment.amount ?? 0))}</td>
                        <td className="hub-clientes__td-actions">
                          <button
                            type="button"
                            className="hub-servicos__icon-btn"
                            title="Gerar comprovante"
                            aria-label="Gerar comprovante"
                            onClick={() => void openHubPaymentReceiptPdf(payment.id, clinicId!)}
                          >
                            <Receipt size={16} strokeWidth={2} />
                          </button>
                          {hasPermission('hub.financial.write') ? (
                            <button
                              type="button"
                              className="hub-servicos__icon-btn hub-servicos__icon-btn--danger"
                              title="Estornar pagamento"
                              aria-label="Estornar pagamento"
                              onClick={() => {
                                setReversePaymentId(payment.id);
                                setReverseReason('');
                              }}
                            >
                              <RotateCcw size={16} strokeWidth={2} />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {reversePaymentId ? (
            <section className="hub-finance-page__panel-section">
              <h3 className="hub-finance-page__subsection-title">Estornar pagamento</h3>
              <p className="hub-clientes__muted">
                Estornando pagamento <strong>{reversePaymentId.slice(0, 8)}…</strong>
              </p>
              <textarea
                className="hub-clientes__input"
                rows={2}
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                placeholder="Motivo do estorno (mín. 3 caracteres)"
              />
              <div className="hub-clientes__footer-btns" style={{ marginTop: 8 }}>
                <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={() => setReversePaymentId(null)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary"
                  disabled={!reverseReason.trim() || reverseReason.trim().length < 3}
                  onClick={() => void onReversePayment()}
                >
                  Confirmar estorno
                </button>
              </div>
            </section>
          ) : null}

          {hasPermission('hub.inventory.write') && detail.status !== 'cancelled' ? (
            <section className="hub-finance-page__panel-section">
              <h3 className="hub-finance-page__subsection-title">Adicionar produto de estoque</h3>
              <div className="hub-finance-page__panel-form-grid">
                <div className="hub-clientes__field hub-finance-page__panel-form-span">
                  <label className="hub-clientes__label" htmlFor="comanda-fin-prod-item">Produto</label>
                  <select
                    id="comanda-fin-prod-item"
                    className="hub-clientes__select-input"
                    value={productItemId}
                    onChange={(e) => {
                      const next = e.target.value;
                      setProductItemId(next);
                      setProductLotId('');
                      const item = inventoryItems.find((x) => x.id === next);
                      setProductPrice(item ? String(item.sale_amount ?? '') : '');
                    }}
                  >
                    <option value="">—</option>
                    {inventoryItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · estoque {Number(item.qty_on_hand ?? 0)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="comanda-fin-prod-lot">Lote</label>
                  <select
                    id="comanda-fin-prod-lot"
                    className="hub-clientes__select-input"
                    value={productLotId}
                    onChange={(e) => setProductLotId(e.target.value)}
                  >
                    <option value="">—</option>
                    {lotsForSelectedItem.map((lot) => (
                      <option key={lot.id} value={lot.id}>
                        {lot.lot_code || 'Sem lote'} · {Number(lot.qty_on_hand ?? 0)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="comanda-fin-prod-qty">Qtd.</label>
                  <input id="comanda-fin-prod-qty" className="hub-clientes__input" value={productQty} onChange={(e) => setProductQty(e.target.value)} inputMode="decimal" />
                </div>
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="comanda-fin-prod-price">Preço unit.</label>
                  <input id="comanda-fin-prod-price" className="hub-clientes__input" value={productPrice} onChange={(e) => setProductPrice(e.target.value)} inputMode="decimal" />
                </div>
              </div>
              <button type="button" className="hub-clientes__btn hub-clientes__btn--primary hub-finance-page__panel-primary" onClick={() => void onAddProductLine()}>
                Adicionar produto de estoque
              </button>
            </section>
          ) : null}

          {detail.status !== 'cancelled' && hasPermission('hub.financial.write') ? (
            <div className="hub-clientes__footer-btns">
              <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={() => void onCancelReceivable()}>
                Cancelar recebível
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};

export default HubComandaReceivablePanel;
