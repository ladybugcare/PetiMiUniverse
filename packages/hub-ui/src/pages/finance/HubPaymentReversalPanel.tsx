import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, RotateCcw, Search, X } from 'lucide-react';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import {
  hubFinancialApi,
  type HubFinancePaymentListItem,
} from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubCancelButton } from '../../components/HubCancelButton';
import { HubDateField } from '../../components/HubDateField';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { HubSidePanel } from '../../components/HubSidePanel';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { paymentMethodLabel } from '../../utils/hubPaymentMethods';
import { formatComandaOriginLabel } from './comandaListPreview';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';

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

const RECEIVABLE_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  partially_paid: 'Parcial',
  paid: 'Pago',
  cancelled: 'Cancelado',
  refunded: 'Estornado',
};

type MethodFilter = 'all' | 'pix' | 'cash' | 'credit_card' | 'debit_card' | 'other';

const METHOD_FILTERS: { id: MethodFilter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'pix', label: 'Pix' },
  { id: 'cash', label: 'Dinheiro' },
  { id: 'credit_card', label: 'Crédito' },
  { id: 'debit_card', label: 'Débito' },
  { id: 'other', label: 'Outras' },
];

const KNOWN_METHODS = new Set(['pix', 'cash', 'credit_card', 'debit_card']);

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

export const HubPaymentReversalPanel: React.FC = () => {
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();
  const { hasPermission } = usePermissions();
  const { showError, showSuccess } = useAlert();

  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(
    clinicId && unitId ? `${clinicId}:${unitId}` : null,
  );
  const [rows, setRows] = useState<HubFinancePaymentListItem[]>([]);
  const [listFrom, setListFrom] = useState(() => daysAgoIso(30));
  const [listTo, setListTo] = useState(() => todayIsoLocal());
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all');
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<HubFinancePaymentListItem | null>(null);
  const [manualId, setManualId] = useState<string | null>(null);
  const [manualDraft, setManualDraft] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const canReverse = hasPermission('hub.financial.write') || hasPermission('hub.cash.receive');

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
      });
      setRows(payments);
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar pagamentos');
      setRows([]);
    } finally {
      finish();
    }
  }, [clinicId, unitId, listFrom, listTo, showError, begin, succeed, finish]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const term = normalizeText(search.trim());
    return rows.filter((row) => {
      if (methodFilter === 'other' && KNOWN_METHODS.has(row.payment_method)) return false;
      if (methodFilter !== 'all' && methodFilter !== 'other' && row.payment_method !== methodFilter) return false;
      if (!term) return true;
      const guardian = row.receivable?.guardian_name ?? '';
      const origin = formatComandaOriginLabel(row.receivable?.source_type ?? '');
      const haystack = normalizeText(
        [guardian, origin, paymentMethodLabel(row.payment_method), row.notes, row.id].filter(Boolean).join(' '),
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

  const resetPanel = () => {
    setTarget(null);
    setManualId(null);
    setManualDraft('');
    setReason('');
  };

  const closePanel = () => {
    if (saving) return;
    resetPanel();
  };

  const openRow = (row: HubFinancePaymentListItem) => {
    setManualId(null);
    setManualDraft('');
    setTarget(row);
    setReason('');
  };

  const openManual = (id = '') => {
    setTarget(null);
    setManualId(id);
    setManualDraft(id);
    setReason('');
  };

  const onConfirm = async () => {
    if (!clinicId) return;
    if (!canReverse) {
      showError('Sem permissão para estornar pagamentos.');
      return;
    }
    const paymentId = (target?.id ?? manualDraft).trim();
    if (!paymentId || !isUuid(paymentId)) {
      showError('Informe o código completo do pagamento.');
      return;
    }
    if (reason.trim().length < 3) {
      showError('Informe o motivo do estorno (mín. 3 caracteres).');
      return;
    }
    setSaving(true);
    try {
      const res = await hubFinancialApi.reversePayment(paymentId, {
        clinic_id: clinicId,
        reason: reason.trim(),
      });
      const status = RECEIVABLE_STATUS_LABELS[res.receivable_status] ?? res.receivable_status;
      showSuccess(res.warning || `Pagamento estornado. A cobrança ficou ${status.toLowerCase()}.`);
      resetPanel();
      await load();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao estornar pagamento');
    } finally {
      setSaving(false);
    }
  };

  if (!clinicId || !unitId) {
    return <p className="hub-clientes__muted">Selecione a unidade para continuar.</p>;
  }

  const panelOpen = !!target || manualId !== null;
  const cashClosed = target?.payment_method === 'cash' && target.cash_session_status === 'closed';

  return (
    <>
      <section className="hub-finance-page__section hub-payables hub-expenses hub-adjustments">
        <div className="hub-payables__head">
          <div className="hub-payables__head-copy">
            <h2 className="hub-clientes__form-title">Estornos</h2>
            <p className="hub-clientes__subtitle">
              Pagamentos desta unidade no período. O estorno devolve o valor integral e recalcula o saldo da
              cobrança. Atendimento cancelado na operação fica em Cancelamentos até a decisão. Para ajustar uma
              comanda, abra a ficha em{' '}
              <Link to="/hub/financeiro?tab=receivables" className="hub-clientes__link-btn">
                Contas a receber
              </Link>
              .
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
            {canReverse ? (
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

        {!canReverse ? (
          <p className="hub-clientes__muted">Apenas leitura — sem permissão para estornar pagamentos.</p>
        ) : null}

        <HubRefreshingBanner show={refreshing} label="Atualizando pagamentos…" />

        <div className="hub-expenses__toolbar">
          <div className="hub-payables__filters hub-expenses__filters" role="group" aria-label="Filtrar por forma de pagamento">
            {METHOD_FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`hub-dayboard__toggle-btn${methodFilter === item.id ? ' hub-dayboard__toggle-btn--active' : ''}`}
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

        {showManualHint && canReverse ? (
          <p className="hub-adjustments__manual-hint">
            Esse código não está no período.
            <button type="button" className="hub-clientes__link-btn" onClick={() => openManual(manualLookup)}>
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
              {filtersNarrowed ? 'Nenhum pagamento com esses filtros' : 'Nenhum pagamento no período'}
            </p>
            <p className="hub-finance-page__empty-desc">
              {filtersNarrowed
                ? 'Limpe a busca, troque a forma ou amplie as datas.'
                : 'Os recebimentos da unidade aparecem aqui para estorno, em qualquer forma de pagamento.'}
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
                  <th className="hub-clientes__th-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const guardian = row.receivable?.guardian_name ?? '—';
                  const origin = row.receivable?.source_type
                    ? formatComandaOriginLabel(row.receivable.source_type)
                    : '—';
                  const active = target?.id === row.id;
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
                        {row.receivable?.comanda_id ? (
                          <Link
                            to={`/hub/financeiro/comanda/${row.receivable.comanda_id}`}
                            className="hub-payables__chip hub-payables__chip--link"
                          >
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
                      </td>
                      <td className="hub-clientes__td-actions">
                        {canReverse ? (
                          <div className="hub-clientes__td-actions-inner hub-dayboard__actions">
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

      <HubSidePanel
        open={panelOpen}
        onClose={closePanel}
        title="Estornar pagamento"
        titleIcon={<RotateCcw size={20} strokeWidth={1.75} aria-hidden />}
        subtitle="O valor integral volta e o saldo da cobrança é recalculado."
        contentKey={target?.id ?? manualId ?? 'manual'}
        footer={
          <div className="hub-finance-page__drawer-footer">
            <HubCancelButton onClick={closePanel} disabled={saving} />
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              disabled={saving || reason.trim().length < 3}
              onClick={() => void onConfirm()}
            >
              {saving ? 'Estornando…' : 'Confirmar estorno'}
            </button>
          </div>
        }
      >
        {target ? (
          <div className="hub-adjustments__facts" aria-label="Pagamento selecionado">
            <div>
              <span>Tutor</span>
              <strong>{target.receivable?.guardian_name ?? '—'}</strong>
            </div>
            <div>
              <span>Valor</span>
              <strong>{formatBrl(Number(target.amount))}</strong>
            </div>
            <div>
              <span>Forma</span>
              <strong>
                {paymentMethodLabel(target.payment_method)}
                {target.installments > 1 ? ` · ${target.installments}x` : ''}
              </strong>
            </div>
            <div>
              <span>Data</span>
              <strong>{formatPaymentDate(target.payment_date)}</strong>
            </div>
          </div>
        ) : (
          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="fin-reverse-payment">
              Código do pagamento
            </label>
            <input
              id="fin-reverse-payment"
              className="hub-clientes__input"
              value={manualDraft}
              onChange={(e) => setManualDraft(e.target.value)}
              placeholder="Cole o código completo"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}

        {cashClosed ? (
          <p className="hub-adjustments__warning" role="status">
            Este dinheiro entrou em um caixa que já foi fechado. Depois do estorno, confira o fechamento da sessão.
          </p>
        ) : null}

        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="fin-reverse-reason">
            Motivo do estorno
          </label>
          <textarea
            id="fin-reverse-reason"
            className="hub-clientes__input"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Descreva o motivo (mín. 3 caracteres)"
          />
        </div>
      </HubSidePanel>
    </>
  );
};

export default HubPaymentReversalPanel;
