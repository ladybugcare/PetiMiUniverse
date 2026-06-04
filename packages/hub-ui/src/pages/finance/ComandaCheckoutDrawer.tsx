import { useCallback, useEffect, useMemo, useState } from 'react';
import { HubSidePanel } from '../../components/HubSidePanel';
import { hubComandaApi, type HubComandaDetailResponse, type HubComandaOriginType } from '../../api/hubComandaApi';
import { hubFinancialApi, type HubPaymentMethod } from '../../api/hubFinancialApi';

function formatBrl(n: number): string {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export type ComandaCheckoutDrawerProps = {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  unitId: string;
  originType: HubComandaOriginType;
  originId: string;
  onSuccess?: (payload: { receivableIds: string[]; comandaId: string }) => void;
};

export function ComandaCheckoutDrawer({
  open,
  onClose,
  clinicId,
  unitId,
  originType,
  originId,
  onSuccess,
}: ComandaCheckoutDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<HubComandaDetailResponse | null>(null);
  const [grouping, setGrouping] = useState<'all' | 'by_pet'>('all');
  const [tutorGroupIdx, setTutorGroupIdx] = useState(0);
  const [action, setAction] = useState<'receive_now' | 'leave_pending' | 'cancel'>('receive_now');
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<HubPaymentMethod>('pix');
  const [cashSessionId, setCashSessionId] = useState<string | null>(null);
  const [waiveReason, setWaiveReason] = useState('');
  /** advance = antecipado (comanda pode permanecer aberta até concluir o serviço). */
  const [paymentTiming, setPaymentTiming] = useState<'on_checkout' | 'advance'>('on_checkout');

  const loadComanda = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
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
    } catch (e: unknown) {
      setError((e as Error)?.message || 'Erro ao abrir comanda');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [clinicId, originType, originId]);

  const syncFromOrigin = useCallback(async () => {
    const cid = detail?.comanda?.id as string | undefined;
    if (!cid) return;
    setLoading(true);
    setError(null);
    try {
      const d = await hubComandaApi.syncComandaFromOrigin(cid, clinicId);
      setDetail(d);
    } catch (e: unknown) {
      setError((e as Error)?.message || 'Erro ao sincronizar');
    } finally {
      setLoading(false);
    }
  }, [clinicId, detail?.comanda?.id]);

  useEffect(() => {
    if (!open) {
      setDetail(null);
      setError(null);
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
      rows.push({
        groupIndex: gi++,
        label: `Pet (${pid.slice(0, 8)}…)`,
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
        onSuccess?.({ receivableIds: [], comandaId });
        onClose();
        return;
      }

      if (action === 'leave_pending') {
        await hubComandaApi.checkout(comandaId, {
          clinic_id: clinicId,
          grouping,
          tutor_items_group_index: grouping === 'by_pet' ? tutorGroupIdx : undefined,
          action: 'leave_pending',
          due_date: dueDate,
          payment_timing: paymentTiming,
        });
        onSuccess?.({ receivableIds: [], comandaId });
        onClose();
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
      onSuccess?.({ receivableIds: res.receivable_ids, comandaId });
      onClose();
    } catch (e: unknown) {
      setError((e as Error)?.message || 'Erro no checkout');
    } finally {
      setLoading(false);
    }
  };

  return (
    <HubSidePanel
      open={open}
      title="Checkout — Comanda"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="hub-btn hub-btn--ghost" onClick={onClose} disabled={loading}>
            Fechar
          </button>
          <button type="button" className="hub-btn hub-btn--primary" onClick={() => void submit()} disabled={loading || !detail}>
            {loading ? 'Processando…' : 'Confirmar'}
          </button>
        </div>
      }
    >
      {error && (
        <div className="hub-alert hub-alert--error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}
      {loading && !detail && <p>Carregando comanda…</p>}
      {detail && (
        <>
          <p className="hub-servicos__metric-sub" style={{ marginBottom: 12 }}>
            Conferir itens e escolher como cobrar. Origem: {originType} · {openItems.length} item(ns) em aberto
          </p>
          {typeof detail.paid_total === 'number' ? (
            <div style={{ marginBottom: 12, fontSize: 14 }}>
              <strong>Já pago:</strong> {formatBrl(detail.paid_total)}
              {typeof detail.balance_due === 'number' ? (
                <>
                  {' '}
                  · <strong>Saldo a cobrar:</strong> {formatBrl(detail.balance_due)}
                </>
              ) : null}
              {detail.operational_complete === false ? (
                <span style={{ color: 'var(--hub-muted)', display: 'block', marginTop: 4 }}>
                  Serviço ainda não concluído na operação — a comanda pode permanecer aberta após pagamento antecipado.
                </span>
              ) : null}
            </div>
          ) : null}
          {originType !== 'manual' ? (
            <div style={{ marginBottom: 12 }}>
              <button type="button" className="hub-btn hub-btn--ghost" disabled={loading} onClick={() => void syncFromOrigin()}>
                Sincronizar itens com o serviço
              </button>
            </div>
          ) : null}
          <div style={{ marginBottom: 16 }}>
            <strong>Itens</strong>
            <ul style={{ margin: '8px 0', paddingLeft: 18 }}>
              {openItems.map((it) => (
                <li key={it.id}>
                  {it.description} — {formatBrl(Number(it.line_total ?? 0))}
                  {it.pet_id ? <span style={{ color: 'var(--hub-muted)' }}> (pet)</span> : null}
                </li>
              ))}
            </ul>
          </div>
          <div style={{ marginBottom: 12 }}>
            <strong>Agrupamento</strong>
            <label style={{ display: 'block', marginTop: 8 }}>
              <input type="radio" name="grp" checked={grouping === 'all'} onChange={() => setGrouping('all')} /> Tudo em uma
              cobrança
            </label>
            <label style={{ display: 'block' }}>
              <input type="radio" name="grp" checked={grouping === 'by_pet'} onChange={() => setGrouping('by_pet')} /> Separar
              por pet
            </label>
            {grouping === 'by_pet' && (
              <div style={{ marginTop: 8, fontSize: 13 }}>
                <label>
                  Itens do tutor anexar ao grupo índice:{' '}
                  <input
                    type="number"
                    min={0}
                    value={tutorGroupIdx}
                    onChange={(e) => setTutorGroupIdx(Number(e.target.value) || 0)}
                    style={{ width: 64 }}
                  />
                </label>
              </div>
            )}
          </div>
          <div style={{ marginBottom: 12 }}>
            <strong>Ação</strong>
            <label style={{ display: 'block', marginTop: 8 }}>
              <input type="radio" name="act" checked={action === 'receive_now'} onChange={() => setAction('receive_now')} />{' '}
              Receber agora
            </label>
            <label style={{ display: 'block' }}>
              <input type="radio" name="act" checked={action === 'leave_pending'} onChange={() => setAction('leave_pending')} />{' '}
              Deixar pendente (conta a receber)
            </label>
            <label style={{ display: 'block' }}>
              <input type="radio" name="act" checked={action === 'cancel'} onChange={() => setAction('cancel')} /> Cancelar / sem
              cobrança
            </label>
          </div>
          {action === 'leave_pending' && (
            <label style={{ display: 'block', marginBottom: 12 }}>
              Vencimento <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
          )}
          {action === 'receive_now' && (
            <div style={{ marginBottom: 12 }}>
              <strong>Momento do pagamento</strong>
              <label style={{ display: 'block', marginTop: 8 }}>
                <input
                  type="radio"
                  name="pt"
                  checked={paymentTiming === 'on_checkout'}
                  onChange={() => setPaymentTiming('on_checkout')}
                />{' '}
                No fecho (após o serviço)
              </label>
              <label style={{ display: 'block' }}>
                <input type="radio" name="pt" checked={paymentTiming === 'advance'} onChange={() => setPaymentTiming('advance')} />{' '}
                Antecipado (antes de concluir o serviço)
              </label>
            </div>
          )}
          {action === 'receive_now' && (
            <div style={{ marginBottom: 12 }}>
              <strong>Forma de pagamento</strong> (aplicada a cada grupo)
              <select
                className="hub-input"
                style={{ display: 'block', marginTop: 8, maxWidth: 280 }}
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
                <p style={{ fontSize: 13, marginTop: 8 }}>
                  {cashSessionId
                    ? `Caixa aberto (sessão ${cashSessionId.slice(0, 8)}…)`
                    : 'Não há caixa aberto — abra no módulo Caixa.'}
                </p>
              )}
            </div>
          )}
          {action === 'cancel' && (
            <label style={{ display: 'block', marginBottom: 12 }}>
              Motivo (waive)
              <textarea className="hub-input" rows={3} value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)} />
            </label>
          )}
          {action === 'receive_now' && groupTotals.length > 0 && (
            <div style={{ fontSize: 14 }}>
              <strong>Resumo por cobrança</strong>
              <ul>
                {groupTotals.map((g) => (
                  <li key={g.groupIndex}>
                    {g.label}: {formatBrl(g.total)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </HubSidePanel>
  );
}

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
