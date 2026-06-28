import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, MessageCircle } from 'lucide-react';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubDateField } from '../../components/HubDateField';
import {
  hubComandaApi,
  downloadHubComandaPdf,
  type HubComandaDetailResponse,
  type HubComandaOriginType,
} from '../../api/hubComandaApi';
import { hubFinancialApi, type HubPaymentMethod } from '../../api/hubFinancialApi';
import {
  buildWhatsAppMessageChargePending,
  buildWhatsAppMessagePaymentReceipt,
  formatBrlLabel,
  formatDueDateLabel,
  guardianFirstName,
  paymentMethodLabel,
  waMeUrlWithText,
} from './hubComandaShareUtils';
import '../clientes/clientes.css';
import './hub-finance-page.css';
import '../orcamentos/orcamentos-page.css';

function formatBrl(n: number): string {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export type ComandaCheckoutDrawerProps = {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  unitId: string;
  mode?: 'caixa' | 'financeiro';
  onSuccess?: (payload: {
    receivableIds: string[];
    comandaId: string;
    kind: 'leave_pending' | 'receive_now' | 'cancel';
  }) => void;
} & (
  | { comandaId: string; originType?: never; originId?: never }
  | { comandaId?: never; originType: HubComandaOriginType; originId: string }
);

export function ComandaCheckoutDrawer({
  open,
  onClose,
  clinicId,
  unitId,
  mode = 'caixa',
  onSuccess,
  ...rest
}: ComandaCheckoutDrawerProps) {
  const comandaId = 'comandaId' in rest ? rest.comandaId : undefined;
  const originType = 'originType' in rest ? rest.originType : undefined;
  const originId = 'originId' in rest ? rest.originId : undefined;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<HubComandaDetailResponse | null>(null);
  const [grouping, setGrouping] = useState<'all' | 'by_pet'>('all');
  const [tutorGroupIdx, setTutorGroupIdx] = useState(0);
  const [action, setAction] = useState<'receive_now' | 'leave_pending' | 'cancel'>('receive_now');
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<HubPaymentMethod>('pix');
  const [cashSessionId, setCashSessionId] = useState<string | null>(null);
  /** advance = antecipado (comanda pode permanecer aberta até concluir o serviço). */
  const [paymentTiming, setPaymentTiming] = useState<'on_checkout' | 'advance'>('on_checkout');
  const [waiveReason, setWaiveReason] = useState('');
  const [successState, setSuccessState] = useState<{
    kind: 'leave_pending' | 'receive_now';
    comandaId: string;
    amount: number;
    paymentMethod?: HubPaymentMethod;
    receivableIds: string[];
  } | null>(null);
  const [shareBusy, setShareBusy] = useState(false);

  const loadComanda = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (comandaId) {
        // Abrir pelo ID da comanda diretamente (ex.: Caixa, comandas manuais)
        const d = await hubComandaApi.getComandaDetail(comandaId, clinicId);
        setDetail(d);
      } else if (originType && originId) {
        try {
          const d = await hubComandaApi.openComanda({ clinic_id: clinicId, origin_type: originType, origin_id: originId });
          setDetail(d);
        } catch (openErr: unknown) {
          const msg = (openErr as Error)?.message ?? '';
          /** 409 «Já existe comanda aberta» — carregar detalhe existente; outros erros propagam. */
          if (msg.includes('Já existe comanda aberta')) {
            const d = await hubComandaApi.getComandaByOrigin({ clinic_id: clinicId, origin_type: originType, origin_id: originId });
            setDetail(d);
          } else {
            throw openErr;
          }
        }
      } else {
        throw new Error('Informe originType+originId ou comandaId para abrir o checkout.');
      }
    } catch (e: unknown) {
      setError((e as Error)?.message || 'Erro ao abrir comanda');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [clinicId, comandaId, originType, originId]);

  const syncFromOrigin = useCallback(async () => {
    const cid = detail?.comanda?.id as string | undefined;
    if (!cid) return;
    setLoading(true);
    setError(null);
    try {
      const d = await hubComandaApi.syncComandaFromOrigin(cid, clinicId, mode);
      setDetail(d);
    } catch (e: unknown) {
      setError((e as Error)?.message || 'Erro ao sincronizar');
    } finally {
      setLoading(false);
    }
  }, [clinicId, detail?.comanda?.id, mode]);

  useEffect(() => {
    if (!open) {
      setDetail(null);
      setError(null);
      setSuccessState(null);
      return;
    }
    void loadComanda();
  }, [open, loadComanda]);

  useEffect(() => {
    if (!open || paymentMethod !== 'cash') return;
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
  }, [open, paymentMethod, clinicId, unitId]);

  const openItems = useMemo(() => {
    if (!detail) return [];
    const set = new Set(detail.open_item_ids);
    return detail.items.filter((it) => set.has(it.id));
  }, [detail]);

  const checkoutLocked = Boolean(detail?.edit_scopes && !detail.edit_scopes[mode]);

  const checkoutLockedMessage = useMemo(() => {
    const reason = detail?.edit_scopes?.locked_reason;
    const moduleLabel = mode === 'financeiro' ? 'Financeiro' : 'Caixa';
    if (!reason) return `Esta comanda não pode ser cobrada no ${moduleLabel.toLowerCase()}.`;
    if (reason === 'paid_and_complete') {
      return 'Comanda quitada e serviço concluído. Alterações de valor via estorno no Financeiro.';
    }
    if (reason === 'finance_handoff' && mode === 'caixa') {
      return 'Comanda enviada ao financeiro. Cobrança pelo módulo Financeiro.';
    }
    if (reason === 'closed') {
      return 'Comanda não está aberta.';
    }
    return `Esta comanda não pode ser cobrada no ${moduleLabel.toLowerCase()}.`;
  }, [detail?.edit_scopes?.locked_reason, mode]);

  const groupTotals = useMemo(() => {
    if (!openItems.length) return [];
    if (grouping === 'all') {
      const t = openItems.reduce((s, it) => s + Number(it.line_total ?? 0), 0);
      return [{ groupIndex: 0, label: 'Tudo junto', total: t }];
    }
    const byPet = new Map<string | null, typeof openItems>();
    for (const it of openItems) {
      const pid = it.pet_id ?? null;
      if (!byPet.has(pid)) byPet.set(pid, []);
      byPet.get(pid)!.push(it);
    }
    const nullItems = byPet.get(null) ?? [];
    byPet.delete(null);
    const rows: { groupIndex: number; label: string; total: number }[] = [];
    let gi = 0;
    const sortedPetIds = [...byPet.keys()].filter((k): k is string => k != null).sort();
    for (const pid of sortedPetIds) {
      const arr = byPet.get(pid)!;
      const t = arr.reduce((s, it) => s + Number(it.line_total ?? 0), 0);
      const petLabel = arr[0]?.pet_name ?? `Pet (${pid.slice(0, 8)}…)`;
      rows.push({
        groupIndex: gi++,
        label: petLabel,
        total: t,
      });
    }
    if (nullItems.length) {
      const t = nullItems.reduce((s, it) => s + Number(it.line_total ?? 0), 0);
      if (rows.length === 0) {
        rows.push({ groupIndex: 0, label: 'Tutor (itens sem pet)', total: t });
      } else {
        const attach = Math.min(Math.max(0, tutorGroupIdx), rows.length - 1);
        rows[attach] = {
          ...rows[attach],
          total: round2(rows[attach].total + t),
          label: `${rows[attach].label} + tutor`,
        };
      }
    }
    return rows;
  }, [openItems, grouping, tutorGroupIdx]);

  const submit = async () => {
    if (!detail?.comanda?.id) return;
    const comandaId = detail.comanda.id as string;
    setLoading(true);
    setError(null);
    try {
      if (action === 'cancel') {
        if (waiveReason.trim().length < 3) {
          setError('Informe o motivo do cancelamento (mín. 3 caracteres).');
          setLoading(false);
          return;
        }
        await hubComandaApi.checkout(comandaId, {
          clinic_id: clinicId,
          grouping: 'all',
          action: 'cancel',
          waive_reason: waiveReason.trim(),
          payment_timing: 'on_checkout',
        });
        onSuccess?.({ receivableIds: [], comandaId, kind: 'cancel' });
        onClose();
        return;
      }

      if (action === 'leave_pending') {
        const totalPending = groupTotals.reduce((s, g) => s + g.total, 0);
        const res = await hubComandaApi.checkout(comandaId, {
          clinic_id: clinicId,
          grouping,
          tutor_items_group_index: grouping === 'by_pet' ? tutorGroupIdx : undefined,
          action: 'leave_pending',
          due_date: dueDate,
          payment_timing: paymentTiming,
        });
        setSuccessState({
          kind: 'leave_pending',
          comandaId,
          amount: totalPending,
          receivableIds: res.receivable_ids ?? [],
        });
        return;
      }

      const payments = groupTotals
        .filter((g) => g.total > 0.009)
        .map((g) => ({
          group_index: g.groupIndex,
          amount: g.total,
          payment_method: paymentMethod,
          cash_session_id: paymentMethod === 'cash' ? cashSessionId : null,
        }));

      if (openItems.length > 0 && payments.length === 0) {
        setError('Não há valor por grupo para receber. Verifique os itens em aberto.');
        setLoading(false);
        return;
      }

      if (paymentMethod === 'cash' && payments.length > 0 && !cashSessionId) {
        setError('Abra o caixa nesta unidade para receber em dinheiro.');
        setLoading(false);
        return;
      }

      const res = await hubComandaApi.checkout(comandaId, {
        clinic_id: clinicId,
        grouping,
        tutor_items_group_index: grouping === 'by_pet' ? tutorGroupIdx : undefined,
        action: 'receive_now',
        payments: payments.length ? payments : undefined,
        payment_timing: paymentTiming,
      });
      const paidAmount = payments.reduce((s, p) => s + p.amount, 0);
      setSuccessState({
        kind: 'receive_now',
        comandaId,
        amount: paidAmount,
        paymentMethod,
        receivableIds: res.receivable_ids,
      });
    } catch (e: unknown) {
      setError((e as Error)?.message || 'Erro no checkout');
    } finally {
      setLoading(false);
    }
  };

  const guardianPhone = useMemo(() => {
    const g = detail?.comanda?.guardian as { phone?: string | null; full_name?: string } | null | undefined;
    return g?.phone?.trim() ?? '';
  }, [detail]);

  const guardianName = useMemo(() => {
    const g = detail?.comanda?.guardian as { full_name?: string } | null | undefined;
    return g?.full_name ?? '';
  }, [detail]);

  const openSuccessWhatsApp = async () => {
    if (!successState || !guardianPhone) return;
    setShareBusy(true);
    try {
      const { public_token } = await hubComandaApi.ensurePublicToken(successState.comandaId, clinicId);
      const publicUrl = hubComandaApi.publicLink(public_token);
      const firstName = guardianFirstName(guardianName);
      const msg =
        successState.kind === 'leave_pending'
          ? buildWhatsAppMessageChargePending(
              firstName,
              formatBrlLabel(successState.amount),
              formatDueDateLabel(dueDate),
              publicUrl,
            )
          : buildWhatsAppMessagePaymentReceipt(
              firstName,
              formatBrlLabel(successState.amount),
              paymentMethodLabel(successState.paymentMethod ?? paymentMethod),
            );
      const wa = waMeUrlWithText(guardianPhone, msg);
      if (wa) window.open(wa, '_blank', 'noopener,noreferrer');
    } finally {
      setShareBusy(false);
    }
  };

  const downloadSuccessPdf = async () => {
    if (!successState) return;
    setShareBusy(true);
    try {
      await downloadHubComandaPdf(successState.comandaId, clinicId);
    } finally {
      setShareBusy(false);
    }
  };

  const finishSuccess = () => {
    if (successState) {
      onSuccess?.({
        receivableIds: successState.receivableIds,
        comandaId: successState.comandaId,
        kind: successState.kind,
      });
    }
    setSuccessState(null);
    onClose();
  };

  return (
    <HubSidePanel
      open={open}
      title={successState ? 'Cobrança registrada' : 'Cobrar — Comanda'}
      subtitle={
        successState
          ? 'Envie a confirmação ou cobrança ao cliente antes de fechar.'
          : 'Confirme os itens e registre o pagamento ou envie ao financeiro.'
      }
      onClose={successState ? finishSuccess : onClose}
      footer={
        successState ? (
          <div className="hub-finance-page__drawer-footer">
            <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={finishSuccess}>
              Concluir
            </button>
          </div>
        ) : (
          <div className="hub-finance-page__drawer-footer">
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost"
              onClick={onClose}
              disabled={loading}
            >
              Fechar
            </button>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              onClick={() => void submit()}
              disabled={loading || !detail || checkoutLocked}
            >
              {loading ? 'Processando…' : 'Confirmar'}
            </button>
          </div>
        )
      }
    >
      <div className="hub-finance-page__card-panel hub-finance-page__card-panel--stack">
        {successState ? (
          <section className="hub-orcamento-novo__card hub-quote-ready__message-card">
            <p className="hub-orcamento-novo__topbar-subtitle">
              {successState.kind === 'leave_pending'
                ? 'Cobrança pendente criada. Avise o tutor pelo WhatsApp ou compartilhe a comanda.'
                : 'Pagamento registrado. Envie a confirmação ao tutor se desejar.'}
            </p>
            <div className="hub-quote-ready__message-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="hub-orcamento-novo__btn hub-orcamento-novo__btn--primary"
                disabled={shareBusy || !guardianPhone}
                title={!guardianPhone ? 'Cadastre o telefone do tutor' : undefined}
                onClick={() => void openSuccessWhatsApp()}
              >
                <MessageCircle size={18} aria-hidden />
                Abrir WhatsApp
              </button>
              <button
                type="button"
                className="hub-orcamento-novo__btn hub-orcamento-novo__btn--outline"
                disabled={shareBusy}
                onClick={() => void downloadSuccessPdf()}
              >
                <Download size={18} aria-hidden />
                Baixar PDF da comanda
              </button>
            </div>
            {!guardianPhone ? (
              <p className="hub-quote-ready__wa-hint">Sem telefone no tutor — use o PDF ou copie a mensagem na ficha da comanda.</p>
            ) : null}
          </section>
        ) : (
          <>
        {error && (
          <p className="hub-clientes__error" role="alert">
            {error}
          </p>
        )}

        {loading && !detail && (
          <p className="hub-clientes__muted">Carregando comanda…</p>
        )}

        {detail && checkoutLocked ? (
          <p className="hub-clientes__muted" role="status">
            {checkoutLockedMessage}
          </p>
        ) : detail ? (
          <>
          {(() => {
            const gu = detail.comanda.guardian as { full_name?: string } | null;
            const pet = detail.comanda.pet as { name?: string } | null;
            const tutorPet = [gu?.full_name, pet?.name].filter(Boolean).join(' · ');
            return tutorPet ? (
              <p className="hub-clientes__muted">
                <strong>{tutorPet}</strong>
              </p>
            ) : null;
          })()}
          <p className="hub-clientes__muted">
            Origem: <strong>{String(detail.comanda.origin_type ?? originType ?? '—')}</strong> · {openItems.length} item(ns) em aberto
          </p>

            {typeof detail.paid_total === 'number' && (
              <div className="hub-finance-page__summary-row">
                <span>Já pago: <strong>{formatBrl(detail.paid_total)}</strong></span>
                {typeof detail.balance_due === 'number' && (
                  <span>Saldo a cobrar: <strong>{formatBrl(detail.balance_due)}</strong></span>
                )}
                {detail.operational_complete === false && (
                  <p className="hub-clientes__muted">
                    Serviço ainda não concluído — a comanda pode permanecer aberta após pagamento antecipado.
                  </p>
                )}
              </div>
            )}

            {originType && originType !== 'manual' && (
              <div>
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                  disabled={loading}
                  onClick={() => void syncFromOrigin()}
                >
                  Sincronizar itens com o serviço
                </button>
              </div>
            )}

            <div>
              <p className="hub-clientes__label">Itens em aberto</p>
              <ul className="hub-finance-page__item-list">
                {openItems.map((it) => (
                  <li key={it.id} className="hub-finance-page__item-list-row">
                    <span>{it.description}</span>
                    <span>{formatBrl(Number(it.line_total ?? 0))}</span>
                    {it.pet_id && <span className="hub-clientes__muted">(pet)</span>}
                  </li>
                ))}
              </ul>
            </div>

            <fieldset className="hub-finance-page__resolve-options">
              <legend className="hub-clientes__label">Agrupamento</legend>
              <label className="hub-finance-page__resolve-option">
                <input
                  type="radio"
                  name="checkout-grp"
                  checked={grouping === 'all'}
                  onChange={() => setGrouping('all')}
                />
                Tudo em uma cobrança
              </label>
              <label className="hub-finance-page__resolve-option">
                <input
                  type="radio"
                  name="checkout-grp"
                  checked={grouping === 'by_pet'}
                  onChange={() => setGrouping('by_pet')}
                />
                Separar por pet
              </label>
              {grouping === 'by_pet' && (
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="tutor-group-idx">
                    Itens do tutor — anexar ao grupo índice
                  </label>
                  <input
                    id="tutor-group-idx"
                    type="number"
                    min={0}
                    className="hub-clientes__input"
                    style={{ maxWidth: 80 }}
                    value={tutorGroupIdx}
                    onChange={(e) => setTutorGroupIdx(Number(e.target.value) || 0)}
                  />
                </div>
              )}
            </fieldset>

            <fieldset className="hub-finance-page__resolve-options">
              <legend className="hub-clientes__label">Ação</legend>
              <label className="hub-finance-page__resolve-option">
                <input
                  type="radio"
                  name="checkout-act"
                  checked={action === 'receive_now'}
                  onChange={() => setAction('receive_now')}
                />
                Receber agora
              </label>
              <label className="hub-finance-page__resolve-option">
                <input
                  type="radio"
                  name="checkout-act"
                  checked={action === 'leave_pending'}
                  onChange={() => setAction('leave_pending')}
                />
                Deixar pendente (conta a receber)
              </label>
              <label className="hub-finance-page__resolve-option">
                <input
                  type="radio"
                  name="checkout-act"
                  checked={action === 'cancel'}
                  onChange={() => setAction('cancel')}
                />
                Cancelar / sem cobrança
              </label>
            </fieldset>

            {action === 'leave_pending' && (
              <div className="hub-clientes__field">
                <HubDateField
                  id="checkout-due-date"
                  label="Vencimento"
                  valueIso={dueDate}
                  onChangeIso={setDueDate}
                />
              </div>
            )}

            {action === 'receive_now' && (
              <fieldset className="hub-finance-page__resolve-options">
                <legend className="hub-clientes__label">Momento do pagamento</legend>
                <label className="hub-finance-page__resolve-option">
                  <input
                    type="radio"
                    name="checkout-pt"
                    checked={paymentTiming === 'on_checkout'}
                    onChange={() => setPaymentTiming('on_checkout')}
                  />
                  No fecho (após o serviço)
                </label>
                <label className="hub-finance-page__resolve-option">
                  <input
                    type="radio"
                    name="checkout-pt"
                    checked={paymentTiming === 'advance'}
                    onChange={() => setPaymentTiming('advance')}
                  />
                  Antecipado (antes de concluir o serviço)
                </label>
              </fieldset>
            )}

            {action === 'receive_now' && (
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="checkout-payment-method">
                  Forma de pagamento (aplicada a cada grupo)
                </label>
                <select
                  id="checkout-payment-method"
                  className="hub-clientes__select-input"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as HubPaymentMethod)}
                >
                  <option value="pix">Pix</option>
                  <option value="cash">Dinheiro</option>
                  <option value="credit_card">Cartão de crédito</option>
                  <option value="debit_card">Cartão de débito</option>
                  <option value="transfer">Transferência</option>
                  <option value="payment_link">Link de pagamento</option>
                  <option value="customer_credit">Crédito do tutor</option>
                </select>
                {paymentMethod === 'cash' && (
                  <p className="hub-clientes__muted">
                    {cashSessionId
                      ? `Caixa aberto (sessão ${cashSessionId.slice(0, 8)}…)`
                      : 'Não há caixa aberto — abra no módulo Caixa.'}
                  </p>
                )}
              </div>
            )}

            {action === 'cancel' && (
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="checkout-waive-reason">
                  Motivo do cancelamento (obrigatório)
                </label>
                <textarea
                  id="checkout-waive-reason"
                  className="hub-clientes__input"
                  rows={3}
                  value={waiveReason}
                  onChange={(e) => setWaiveReason(e.target.value)}
                  placeholder="Informe o motivo (mín. 3 caracteres)"
                />
              </div>
            )}

            {action === 'receive_now' && groupTotals.length > 0 && (
              <div>
                <p className="hub-clientes__label">Resumo por cobrança</p>
                <ul className="hub-finance-page__item-list">
                  {groupTotals.map((g) => (
                    <li key={g.groupIndex} className="hub-finance-page__item-list-row">
                      <span>{g.label}</span>
                      <strong>{formatBrl(g.total)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : null}
          </>
        )}
      </div>
    </HubSidePanel>
  );
}

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
