import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, MessageCircle, Phone, User } from 'lucide-react';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubLoading } from '../../components/HubLoading';
import { HubDateField } from '../../components/HubDateField';
import {
  hubComandaApi,
  downloadHubComandaPdf,
  type HubComandaDetailResponse,
  type HubComandaOriginType,
} from '../../api/hubComandaApi';
import {
  hubFinancialApi,
  type HubFinanceReceivableDetail,
  type HubPaymentMethod,
} from '../../api/hubFinancialApi';
import {
  buildWhatsAppMessageChargePending,
  buildWhatsAppMessagePaymentReceipt,
  formatBrlLabel,
  formatDueDateLabel,
  guardianFirstName,
  waMeUrlWithText,
} from './hubComandaShareUtils';
import {
  defaultPaymentMethod,
  filterEnabledPaymentMethods,
  HUB_PAYMENT_METHOD_LABELS,
  paymentMethodLabel,
} from '../../utils/hubPaymentMethods';
import '../clientes/clientes.css';
import './hub-finance-page.css';
import '../orcamentos/orcamentos-page.css';

function formatBrl(n: number): string {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function parseAmount(raw: string): number {
  const t = String(raw).trim().replace(/\./g, '').replace(',', '.');
  return Number(t);
}

const ORIGIN_LABELS: Record<string, string> = {
  appointment: 'Agenda',
  grooming_session: 'Banho e Tosa',
  encounter: 'Clínica',
  quote: 'Orçamento',
  boarding_reservation: 'Hotel/Creche',
  manual: 'Manual',
};

export type ComandaCheckoutDrawerProps = {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  unitId: string;
  mode?: 'caixa' | 'financeiro';
  onDataChanged?: () => void;
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
  onDataChanged,
  onSuccess,
  ...rest
}: ComandaCheckoutDrawerProps) {
  const comandaIdProp = 'comandaId' in rest ? rest.comandaId : undefined;
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
  const [acceptedPaymentMethods, setAcceptedPaymentMethods] = useState<HubPaymentMethod[]>([]);
  const [cashSessionId, setCashSessionId] = useState<string | null>(null);
  const [paymentTiming, setPaymentTiming] = useState<'on_checkout' | 'advance'>('on_checkout');
  const [waiveReason, setWaiveReason] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [receivableDetail, setReceivableDetail] = useState<HubFinanceReceivableDetail | null>(null);
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
      if (comandaIdProp) {
        const d = await hubComandaApi.getComandaDetail(comandaIdProp, clinicId);
        setDetail(d);
      } else if (originType && originId) {
        try {
          const d = await hubComandaApi.openComanda({
            clinic_id: clinicId,
            origin_type: originType,
            origin_id: originId,
            unit_id: unitId,
          });
          setDetail(d);
        } catch (openErr: unknown) {
          const msg = (openErr as Error)?.message ?? '';
          if (msg.includes('Já existe comanda aberta')) {
            const d = await hubComandaApi.getComandaByOrigin({
              clinic_id: clinicId,
              origin_type: originType,
              origin_id: originId,
            });
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
  }, [clinicId, comandaIdProp, originType, originId, unitId]);

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
      setReceivableDetail(null);
      setPaymentAmount('');
      return;
    }
    void loadComanda();
  }, [open, loadComanda]);

  useEffect(() => {
    if (!open) return;
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
  }, [open, clinicId, unitId]);

  useEffect(() => {
    if (!open || !clinicId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await hubFinancialApi.getPaymentMethodSettings(clinicId);
        const methods = filterEnabledPaymentMethods(res.accepted_payment_methods ?? []);
        if (!cancelled) {
          setAcceptedPaymentMethods(methods);
          setPaymentMethod((current) => (methods.includes(current) ? current : defaultPaymentMethod(methods)));
        }
      } catch {
        if (!cancelled) {
          setAcceptedPaymentMethods(filterEnabledPaymentMethods([]));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, clinicId]);

  const openItems = useMemo(() => {
    if (!detail) return [];
    const set = new Set(detail.open_item_ids);
    return detail.items.filter((it) => set.has(it.id));
  }, [detail]);

  const openItemsTotal = useMemo(
    () => round2(openItems.reduce((s, it) => s + Number(it.line_total ?? 0), 0)),
    [openItems],
  );

  const balanceDue = Number(detail?.balance_due ?? 0);
  const paidTotal = Number(detail?.paid_total ?? 0);
  const comandaTotal = Number((detail?.comanda as { total_amount?: number })?.total_amount ?? openItemsTotal + paidTotal);

  const activeReceivableId = detail?.active_receivable_ids?.[0] ?? '';

  const isReceivableOnlyMode =
    openItems.length === 0 &&
    balanceDue > 0.02 &&
    (detail?.active_receivable_ids?.length ?? 0) > 0;

  useEffect(() => {
    if (!open || !isReceivableOnlyMode || !activeReceivableId) {
      setReceivableDetail(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const d = await hubFinancialApi.getReceivableDetail(activeReceivableId, clinicId);
        if (!cancelled) setReceivableDetail(d);
      } catch {
        if (!cancelled) setReceivableDetail(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, isReceivableOnlyMode, activeReceivableId, clinicId]);

  const receivableBalance = useMemo(() => {
    if (receivableDetail) {
      return Number(
        receivableDetail.balance_amount ??
          Math.max(0, Number(receivableDetail.final_amount ?? 0) - Number(receivableDetail.paid_amount ?? 0)),
      );
    }
    return round2(Math.max(0, balanceDue - openItemsTotal));
  }, [receivableDetail, balanceDue, openItemsTotal]);

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
      rows.push({ groupIndex: gi++, label: petLabel, total: t });
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

  const chargeableTotal = useMemo(() => {
    if (isReceivableOnlyMode) return receivableBalance;
    return round2(groupTotals.reduce((s, g) => s + g.total, 0));
  }, [isReceivableOnlyMode, receivableBalance, groupTotals]);

  const canPartialPay = isReceivableOnlyMode || (grouping === 'all' && groupTotals.length <= 1);

  useEffect(() => {
    if (!open || action !== 'receive_now' || chargeableTotal <= 0) return;
    setPaymentAmount(chargeableTotal.toFixed(2).replace('.', ','));
  }, [open, action, chargeableTotal, grouping]);

  const petChips = useMemo(() => {
    const names = new Set<string>();
    const comandaPet = (detail?.comanda?.pet as { name?: string } | null)?.name;
    if (comandaPet) names.add(comandaPet);
    for (const it of openItems) {
      if (it.pet_name) names.add(it.pet_name);
    }
    return [...names];
  }, [detail, openItems]);

  const priorBalance = round2(Math.max(0, balanceDue - openItemsTotal));

  const notifyDataChanged = () => {
    onDataChanged?.();
  };

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
        notifyDataChanged();
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
        notifyDataChanged();
        setSuccessState({
          kind: 'leave_pending',
          comandaId,
          amount: totalPending,
          receivableIds: res.receivable_ids ?? [],
        });
        return;
      }

      if (isReceivableOnlyMode) {
        if (!activeReceivableId) {
          setError('Nenhum recebível ativo encontrado para pagamento.');
          setLoading(false);
          return;
        }
        const amount = parseAmount(paymentAmount);
        if (Number.isNaN(amount) || amount <= 0) {
          setError('Informe um valor de pagamento válido.');
          setLoading(false);
          return;
        }
        if (amount > receivableBalance + 0.02) {
          setError(`Valor não pode ser maior que o saldo (${formatBrl(receivableBalance)}).`);
          setLoading(false);
          return;
        }
        if (paymentMethod === 'cash' && !cashSessionId) {
          setError('Abra o caixa nesta unidade para receber em dinheiro.');
          setLoading(false);
          return;
        }
        await hubFinancialApi.createReceivablePayment(activeReceivableId, {
          clinic_id: clinicId,
          amount,
          payment_method: paymentMethod,
          cash_session_id: cashSessionId,
        });
        notifyDataChanged();
        setSuccessState({
          kind: 'receive_now',
          comandaId,
          amount,
          paymentMethod,
          receivableIds: [activeReceivableId],
        });
        return;
      }

      const amount = canPartialPay ? parseAmount(paymentAmount) : chargeableTotal;
      if (Number.isNaN(amount) || amount <= 0) {
        setError('Informe um valor de pagamento válido.');
        setLoading(false);
        return;
      }
      if (canPartialPay && amount > chargeableTotal + 0.02) {
        setError(`Valor não pode ser maior que ${formatBrl(chargeableTotal)}.`);
        setLoading(false);
        return;
      }
      if (!canPartialPay && Math.abs(amount - chargeableTotal) > 0.02) {
        setError('Com agrupamento por pet, receba o valor total de cada grupo.');
        setLoading(false);
        return;
      }

      const payments = groupTotals
        .filter((g) => g.total > 0.009)
        .map((g) => ({
          group_index: g.groupIndex,
          amount: canPartialPay && groupTotals.length === 1 ? amount : g.total,
          payment_method: paymentMethod,
          cash_session_id: cashSessionId,
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
      notifyDataChanged();
      setSuccessState({
        kind: 'receive_now',
        comandaId,
        amount,
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

  const originLabel = ORIGIN_LABELS[String(detail?.comanda?.origin_type ?? originType ?? '')] ??
    String(detail?.comanda?.origin_type ?? originType ?? '—');

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

  const parsedPaymentAmount = parseAmount(paymentAmount);
  const remainingAfterPay =
    canPartialPay && parsedPaymentAmount > 0 && parsedPaymentAmount < chargeableTotal - 0.009
      ? round2(chargeableTotal - parsedPaymentAmount)
      : null;

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
              <p className="hub-quote-ready__wa-hint">
                Sem telefone no tutor — use o PDF ou copie a mensagem na ficha da comanda.
              </p>
            ) : null}
          </section>
        ) : (
          <>
            {error && (
              <p className="hub-clientes__error" role="alert">
                {error}
              </p>
            )}

            {loading && !detail ? (
              <HubLoading variant="block" label="Carregando comanda…" />
            ) : null}

            {detail && checkoutLocked ? (
              <p className="hub-clientes__muted" role="status">
                {checkoutLockedMessage}
              </p>
            ) : detail ? (
              <>
                <section className="hub-checkout-drawer__hero">
                  <div className="hub-checkout-drawer__hero-main">
                    <div className="hub-checkout-drawer__hero-row">
                      <User size={16} aria-hidden />
                      <strong>{guardianName || 'Tutor não informado'}</strong>
                    </div>
                    {guardianPhone ? (
                      <div className="hub-checkout-drawer__hero-row hub-clientes__muted">
                        <Phone size={14} aria-hidden />
                        <span>{guardianPhone}</span>
                      </div>
                    ) : null}
                    {petChips.length > 0 ? (
                      <div className="hub-checkout-drawer__pet-chips">
                        {petChips.map((name) => (
                          <span key={name} className="hub-checkout-drawer__pet-chip">
                            {name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="hub-checkout-drawer__hero-meta">
                    <span className="hub-checkout-drawer__origin-badge">{originLabel}</span>
                    {detail.operational_complete === false && (
                      <span className="hub-clientes__pill hub-finance-page__pill--warning">Serviço em andamento</span>
                    )}
                    {paidTotal > 0.02 && balanceDue > 0.02 && (
                      <span className="hub-clientes__pill hub-finance-page__pill--warning">Pagamento parcial</span>
                    )}
                  </div>
                </section>

                <section className="hub-checkout-drawer__summary-grid">
                  <div className="hub-checkout-drawer__summary-cell">
                    <span className="hub-checkout-drawer__summary-label">Total da comanda</span>
                    <strong>{formatBrl(comandaTotal)}</strong>
                  </div>
                  <div className="hub-checkout-drawer__summary-cell">
                    <span className="hub-checkout-drawer__summary-label">Já pago</span>
                    <strong>{formatBrl(paidTotal)}</strong>
                  </div>
                  <div className="hub-checkout-drawer__summary-cell hub-checkout-drawer__summary-cell--highlight">
                    <span className="hub-checkout-drawer__summary-label">Saldo a cobrar</span>
                    <strong>{formatBrl(balanceDue)}</strong>
                  </div>
                </section>

                {detail.operational_complete === false && (
                  <p className="hub-clientes__muted hub-checkout-drawer__hint">
                    Serviço ainda não concluído — a comanda pode permanecer aberta após pagamento antecipado.
                  </p>
                )}

                {(originType || detail.comanda.origin_type) &&
                  String(detail.comanda.origin_type ?? originType) !== 'manual' && (
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                      disabled={loading}
                      onClick={() => void syncFromOrigin()}
                    >
                      Sincronizar itens com o serviço
                    </button>
                  )}

                {openItems.length > 0 && (
                  <section className="hub-checkout-drawer__section">
                    <h3 className="hub-checkout-drawer__section-title">
                      Itens em aberto ({openItems.length})
                    </h3>
                    <div className="hub-checkout-drawer__items-table-wrap">
                      <table className="hub-checkout-drawer__items-table">
                        <thead>
                          <tr>
                            <th>Descrição</th>
                            <th>Pet</th>
                            <th>Qtd</th>
                            <th>Unit.</th>
                            <th>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {openItems.map((it) => (
                            <tr key={it.id}>
                              <td>{it.description}</td>
                              <td className="hub-checkout-drawer__cell-muted">{it.pet_name ?? '—'}</td>
                              <td className="hub-checkout-drawer__cell-muted">{Number(it.quantity ?? 1)}</td>
                              <td className="hub-checkout-drawer__cell-muted">
                                {formatBrl(Number(it.unit_amount ?? 0))}
                              </td>
                              <td>
                                <strong>{formatBrl(Number(it.line_total ?? 0))}</strong>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {priorBalance > 0.02 && openItems.length > 0 && (
                  <section className="hub-checkout-drawer__section hub-checkout-drawer__prior-balance">
                    <h3 className="hub-checkout-drawer__section-title">Saldo de cobranças anteriores</h3>
                    <p className="hub-clientes__muted">
                      Há <strong>{formatBrl(priorBalance)}</strong> pendente de recebíveis já faturados.
                    </p>
                  </section>
                )}

                {isReceivableOnlyMode && (
                  <section className="hub-checkout-drawer__section">
                    <h3 className="hub-checkout-drawer__section-title">Saldo pendente</h3>
                    <p className="hub-clientes__muted">
                      Todos os itens já foram faturados. Informe o valor a receber sobre o saldo de{' '}
                      <strong>{formatBrl(receivableBalance)}</strong>.
                    </p>
                    {receivableDetail?.payments && receivableDetail.payments.length > 0 && (
                      <ul className="hub-finance-page__item-list">
                        {receivableDetail.payments.map((p) => (
                          <li key={p.id} className="hub-finance-page__item-list-row">
                            <span>
                              {HUB_PAYMENT_METHOD_LABELS[p.payment_method as HubPaymentMethod] ?? p.payment_method}
                            </span>
                            <span>{formatBrl(Number(p.amount ?? 0))}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}

                <div className="hub-checkout-drawer__action-tabs" role="tablist" aria-label="Ação de cobrança">
                  {(
                    [
                      ['receive_now', 'Receber agora'],
                      ...(openItems.length > 0 ? [['leave_pending', 'Deixar pendente'] as const] : []),
                      ['cancel', 'Cancelar'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="tab"
                      aria-selected={action === value}
                      className={`hub-checkout-drawer__action-tab${action === value ? ' hub-checkout-drawer__action-tab--active' : ''}`}
                      onClick={() => setAction(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {action === 'receive_now' && (
                  <section className="hub-checkout-drawer__payment-block">
                    <div className="hub-clientes__field">
                      <label className="hub-clientes__label" htmlFor="checkout-payment-amount">
                        Valor a receber agora
                      </label>
                      <div className="hub-checkout-drawer__amount-row">
                        <input
                          id="checkout-payment-amount"
                          type="text"
                          inputMode="decimal"
                          className="hub-clientes__input"
                          value={paymentAmount}
                          disabled={!canPartialPay}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                        />
                        {canPartialPay && (
                          <button
                            type="button"
                            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                            onClick={() =>
                              setPaymentAmount(chargeableTotal.toFixed(2).replace('.', ','))
                            }
                          >
                            Receber total
                          </button>
                        )}
                      </div>
                      {!canPartialPay && groupTotals.length > 1 && (
                        <p className="hub-clientes__muted">
                          Com agrupamento por pet, o valor total de cada grupo será cobrado integralmente.
                        </p>
                      )}
                      {remainingAfterPay != null && (
                        <p className="hub-clientes__muted">
                          Saldo restante após este pagamento: <strong>{formatBrl(remainingAfterPay)}</strong>
                        </p>
                      )}
                    </div>

                    <div className="hub-clientes__field">
                      <label className="hub-clientes__label" htmlFor="checkout-payment-method">
                        Forma de pagamento
                      </label>
                      <select
                        id="checkout-payment-method"
                        className="hub-clientes__select-input"
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as HubPaymentMethod)}
                      >
                        {acceptedPaymentMethods.map((value) => (
                          <option key={value} value={value}>
                            {HUB_PAYMENT_METHOD_LABELS[value]}
                          </option>
                        ))}
                      </select>
                      {paymentMethod === 'cash' && (
                        <p className="hub-clientes__muted">
                          {cashSessionId
                            ? `Caixa aberto (sessão ${cashSessionId.slice(0, 8)}…)`
                            : 'Não há caixa aberto — abra no módulo Caixa.'}
                        </p>
                      )}
                      {paymentMethod !== 'cash' && cashSessionId && (
                        <p className="hub-clientes__muted">
                          Sessão de caixa aberta — recebimento será registrado no histórico do dia.
                        </p>
                      )}
                    </div>
                  </section>
                )}

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

                {(action === 'receive_now' || action === 'leave_pending') && !isReceivableOnlyMode && (
                  <details className="hub-checkout-drawer__advanced">
                    <summary className="hub-checkout-drawer__advanced-summary">Opções avançadas</summary>
                    <div className="hub-checkout-drawer__advanced-body">
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

                      {groupTotals.length > 0 && (
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
                    </div>
                  </details>
                )}
              </>
            ) : null}
          </>
        )}
      </div>
    </HubSidePanel>
  );
}
