import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import { DollarSign } from 'lucide-react';
import { useAlert } from '../../components/AlertProvider';
import {
  hubFinancialApi,
  type HubFinanceReceivable,
  type HubFinanceExpense,
  type HubFinanceExpenseCategory,
  type HubFinanceCashFlowDay,
  type HubCommissionRule,
  type HubCommissionBasis,
  type HubCommissionPreviewResponse,
} from '../../api/hubFinancialApi';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import './hub-finance-page.css';

const SELECTED_UNIT_KEY = 'selected_unit_id';

function getSelectedUnitId(): string | null {
  try {
    return localStorage.getItem(SELECTED_UNIT_KEY);
  } catch {
    return null;
  }
}

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

function formatCommissionRate(basis: HubCommissionBasis, rate: number): string {
  if (basis === 'percent_of_sale') return `${rate}%`;
  return formatBrl(rate);
}

function commissionRuleServiceLabel(rule: HubCommissionRule, types: HubServiceType[]): string {
  const emb = embedOne(rule.hub_service_types);
  if (emb) return `${emb.name} (${emb.code})`;
  const t = types.find((x) => x.id === rule.hub_service_type_id);
  return t ? `${t.name} (${t.code})` : `${rule.hub_service_type_id.slice(0, 8)}…`;
}

const COMMISSION_BASIS_LABELS: Record<HubCommissionBasis, string> = {
  percent_of_sale: '% sobre valor da linha',
  fixed_per_sale: 'Valor fixo por linha (até ao total da linha)',
};

const EXPENSE_CATEGORY_LABELS: Record<HubFinanceExpenseCategory, string> = {
  supplies: 'Material / consumíveis',
  services: 'Serviços terceiros',
  utilities: 'Utilidades',
  payroll: 'Pessoal',
  rent: 'Aluguel',
  marketing: 'Marketing',
  other: 'Outro',
};

type FinanceTab = 'receivables' | 'expenses' | 'cashflow' | 'commissions';

const HubFinanceiroPage: React.FC = () => {
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError, showSuccess } = useAlert();
  const clinicId = getStoredClinicId();
  const unitId = getSelectedUnitId();
  const [tab, setTab] = useState<FinanceTab>('receivables');
  const [pending, setPending] = useState(0);
  const [receivables, setReceivables] = useState<HubFinanceReceivable[]>([]);
  const [status, setStatus] = useState<string>('');
  const [expenses, setExpenses] = useState<HubFinanceExpense[]>([]);
  const [flowDays, setFlowDays] = useState<HubFinanceCashFlowDay[]>([]);
  const [flowPeriod, setFlowPeriod] = useState<{ from: string; to: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expLoading, setExpLoading] = useState(false);
  const [flowLoading, setFlowLoading] = useState(false);

  const [expCategory, setExpCategory] = useState<HubFinanceExpenseCategory>('other');
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [commissionRules, setCommissionRules] = useState<HubCommissionRule[]>([]);
  const [commissionServiceTypes, setCommissionServiceTypes] = useState<HubServiceType[]>([]);
  const [commPreviewReceivables, setCommPreviewReceivables] = useState<HubFinanceReceivable[]>([]);
  const [commLoading, setCommLoading] = useState(false);
  const [commSvcId, setCommSvcId] = useState('');
  const [commBasis, setCommBasis] = useState<HubCommissionBasis>('percent_of_sale');
  const [commRate, setCommRate] = useState('10');
  const [commNotes, setCommNotes] = useState('');
  const [previewReceivableId, setPreviewReceivableId] = useState('');
  const [commPreview, setCommPreview] = useState<HubCommissionPreviewResponse | null>(null);
  const [commPreviewLoading, setCommPreviewLoading] = useState(false);

  const loadPending = useCallback(async () => {
    if (!clinicId || !unitId) return;
    try {
      const c = await hubFinancialApi.getPendingBillingCount(clinicId, unitId);
      setPending(c);
    } catch {
      /* ignore */
    }
  }, [clinicId, unitId]);

  const loadReceivables = useCallback(async () => {
    if (!clinicId || !unitId) return;
    setLoading(true);
    try {
      await loadPending();
      const rec = await hubFinancialApi.listReceivables(clinicId, {
        unit_id: unitId,
        status: status || undefined,
      });
      setReceivables(rec);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar recebíveis');
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId, status, showError, loadPending]);

  const loadExpenses = useCallback(async () => {
    if (!clinicId || !unitId) return;
    setExpLoading(true);
    try {
      await loadPending();
      const list = await hubFinancialApi.listExpenses(clinicId, unitId);
      setExpenses(list);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar despesas');
    } finally {
      setExpLoading(false);
    }
  }, [clinicId, unitId, showError, loadPending]);

  const loadCashFlow = useCallback(async () => {
    if (!clinicId || !unitId) return;
    setFlowLoading(true);
    try {
      await loadPending();
      const res = await hubFinancialApi.getCashFlow(clinicId, unitId, { days: 30 });
      setFlowDays(res.days);
      setFlowPeriod(res.period);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar fluxo de caixa');
    } finally {
      setFlowLoading(false);
    }
  }, [clinicId, unitId, showError, loadPending]);

  const loadCommissions = useCallback(async () => {
    if (!clinicId || !unitId) return;
    setCommLoading(true);
    try {
      await loadPending();
      const [rules, stRes, rec] = await Promise.all([
        hubFinancialApi.listCommissionRules(clinicId, { includeInactive: true }),
        hubServiceTypesApi.list(clinicId, false, true),
        hubFinancialApi.listReceivables(clinicId, { unit_id: unitId }),
      ]);
      setCommissionRules(rules);
      const types = stRes.service_types ?? [];
      setCommissionServiceTypes(types);
      setCommPreviewReceivables(rec.slice(0, 80));
      setCommSvcId((prev) => {
        if (prev && types.some((t) => t.id === prev)) return prev;
        const first = types.find((s) => s.active && !s.deleted_at);
        return first?.id ?? '';
      });
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar comissões');
    } finally {
      setCommLoading(false);
    }
  }, [clinicId, unitId, showError, loadPending]);

  useEffect(() => {
    if (permLoading || !hasPermission('hub.financial.read')) return;
    if (!clinicId || !unitId) return;
    if (tab === 'receivables') void loadReceivables();
    if (tab === 'expenses') void loadExpenses();
    if (tab === 'cashflow') void loadCashFlow();
    if (tab === 'commissions') void loadCommissions();
  }, [permLoading, hasPermission, clinicId, unitId, tab, loadReceivables, loadExpenses, loadCashFlow, loadCommissions]);

  const onCreateExpense = async () => {
    if (!clinicId || !unitId) return;
    if (!hasPermission('hub.financial.write')) {
      showError('Sem permissão para registar despesas.');
      return;
    }
    const v = Number(String(expAmount).replace(',', '.'));
    if (!expDesc.trim() || Number.isNaN(v) || v <= 0) {
      showError('Preencha descrição e valor válidos.');
      return;
    }
    try {
      await hubFinancialApi.createExpense({
        clinic_id: clinicId,
        unit_id: unitId,
        amount: v,
        category: expCategory,
        description: expDesc.trim(),
        expense_date: expDate,
      });
      showSuccess('Despesa registada.');
      setExpDesc('');
      setExpAmount('');
      await loadExpenses();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao registar');
    }
  };

  if (!permLoading && !hasPermission('hub.financial.read')) {
    return <Navigate to="/hub/clientes" replace />;
  }

  const shell = (children: React.ReactNode) => (
    <div className="hub-clientes hub-servicos-page hub-finance-page">
      <div className="hub-clientes__main">{children}</div>
    </div>
  );

  if (!clinicId || !unitId) {
    return shell(<p className="hub-clientes__muted">Selecione uma unidade no cabeçalho.</p>);
  }

  return shell(
    <>
      <div className="hub-clientes__title-block">
        <h1 className="hub-clientes__title">Financeiro</h1>
        <p className="hub-clientes__subtitle">Recebíveis, despesas e fluxo de caixa da unidade seleccionada.</p>
      </div>

      <div className="hub-servicos__metrics" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Pendentes de cobrança</div>
            <div className="hub-servicos__metric-value">{pending}</div>
            <div className="hub-servicos__metric-sub">Tratar no Caixa (gerar cobrança ou waive)</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <DollarSign size={22} strokeWidth={1.75} />
          </div>
        </div>
      </div>

      <div className="hub-clientes__tabs" role="tablist" aria-label="Secções financeiras">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'receivables'}
          className={`hub-clientes__tab ${tab === 'receivables' ? 'hub-clientes__tab--active' : ''}`}
          onClick={() => setTab('receivables')}
        >
          Recebíveis
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'expenses'}
          className={`hub-clientes__tab ${tab === 'expenses' ? 'hub-clientes__tab--active' : ''}`}
          onClick={() => setTab('expenses')}
        >
          Despesas
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'cashflow'}
          className={`hub-clientes__tab ${tab === 'cashflow' ? 'hub-clientes__tab--active' : ''}`}
          onClick={() => setTab('cashflow')}
        >
          Fluxo de caixa
        </button>
      </div>

      {tab === 'receivables' ? (
        <section className="hub-finance-page__section">
          <h2 className="hub-clientes__form-title">Recebíveis</h2>
          <div className="hub-clientes__toolbar">
            <div className="hub-servicos__filter-field">
              <span className="hub-clientes__label">Estado</span>
              <select
                className="hub-clientes__select-input"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                aria-label="Filtrar por estado"
              >
                <option value="">Todos</option>
                <option value="pending">Pendente</option>
                <option value="partially_paid">Parcial</option>
                <option value="paid">Pago</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>
          </div>
          {loading ? (
            <p className="hub-clientes__muted">A carregar…</p>
          ) : receivables.length === 0 ? (
            <p className="hub-clientes__muted">Sem recebíveis com os filtros actuais.</p>
          ) : (
            <div className="hub-clientes__table-wrap">
              <table className="hub-clientes__table hub-finance-page__table">
                <thead>
                  <tr>
                    <th>Origem</th>
                    <th>Estado</th>
                    <th className="hub-finance-page__th-num">Original</th>
                    <th className="hub-finance-page__th-num">Final</th>
                    <th>Criado</th>
                  </tr>
                </thead>
                <tbody>
                  {receivables.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.source_type}{' '}
                        <span className="hub-clientes__muted">({r.source_id.slice(0, 8)}…)</span>
                      </td>
                      <td>{r.status}</td>
                      <td className="hub-finance-page__td-num">{formatBrl(Number(r.original_amount))}</td>
                      <td className="hub-finance-page__td-num">{formatBrl(Number(r.final_amount))}</td>
                      <td>{new Date(r.created_at).toLocaleString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === 'expenses' ? (
        <section className="hub-finance-page__section">
          <h2 className="hub-clientes__form-title">Despesas</h2>
          {hasPermission('hub.financial.write') ? (
            <div className="hub-finance-page__expense-toolbar">
              <div className="hub-clientes__field hub-finance-page__field-compact">
                <label className="hub-clientes__label" htmlFor="fin-exp-cat">
                  Categoria
                </label>
                <select
                  id="fin-exp-cat"
                  className="hub-clientes__select-input"
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value as HubFinanceExpenseCategory)}
                >
                  {(Object.keys(EXPENSE_CATEGORY_LABELS) as HubFinanceExpenseCategory[]).map((k) => (
                    <option key={k} value={k}>
                      {EXPENSE_CATEGORY_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="hub-clientes__field hub-finance-page__field-grow">
                <label className="hub-clientes__label" htmlFor="fin-exp-desc">
                  Descrição
                </label>
                <input
                  id="fin-exp-desc"
                  className="hub-clientes__input"
                  value={expDesc}
                  onChange={(e) => setExpDesc(e.target.value)}
                  placeholder="Ex.: Compra de shampoo"
                />
              </div>
              <div className="hub-clientes__field hub-finance-page__field-compact">
                <label className="hub-clientes__label" htmlFor="fin-exp-amt">
                  Valor (R$)
                </label>
                <input
                  id="fin-exp-amt"
                  className="hub-clientes__input"
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div className="hub-clientes__field hub-finance-page__field-compact">
                <label className="hub-clientes__label" htmlFor="fin-exp-date">
                  Data
                </label>
                <input
                  id="fin-exp-date"
                  className="hub-clientes__input"
                  type="date"
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary hub-finance-page__btn-align"
                onClick={() => void onCreateExpense()}
              >
                Registar despesa
              </button>
            </div>
          ) : (
            <p className="hub-clientes__muted">Apenas leitura — sem permissão para registar despesas.</p>
          )}
          {expLoading ? (
            <p className="hub-clientes__muted">A carregar…</p>
          ) : expenses.length === 0 ? (
            <p className="hub-clientes__muted">Nenhuma despesa nesta unidade.</p>
          ) : (
            <div className="hub-clientes__table-wrap">
              <table className="hub-clientes__table hub-finance-page__table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Categoria</th>
                    <th>Descrição</th>
                    <th className="hub-finance-page__th-num">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((ex) => (
                    <tr key={ex.id}>
                      <td>{ex.expense_date}</td>
                      <td>{EXPENSE_CATEGORY_LABELS[ex.category] ?? ex.category}</td>
                      <td>{ex.description}</td>
                      <td className="hub-finance-page__td-num">{formatBrl(Number(ex.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === 'cashflow' ? (
        <section className="hub-finance-page__section">
          <h2 className="hub-clientes__form-title">Fluxo de caixa (diário)</h2>
          <p className="hub-clientes__subtitle" style={{ marginBottom: 16 }}>
            {flowPeriod ? `Período: ${flowPeriod.from} — ${flowPeriod.to}. ` : ''}
            Entradas: pagamentos de recebíveis desta unidade e suprimentos no caixa. Saídas: despesas e sangrias.
          </p>
          {flowLoading ? (
            <p className="hub-clientes__muted">A carregar…</p>
          ) : flowDays.length === 0 ? (
            <p className="hub-clientes__muted">Sem dados no intervalo.</p>
          ) : (
            <div className="hub-clientes__table-wrap hub-finance-page__table-wrap--scroll">
              <table className="hub-clientes__table hub-finance-page__table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th className="hub-finance-page__th-num">Pagamentos</th>
                    <th className="hub-finance-page__th-num">Suprimentos</th>
                    <th className="hub-finance-page__th-num">Despesas</th>
                    <th className="hub-finance-page__th-num">Sangrias</th>
                    <th className="hub-finance-page__th-num">Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {flowDays.map((d) => (
                    <tr key={d.date}>
                      <td>{d.date}</td>
                      <td className="hub-finance-page__td-num">{formatBrl(d.payments_in)}</td>
                      <td className="hub-finance-page__td-num">{formatBrl(d.deposits_in)}</td>
                      <td className="hub-finance-page__td-num">{formatBrl(d.expenses_out)}</td>
                      <td className="hub-finance-page__td-num">{formatBrl(d.withdrawals_out)}</td>
                      <td
                        className={`hub-finance-page__td-num ${
                          d.net >= 0 ? 'hub-finance-page__td-num--pos' : 'hub-finance-page__td-num--neg'
                        }`}
                      >
                        {formatBrl(d.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      <p className="hub-clientes__muted" style={{ marginTop: 24 }}>
        Itens «sem cobrança» tratam-se no Caixa até gerar cobrança ou marcar sem cobrança.
      </p>
    </>,
  );
};

export default HubFinanceiroPage;
