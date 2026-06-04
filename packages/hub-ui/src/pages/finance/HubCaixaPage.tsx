import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import { AlertCircle, Banknote, ClipboardList, TrendingUp, X } from 'lucide-react';
import { useAlert } from '../../components/AlertProvider';
import { HubTabs } from '../../components/HubTabs';
import {
  hubFinancialApi,
  type HubFinanceUnbilledItem,
  type HubCashSession,
  type HubCashSessionSummary,
} from '../../api/hubFinancialApi';
import { hubComandaApi } from '../../api/hubComandaApi';
import { ComandaCancellationResolveDrawer } from './ComandaCancellationResolveDrawer';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import './hub-finance-page.css';

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

const HubCaixaPage: React.FC = () => {
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError, showSuccess } = useAlert();
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();

  const [pending, setPending] = useState(0);
  const [items, setItems] = useState<HubFinanceUnbilledItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cashOpen, setCashOpen] = useState<HubCashSession | null>(null);
  const [cashSummary, setCashSummary] = useState<HubCashSessionSummary | null>(null);
  const [tab, setTab] = useState<'session' | 'pending' | 'reversal' | 'historico' | 'comandas' | 'cancellation'>(
    'session',
  );
  const [openBal, setOpenBal] = useState('0');
  const [closeBal, setCloseBal] = useState('');
  const [movType, setMovType] = useState<'withdrawal' | 'deposit'>('withdrawal');
  const [movAmount, setMovAmount] = useState('');
  const [movNotes, setMovNotes] = useState('');
  const [reversePaymentId, setReversePaymentId] = useState('');
  const [selectedCashItem, setSelectedCashItem] = useState<Record<string, unknown> | null>(null);
  const [openComandas, setOpenComandas] = useState<Array<Record<string, unknown>>>([]);
  const [cancellationPendingCount, setCancellationPendingCount] = useState(0);
  const [cancellationQueue, setCancellationQueue] = useState<Array<Record<string, unknown>>>([]);
  const [resolveComanda, setResolveComanda] = useState<Record<string, unknown> | null>(null);
  const [closedSessions, setClosedSessions] = useState<HubCashSession[]>([]);

  const canFinancialWrite = hasPermission('hub.financial.write');

  const load = useCallback(async () => {
    if (!clinicId || !unitId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [c, list, cash, comandasRes, cancelCountRes, cancelQueueRes, closedRes] = await Promise.all([
        hubFinancialApi.getPendingBillingCount(clinicId, unitId),
        hubFinancialApi.listUnbilledCompleted(clinicId, unitId),
        hubFinancialApi.getCashSessionOpen(clinicId, unitId),
        hubComandaApi.listComandas({ clinic_id: clinicId, unit_id: unitId, status: 'aberta' }).catch(() => ({ comandas: [] })),
        hubComandaApi.getCancellationPendingCount(clinicId, unitId).catch(() => ({ count: 0 })),
        hubComandaApi.listCancellationPending({ clinic_id: clinicId, unit_id: unitId }).catch(() => ({ comandas: [] })),
        hubFinancialApi.listClosedCashSessions(clinicId, unitId, 25).catch(() => ({ sessions: [] })),
      ]);
      setPending(c);
      setItems(list);
      setOpenComandas(comandasRes.comandas ?? []);
      setCancellationPendingCount(cancelCountRes.count ?? 0);
      setCancellationQueue(cancelQueueRes.comandas ?? []);
      setClosedSessions(closedRes.sessions ?? []);
      const open = cash.cash_session ?? null;
      setCashOpen(open);
      if (open?.id) {
        setCashSummary(await hubFinancialApi.getCashSessionSummary(open.id, clinicId));
      } else {
        setCashSummary(null);
      }
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar caixa');
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId, showError]);

  useEffect(() => {
    if (!permLoading && hasPermission('hub.financial.read')) void load();
  }, [permLoading, hasPermission, load]);

  if (!permLoading && !hasPermission('hub.financial.read')) {
    return <Navigate to="/hub/clientes" replace />;
  }

  const shell = (children: React.ReactNode, panel?: React.ReactNode) => (
    <div className="hub-clientes hub-servicos-page hub-finance-page">
      <div className="hub-clientes__main">{children}</div>
      {panel}
    </div>
  );

  if (!clinicId || !unitId) {
    return shell(
      <p className="hub-clientes__muted">Selecione uma unidade no cabeçalho para usar o Caixa.</p>,
    );
  }

  const onGerarCobranca = async (row: HubFinanceUnbilledItem) => {
    if (!hasPermission('hub.receivables.create')) {
      showError('Sem permissão para gerar cobrança.');
      return;
    }
    if (!window.confirm(`Gerar cobrança de ${formatBrl(row.estimated_amount)} (${row.origin_label})?`)) return;
    try {
      await hubFinancialApi.createReceivable({
        clinic_id: clinicId,
        source_type: row.source_type,
        source_id: row.source_id,
      });
      showSuccess('Cobrança criada.');
      await load();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao gerar cobrança');
    }
  };

  const onWaive = async (row: HubFinanceUnbilledItem) => {
    if (!hasPermission('hub.financial.write')) {
      showError('Sem permissão para marcar sem cobrança (waive).');
      return;
    }
    const reason = window.prompt('Motivo para não cobrar este atendimento (mín. 3 caracteres):');
    if (!reason || reason.trim().length < 3) return;
    try {
      await hubFinancialApi.waiveBilling({
        clinic_id: clinicId,
        source_type: row.source_type,
        source_id: row.source_id,
        reason: reason.trim(),
      });
      showSuccess('Registado como sem cobrança.');
      await load();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao registar');
    }
  };

  const onOpenCash = async () => {
    if (!hasPermission('hub.cash.session')) {
      showError('Sem permissão para abrir caixa.');
      return;
    }
    const v = Number(String(openBal).replace(',', '.'));
    if (Number.isNaN(v) || v < 0) {
      showError('Saldo inicial inválido.');
      return;
    }
    try {
      await hubFinancialApi.openCashSession({ clinic_id: clinicId, unit_id: unitId, opening_balance: v });
      showSuccess('Caixa aberto.');
      await load();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao abrir caixa');
    }
  };

  const onCloseCash = async () => {
    if (!cashOpen?.id) return;
    const sessionId = cashOpen.id;
    const v = Number(String(closeBal).replace(',', '.'));
    if (Number.isNaN(v) || v < 0) {
      showError('Saldo de fecho inválido.');
      return;
    }
    try {
      await hubFinancialApi.closeCashSession(sessionId, {
        clinic_id: clinicId,
        closing_balance: v,
      });
      showSuccess('Caixa fechado.');
      setCloseBal('');
      await load();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao fechar caixa');
    }
  };

  const onCashMovement = async () => {
    if (!cashOpen?.id) return;
    if (!hasPermission('hub.cash.session')) {
      showError('Sem permissão para movimentar caixa.');
      return;
    }
    const v = Number(String(movAmount).replace(',', '.'));
    if (Number.isNaN(v) || v <= 0) {
      showError('Valor inválido.');
      return;
    }
    try {
      await hubFinancialApi.createCashMovement(cashOpen.id, {
        clinic_id: clinicId,
        movement_type: movType,
        amount: v,
        notes: movNotes.trim() || null,
      });
      showSuccess(movType === 'withdrawal' ? 'Sangria registada.' : 'Suprimento registado.');
      setMovAmount('');
      setMovNotes('');
      await load();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao registar movimento');
    }
  };

  const onReversePayment = async () => {
    if (!clinicId) return;
    if (!hasPermission('hub.cash.receive')) {
      showError('Sem permissão para estornar pagamentos.');
      return;
    }
    const paymentId = reversePaymentId.trim();
    if (!paymentId) {
      showError('Informe o ID do pagamento.');
      return;
    }
    const reason = window.prompt('Motivo do estorno:');
    if (!reason?.trim()) return;
    try {
      const res = await hubFinancialApi.reversePayment(paymentId, { clinic_id: clinicId, reason: reason.trim() });
      showSuccess(res.warning || 'Pagamento estornado e recebível recalculado.');
      setReversePaymentId('');
      await load();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao estornar pagamento');
    }
  };

  const onReversePaymentId = async (paymentId: string) => {
    if (!clinicId) return;
    if (!hasPermission('hub.cash.receive')) {
      showError('Sem permissão para estornar pagamentos.');
      return;
    }
    const reason = window.prompt(`Motivo do estorno (pagamento ${paymentId.slice(0, 8)}…):`);
    if (!reason?.trim()) return;
    try {
      const res = await hubFinancialApi.reversePayment(paymentId, { clinic_id: clinicId, reason: reason.trim() });
      showSuccess(res.warning || 'Pagamento estornado e recebível recalculado.');
      await load();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao estornar pagamento');
    }
  };

  const expectedBalance = cashSummary?.summary.expected_balance ?? Number(cashOpen?.opening_balance ?? 0);
  const closeInformedNum = useMemo(() => {
    const t = String(closeBal).trim();
    if (!t) return null;
    const v = Number(t.replace(',', '.'));
    return Number.isNaN(v) ? null : v;
  }, [closeBal]);
  const closeDiffPreview =
    closeInformedNum != null && cashOpen ? Math.round((closeInformedNum - expectedBalance + Number.EPSILON) * 100) / 100 : null;
  const cashRows = useMemo(() => {
    const payments = (cashSummary?.payments ?? []).map((payment) => ({
      ...payment,
      row_kind: 'payment',
      label: 'Recebimento em dinheiro',
      signed_amount: Number(payment.amount ?? 0),
      happened_at: payment.payment_date,
    }));
    const movements = (cashSummary?.movements ?? []).map((movement) => ({
      ...movement,
      row_kind: 'movement',
      label: movement.movement_type === 'deposit' ? 'Suprimento' : 'Sangria',
      signed_amount: movement.movement_type === 'deposit' ? Number(movement.amount ?? 0) : -Number(movement.amount ?? 0),
      happened_at: movement.created_at,
    }));
    return [...payments, ...movements].sort((a, b) => String(b.happened_at).localeCompare(String(a.happened_at)));
  }, [cashSummary]);

  return shell(
    <>
      <div className="hub-clientes__title-block">
        <h1 className="hub-clientes__title">Caixa</h1>
        <p className="hub-clientes__subtitle">Caixa físico da unidade: apenas dinheiro, sangrias e suprimentos.</p>
      </div>

      <HubTabs
        ariaLabel="Seções do caixa"
        items={[
          { id: 'session', label: 'Sessão do caixa' },
          { id: 'comandas', label: 'Comandas abertas' },
          { id: 'cancellation', label: 'Ajustes por cancelamento' },
          { id: 'pending', label: 'Pendentes de cobrança' },
          { id: 'historico', label: 'Sessões fechadas' },
          { id: 'reversal', label: 'Estornos' },
        ]}
        activeId={tab}
        onTabChange={(id) => {
          setTab(id as 'session' | 'pending' | 'reversal' | 'historico' | 'comandas' | 'cancellation');
          setSelectedCashItem(null);
        }}
      />

      <div className="hub-servicos__metrics" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Atendimentos sem cobrança</div>
            <div className="hub-servicos__metric-value">{loading ? '—' : String(pending)}</div>
            <div className="hub-servicos__metric-sub">Pendentes de gerar cobrança ou waive</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <AlertCircle size={22} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Status do caixa</div>
            <div className="hub-servicos__metric-value">{loading ? '—' : cashOpen ? 'Aberto' : 'Fechado'}</div>
            <div className="hub-servicos__metric-sub">{cashOpen?.opened_at ? `Aberto em ${new Date(cashOpen.opened_at).toLocaleString('pt-BR')}` : 'Sem sessão aberta'}</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Banknote size={22} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Entradas em dinheiro</div>
            <div className="hub-servicos__metric-value">{loading ? '—' : formatBrl(cashSummary?.summary.cash_payments_total ?? 0)}</div>
            <div className="hub-servicos__metric-sub">Pagamentos da sessão</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <TrendingUp size={22} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Saldo esperado</div>
            <div className="hub-servicos__metric-value">{loading ? '—' : formatBrl(expectedBalance)}</div>
            <div className="hub-servicos__metric-sub">Inicial + dinheiro + suprimentos - sangrias</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <ClipboardList size={22} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Ajustes por cancelamento</div>
            <div className="hub-servicos__metric-value">{loading ? '—' : String(cancellationPendingCount)}</div>
            <div className="hub-servicos__metric-sub">Pagamento antecipado com operação cancelada</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <AlertCircle size={22} strokeWidth={1.75} />
          </div>
        </div>
      </div>

      {tab === 'session' ? <section className="hub-finance-page__section">
        <h2 className="hub-clientes__form-title">Sessão de caixa</h2>
        {!cashOpen ? (
          <div className="hub-finance-page__card-panel">
            <div className="hub-clientes__field hub-finance-page__field-compact">
              <label className="hub-clientes__label" htmlFor="caixa-open-bal">
                Saldo inicial (abertura)
              </label>
              <input
                id="caixa-open-bal"
                className="hub-clientes__input"
                value={openBal}
                onChange={(e) => setOpenBal(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={() => void onOpenCash()}>
              Abrir caixa
            </button>
          </div>
        ) : (
          <div className="hub-finance-page__card-panel hub-finance-page__card-panel--stack">
            <p className="hub-clientes__muted" style={{ margin: '0 0 12px' }}>
              Caixa aberto nesta unidade.
            </p>
            <h3 className="hub-finance-page__subsection-title">Sangria / suprimento</h3>
            <div className="hub-finance-page__expense-toolbar">
              <div className="hub-clientes__field hub-finance-page__field-compact">
                <span className="hub-clientes__label">Tipo</span>
                <select
                  className="hub-clientes__select-input"
                  value={movType}
                  onChange={(e) => setMovType(e.target.value as 'withdrawal' | 'deposit')}
                  aria-label="Tipo de movimento"
                >
                  <option value="withdrawal">Sangria (retirada)</option>
                  <option value="deposit">Suprimento (entrada)</option>
                </select>
              </div>
              <div className="hub-clientes__field hub-finance-page__field-compact">
                <label className="hub-clientes__label" htmlFor="caixa-mov-amt">
                  Valor
                </label>
                <input
                  id="caixa-mov-amt"
                  className="hub-clientes__input"
                  value={movAmount}
                  onChange={(e) => setMovAmount(e.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div className="hub-clientes__field hub-finance-page__field-grow">
                <label className="hub-clientes__label" htmlFor="caixa-mov-notes">
                  Notas
                </label>
                <input
                  id="caixa-mov-notes"
                  className="hub-clientes__input"
                  value={movNotes}
                  onChange={(e) => setMovNotes(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary hub-finance-page__btn-align"
                onClick={() => void onCashMovement()}
              >
                Registrar
              </button>
            </div>
            <div className="hub-finance-page__close-row">
              <div className="hub-clientes__field hub-finance-page__field-grow">
                <label className="hub-clientes__label" htmlFor="caixa-close-bal">
                  Saldo informado no fechamento
                </label>
                <input
                  id="caixa-close-bal"
                  className="hub-clientes__input"
                  value={closeBal}
                  onChange={(e) => setCloseBal(e.target.value)}
                  placeholder="0,00"
                  inputMode="decimal"
                />
              </div>
              <button type="button" className="hub-clientes__btn" onClick={() => void onCloseCash()}>
                Fechar caixa
              </button>
            </div>
            {cashOpen && closeDiffPreview != null ? (
              <p className="hub-clientes__muted" style={{ marginTop: 8 }}>
                Saldo esperado no fechamento: <strong>{formatBrl(expectedBalance)}</strong> · Prévia de diferença
                (informado − esperado):{' '}
                <strong style={{ color: closeDiffPreview >= -0.009 ? '#15803d' : '#b91c1c' }}>
                  {formatBrl(closeDiffPreview)}
                </strong>
              </p>
            ) : null}
          </div>
        )}
        {cashOpen ? (
          <section className="hub-finance-page__panel-section">
            <h3 className="hub-finance-page__subsection-title">Movimentos da sessão</h3>
            {cashRows.length === 0 ? (
              <p className="hub-clientes__muted">Nenhum dinheiro recebido, sangria ou suprimento nesta sessão.</p>
            ) : (
              <div className="hub-clientes__table-wrap">
                <table className="hub-clientes__table hub-finance-page__table">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Data</th>
                      <th>Referência</th>
                      <th className="hub-finance-page__th-num">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashRows.map((row) => (
                      <tr key={`${row.row_kind}:${row.id}`} onClick={() => setSelectedCashItem(row)}>
                        <td>{row.label}</td>
                        <td>{row.happened_at ? new Date(String(row.happened_at)).toLocaleString('pt-BR') : '—'}</td>
                        <td>{String(row.id).slice(0, 8)}…</td>
                        <td className={`hub-finance-page__td-num ${Number(row.signed_amount) >= 0 ? 'hub-finance-page__td-num--pos' : 'hub-finance-page__td-num--neg'}`}>
                          {formatBrl(Number(row.signed_amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}
      </section> : null}

      {tab === 'cancellation' ? (
        <section className="hub-finance-page__section">
          <h2 className="hub-clientes__form-title">Ajustes por cancelamento</h2>
          <p className="hub-clientes__muted" style={{ marginTop: 0 }}>
            Operação cancelada na agenda ou no atendimento, com pagamento já registrado na comanda. Resolva aqui
            (reembolso, crédito ou manter cobrança).
          </p>
          {loading ? (
            <p className="hub-clientes__muted">Carregando…</p>
          ) : cancellationQueue.length === 0 ? (
            <p className="hub-clientes__muted">Nenhuma pendência de cancelamento nesta unidade.</p>
          ) : (
            <div className="hub-clientes__table-wrap">
              <table className="hub-clientes__table hub-finance-page__table">
                <thead>
                  <tr>
                    <th>Tutor / Pet</th>
                    <th>Origem</th>
                    <th className="hub-finance-page__th-num">Pago</th>
                    <th>Cancelamento</th>
                    <th className="hub-clientes__th-actions">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {cancellationQueue.map((c) => {
                    const gu = c.guardian as { full_name?: string } | null | undefined;
                    const pet = c.pet as { name?: string } | null | undefined;
                    const cancelledAt = c.cancellation_operational_at
                      ? new Date(String(c.cancellation_operational_at)).toLocaleString('pt-BR')
                      : '—';
                    return (
                      <tr key={String(c.id)}>
                        <td>
                          {gu?.full_name ?? '—'}
                          {pet?.name ? ` · ${pet.name}` : ''}
                        </td>
                        <td>
                          <span className="hub-clientes__muted">{String(c.cancellation_operational_type ?? c.origin_type ?? '—')}</span>
                        </td>
                        <td className="hub-finance-page__td-num">{formatBrl(Number(c.paid_total ?? 0))}</td>
                        <td>{cancelledAt}</td>
                        <td className="hub-clientes__td-actions">
                          {canFinancialWrite ? (
                            <button
                              type="button"
                              className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                              onClick={() => setResolveComanda(c)}
                            >
                              Resolver
                            </button>
                          ) : (
                            <span className="hub-clientes__muted">Sem permissão</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === 'comandas' ? (
        <section className="hub-finance-page__section">
          <h2 className="hub-clientes__form-title">Comandas abertas nesta unidade</h2>
          {loading ? (
            <p className="hub-clientes__muted">Carregando…</p>
          ) : openComandas.length === 0 ? (
            <p className="hub-clientes__muted">Nenhuma comanda aberta.</p>
          ) : (
            <div className="hub-clientes__table-wrap">
              <table className="hub-clientes__table hub-finance-page__table">
                <thead>
                  <tr>
                    <th>Origem</th>
                    <th>Financeiro</th>
                    <th>Valor</th>
                    <th>Aberta em</th>
                  </tr>
                </thead>
                <tbody>
                  {openComandas.map((c) => (
                    <tr key={String(c.id)}>
                      <td>
                        <span className="hub-clientes__muted">{String(c.origin_type ?? '—')}</span> · #
                        {String(c.origin_id ?? '').slice(0, 8)}…
                      </td>
                      <td>{String(c.financial_status ?? '—')}</td>
                      <td className="hub-finance-page__td-num">{formatBrl(Number(c.total_amount ?? 0))}</td>
                      <td>{c.opened_at ? new Date(String(c.opened_at)).toLocaleString('pt-BR') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="hub-clientes__muted" style={{ marginTop: 12 }}>
            Para conferir itens e receber, abra o checkout a partir da agenda, do Banho &amp; Tosa, do orçamento ou do
            atendimento clínico.
          </p>
        </section>
      ) : null}

      {tab === 'historico' ? (
        <section className="hub-finance-page__section">
          <h2 className="hub-clientes__form-title">Últimas sessões fechadas</h2>
          {loading ? (
            <p className="hub-clientes__muted">Carregando…</p>
          ) : closedSessions.length === 0 ? (
            <p className="hub-clientes__muted">Nenhuma sessão fechada encontrada.</p>
          ) : (
            <div className="hub-clientes__table-wrap">
              <table className="hub-clientes__table hub-finance-page__table">
                <thead>
                  <tr>
                    <th>Abertura</th>
                    <th>Fechamento</th>
                    <th className="hub-finance-page__th-num">Informado</th>
                    <th className="hub-finance-page__th-num">Esperado</th>
                    <th className="hub-finance-page__th-num">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {closedSessions.map((s) => (
                    <tr key={s.id}>
                      <td>{s.opened_at ? new Date(s.opened_at).toLocaleString('pt-BR') : '—'}</td>
                      <td>{s.closed_at ? new Date(s.closed_at).toLocaleString('pt-BR') : '—'}</td>
                      <td className="hub-finance-page__td-num">{formatBrl(Number(s.closing_balance ?? 0))}</td>
                      <td className="hub-finance-page__td-num">{formatBrl(Number(s.expected_balance ?? 0))}</td>
                      <td className="hub-finance-page__td-num">{formatBrl(Number(s.difference_amount ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === 'reversal' ? <section className="hub-finance-page__section">
        <h2 className="hub-clientes__form-title">Estorno de pagamento</h2>
        {cashOpen && cashSummary?.payments?.length ? (
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
                          onClick={() => void onReversePaymentId(p.id)}
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
          Ou informe manualmente o UUID do pagamento (ex.: cópia do financeiro).
        </p>
        <div className="hub-finance-page__card-panel">
          <div className="hub-clientes__field hub-finance-page__field-grow">
            <label className="hub-clientes__label" htmlFor="caixa-reverse-payment">
              ID do pagamento
            </label>
            <input
              id="caixa-reverse-payment"
              className="hub-clientes__input"
              value={reversePaymentId}
              onChange={(e) => setReversePaymentId(e.target.value)}
              placeholder="UUID do hub_payments"
            />
          </div>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost"
            onClick={() => void onReversePayment()}
          >
            Estornar
          </button>
        </div>
      </section> : null}

      <ComandaCancellationResolveDrawer
        open={!!resolveComanda}
        onClose={() => setResolveComanda(null)}
        clinicId={clinicId}
        unitId={unitId}
        comanda={resolveComanda}
        onResolved={() => void load()}
      />

      {tab === 'pending' ? <section className="hub-finance-page__section">
        <h2 className="hub-clientes__form-title">Pendentes de cobrança</h2>
        {loading ? (
          <p className="hub-clientes__muted">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="hub-clientes__muted">Nenhum atendimento concluído aguardando cobrança nesta unidade.</p>
        ) : (
          <div className="hub-servicos__table-wrap">
            <table className="hub-clientes__table hub-finance-page__table">
              <thead>
                <tr>
                  <th>Origem</th>
                  <th>Cliente</th>
                  <th>Pet</th>
                  <th>Data</th>
                  <th className="hub-finance-page__th-num">Valor est.</th>
                  <th className="hub-clientes__th-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={`${row.source_type}:${row.source_id}`}>
                    <td>{row.origin_label}</td>
                    <td>{row.guardian?.full_name ?? '—'}</td>
                    <td>{row.pet?.name ?? '—'}</td>
                    <td>{row.completed_at ? new Date(row.completed_at).toLocaleString('pt-BR') : '—'}</td>
                    <td className="hub-finance-page__td-num">{formatBrl(row.estimated_amount)}</td>
                    <td className="hub-clientes__td-actions">
                      <div className="hub-clientes__td-actions-inner">
                        <button
                          type="button"
                          className="hub-servicos__btn-ghost-sm"
                          onClick={() => void onGerarCobranca(row)}
                        >
                          Gerar cobrança
                        </button>
                        <button type="button" className="hub-servicos__btn-ghost-sm" onClick={() => void onWaive(row)}>
                          Sem cobrança
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section> : null}
    </>,
    selectedCashItem ? (
      <aside className="hub-clientes__panel hub-finance-page__panel" aria-label="Detalhe do movimento de caixa">
        <div className="hub-clientes__panel-scroll">
          <div className="hub-clientes__panel-header">
            <div>
              <h2 className="hub-clientes__panel-title">{String(selectedCashItem.label ?? 'Movimento')}</h2>
              <p className="hub-clientes__muted">#{String(selectedCashItem.id ?? '').slice(0, 8)}</p>
            </div>
            <button
              type="button"
              className="hub-clientes__panel-close"
              aria-label="Fechar detalhe do movimento"
              onClick={() => setSelectedCashItem(null)}
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>
          <div className="hub-finance-page__detail-hero">
            <strong>{formatBrl(Number(selectedCashItem.signed_amount ?? selectedCashItem.amount ?? 0))}</strong>
            <span className="hub-clientes__muted">
              {selectedCashItem.happened_at ? new Date(String(selectedCashItem.happened_at)).toLocaleString('pt-BR') : '—'}
            </span>
          </div>
          <section className="hub-finance-page__panel-section">
            <div className="hub-finance-page__detail-list">
              <p><strong>Tipo:</strong> {String(selectedCashItem.label ?? '—')}</p>
              <p><strong>Origem:</strong> {selectedCashItem.row_kind === 'payment' ? 'Financeiro' : 'Movimento manual do caixa'}</p>
              <p><strong>Observações:</strong> {String(selectedCashItem.notes ?? '—')}</p>
            </div>
          </section>
        </div>
      </aside>
    ) : null,
  );
};

export default HubCaixaPage;
