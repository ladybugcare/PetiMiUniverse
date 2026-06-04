import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import { AlertCircle, Eye, LayoutDashboard, Plus, Receipt, Trash2, TrendingDown, TrendingUp, X, XCircle } from 'lucide-react';
import { useAlert } from '../../components/AlertProvider';
import { HubTabs } from '../../components/HubTabs';
import {
  hubFinancialApi,
  openHubPaymentReceiptPdf,
  type HubFinanceReceivable,
  type HubFinanceReceivableDetail,
  type HubFinanceExpense,
  type HubFinanceExpenseCategory,
  type HubFinanceCashFlowDay,
  type HubFinanceDashboardSummary,
  type HubPaymentMethod,
  type HubCommissionRule,
  type HubCommissionBasis,
  type HubCommissionPreviewResponse,
} from '../../api/hubFinancialApi';
import { hubInventoryApi, type HubInventoryItem, type HubInventoryLotRow } from '../../api/hubInventoryApi';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import './hub-finance-page.css';

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

const SOURCE_TYPE_LABELS: Record<string, string> = {
  quote: 'Orçamento',
  appointment: 'Agendamento',
  encounter: 'Atendimento',
  grooming_session: 'Banho e tosa',
};

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

function formatDueYmd(ymd?: string | null): string {
  if (!ymd) return '—';
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

function petNamesFromReceivable(r: HubFinanceReceivable): string {
  const lines = r.lines ?? [];
  const names = new Set<string>();
  for (const ln of lines) {
    const n = ln.pet?.name?.trim();
    if (n) names.add(n);
  }
  return names.size ? [...names].join(', ') : '—';
}

function sourceLabel(type: string): string {
  return SOURCE_TYPE_LABELS[type] ?? type;
}

function statusLabel(status: string): string {
  return RECEIVABLE_STATUS_LABELS[status] ?? status;
}

function statusPillClass(status: string): string {
  if (status === 'paid') return 'hub-clientes__pill hub-clientes__pill--active';
  if (status === 'cancelled' || status === 'refunded') return 'hub-clientes__pill hub-clientes__pill--inactive-alert';
  if (status === 'partially_paid') return 'hub-clientes__pill hub-finance-page__pill--warning';
  return 'hub-clientes__pill hub-clientes__pill--inactive';
}

function sourceField(source: Record<string, unknown> | null, key: string): string {
  if (!source) return '—';
  const value = source[key];
  return typeof value === 'string' && value.trim() ? value : '—';
}

function sourceEmbedName(source: Record<string, unknown> | null, key: 'pet' | 'staff' | 'guardian' | 'prospect'): string {
  if (!source) return '—';
  const raw = source[key] as { name?: string; full_name?: string } | Array<{ name?: string; full_name?: string }> | null | undefined;
  const item = Array.isArray(raw) ? raw[0] : raw;
  return item?.name || item?.full_name || '—';
}

function sourcePetsLabel(source: Record<string, unknown> | null): string {
  if (!source) return '—';
  const direct = sourceEmbedName(source, 'pet');
  if (direct !== '—') return direct;
  const pets = source.pets as Array<{ display_name?: string | null }> | null | undefined;
  return pets?.map((p) => p.display_name).filter(Boolean).join(', ') || '—';
}

type FinanceTab = 'receivables' | 'expenses' | 'cashflow' | 'commissions';

const HubFinanceiroPage: React.FC = () => {
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError, showSuccess } = useAlert();
  const [searchParams] = useSearchParams();
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();
  const [tab, setTab] = useState<FinanceTab>('receivables');
  const [summary, setSummary] = useState<HubFinanceDashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [receivables, setReceivables] = useState<HubFinanceReceivable[]>([]);
  const [selectedReceivableId, setSelectedReceivableId] = useState('');
  const [selectedReceivableDetail, setSelectedReceivableDetail] = useState<HubFinanceReceivableDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [manualPanelOpen, setManualPanelOpen] = useState(false);
  const [financeContextMessage, setFinanceContextMessage] = useState('');
  const [inventoryItems, setInventoryItems] = useState<HubInventoryItem[]>([]);
  const [inventoryLots, setInventoryLots] = useState<HubInventoryLotRow[]>([]);
  const [lineServiceTypes, setLineServiceTypes] = useState<HubServiceType[]>([]);
  const [productItemId, setProductItemId] = useState('');
  const [productLotId, setProductLotId] = useState('');
  const [productQty, setProductQty] = useState('1');
  const [productPrice, setProductPrice] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<HubPaymentMethod>('pix');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [manualDescription, setManualDescription] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualDueDate, setManualDueDate] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
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
  const [expListFrom, setExpListFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [expListTo, setExpListTo] = useState(() => new Date().toISOString().slice(0, 10));

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

  const loadSummary = useCallback(async () => {
    if (!clinicId || !unitId) return;
    setSummaryLoading(true);
    try {
      const s = await hubFinancialApi.getDashboardSummary(clinicId, unitId, { days: 30 });
      setSummary(s);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar resumo financeiro');
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [clinicId, unitId, showError]);

  const loadReceivables = useCallback(async () => {
    if (!clinicId || !unitId) return;
    setLoading(true);
    try {
      const rec = await hubFinancialApi.listReceivables(clinicId, {
        unit_id: unitId,
        status: status || undefined,
      });
      setReceivables(rec);
      const targetReceivableId = searchParams.get('receivable_id');
      const targetSourceType = searchParams.get('source_type');
      const targetSourceId = searchParams.get('source_id');
      const contextual = targetReceivableId
        ? rec.find((r) => r.id === targetReceivableId)
        : targetSourceType && targetSourceId
          ? rec.find((r) => r.source_type === targetSourceType && r.source_id === targetSourceId)
          : null;
      if (contextual) {
        setSelectedReceivableId(contextual.id);
        setFinanceContextMessage('');
      } else {
        setSelectedReceivableId((prev) => (prev && rec.some((r) => r.id === prev) ? prev : rec[0]?.id ?? ''));
        setFinanceContextMessage(
          targetReceivableId || (targetSourceType && targetSourceId)
            ? 'Não encontrei o recebível solicitado nos filtros desta unidade. Verifique a unidade selecionada ou limpe os filtros.'
            : '',
        );
      }
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar recebíveis');
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId, status, showError, searchParams]);

  const loadExpenses = useCallback(async () => {
    if (!clinicId || !unitId) return;
    setExpLoading(true);
    try {
      const list = await hubFinancialApi.listExpenses(clinicId, unitId, {
        from: expListFrom,
        to: expListTo,
      });
      setExpenses(list);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar despesas');
    } finally {
      setExpLoading(false);
    }
  }, [clinicId, unitId, showError, expListFrom, expListTo]);

  const loadCashFlow = useCallback(async () => {
    if (!clinicId || !unitId) return;
    setFlowLoading(true);
    try {
      const res = await hubFinancialApi.getCashFlow(clinicId, unitId, { days: 30 });
      setFlowDays(res.days);
      setFlowPeriod(res.period);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar fluxo de caixa');
    } finally {
      setFlowLoading(false);
    }
  }, [clinicId, unitId, showError]);

  const loadCommissions = useCallback(async () => {
    if (!clinicId || !unitId) return;
    setCommLoading(true);
    try {
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
  }, [clinicId, unitId, showError]);

  const loadInventoryForProducts = useCallback(async () => {
    if (!clinicId) return;
    try {
      const [itemsRes, lotsRes] = await Promise.all([
        hubInventoryApi.items.list(clinicId, true),
        hubInventoryApi.lots.list(clinicId),
      ]);
      const activeItems = (itemsRes.items ?? []).filter((item) => item.active && !item.deleted_at);
      setInventoryItems(activeItems);
      setInventoryLots((lotsRes.lots ?? []).filter((lot) => Number(lot.qty_on_hand ?? 0) > 0));
      setProductItemId((prev) => (prev && activeItems.some((item) => item.id === prev) ? prev : activeItems[0]?.id ?? ''));
    } catch {
      /* Inventário fica opcional na tela; erros aparecem ao adicionar produto. */
    }
  }, [clinicId]);

  const loadLineServiceTypes = useCallback(async () => {
    if (!clinicId) return;
    try {
      const res = await hubServiceTypesApi.list(clinicId, false, true);
      setLineServiceTypes(res.service_types ?? []);
    } catch {
      setLineServiceTypes([]);
    }
  }, [clinicId]);

  const loadReceivableDetail = useCallback(async (receivableId: string) => {
    if (!clinicId || !receivableId) {
      setSelectedReceivableDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      const detail = await hubFinancialApi.getReceivableDetail(receivableId, clinicId);
      setSelectedReceivableDetail(detail);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar detalhe do recebível');
      setSelectedReceivableDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [clinicId, showError]);

  useEffect(() => {
    if (permLoading || !hasPermission('hub.financial.read')) return;
    if (!clinicId || !unitId) return;
    void loadSummary();
    if (tab === 'receivables') void loadReceivables();
    if (tab === 'receivables') void loadInventoryForProducts();
    if (tab === 'receivables') void loadLineServiceTypes();
    if (tab === 'expenses') void loadExpenses();
    if (tab === 'cashflow') void loadCashFlow();
    if (tab === 'commissions') void loadCommissions();
  }, [permLoading, hasPermission, clinicId, unitId, tab, loadSummary, loadReceivables, loadInventoryForProducts, loadLineServiceTypes, loadExpenses, loadCashFlow, loadCommissions]);

  useEffect(() => {
    if (!selectedReceivableId) {
      setSelectedReceivableDetail(null);
      return;
    }
    void loadReceivableDetail(selectedReceivableId);
  }, [selectedReceivableId, loadReceivableDetail]);

  const onCreateExpense = async () => {
    if (!clinicId || !unitId) return;
    if (!hasPermission('hub.financial.write')) {
      showError('Sem permissão para registrar despesas.');
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
      showSuccess('Despesa registrada.');
      setExpDesc('');
      setExpAmount('');
      await Promise.all([loadExpenses(), loadSummary()]);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao registrar');
    }
  };

  const selectedReceivable =
    selectedReceivableDetail ?? receivables.find((r) => r.id === selectedReceivableId) ?? null;
  const selectedProductItem = inventoryItems.find((item) => item.id === productItemId) ?? null;
  const lotsForSelectedItem = inventoryLots.filter((lot) => lot.item_id === productItemId);
  const lineServiceTypeById = useMemo(
    () => new Map(lineServiceTypes.map((type) => [type.id, type])),
    [lineServiceTypes],
  );
  const summaryNet = summary?.net_operational_period ?? 0;
  const selectedDetail = selectedReceivable as HubFinanceReceivableDetail | null;
  const selectedPayments = selectedDetail?.payments ?? [];
  const selectedAdjustments = selectedDetail?.adjustments ?? [];
  const selectedGuardian = selectedDetail?.guardian ?? null;
  const selectedUnit = selectedDetail?.unit ?? null;
  const selectedSource = selectedDetail?.source ?? null;
  const selectedPaid = Number(selectedDetail?.paid_amount ?? 0);
  const selectedBalance = Number(
    selectedDetail?.balance_amount ??
      Math.max(0, Number(selectedReceivable?.final_amount ?? 0) - selectedPaid),
  );

  const lineTypeLabel = useCallback(
    (line: NonNullable<HubFinanceReceivable['lines']>[number]) => {
      if (line.hub_service_type_id) {
        const type = lineServiceTypeById.get(line.hub_service_type_id);
        if (type) return type.name;
      }
      return LINE_KIND_LABELS[line.line_kind] ?? line.line_kind;
    },
    [lineServiceTypeById],
  );

  const onAddProductLine = async () => {
    if (!clinicId || !selectedReceivable) return;
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
      await hubFinancialApi.addReceivableProductLine(selectedReceivable.id, {
        clinic_id: clinicId,
        item_id: productItemId,
        lot_id: productLotId,
        quantity: qty,
        unit_sale_amount: price,
      });
      showSuccess('Produto adicionado e estoque baixado.');
      setProductQty('1');
      setProductPrice('');
      await Promise.all([loadReceivables(), loadInventoryForProducts(), loadSummary()]);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao adicionar produto');
    }
  };

  const onRemoveProductLine = async (lineId: string) => {
    if (!clinicId || !selectedReceivable) return;
    if (!window.confirm('Remover este produto e devolver ao estoque?')) return;
    try {
      await hubFinancialApi.removeReceivableProductLine(selectedReceivable.id, lineId, clinicId);
      showSuccess('Produto removido e estoque ajustado.');
      await Promise.all([loadReceivables(), loadInventoryForProducts(), loadSummary()]);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao remover produto');
    }
  };

  const onCancelReceivable = async (receivable: HubFinanceReceivable) => {
    if (!clinicId) return;
    if (!hasPermission('hub.financial.write')) {
      showError('Sem permissão para cancelar recebíveis.');
      return;
    }
    const reason = window.prompt('Motivo do cancelamento do recebível:');
    if (!reason?.trim()) return;
    try {
      await hubFinancialApi.cancelReceivable(receivable.id, { clinic_id: clinicId, reason: reason.trim() });
      showSuccess('Recebível cancelado.');
      await Promise.all([loadReceivables(), loadSummary()]);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao cancelar recebível');
    }
  };

  const onCreatePayment = async () => {
    if (!clinicId || !unitId || !selectedReceivable) return;
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
      await hubFinancialApi.createReceivablePayment(selectedReceivable.id, {
        clinic_id: clinicId,
        amount,
        payment_method: paymentMethod,
        notes: paymentNotes.trim() || null,
        cash_session_id: cashSessionId,
      });
      showSuccess('Pagamento registrado.');
      setPaymentAmount('');
      setPaymentNotes('');
      await Promise.all([loadReceivables(), loadSummary(), loadReceivableDetail(selectedReceivable.id)]);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao registrar pagamento');
    } finally {
      setPaymentLoading(false);
    }
  };

  const onCreateManualReceivable = async () => {
    if (!clinicId || !unitId) return;
    if (!hasPermission('hub.receivables.create')) {
      showError('Sem permissão para criar recebíveis.');
      return;
    }
    const amount = Number(String(manualAmount).replace(',', '.'));
    if (!manualDescription.trim() || Number.isNaN(amount) || amount <= 0) {
      showError('Preencha descrição e valor válidos.');
      return;
    }
    setManualLoading(true);
    try {
      const res = await hubFinancialApi.createReceivable({
        clinic_id: clinicId,
        unit_id: unitId,
        source_type: 'manual',
        due_date: manualDueDate || null,
        notes: manualNotes.trim() || null,
        lines: [{ description: manualDescription.trim(), quantity: 1, unit_sale_amount: amount }],
      });
      showSuccess('Recebível manual criado.');
      setManualDescription('');
      setManualAmount('');
      setManualDueDate('');
      setManualNotes('');
      setManualPanelOpen(false);
      await Promise.all([loadReceivables(), loadSummary()]);
      setSelectedReceivableId(res.receivable.id);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao criar recebível manual');
    } finally {
      setManualLoading(false);
    }
  };

  const onOpenPaymentReceipt = async (paymentId: string) => {
    if (!clinicId) return;
    try {
      await openHubPaymentReceiptPdf(paymentId, clinicId);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao gerar comprovante');
    }
  };

  const onUpsertCommissionRule = async () => {
    if (!clinicId) return;
    if (!hasPermission('hub.financial.write')) {
      showError('Sem permissão para alterar regras de comissão.');
      return;
    }
    if (!commSvcId) {
      showError('Escolha um tipo de serviço.');
      return;
    }
    const rate = Number(String(commRate).replace(',', '.'));
    if (Number.isNaN(rate) || rate < 0) {
      showError('Indique uma taxa válida.');
      return;
    }
    if (commBasis === 'percent_of_sale' && rate > 100) {
      showError('Percentagem não pode exceder 100.');
      return;
    }
    try {
      await hubFinancialApi.upsertCommissionRule({
        clinic_id: clinicId,
        hub_service_type_id: commSvcId,
        basis: commBasis,
        rate,
        notes: commNotes.trim() || null,
      });
      showSuccess('Regra guardada.');
      setCommNotes('');
      await loadCommissions();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao guardar regra');
    }
  };

  const onToggleCommissionRule = async (rule: HubCommissionRule) => {
    if (!clinicId) return;
    if (!hasPermission('hub.financial.write')) {
      showError('Sem permissão.');
      return;
    }
    try {
      await hubFinancialApi.patchCommissionRule(rule.id, {
        clinic_id: clinicId,
        active: !rule.active,
      });
      await loadCommissions();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao atualizar');
    }
  };

  const onDeleteCommissionRule = async (ruleId: string) => {
    if (!clinicId) return;
    if (!hasPermission('hub.financial.write')) {
      showError('Sem permissão.');
      return;
    }
    if (!window.confirm('Remover esta regra de comissão?')) return;
    try {
      await hubFinancialApi.deleteCommissionRule(ruleId, clinicId);
      showSuccess('Regra removida.');
      setCommPreview(null);
      await loadCommissions();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao remover');
    }
  };

  const onRunCommissionPreview = async () => {
    if (!clinicId || !previewReceivableId) {
      showError('Selecione um recebível para pré-visualizar.');
      return;
    }
    setCommPreviewLoading(true);
    try {
      const p = await hubFinancialApi.getCommissionPreview(clinicId, previewReceivableId);
      setCommPreview(p);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao calcular pré-visualização');
      setCommPreview(null);
    } finally {
      setCommPreviewLoading(false);
    }
  };

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
    return shell(<p className="hub-clientes__muted">Selecione uma unidade no cabeçalho.</p>);
  }

  return shell(
    <>
      <div className="hub-clientes__title-block">
        <h1 className="hub-clientes__title">Financeiro</h1>
        <p className="hub-clientes__subtitle">
          Recebíveis, despesas, fluxo de caixa e regras de comissão por tipo de serviço (unidade selecionada).
        </p>
      </div>

      <HubTabs
        ariaLabel="Seções financeiras"
        items={[
          { id: 'receivables', label: 'Recebíveis' },
          { id: 'expenses', label: 'Despesas' },
          { id: 'cashflow', label: 'Fluxo de caixa' },
          { id: 'commissions', label: 'Comissões' },
        ]}
        activeId={tab}
        onTabChange={(id) => {
          setTab(id as FinanceTab);
          if (id !== 'receivables') setSelectedReceivableId('');
        }}
      />

      <div className="hub-servicos__metrics" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Pendentes de cobrança</div>
            <div className="hub-servicos__metric-value">{summaryLoading ? '—' : String(summary?.pending_billing_count ?? 0)}</div>
            <div className="hub-servicos__metric-sub">Tratar no Caixa (gerar cobrança ou waive)</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <AlertCircle size={22} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Recebíveis em aberto</div>
            <div className="hub-servicos__metric-value">
              {summaryLoading ? '—' : String(summary?.receivables_pending_count ?? summary?.receivables_open_count ?? 0)}
            </div>
            <div className="hub-servicos__metric-sub">
              {summaryLoading ? '—' : `${formatBrl(summary?.receivables_outstanding ?? 0)} a receber`}
            </div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Receipt size={22} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Pagamentos (30 dias)</div>
            <div className="hub-servicos__metric-value">{summaryLoading ? '—' : formatBrl(summary?.payments_total_period ?? 0)}</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <TrendingUp size={22} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Despesas (30 dias)</div>
            <div className="hub-servicos__metric-value">{summaryLoading ? '—' : formatBrl(summary?.expenses_total_period ?? 0)}</div>
          </div>
          <div className="hub-servicos__metric-icon hub-servicos__metric-icon--muted" aria-hidden>
            <TrendingDown size={22} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Saldo operacional</div>
            <div className="hub-servicos__metric-value" style={{ color: summaryNet >= 0 ? '#15803d' : '#b91c1c' }}>
              {summaryLoading ? '—' : formatBrl(summaryNet)}
            </div>
            <div className="hub-servicos__metric-sub">Pagamentos menos despesas</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <LayoutDashboard size={22} strokeWidth={1.75} />
          </div>
        </div>
      </div>

      {tab === 'receivables' ? (
        <section className="hub-finance-page__section">
          <h2 className="hub-clientes__form-title">Recebíveis</h2>
          {financeContextMessage ? (
            <div className="hub-finance-page__context-warning" role="status">
              {financeContextMessage}
            </div>
          ) : null}
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
            {hasPermission('hub.receivables.create') ? (
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary"
                onClick={() => {
                  setSelectedReceivableId('');
                  setManualPanelOpen(true);
                }}
              >
                <Plus size={16} strokeWidth={2} />
                Novo recebível
              </button>
            ) : null}
          </div>
          {loading ? (
            <p className="hub-clientes__muted">Carregando…</p>
          ) : receivables.length === 0 ? (
            <p className="hub-clientes__muted">Sem recebíveis com os filtros atuais.</p>
          ) : (
            <div className="hub-clientes__table-wrap">
              <table className="hub-clientes__table hub-finance-page__table">
                <thead>
                  <tr>
                    <th>Origem</th>
                    <th>Tutor</th>
                    <th>Pet(s)</th>
                    <th>Vencimento</th>
                    <th>Estado</th>
                    <th className="hub-finance-page__th-num">Original</th>
                    <th className="hub-finance-page__th-num">Final</th>
                    <th>Criado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {receivables.map((r) => (
                    <tr
                      key={r.id}
                      className={selectedReceivableId === r.id ? 'hub-finance-page__row-selected' : undefined}
                      onClick={() => setSelectedReceivableId(r.id)}
                    >
                      <td>
                        <strong>{sourceLabel(r.source_type)}</strong>{' '}
                        <span className="hub-clientes__muted">#{r.source_id.slice(0, 8)}</span>
                      </td>
                      <td>{r.guardian?.full_name ?? '—'}</td>
                      <td>{petNamesFromReceivable(r)}</td>
                      <td>{formatDueYmd(r.due_date)}</td>
                      <td>
                        <span className={statusPillClass(r.status)}>{statusLabel(r.status)}</span>
                      </td>
                      <td className="hub-finance-page__td-num">{formatBrl(Number(r.original_amount))}</td>
                      <td className="hub-finance-page__td-num">{formatBrl(Number(r.final_amount))}</td>
                      <td>{formatDateTime(r.created_at)}</td>
                      <td className="hub-clientes__td-actions" onClick={(e) => e.stopPropagation()}>
                        <div className="hub-servicos__row-actions">
                          <button
                            type="button"
                            className="hub-servicos__icon-btn"
                            title="Detalhar"
                            aria-label="Detalhar recebível"
                            onClick={() => setSelectedReceivableId(r.id)}
                          >
                            <Eye size={18} strokeWidth={2} />
                          </button>
                          {r.status !== 'cancelled' && hasPermission('hub.financial.write') ? (
                            <button
                              type="button"
                              className="hub-servicos__icon-btn hub-servicos__icon-btn--danger"
                              title="Cancelar cobrança"
                              aria-label="Cancelar cobrança"
                              onClick={() => void onCancelReceivable(r)}
                            >
                              <XCircle size={18} strokeWidth={2} />
                            </button>
                          ) : null}
                        </div>
                      </td>
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
                Registrar despesa
              </button>
            </div>
          ) : (
            <p className="hub-clientes__muted">Apenas leitura — sem permissão para registrar despesas.</p>
          )}
          <div className="hub-clientes__toolbar" style={{ marginTop: 16, marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
            <div className="hub-clientes__field hub-finance-page__field-compact">
              <label className="hub-clientes__label" htmlFor="fin-exp-list-from">
                Listar de
              </label>
              <input
                id="fin-exp-list-from"
                className="hub-clientes__input"
                type="date"
                value={expListFrom}
                onChange={(e) => setExpListFrom(e.target.value)}
              />
            </div>
            <div className="hub-clientes__field hub-finance-page__field-compact">
              <label className="hub-clientes__label" htmlFor="fin-exp-list-to">
                até
              </label>
              <input
                id="fin-exp-list-to"
                className="hub-clientes__input"
                type="date"
                value={expListTo}
                onChange={(e) => setExpListTo(e.target.value)}
              />
            </div>
            <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={() => void loadExpenses()}>
              Atualizar lista
            </button>
          </div>
          {expLoading ? (
            <p className="hub-clientes__muted">Carregando…</p>
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
            <p className="hub-clientes__muted">Carregando…</p>
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

      {tab === 'commissions' ? (
        <section className="hub-finance-page__section">
          <h2 className="hub-clientes__form-title">Comissões por tipo de serviço</h2>
          <p className="hub-clientes__subtitle" style={{ marginBottom: 16 }}>
            Defina percentagem sobre o valor da linha do recebível ou valor fixo por linha (limitado ao total da linha).
            Salvar com o mesmo tipo de serviço atualiza a regra existente.
          </p>
          {commLoading ? (
            <p className="hub-clientes__muted">Carregando…</p>
          ) : (
            <>
              {hasPermission('hub.financial.write') ? (
                <div className="hub-finance-page__expense-toolbar" style={{ marginBottom: 20 }}>
                  <div className="hub-clientes__field hub-finance-page__field-grow">
                    <label className="hub-clientes__label" htmlFor="fin-comm-svc">
                      Tipo de serviço
                    </label>
                    <select
                      id="fin-comm-svc"
                      className="hub-clientes__select-input"
                      value={commSvcId}
                      onChange={(e) => setCommSvcId(e.target.value)}
                    >
                      <option value="">—</option>
                      {commissionServiceTypes
                        .filter((s) => s.active && !s.deleted_at)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.code})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="hub-clientes__field hub-finance-page__field-compact">
                    <label className="hub-clientes__label" htmlFor="fin-comm-basis">
                      Critério
                    </label>
                    <select
                      id="fin-comm-basis"
                      className="hub-clientes__select-input"
                      value={commBasis}
                      onChange={(e) => setCommBasis(e.target.value as HubCommissionBasis)}
                    >
                      {(Object.keys(COMMISSION_BASIS_LABELS) as HubCommissionBasis[]).map((k) => (
                        <option key={k} value={k}>
                          {COMMISSION_BASIS_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="hub-clientes__field hub-finance-page__field-compact">
                    <label className="hub-clientes__label" htmlFor="fin-comm-rate">
                      {commBasis === 'percent_of_sale' ? 'Taxa (%)' : 'Valor (R$)'}
                    </label>
                    <input
                      id="fin-comm-rate"
                      className="hub-clientes__input"
                      value={commRate}
                      onChange={(e) => setCommRate(e.target.value)}
                      inputMode="decimal"
                    />
                  </div>
                  <div className="hub-clientes__field hub-finance-page__field-grow">
                    <label className="hub-clientes__label" htmlFor="fin-comm-notes">
                      Notas (opcional)
                    </label>
                    <input
                      id="fin-comm-notes"
                      className="hub-clientes__input"
                      value={commNotes}
                      onChange={(e) => setCommNotes(e.target.value)}
                      placeholder="Ex.: comissão groomer"
                    />
                  </div>
                  <button
                    type="button"
                    className="hub-clientes__btn hub-clientes__btn--primary hub-finance-page__btn-align"
                    onClick={() => void onUpsertCommissionRule()}
                  >
                    Salvar regra
                  </button>
                </div>
              ) : (
                <p className="hub-clientes__muted" style={{ marginBottom: 16 }}>
                  Apenas leitura — sem permissão para alterar regras.
                </p>
              )}

              <h3 className="hub-clientes__form-title" style={{ fontSize: '1rem', marginBottom: 8 }}>
                Regras
              </h3>
              {commissionRules.length === 0 ? (
                <p className="hub-clientes__muted">Nenhuma regra definida para esta clínica.</p>
              ) : (
                <div className="hub-clientes__table-wrap">
                  <table className="hub-clientes__table hub-finance-page__table">
                    <thead>
                      <tr>
                        <th>Serviço</th>
                        <th>Critério</th>
                        <th className="hub-finance-page__th-num">Taxa</th>
                        <th>Ativa</th>
                        {hasPermission('hub.financial.write') ? <th /> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {commissionRules.map((r) => (
                        <tr key={r.id} className={!r.active ? 'hub-clientes__muted' : undefined}>
                          <td>{commissionRuleServiceLabel(r, commissionServiceTypes)}</td>
                          <td>{COMMISSION_BASIS_LABELS[r.basis] ?? r.basis}</td>
                          <td className="hub-finance-page__td-num">{formatCommissionRate(r.basis, Number(r.rate))}</td>
                          <td>{r.active ? 'Sim' : 'Não'}</td>
                          {hasPermission('hub.financial.write') ? (
                            <td>
                              <button
                                type="button"
                                className="hub-clientes__btn hub-clientes__btn--ghost"
                                style={{ marginRight: 8 }}
                                onClick={() => void onToggleCommissionRule(r)}
                              >
                                {r.active ? 'Desativar' : 'Ativar'}
                              </button>
                              <button
                                type="button"
                                className="hub-clientes__btn hub-clientes__btn--ghost"
                                onClick={() => void onDeleteCommissionRule(r.id)}
                              >
                                Remover
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h3 className="hub-clientes__form-title" style={{ fontSize: '1rem', marginTop: 24, marginBottom: 8 }}>
                Pré-visualização por recebível
              </h3>
              <p className="hub-clientes__subtitle" style={{ marginBottom: 12 }}>
                Usa as linhas do recebível e as regras <strong>ativas</strong> desta clínica (até 80 recebíveis recentes
                desta unidade).
              </p>
              <div className="hub-finance-page__expense-toolbar" style={{ marginBottom: 16 }}>
                <div className="hub-clientes__field hub-finance-page__field-grow">
                  <label className="hub-clientes__label" htmlFor="fin-comm-prev-rec">
                    Recebível
                  </label>
                  <select
                    id="fin-comm-prev-rec"
                    className="hub-clientes__select-input"
                    value={previewReceivableId}
                    onChange={(e) => {
                      setPreviewReceivableId(e.target.value);
                      setCommPreview(null);
                    }}
                  >
                    <option value="">—</option>
                    {commPreviewReceivables.map((r) => (
                      <option key={r.id} value={r.id}>
                        {statusLabel(r.status)} · {formatBrl(Number(r.final_amount))} · {sourceLabel(r.source_type)}{' '}
                        ({r.source_id.slice(0, 8)}…)
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary hub-finance-page__btn-align"
                  disabled={!previewReceivableId || commPreviewLoading}
                  onClick={() => void onRunCommissionPreview()}
                >
                  {commPreviewLoading ? 'Calculando…' : 'Calcular'}
                </button>
              </div>
              {commPreview ? (
                <>
                  <p className="hub-clientes__subtitle" style={{ marginBottom: 8 }}>
                    Total comissão estimada:{' '}
                    <strong>{formatBrl(commPreview.total_commission)}</strong> (recebível final{' '}
                    {formatBrl(commPreview.receivable_final_amount)})
                  </p>
                  <div className="hub-clientes__table-wrap">
                    <table className="hub-clientes__table hub-finance-page__table">
                      <thead>
                        <tr>
                          <th>Descrição</th>
                          <th className="hub-finance-page__th-num">Linha</th>
                          <th>Critério</th>
                          <th className="hub-finance-page__th-num">Comissão</th>
                        </tr>
                      </thead>
                      <tbody>
                        {commPreview.lines.map((ln) => (
                          <tr key={ln.line_id}>
                            <td>{ln.description}</td>
                            <td className="hub-finance-page__td-num">{formatBrl(ln.line_total)}</td>
                            <td>
                              {ln.basis && ln.rate != null
                                ? `${COMMISSION_BASIS_LABELS[ln.basis as HubCommissionBasis] ?? ln.basis} (${formatCommissionRate(ln.basis as HubCommissionBasis, ln.rate)})`
                                : '—'}
                            </td>
                            <td className="hub-finance-page__td-num">{formatBrl(ln.commission_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      <p className="hub-clientes__muted" style={{ marginTop: 24 }}>
        Itens sem cobrança são tratados no Caixa até gerar cobrança ou marcar sem cobrança.
      </p>
    </>,
    manualPanelOpen ? (
      <aside className="hub-clientes__panel hub-finance-page__panel" aria-label="Novo recebível manual">
        <div className="hub-clientes__panel-scroll">
          <div className="hub-clientes__panel-header">
            <div>
              <h2 className="hub-clientes__panel-title">Novo recebível</h2>
              <p className="hub-clientes__muted">Lançamento manual simples para o MVP.</p>
            </div>
            <button
              type="button"
              className="hub-clientes__panel-close"
              aria-label="Fechar novo recebível"
              onClick={() => setManualPanelOpen(false)}
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>
          <section className="hub-finance-page__panel-section">
            <div className="hub-finance-page__panel-form-grid">
              <div className="hub-clientes__field hub-finance-page__panel-form-span">
                <label className="hub-clientes__label" htmlFor="manual-desc">Descrição</label>
                <input
                  id="manual-desc"
                  className="hub-clientes__input"
                  value={manualDescription}
                  onChange={(e) => setManualDescription(e.target.value)}
                  placeholder="Ex.: Venda avulsa"
                />
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="manual-amount">Valor</label>
                <input
                  id="manual-amount"
                  className="hub-clientes__input"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                />
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="manual-due">Vencimento</label>
                <input
                  id="manual-due"
                  className="hub-clientes__input"
                  type="date"
                  value={manualDueDate}
                  onChange={(e) => setManualDueDate(e.target.value)}
                />
              </div>
              <div className="hub-clientes__field hub-finance-page__panel-form-span">
                <label className="hub-clientes__label" htmlFor="manual-notes">Observações</label>
                <input
                  id="manual-notes"
                  className="hub-clientes__input"
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
            </div>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary hub-finance-page__panel-primary"
              disabled={manualLoading}
              onClick={() => void onCreateManualReceivable()}
            >
              {manualLoading ? 'Criando…' : 'Criar recebível'}
            </button>
          </section>
        </div>
      </aside>
    ) : selectedReceivable ? (
      <aside className="hub-clientes__panel hub-finance-page__panel" aria-label="Detalhe do recebível">
        <div className="hub-clientes__panel-scroll">
          <div className="hub-clientes__panel-header">
            <div>
              <h2 className="hub-clientes__panel-title">Recebível</h2>
              <p className="hub-clientes__muted">
                {sourceLabel(selectedReceivable.source_type)} #{selectedReceivable.source_id.slice(0, 8)}
              </p>
            </div>
            <button
              type="button"
              className="hub-clientes__panel-close"
              aria-label="Fechar detalhe do recebível"
              onClick={() => setSelectedReceivableId('')}
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>

          <div className="hub-finance-page__detail-hero">
            <span className={statusPillClass(selectedReceivable.status)}>{statusLabel(selectedReceivable.status)}</span>
            <strong>{formatBrl(Number(selectedReceivable.final_amount))}</strong>
            <span className="hub-clientes__muted">Criado em {formatDateTime(selectedReceivable.created_at)}</span>
          </div>

          {detailLoading ? <p className="hub-clientes__muted">Carregando detalhes…</p> : null}

          <section className="hub-finance-page__panel-section">
            <h3 className="hub-finance-page__subsection-title">Resumo financeiro</h3>
            <div className="hub-finance-page__detail-grid">
              <div><span>Original</span><strong>{formatBrl(Number(selectedReceivable.original_amount ?? 0))}</strong></div>
              <div><span>Final</span><strong>{formatBrl(Number(selectedReceivable.final_amount ?? 0))}</strong></div>
              <div><span>Pago</span><strong>{formatBrl(selectedPaid)}</strong></div>
              <div><span>Saldo</span><strong>{formatBrl(selectedBalance)}</strong></div>
            </div>
          </section>

          <section className="hub-finance-page__panel-section">
            <h3 className="hub-finance-page__subsection-title">Tutor e origem</h3>
            <div className="hub-finance-page__detail-list">
              <p><strong>Tutor:</strong> {selectedGuardian?.full_name ?? sourceEmbedName(selectedSource, 'guardian')}</p>
              <p><strong>Telefone:</strong> {selectedGuardian?.phone ?? '—'}</p>
              <p><strong>Email:</strong> {selectedGuardian?.email ?? '—'}</p>
              <p><strong>Pet:</strong> {sourcePetsLabel(selectedSource)}</p>
              <p><strong>Profissional:</strong> {sourceEmbedName(selectedSource, 'staff')}</p>
              <p><strong>Unidade:</strong> {selectedUnit?.nickname || selectedUnit?.name || '—'}</p>
              <p><strong>Origem:</strong> {sourceLabel(selectedReceivable.source_type)} #{selectedReceivable.source_id.slice(0, 8)}</p>
              <p><strong>Data da origem:</strong> {formatDateTime(sourceField(selectedSource, 'completed_at') !== '—' ? sourceField(selectedSource, 'completed_at') : sourceField(selectedSource, 'starts_at'))}</p>
            </div>
          </section>

          <section className="hub-finance-page__panel-section">
            <h3 className="hub-finance-page__subsection-title">Linhas do recebível</h3>
            {selectedReceivable.lines?.length ? (
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
                    {selectedReceivable.lines.map((line) => (
                      <tr key={line.id}>
                        <td>
                          <strong>{line.description || lineTypeLabel(line)}</strong>
                        </td>
                        <td>{lineTypeLabel(line)}</td>
                        <td className="hub-finance-page__td-num">{Number(line.quantity ?? 0)}</td>
                        <td className="hub-finance-page__td-num">{formatBrl(Number(line.line_total ?? 0))}</td>
                        <td className="hub-clientes__td-actions" onClick={(e) => e.stopPropagation()}>
                          {line.line_kind === 'product' ? (
                            <button
                              type="button"
                              className="hub-servicos__icon-btn hub-servicos__icon-btn--danger"
                              title="Remover produto e devolver ao estoque"
                              aria-label="Remover produto e devolver ao estoque"
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
              <p className="hub-clientes__muted">Sem linhas carregadas para este recebível.</p>
            )}
          </section>

          {hasPermission('hub.financial.write') && !['cancelled', 'refunded', 'paid'].includes(selectedReceivable.status) ? (
            <section className="hub-finance-page__panel-section">
              <h3 className="hub-finance-page__subsection-title">Registrar pagamento</h3>
              <div className="hub-finance-page__panel-form-grid">
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="fin-payment-amount">
                    Valor
                  </label>
                  <input
                    id="fin-payment-amount"
                    className="hub-clientes__input"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder={formatBrl(Number(selectedReceivable.final_amount))}
                  />
                </div>
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="fin-payment-method">
                    Método
                  </label>
                  <select
                    id="fin-payment-method"
                    className="hub-clientes__select-input"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as HubPaymentMethod)}
                  >
                    {(Object.keys(PAYMENT_METHOD_LABELS) as HubPaymentMethod[]).map((method) => (
                      <option key={method} value={method}>
                        {PAYMENT_METHOD_LABELS[method]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="hub-clientes__field hub-finance-page__panel-form-span">
                  <label className="hub-clientes__label" htmlFor="fin-payment-notes">
                    Observações
                  </label>
                  <input
                    id="fin-payment-notes"
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
                        <td>
                          <button
                            type="button"
                            className="hub-servicos__icon-btn"
                            title="Gerar comprovante"
                            aria-label="Gerar comprovante"
                            onClick={() => void onOpenPaymentReceipt(payment.id)}
                          >
                            <Receipt size={16} strokeWidth={2} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="hub-finance-page__panel-section">
            <h3 className="hub-finance-page__subsection-title">Timeline</h3>
            <div className="hub-finance-page__timeline">
              <p><strong>Criado:</strong> {formatDateTime(selectedReceivable.created_at)}</p>
              {selectedPayments.map((payment) => (
                <p key={`pay-${payment.id}`}><strong>Pago:</strong> {formatBrl(Number(payment.amount ?? 0))} em {formatDateTime(payment.payment_date)}</p>
              ))}
              {selectedAdjustments.map((adj) => (
                <p key={`adj-${adj.id}`}><strong>{adj.adjustment_type}:</strong> {formatBrl(Number(adj.amount ?? 0))} em {formatDateTime(adj.created_at)}</p>
              ))}
              {selectedReceivable.status === 'cancelled' ? <p><strong>Cancelado:</strong> ajuste registrado no financeiro.</p> : null}
            </div>
          </section>

          {hasPermission('hub.inventory.write') && selectedReceivable.status !== 'cancelled' ? (
            <section className="hub-finance-page__panel-section">
              <h3 className="hub-finance-page__subsection-title">Adicionar produto de estoque</h3>
              <p className="hub-clientes__muted">
                Use esta seção apenas para mercadorias do inventário. Serviços já vêm das linhas do orçamento, agenda ou atendimento.
              </p>
              <div className="hub-finance-page__panel-form-grid">
                <div className="hub-clientes__field hub-finance-page__panel-form-span">
                  <label className="hub-clientes__label" htmlFor="fin-prod-item">
                    Produto de estoque
                  </label>
                  <select
                    id="fin-prod-item"
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
                  <label className="hub-clientes__label" htmlFor="fin-prod-lot">
                    Lote
                  </label>
                  <select
                    id="fin-prod-lot"
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
                  <label className="hub-clientes__label" htmlFor="fin-prod-qty">
                    Qtd.
                  </label>
                  <input
                    id="fin-prod-qty"
                    className="hub-clientes__input"
                    value={productQty}
                    onChange={(e) => setProductQty(e.target.value)}
                    inputMode="decimal"
                  />
                </div>
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="fin-prod-price">
                    Preço unit.
                  </label>
                  <input
                    id="fin-prod-price"
                    className="hub-clientes__input"
                    value={productPrice}
                    onChange={(e) => setProductPrice(e.target.value)}
                    inputMode="decimal"
                  />
                </div>
              </div>
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary hub-finance-page__panel-primary"
                onClick={() => void onAddProductLine()}
              >
                Adicionar produto de estoque
              </button>
            </section>
          ) : null}

          {selectedReceivable.status !== 'cancelled' && hasPermission('hub.financial.write') ? (
            <div className="hub-clientes__footer-btns">
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost"
                onClick={() => void onCancelReceivable(selectedReceivable)}
              >
                Cancelar recebível
              </button>
            </div>
          ) : null}
        </div>
      </aside>
    ) : null,
  );
};

export default HubFinanceiroPage;
