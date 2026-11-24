import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, RotateCcw, Search, X } from 'lucide-react';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import {
  hubFinancialApi,
  type HubFinancePaymentListItem,
  type HubFinanceReceivableDetail,
} from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubDateField } from '../../components/HubDateField';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { HubSidePanel } from '../../components/HubSidePanel';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { paymentMethodLabel } from '../../utils/hubPaymentMethods';
import { formatComandaOriginLabel } from './comandaListPreview';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';
import { merchandiseLinesFromReceivableDetail } from './HubMerchandiseReturnSection';
import { HubPaymentReversalForm } from './HubPaymentReversalForm';

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function todayIsoLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatPaymentDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

type MethodFilter = 'all' | 'pix' | 'cash' | 'credit_card' | 'debit_card' | 'other';
type ListMode = 'posted' | 'reversed';

const METHOD_FILTERS: { id: MethodFilter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'pix', label: 'Pix' },
  { id: 'cash', label: 'Dinheiro' },
  { id: 'credit_card', label: 'Crédito' },
  { id: 'debit_card', label: 'Débito' },
  { id: 'other', label: 'Outras' },
];

const LIST_MODES: { id: ListMode; label: string }[] = [
  { id: 'posted', label: 'A estornar' },
  { id: 'reversed', label: 'Já estornados' },
];

const KNOWN_METHODS = new Set(['pix', 'cash', 'credit_card', 'debit_card']);

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

type HubPaymentReversalPanelProps = {
  /** Caixa: copy alinhado à devolução no balcão; Financeiro: link para contas a receber. */
  context?: 'financeiro' | 'caixa';
  /**
   * Embutido em side panel (ex.: Caixa): sem título de página e confirmação inline
   * (evita empilhar outro HubSidePanel).
   */
  embedded?: boolean;
  /** Chamado após estorno/reembolso bem-sucedido (ex.: atualizar métricas do caixa). */
  onChanged?: () => void;
};

export const HubPaymentReversalPanel: React.FC<HubPaymentReversalPanelProps> = ({
  context = 'financeiro',
  embedded = false,
  onChanged,
}) => {
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();
  const { hasPermission } = usePermissions();
  const { showError } = useAlert();

  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(
    clinicId && unitId ? `${clinicId}:${unitId}` : null,
  );
  const [rows, setRows] = useState<HubFinancePaymentListItem[]>([]);
  const [listFrom, setListFrom] = useState(() => daysAgoIso(30));
  const [listTo, setListTo] = useState(() => todayIsoLocal());
  const [listMode, setListMode] = useState<ListMode>('posted');
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all');
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<HubFinancePaymentListItem | null>(null);
  const [manualId, setManualId] = useState<string | null>(null);
  const [receivableDetail, setReceivableDetail] = useState<HubFinanceReceivableDetail | null>(null);

  const canReverse = hasPermission('hub.payments.reverse');
  const isHistory = listMode === 'reversed';

  const merchandiseLines = useMemo(
    () => merchandiseLinesFromReceivableDetail(receivableDetail),
    [receivableDetail],
  );

  const load = useCallback(async () => {
    if (!clinicId || !unitId) {
      setRows([]);
      finish();
      return;
    }
    begin();
    try {
      const payments = await hubFinancialApi.listPayments(clinicId, unitId, {
        from: listFrom,
        to: listTo,
        status: listMode,
      });
      setRows(payments);
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar pagamentos');
      setRows([]);
    } finally {
      finish();
    }
  }, [clinicId, unitId, listFrom, listTo, listMode, showError, begin, succeed, finish]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const term = normalizeText(search.trim());
    return rows.filter((row) => {
      if (methodFilter === 'other' && KNOWN_METHODS.has(row.payment_method)) return false;
      if (methodFilter !== 'all' && methodFilter !== 'other' && row.payment_method !== methodFilter) {
        return false;
      }
      if (!term) return true;
      const guardian = row.receivable?.guardian_name ?? '';
      const origin = formatComandaOriginLabel(row.receivable?.source_type ?? '');
      const haystack = normalizeText(
        [guardian, origin, paymentMethodLabel(row.payment_method), row.notes, row.id]
          .filter(Boolean)
          .join(' '),
      );
      return haystack.includes(term);
    });
  }, [rows, methodFilter, search]);

  const visibleTotal = useMemo(
    () => visible.reduce((acc, row) => acc + Number(row.amount || 0), 0),
    [visible],
  );

  const filtersNarrowed = methodFilter !== 'all' || search.trim().length > 0;
  const manualLookup = search.trim();
  const showManualHint = isUuid(manualLookup) && !rows.some((row) => row.id === manualLookup);

  const [lookupBusy, setLookupBusy] = useState(false);

  const resetPanel = () => {
    setTarget(null);
    setManualId(null);
    setReceivableDetail(null);
    setLookupBusy(false);
  };

  const loadReceivableForReturn = useCallback(
    async (receivableId: string | null | undefined) => {
      if (!clinicId || !receivableId) {
        setReceivableDetail(null);
        return;
      }
      try {
        const detail = await hubFinancialApi.getReceivableDetail(receivableId, clinicId);
        setReceivableDetail(detail);
      } catch {
        setReceivableDetail(null);
      }
    },
    [clinicId],
  );

  const closePanel = () => {
    resetPanel();
  };

  const openRow = (row: HubFinancePaymentListItem) => {
    setManualId(null);
    setTarget(row);
    void loadReceivableForReturn(row.receivable?.id);
  };

  const resolvePaymentById = useCallback(
    async (id: string) => {
      if (!clinicId || !isUuid(id)) return;
      if (target?.id === id) return;
      setLookupBusy(true);
      try {
        const payment = await hubFinancialApi.getPayment(id, clinicId);
        setTarget(payment);
        setManualId(null);
        await loadReceivableForReturn(payment.receivable?.id);
      } catch {
        /* mantém o campo manual se o código não existir / sem acesso */
      } finally {
        setLookupBusy(false);
      }
    },
    [clinicId, target?.id, loadReceivableForReturn],
  );

  const openManual = (id = '') => {
    setTarget(null);
    setReceivableDetail(null);
    setManualId(id || 'manual');
    if (id && isUuid(id)) {
      void resolvePaymentById(id);
    }
  };

  const onFormSuccess = async () => {
    resetPanel();
    setListMode('reversed');
    onChanged?.();
  };

  if (!clinicId || !unitId) {
    return <p className="hub-clientes__muted">Selecione a unidade para continuar.</p>;
  }

  const panelOpen = !!target || manualId !== null;
  const paymentSummary = target
    ? {
        id: target.id,
        amount: Number(target.amount),
        payment_method: target.payment_method,
        installments: target.installments,
        payment_date: target.payment_date,
        cash_session_status: target.cash_session_status,
      }
    : null;

  const seedManualId =
    !target && manualId && manualId !== 'manual' && isUuid(manualId) ? manualId : '';

  const originLabel = target?.receivable?.source_type
    ? formatComandaOriginLabel(target.receivable.source_type)
    : null;
  const loadingMerchandise =
    lookupBusy || Boolean(target?.receivable?.id && !receivableDetail);
  const hasPendingMerch = merchandiseLines.some((l) => !l.alreadyReturned);
  const receivableSnapshot =
    receivableDetail || target?.receivable
      ? {
          final_amount: Number(
            receivableDetail?.final_amount ?? target?.receivable?.final_amount ?? 0,
          ),
          returned_amount: Number(
            receivableDetail?.returned_amount ?? target?.receivable?.returned_amount ?? 0,
          ),
          line_refunds_amount: Number(
            receivableDetail?.line_refunds_amount ?? target?.line_refunds_amount ?? 0,
          ),
          paid_amount:
            receivableDetail?.paid_amount != null
              ? Number(receivableDetail.paid_amount)
              : undefined,
        }
      : null;

  const reversalForm = panelOpen ? (
    <HubPaymentReversalForm
      key={`${target?.id ?? manualId ?? 'manual'}-${receivableDetail?.id ?? 'pending'}`}
      clinicId={clinicId}
      payment={paymentSummary}
      seedPaymentId={seedManualId}
      onLookupPaymentId={(id) => void resolvePaymentById(id)}
      originLabel={originLabel}
      allowCustomerCreditRefund={Boolean(
        receivableDetail?.guardian_id || receivableDetail?.guardian?.id,
      )}
      receivableSnapshot={receivableSnapshot}
      merchandiseLines={merchandiseLines}
      stockReturnStatus={receivableDetail?.stock_return_status}
      loadingMerchandise={loadingMerchandise}
      initialMode={hasPendingMerch ? 'refund' : 'payment_reversal'}
      idPrefix={embedded ? 'caixa-rev' : 'fin-rev'}
      cancelLabel="Voltar"
      subtitle={
        Number(receivableSnapshot?.returned_amount ?? 0) > 0.009 ||
        Number(receivableSnapshot?.line_refunds_amount ?? 0) > 0.009
          ? 'Já houve devolução parcial: o vigente abaixo é o que ainda conta na cobrança. Ao marcar itens, só esses valores são reembolsados.'
          : null
      }
      onCancel={closePanel}
      onSuccess={() => void onFormSuccess()}
    />
  ) : null;

  if (embedded && panelOpen) {
    return reversalForm;
  }

  return (
    <>
      <section className="hub-finance-page__section hub-payables hub-expenses hub-adjustments">
        {embedded ? (
          <div className="hub-payables__head hub-payables__head--compact">
            <div className="hub-payables__head-aside">
              {!loading ? (
                <div className="hub-payables__stat">
                  <span className="hub-payables__stat-label">No período</span>
                  <span className="hub-payables__stat-value">{formatBrl(visibleTotal)}</span>
                  <span className="hub-expenses__stat-meta">
                    {visible.length} pagamento{visible.length === 1 ? '' : 's'}
                  </span>
                </div>
              ) : null}
              {canReverse && !isHistory ? (
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--ghost"
                  onClick={() => openManual()}
                >
                  Estornar por código
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="hub-payables__head">
            <div className="hub-payables__head-copy">
              <h2 className="hub-clientes__form-title">Estornos</h2>
              <p className="hub-clientes__subtitle">
                {isHistory ? (
                  <>
                    Histórico do período: estornos integrais e devoluções parciais (com o valor reembolsado). O acerto
                    também aparece em{' '}
                    <Link to="/hub/relatorios?relatorio=sales-adjustments" className="hub-clientes__link-btn">
                      Relatórios → Vendas e acertos
                    </Link>
                    {context === 'financeiro' ? (
                      <>
                        {' '}
                        e na ficha em{' '}
                        <Link to="/hub/financeiro?tab=receivables" className="hub-clientes__link-btn">
                          Contas a receber
                        </Link>
                      </>
                    ) : null}
                    .
                  </>
                ) : context === 'caixa' ? (
                  <>
                    Pagamentos ainda válidos desta unidade — inclusive vendas rápidas de dias anteriores. Devolução
                    parcial de produto fica marcada como Parcial e permanece aqui até o líquido zerar; o valor
                    devolvido entra em “Já estornados”.
                  </>
                ) : (
                  <>
                    Pagamentos ainda válidos desta unidade. Devolução parcial fica como Parcial aqui; o valor
                    reembolsado e o estorno integral aparecem em “Já estornados”. Cancelamento operacional fica em
                    Cancelamentos até a decisão.
                  </>
                )}
              </p>
            </div>
            <div className="hub-payables__head-aside">
              {!loading ? (
                <div className="hub-payables__stat">
                  <span className="hub-payables__stat-label">No período</span>
                  <span className="hub-payables__stat-value">{formatBrl(visibleTotal)}</span>
                  <span className="hub-expenses__stat-meta">
                    {visible.length} pagamento{visible.length === 1 ? '' : 's'}
                  </span>
                </div>
              ) : null}
              {canReverse && !isHistory ? (
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--ghost"
                  onClick={() => openManual()}
                >
                  Estornar por código
                </button>
              ) : null}
            </div>
          </div>
        )}

        {!canReverse ? (
          <p className="hub-clientes__muted">Apenas leitura — sem permissão para estornar pagamentos.</p>
        ) : null}

        <HubRefreshingBanner show={refreshing} label="Atualizando pagamentos…" />

        <div className="hub-expenses__toolbar">
          <div
            className="hub-payables__filters hub-expenses__filters"
            role="tablist"
            aria-label="Lista de estornos"
          >
            {LIST_MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={listMode === item.id}
                className={`hub-dayboard__toggle-btn${
                  listMode === item.id ? ' hub-dayboard__toggle-btn--active' : ''
                }`}
                onClick={() => {
                  setListMode(item.id);
                  resetPanel();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div
            className="hub-payables__filters hub-expenses__filters"
            role="group"
            aria-label="Filtrar por forma de pagamento"
          >
            {METHOD_FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`hub-dayboard__toggle-btn${
                  methodFilter === item.id ? ' hub-dayboard__toggle-btn--active' : ''
                }`}
                onClick={() => setMethodFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="hub-expenses__toolbar-row">
            <div className="hub-dayboard__search-wrap hub-expenses__search">
              <Search size={14} className="hub-dayboard__search-icon" aria-hidden />
              <input
                type="text"
                className="hub-dayboard__search"
                placeholder="Buscar tutor, forma ou código…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Buscar pagamento"
              />
              {search ? (
                <button
                  type="button"
                  className="hub-dayboard__search-clear"
                  aria-label="Limpar busca"
                  onClick={() => setSearch('')}
                >
                  <X size={12} />
                </button>
              ) : null}
            </div>
            <div className="hub-payables__period" role="group" aria-label="Período">
              <HubDateField
                id="fin-rev-list-from"
                label="De"
                valueIso={listFrom}
                onChangeIso={setListFrom}
                showTodayButton={false}
              />
              <span className="hub-payables__period-sep" aria-hidden="true">
                —
              </span>
              <HubDateField
                id="fin-rev-list-to"
                label="Até"
                valueIso={listTo}
                onChangeIso={setListTo}
                showTodayButton={false}
              />
            </div>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm hub-payables__refresh"
              onClick={() => void load()}
              aria-label="Atualizar lista"
            >
              <RefreshCw size={14} strokeWidth={2} aria-hidden />
              Atualizar
            </button>
          </div>
        </div>

        {showManualHint && canReverse && !isHistory ? (
          <p className="hub-adjustments__manual-hint">
            Esse código não está no período.
            <button
              type="button"
              className="hub-clientes__link-btn"
              onClick={() => openManual(manualLookup)}
            >
              Estornar mesmo assim
            </button>
          </p>
        ) : null}

        {loading && rows.length === 0 ? (
          <HubLoading variant="block" label="Carregando pagamentos…" />
        ) : visible.length === 0 ? (
          <div className="hub-finance-page__empty" role="status">
            <span className="hub-finance-page__empty-icon" aria-hidden>
              <RotateCcw size={24} strokeWidth={1.75} />
            </span>
            <p className="hub-finance-page__empty-title">
              {filtersNarrowed
                ? 'Nenhum pagamento com esses filtros'
                : isHistory
                  ? 'Nenhum estorno no período'
                  : 'Nenhum pagamento no período'}
            </p>
            <p className="hub-finance-page__empty-desc">
              {filtersNarrowed
                ? 'Limpe a busca, troque a forma ou amplie as datas.'
                : isHistory
                  ? 'Estornos integrais e devoluções parciais do período aparecem aqui. Amplie as datas se o acerto foi em outro dia.'
                  : 'Os recebimentos da unidade aparecem aqui para estorno. Depois de anular, mude para “Já estornados”.'}
            </p>
          </div>
        ) : (
          <div className="hub-clientes__table-wrap">
            <table className="hub-clientes__table hub-dayboard__table hub-payables__table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tutor</th>
                  <th>Origem</th>
                  <th>Forma</th>
                  <th className="hub-finance-page__th-num">Valor</th>
                  <th className="hub-clientes__th-actions">{isHistory ? 'Situação' : 'Ações'}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const guardian = row.receivable?.guardian_name ?? '—';
                  const origin = row.receivable?.source_type
                    ? formatComandaOriginLabel(row.receivable.source_type)
                    : '—';
                  const active = target?.id === row.id;
                  const isPartial = row.settlement === 'partial' || row.list_kind === 'line_refund';
                  const refundedShown = Number(row.line_refunds_amount ?? 0);
                  const comandaHref = row.receivable?.comanda_id
                    ? `/hub/financeiro/comanda/${row.receivable.comanda_id}`
                    : row.receivable?.id
                      ? `/hub/financeiro?tab=receivables&receivable=${row.receivable.id}`
                      : null;
                  return (
                    <tr key={row.id} className={active ? 'hub-payables__row--active' : undefined}>
                      <td>
                        <span className="hub-expenses__date">{formatPaymentDate(row.payment_date)}</span>
                      </td>
                      <td>
                        <span className="hub-payables__payee">{guardian}</span>
                        {row.notes ? <span className="hub-expenses__notes">{row.notes}</span> : null}
                      </td>
                      <td>
                        {comandaHref ? (
                          <Link to={comandaHref} className="hub-payables__chip hub-payables__chip--link">
                            {origin}
                          </Link>
                        ) : (
                          <span className="hub-payables__chip">{origin}</span>
                        )}
                      </td>
                      <td>
                        <span className="hub-payables__chip">
                          {paymentMethodLabel(row.payment_method)}
                          {row.installments > 1 ? ` · ${row.installments}x` : ''}
                        </span>
                      </td>
                      <td className="hub-finance-page__td-num">
                        <span className="hub-payables__amount">{formatBrl(Number(row.amount))}</span>
                        {!isHistory && isPartial && refundedShown > 0.009 ? (
                          <span className="hub-payables__amount-meta">
                            −{formatBrl(refundedShown)} devolvido
                          </span>
                        ) : null}
                        {isHistory && isPartial ? (
                          <span className="hub-payables__amount-meta">Devolução parcial</span>
                        ) : null}
                      </td>
                      <td className="hub-clientes__td-actions">
                        {isHistory ? (
                          <span
                            className={`hub-payables__chip${
                              isPartial
                                ? ' hub-payables__chip--partial'
                                : ' hub-payables__chip--muted'
                            }`}
                          >
                            {isPartial ? 'Parcial' : 'Estornado'}
                          </span>
                        ) : canReverse ? (
                          <div className="hub-clientes__td-actions-inner hub-dayboard__actions">
                            {isPartial ? (
                              <span className="hub-payables__chip hub-payables__chip--partial">
                                Parcial
                              </span>
                            ) : null}
                            <button
                              type="button"
                              className="hub-dayboard__action-btn hub-dayboard__action-btn--danger"
                              title="Estornar pagamento"
                              aria-label={`Estornar pagamento de ${guardian}`}
                              onClick={() => openRow(row)}
                            >
                              <RotateCcw size={15} strokeWidth={2} />
                            </button>
                          </div>
                        ) : (
                          <span className="hub-clientes__muted">—</span>
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

      {!embedded ? (
        <HubSidePanel
          open={panelOpen}
          onClose={closePanel}
          title="Estornar pagamento"
          titleIcon={<RotateCcw size={20} strokeWidth={1.75} aria-hidden />}
          subtitle="O valor integral volta e o saldo da cobrança é recalculado."
          contentKey={target?.id ?? manualId ?? 'manual'}
        >
          {reversalForm}
        </HubSidePanel>
      ) : null}
    </>
  );
};

export default HubPaymentReversalPanel;
