import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Receipt, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { HubCancelButton } from '../../components/HubCancelButton';
import { HubDateField } from '../../components/HubDateField';
import { HubLoading } from '../../components/HubLoading';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubSidePanel } from '../../components/HubSidePanel';
import {
  hubFinancialApi,
  type HubFinanceExpense,
  type HubFinanceExpenseCategory,
} from '../../api/hubFinancialApi';

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function groupThousands(digits: string): string {
  const trimmed = digits.replace(/^0+(?=\d)/, '');
  return trimmed.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function finishAmount(intDigits: string, frac: string | null, trailingComma: boolean): string {
  const grouped = groupThousands(intDigits || (frac !== null || trailingComma ? '0' : ''));
  if (!grouped) return '';
  if (trailingComma) return `${grouped},`;
  if (frac !== null) return `${grouped},${frac}`;
  return grouped;
}

function maskAmount(raw: string, previous = ''): string {
  let s = raw.replace(/R\$\s?/gi, '').replace(/[^\d,.]/g, '');
  if (!s) return '';

  if (!s.includes(',') && s.endsWith('.')) {
    s = `${s.slice(0, -1).replace(/\./g, '')},`;
  }

  if (s.includes(',')) {
    const i = s.lastIndexOf(',');
    const intDigits = s.slice(0, i).replace(/\D/g, '');
    const fracDigits = s.slice(i + 1).replace(/\D/g, '').slice(0, 2);
    return finishAmount(intDigits, fracDigits, i === s.length - 1);
  }

  if (/^\d+\.\d{1,2}$/.test(s)) {
    const digitsIfGrouped = s.replace(/\./g, '');
    const prevDigits = previous.replace(/\D/g, '');
    const deletedFromGrouped =
      prevDigits.length === digitsIfGrouped.length + 1 && prevDigits.includes(digitsIfGrouped);
    if (!deletedFromGrouped) {
      const [intDigits, fracDigits] = s.split('.');
      return finishAmount(intDigits, fracDigits, false);
    }
  }

  return finishAmount(s.replace(/\D/g, ''), null, false);
}

function parseAmount(raw: string): number {
  const masked = maskAmount(raw);
  if (!masked) return Number.NaN;
  const n = Number(masked.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : Number.NaN;
}

function formatAmountFromNumber(n: number): string {
  if (!Number.isFinite(n)) return '';
  const [intRaw, frac] = Math.abs(n).toFixed(2).split('.');
  return frac === '00' ? groupThousands(intRaw) : `${groupThousands(intRaw)},${frac}`;
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

function formatExpenseDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

const CATEGORY_ORDER: HubFinanceExpenseCategory[] = [
  'supplies',
  'services',
  'utilities',
  'payroll',
  'rent',
  'marketing',
  'other',
];

const CATEGORY_LABELS: Record<HubFinanceExpenseCategory, string> = {
  supplies: 'Estoque e materiais',
  services: 'Serviços de apoio',
  utilities: 'Água, luz e internet',
  payroll: 'Salários e encargos',
  rent: 'Aluguel',
  marketing: 'Divulgação',
  other: 'Outros',
};

const CATEGORY_CHIP_LABELS: Record<HubFinanceExpenseCategory, string> = {
  supplies: 'Materiais',
  services: 'Serviços',
  utilities: 'Utilidades',
  payroll: 'Pessoal',
  rent: 'Aluguel',
  marketing: 'Divulgação',
  other: 'Outros',
};

const CATEGORY_OPTIONS: HubComboboxOption[] = CATEGORY_ORDER.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
}));

const PAYMENT_METHOD_OPTIONS: HubComboboxOption[] = [
  { value: 'pix', label: 'PIX' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'transfer', label: 'Transferência' },
  { value: 'credit_card', label: 'Cartão de crédito' },
  { value: 'debit_card', label: 'Cartão de débito' },
  { value: 'payment_link', label: 'Link externo (baixa manual)' },
  { value: 'other', label: 'Outro' },
];

const PAYMENT_METHOD_LABELS: Record<string, string> = Object.fromEntries(
  PAYMENT_METHOD_OPTIONS.map((o) => [o.value, o.label]),
);

type CategoryFilter = 'all' | HubFinanceExpenseCategory;

type Props = {
  clinicId: string;
  unitId: string;
  canWrite: boolean;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  onChanged: () => void;
};

const HubExpensesSection: React.FC<Props> = ({
  clinicId,
  unitId,
  canWrite,
  showError,
  showSuccess,
  onChanged,
}) => {
  const [rows, setRows] = useState<HubFinanceExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [listFrom, setListFrom] = useState(() => daysAgoIso(30));
  const [listTo, setListTo] = useState(() => todayIsoLocal());
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [search, setSearch] = useState('');

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [category, setCategory] = useState<HubFinanceExpenseCategory>('supplies');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => todayIsoLocal());
  const [paymentMethod, setPaymentMethod] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await hubFinancialApi.listExpenses(clinicId, unitId, {
        from: listFrom,
        to: listTo,
      });
      setRows(list);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar despesas');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId, listFrom, listTo, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (categoryFilter !== 'all' && row.category !== categoryFilter) return false;
      if (!q) return true;
      const haystack = [row.description, row.notes, CATEGORY_LABELS[row.category]]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, categoryFilter, search]);

  const periodTotal = useMemo(
    () => visibleRows.reduce((acc, row) => acc + Number(row.amount || 0), 0),
    [visibleRows],
  );

  const resetForm = () => {
    setEditingId(null);
    setCategory('supplies');
    setDescription('');
    setAmount('');
    setExpenseDate(todayIsoLocal());
    setPaymentMethod('');
    setNotes('');
  };

  const openCreatePanel = () => {
    resetForm();
    setPanelOpen(true);
  };

  const openEditPanel = (expense: HubFinanceExpense) => {
    setEditingId(expense.id);
    setCategory(expense.category);
    setDescription(expense.description);
    setAmount(formatAmountFromNumber(Number(expense.amount)));
    setExpenseDate(expense.expense_date.slice(0, 10));
    setPaymentMethod(expense.payment_method ?? '');
    setNotes(expense.notes ?? '');
    setPanelOpen(true);
  };

  const closePanel = () => {
    if (saving) return;
    setPanelOpen(false);
    resetForm();
  };

  const expensePayload = () => {
    const value = parseAmount(amount);
    return {
      value,
      body: {
        clinic_id: clinicId,
        unit_id: unitId,
        amount: value,
        category,
        description: description.trim(),
        expense_date: expenseDate,
        payment_method: paymentMethod || null,
        notes: notes.trim() || null,
      },
    };
  };

  const onSave = async () => {
    if (!canWrite) {
      showError('Sem permissão para alterar despesas.');
      return;
    }
    const { value, body } = expensePayload();
    if (!body.description || !Number.isFinite(value) || value <= 0) {
      showError('Preencha descrição e valor válidos.');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await hubFinancialApi.updateExpense(editingId, body);
        showSuccess('Despesa atualizada.');
      } else {
        await hubFinancialApi.createExpense(body);
        showSuccess('Despesa registrada.');
      }
      setPanelOpen(false);
      resetForm();
      await load();
      onChanged();
    } catch (e) {
      showError((e as Error)?.message || (editingId ? 'Erro ao salvar' : 'Erro ao registrar'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (expense: HubFinanceExpense) => {
    if (!canWrite || deletingId) return;
    const ok = window.confirm(`Remover "${expense.description}"? O valor sai do período e do fluxo de caixa.`);
    if (!ok) return;
    setDeletingId(expense.id);
    try {
      await hubFinancialApi.deleteExpense(expense.id, clinicId, unitId);
      if (editingId === expense.id) {
        setPanelOpen(false);
        resetForm();
      }
      showSuccess('Despesa removida.');
      await load();
      onChanged();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao remover');
    } finally {
      setDeletingId(null);
    }
  };

  const filtersNarrowed = categoryFilter !== 'all' || search.trim().length > 0;

  return (
    <section className="hub-finance-page__section hub-payables hub-expenses">
      <div className="hub-payables__head">
        <div className="hub-payables__head-copy">
          <h2 className="hub-clientes__form-title">Despesas</h2>
          <p className="hub-clientes__subtitle">
            Saídas já pagas desta unidade. O que ainda está em aberto fica em Contas a pagar.
          </p>
        </div>
        <div className="hub-payables__head-aside">
          {!loading ? (
            <div className="hub-payables__stat">
              <span className="hub-payables__stat-label">No período</span>
              <span className="hub-payables__stat-value">{formatBrl(periodTotal)}</span>
              <span className="hub-expenses__stat-meta">
                {visibleRows.length} lançamento{visibleRows.length === 1 ? '' : 's'}
              </span>
            </div>
          ) : null}
          {canWrite ? (
            <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={openCreatePanel}>
              <Plus size={16} strokeWidth={2} aria-hidden />
              Nova despesa
            </button>
          ) : null}
        </div>
      </div>

      {!canWrite ? (
        <p className="hub-clientes__muted">Apenas leitura — sem permissão para registrar, editar ou remover despesas.</p>
      ) : null}

      <div className="hub-expenses__toolbar">
        <div className="hub-payables__filters hub-expenses__filters" role="group" aria-label="Filtrar por categoria">
          <button
            type="button"
            className={`hub-dayboard__toggle-btn${categoryFilter === 'all' ? ' hub-dayboard__toggle-btn--active' : ''}`}
            onClick={() => setCategoryFilter('all')}
          >
            Todas
          </button>
          {CATEGORY_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className={`hub-dayboard__toggle-btn${categoryFilter === id ? ' hub-dayboard__toggle-btn--active' : ''}`}
              onClick={() => setCategoryFilter(id)}
            >
              {CATEGORY_CHIP_LABELS[id]}
            </button>
          ))}
        </div>
        <div className="hub-expenses__toolbar-row">
          <div className="hub-dayboard__search-wrap hub-expenses__search">
            <Search size={14} className="hub-dayboard__search-icon" aria-hidden />
            <input
              type="text"
              className="hub-dayboard__search"
              placeholder="Buscar descrição…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar despesa"
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
              id="fin-exp-list-from"
              label="De"
              valueIso={listFrom}
              onChangeIso={setListFrom}
              showTodayButton={false}
            />
            <span className="hub-payables__period-sep" aria-hidden="true">
              —
            </span>
            <HubDateField
              id="fin-exp-list-to"
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

      {loading ? (
        <HubLoading variant="block" label="Carregando despesas…" />
      ) : visibleRows.length === 0 ? (
        <div className="hub-finance-page__empty" role="status">
          <span className="hub-finance-page__empty-icon" aria-hidden>
            <Receipt size={24} strokeWidth={1.75} />
          </span>
          <p className="hub-finance-page__empty-title">
            {filtersNarrowed ? 'Nenhuma despesa com esses filtros' : 'Nenhuma despesa no período'}
          </p>
          <p className="hub-finance-page__empty-desc">
            {filtersNarrowed
              ? 'Limpe a busca ou escolha outra categoria para ver os lançamentos do período.'
              : 'Registre saídas já pagas aqui. Títulos que ainda vão vencer ficam em Contas a pagar.'}
          </p>
          {canWrite && !filtersNarrowed ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              style={{ marginTop: 12 }}
              onClick={openCreatePanel}
            >
              <Plus size={16} strokeWidth={2} aria-hidden />
              Nova despesa
            </button>
          ) : null}
        </div>
      ) : (
        <div className="hub-clientes__table-wrap">
          <table className="hub-clientes__table hub-dayboard__table hub-payables__table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Categoria</th>
                <th>Descrição</th>
                <th>Pagamento</th>
                <th className="hub-finance-page__th-num">Valor</th>
                <th className="hub-clientes__th-actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((ex) => (
                <tr key={ex.id} className={editingId === ex.id ? 'hub-payables__row--active' : undefined}>
                  <td>
                    <span className="hub-expenses__date">{formatExpenseDate(ex.expense_date)}</span>
                  </td>
                  <td>
                    <span className="hub-payables__chip">{CATEGORY_LABELS[ex.category] ?? ex.category}</span>
                  </td>
                  <td>
                    <span className="hub-payables__desc" title={ex.description}>
                      {ex.description}
                    </span>
                    {ex.notes ? <span className="hub-expenses__notes">{ex.notes}</span> : null}
                  </td>
                  <td>
                    {ex.payment_method ? (
                      <span className="hub-payables__chip">
                        {PAYMENT_METHOD_LABELS[ex.payment_method] ?? ex.payment_method}
                      </span>
                    ) : (
                      <span className="hub-clientes__muted">—</span>
                    )}
                  </td>
                  <td className="hub-finance-page__td-num">
                    <span className="hub-payables__amount">{formatBrl(Number(ex.amount))}</span>
                  </td>
                  <td className="hub-clientes__td-actions">
                    {canWrite ? (
                      <div className="hub-clientes__td-actions-inner hub-dayboard__actions">
                        <button
                          type="button"
                          className="hub-dayboard__action-btn"
                          title="Editar"
                          aria-label={`Editar ${ex.description}`}
                          disabled={deletingId === ex.id}
                          onClick={() => openEditPanel(ex)}
                        >
                          <Pencil size={15} strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          className="hub-dayboard__action-btn"
                          title="Remover"
                          aria-label={`Remover ${ex.description}`}
                          disabled={deletingId === ex.id}
                          onClick={() => void onDelete(ex)}
                        >
                          <Trash2 size={15} strokeWidth={2} />
                        </button>
                      </div>
                    ) : (
                      <span className="hub-clientes__muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canWrite ? (
        <HubSidePanel
          open={panelOpen}
          onClose={closePanel}
          title={editingId ? 'Editar despesa' : 'Nova despesa'}
          titleIcon={<Receipt size={20} strokeWidth={1.75} aria-hidden />}
          subtitle={
            editingId
              ? 'Ajuste valor, data, categoria ou a forma de pagamento.'
              : 'Lança uma saída já realizada nesta unidade.'
          }
          contentKey={editingId ? `edit-${editingId}` : 'create'}
          footer={
            <div className="hub-finance-page__drawer-footer">
              <HubCancelButton onClick={closePanel} disabled={saving} />
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary"
                disabled={saving}
                onClick={() => void onSave()}
              >
                {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Registrar despesa'}
              </button>
            </div>
          }
        >
          <div className="hub-payables__sections">
            <section className="hub-finance-page__form-card" aria-labelledby="fin-exp-what">
              <h3 id="fin-exp-what" className="hub-finance-page__form-card-title">
                O que foi pago
              </h3>
              <p className="hub-finance-page__form-card-sub">
                Categoria e valor de uma saída que já saiu do caixa.
              </p>
              <div className="hub-finance-page__form-grid">
                <div className="hub-clientes__field hub-finance-page__field-span-6">
                  <label className="hub-clientes__label" htmlFor="fin-exp-cat">
                    Categoria
                  </label>
                  <HubSearchableCombobox
                    id="fin-exp-cat"
                    options={CATEGORY_OPTIONS}
                    value={category}
                    onChange={(v) => setCategory((v || category) as HubFinanceExpenseCategory)}
                    placeholder="Selecionar categoria…"
                    searchPlaceholder="Buscar categoria…"
                    ariaLabel="Categoria"
                    clearable={false}
                  />
                </div>
                <div className="hub-clientes__field hub-finance-page__field-span-6">
                  <label className="hub-clientes__label" htmlFor="fin-exp-amt">
                    Valor (R$)
                  </label>
                  <input
                    id="fin-exp-amt"
                    className="hub-clientes__input"
                    value={amount}
                    onChange={(e) => setAmount(maskAmount(e.target.value, amount))}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0,00"
                  />
                </div>
                <div className="hub-clientes__field hub-finance-page__field-span-6">
                  <label className="hub-clientes__label" htmlFor="fin-exp-desc">
                    Descrição
                  </label>
                  <input
                    id="fin-exp-desc"
                    className="hub-clientes__input"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ex.: Compra de shampoo"
                  />
                </div>
              </div>
            </section>
            <section className="hub-finance-page__form-card" aria-labelledby="fin-exp-when">
              <h3 id="fin-exp-when" className="hub-finance-page__form-card-title">
                Quando e como
              </h3>
              <p className="hub-finance-page__form-card-sub">Data do pagamento e a forma, se souber.</p>
              <div className="hub-finance-page__form-grid">
                <div className="hub-clientes__field hub-finance-page__field-span-6">
                  <HubDateField
                    id="fin-exp-date"
                    label="Data"
                    valueIso={expenseDate}
                    onChangeIso={setExpenseDate}
                    showTodayButton={false}
                  />
                </div>
                <div className="hub-clientes__field hub-finance-page__field-span-6">
                  <label className="hub-clientes__label" htmlFor="fin-exp-method">
                    Forma de pagamento
                  </label>
                  <HubSearchableCombobox
                    id="fin-exp-method"
                    options={PAYMENT_METHOD_OPTIONS}
                    value={paymentMethod}
                    onChange={setPaymentMethod}
                    placeholder="Opcional"
                    searchPlaceholder="Buscar…"
                    ariaLabel="Forma de pagamento"
                  />
                </div>
                <div className="hub-clientes__field hub-finance-page__field-span-6">
                  <label className="hub-clientes__label" htmlFor="fin-exp-notes">
                    Observação
                  </label>
                  <textarea
                    id="fin-exp-notes"
                    className="hub-clientes__textarea"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Opcional"
                  />
                </div>
              </div>
            </section>
          </div>
        </HubSidePanel>
      ) : null}
    </section>
  );
};

export default HubExpensesSection;
