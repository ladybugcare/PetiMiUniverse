import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, Plus, RefreshCw, Stethoscope } from 'lucide-react';
import { HubCancelButton } from '../../components/HubCancelButton';
import { HubDateField } from '../../components/HubDateField';
import { HubLoading } from '../../components/HubLoading';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubSidePanel } from '../../components/HubSidePanel';
import {
  hubFinancialApi,
  type HubFinancePayable,
  type HubFinancePayableCategory,
  type HubPayableSchedule,
  type HubPayableScheduleAmountMode,
  type HubPayableScheduleFrequency,
} from '../../api/hubFinancialApi';
import { hubInventoryApi, type HubSupplier } from '../../api/hubInventoryApi';
import { hubStaffApi, type HubStaffMember } from '../../api/hubStaffApi';
import { isGuestAffiliation, staffAffiliationLabel } from '../../constants/hubStaffAffiliation';
import { daysUntilDue, formatDueDateShort, resolveDueDateTone } from './dueDateTone';
import { ReceivableDueBadge } from './ReceivableDueBadge';

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

/** Dígitos e um separador decimal. Letras e símbolos são descartados; centavos ficam em 2 casas. */
function sanitizePayableAmount(raw: string): string {
  const s = raw.replace(/[^\d,.]/g, '');
  if (!s) return '';

  const commas = (s.match(/,/g) ?? []).length;
  const dots = (s.match(/\./g) ?? []).length;
  if (commas === 0 && dots > 1) return s.replace(/\D/g, '');

  const sepAt = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  if (sepAt < 0) return s;

  const intPart = s.slice(0, sepAt).replace(/\D/g, '');
  const frac = s.slice(sepAt + 1).replace(/\D/g, '').slice(0, 2);
  if (s.endsWith(',') || s.endsWith('.')) return `${intPart},`;
  return frac ? `${intPart},${frac}` : intPart;
}

function isLikelyUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim());
}

type PayeeKind = 'staff' | 'supplier' | 'other';

function payeeKindFromPayable(p: HubFinancePayable): PayeeKind {
  if (p.payee_supplier_id) return 'supplier';
  if (p.payee_staff_member_id) return 'staff';
  return 'other';
}

const PAYABLE_CATEGORY_LABELS: Record<HubFinancePayableCategory, string> = {
  professional_fee: 'Honorário profissional',
  supplies: 'Material / consumíveis',
  services: 'Serviços terceiros',
  utilities: 'Utilidades',
  payroll: 'Pessoal',
  rent: 'Aluguel',
  marketing: 'Marketing',
  other: 'Outro',
};

const PAYABLE_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  paid: 'Pago',
  cancelled: 'Cancelado',
};

const PAYABLE_CATEGORY_OPTIONS: HubComboboxOption[] = (
  Object.keys(PAYABLE_CATEGORY_LABELS) as HubFinancePayableCategory[]
).map((k) => ({ value: k, label: PAYABLE_CATEGORY_LABELS[k] }));

const PAYEE_KIND_OPTIONS: HubComboboxOption[] = [
  { value: 'staff', label: 'Profissional' },
  { value: 'supplier', label: 'Fornecedor' },
  { value: 'other', label: 'Outro (nome livre)' },
];

const CREATE_STATUS_OPTIONS: HubComboboxOption[] = [
  { value: 'pending', label: 'Pendente' },
  { value: 'paid', label: 'Já pago' },
];

const PAYMENT_METHOD_OPTIONS: HubComboboxOption[] = [
  { value: 'pix', label: 'PIX' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'transfer', label: 'Transferência' },
  { value: 'credit_card', label: 'Cartão de crédito' },
  { value: 'debit_card', label: 'Cartão de débito' },
  { value: 'other', label: 'Outro' },
];

type StatusFilter = 'all' | 'pending' | 'paid';
type SourceFilter = 'all' | 'surgery' | 'manual' | 'recurrence';
type DueQuick = 'all' | 'overdue' | 'today' | 'week';
type FormPanel = 'create' | 'edit' | 'schedule';

const FREQUENCY_LABELS: Record<HubPayableScheduleFrequency, string> = {
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
};

const FREQUENCY_OPTIONS: HubComboboxOption[] = [
  { value: 'monthly', label: 'Mensal' },
  { value: 'biweekly', label: 'Quinzenal' },
  { value: 'weekly', label: 'Semanal' },
];

function todayIsoLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function daysUntilSunday(asOf = new Date()): number {
  const dow = asOf.getDay();
  return dow === 0 ? 0 : 7 - dow;
}

function paidAtFromYmd(ymd: string): string {
  return `${ymd}T12:00:00-03:00`;
}

const RECURRENCE_HORIZON_HINT =
  'Entram agora a conta deste mês e a do próximo. Nos meses seguintes, a próxima competência aparece ao abrir Contas a pagar ou o painel de Hoje, até a data em Até. Sem essa data, continua até pausar ou encerrar.';

type Props = {
  clinicId: string;
  unitId: string;
  canWrite: boolean;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  onChanged: () => void;
};

type EditDraft = {
  id: string;
  category: HubFinancePayableCategory;
  description: string;
  amount: string;
  amountConfirmed: boolean;
  payeeKind: PayeeKind;
  payeeStaffId: string;
  payeeSupplierId: string;
  payeeName: string;
  dueDate: string;
};

type ScheduleDraft = EditDraft & {
  frequency: HubPayableScheduleFrequency;
  anchorDate: string;
  untilDate: string;
  status: 'active' | 'paused';
  amountMode: HubPayableScheduleAmountMode;
};

const HubPayablesSection: React.FC<Props> = ({
  clinicId,
  unitId,
  canWrite,
  showError,
  showSuccess,
  onChanged,
}) => {
  const [rows, setRows] = useState<HubFinancePayable[]>([]);
  const [schedules, setSchedules] = useState<HubPayableSchedule[]>([]);
  const [staff, setStaff] = useState<HubStaffMember[]>([]);
  const [suppliers, setSuppliers] = useState<HubSupplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [listFrom, setListFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [listTo, setListTo] = useState(todayIsoLocal);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [dueQuick, setDueQuick] = useState<DueQuick>('all');
  const [formPanel, setFormPanel] = useState<FormPanel | null>(null);

  const [payeeKind, setPayeeKind] = useState<PayeeKind>('staff');
  const [payeeStaffId, setPayeeStaffId] = useState('');
  const [payeeSupplierId, setPayeeSupplierId] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [category, setCategory] = useState<HubFinancePayableCategory>('professional_fee');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [untilDate, setUntilDate] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [amountMode, setAmountMode] = useState<HubPayableScheduleAmountMode>('fixed');
  const [frequency, setFrequency] = useState<HubPayableScheduleFrequency>('monthly');
  const [createStatus, setCreateStatus] = useState<'pending' | 'paid'>('pending');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payMethodForRow, setPayMethodForRow] = useState('pix');
  const [payDateForRow, setPayDateForRow] = useState(todayIsoLocal);
  const [payAmountForRow, setPayAmountForRow] = useState('');
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [creating, setCreating] = useState(false);

  const staffOptions: HubComboboxOption[] = useMemo(
    () =>
      staff
        .filter((s) => s.active !== false)
        .map((s) => {
          const name = s.full_name || s.display_name || s.id;
          return {
            value: s.id,
            label: isGuestAffiliation(s.affiliation)
              ? `${name} · ${staffAffiliationLabel(s.affiliation)}`
              : name,
          };
        }),
    [staff],
  );

  const supplierOptions: HubComboboxOption[] = useMemo(
    () =>
      suppliers
        .filter((s) => s.active !== false)
        .map((s) => ({
          value: s.id,
          label: s.party_name ? `${s.name} · ${s.party_name}` : s.name,
        })),
    [suppliers],
  );

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  const pendingTotal = useMemo(
    () =>
      rows
        .filter((r) => r.status === 'pending' && r.amount_confirmed !== false)
        .reduce((acc, r) => acc + Number(r.amount || 0), 0),
    [rows],
  );

  const pendingEstimate = useMemo(() => {
    const open = rows.filter((r) => r.status === 'pending' && r.amount_confirmed === false);
    return {
      count: open.length,
      total: open.reduce((acc, r) => acc + Number(r.amount || 0), 0),
    };
  }, [rows]);

  const overdueCount = useMemo(
    () =>
      rows.filter((r) => {
        if (r.status !== 'pending') return false;
        return resolveDueDateTone(r.due_date, { status: r.status }).tone === 'overdue';
      }).length,
    [rows],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const pendingView = statusFilter === 'pending';
      const [payables, staffRes, suppliersRes, scheduleRows] = await Promise.all([
        hubFinancialApi.listPayables(clinicId, unitId, {
          from: pendingView ? undefined : listFrom,
          to: pendingView ? undefined : listTo,
          status: statusFilter === 'all' ? undefined : statusFilter,
          source_type: sourceFilter === 'all' ? undefined : sourceFilter,
        }),
        hubStaffApi.list(clinicId, { active_only: true }).catch(() => ({ staff: [] as HubStaffMember[] })),
        hubInventoryApi.suppliers.list(clinicId).catch(() => ({ suppliers: [] as HubSupplier[] })),
        hubFinancialApi.listPayableSchedules(clinicId, unitId).catch(() => [] as HubPayableSchedule[]),
      ]);
      setRows(payables);
      setSchedules(scheduleRows);
      setStaff(staffRes.staff ?? []);
      setSuppliers(suppliersRes.suppliers ?? []);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar contas a pagar');
      setRows([]);
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId, listFrom, listTo, statusFilter, sourceFilter, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetCreateForm = () => {
    setDescription('');
    setAmount('');
    setPayeeKind('staff');
    setPayeeStaffId('');
    setPayeeSupplierId('');
    setPayeeName('');
    setDueDate('');
    setUntilDate('');
    setRecurring(false);
    setAmountMode('fixed');
    setFrequency('monthly');
    setCreateStatus('pending');
    setPaymentMethod('pix');
    setCategory('professional_fee');
  };

  const openCreatePanel = () => {
    setPayingId(null);
    setEditDraft(null);
    resetCreateForm();
    setFormPanel('create');
  };

  const closeFormPanel = () => {
    if (creating || savingEdit || savingSchedule) return;
    setFormPanel(null);
    setEditDraft(null);
    setScheduleDraft(null);
    resetCreateForm();
  };

  const resolveSupplierSelection = async (raw: string): Promise<string | null> => {
    const t = raw.trim();
    if (!t) return null;
    if (suppliers.some((s) => s.id === t) || isLikelyUuid(t)) return t;
    if (!canWrite) {
      showError('Sem permissão para criar fornecedor.');
      return null;
    }
    try {
      const res = await hubInventoryApi.suppliers.create({ clinic_id: clinicId, name: t });
      const created = res.supplier;
      setSuppliers((prev) =>
        [...prev.filter((s) => s.id !== created.id), created].sort((a, b) =>
          a.name.localeCompare(b.name, 'pt'),
        ),
      );
      showSuccess('Fornecedor adicionado.');
      return created.id;
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao criar fornecedor');
      return null;
    }
  };

  const onCreate = async () => {
    if (!canWrite) {
      showError('Sem permissão para registrar contas a pagar.');
      return;
    }
    const v = Number(String(amount).replace(',', '.'));
    if (!description.trim() || Number.isNaN(v) || v <= 0) {
      showError('Preencha descrição e valor válidos.');
      return;
    }

    let staffId: string | null = payeeKind === 'staff' ? payeeStaffId || null : null;
    let supplierId: string | null = null;
    let name = payeeName.trim();

    if (payeeKind === 'staff') {
      if (!staffId && !name) {
        showError('Informe o profissional ou o nome do credor.');
        return;
      }
    } else if (payeeKind === 'supplier') {
      staffId = null;
      if (!payeeSupplierId && !name) {
        showError('Informe o fornecedor ou o nome do credor.');
        return;
      }
      if (payeeSupplierId) {
        supplierId = await resolveSupplierSelection(payeeSupplierId);
        if (!supplierId && payeeSupplierId) return;
        if (supplierId && !name) {
          const s = suppliers.find((x) => x.id === supplierId);
          name = s?.name || s?.party_name || '';
        }
      }
    } else {
      staffId = null;
      supplierId = null;
      if (!name) {
        showError('Informe o nome do credor.');
        return;
      }
    }

    if (recurring) {
      if (!dueDate) {
        showError('Informe o primeiro vencimento.');
        return;
      }
      if (untilDate && untilDate < dueDate) {
        showError('A data final não pode ser anterior ao primeiro vencimento.');
        return;
      }
      setCreating(true);
      try {
        await hubFinancialApi.createPayableSchedule({
          clinic_id: clinicId,
          unit_id: unitId,
          amount: v,
          category,
          description: description.trim(),
          payee_staff_member_id: staffId,
          payee_supplier_id: supplierId,
          payee_name: name || undefined,
          amount_mode: amountMode,
          frequency,
          anchor_date: dueDate,
          until_date: untilDate || null,
        });
        showSuccess(
          amountMode === 'estimated'
            ? 'Recorrência registrada. Os vencimentos deste mês e do próximo já estão na lista, com valor a confirmar.'
            : 'Recorrência registrada. Os vencimentos deste mês e do próximo já estão na lista.',
        );
        resetCreateForm();
        setFormPanel(null);
        await load();
        onChanged();
      } catch (e) {
        showError((e as Error)?.message || 'Erro ao registrar recorrência');
      } finally {
        setCreating(false);
      }
      return;
    }

    if (createStatus === 'paid' && !paymentMethod) {
      showError('Informe a forma de pagamento.');
      return;
    }
    setCreating(true);
    try {
      await hubFinancialApi.createPayable({
        clinic_id: clinicId,
        unit_id: unitId,
        amount: v,
        category,
        description: description.trim(),
        payee_staff_member_id: staffId,
        payee_supplier_id: supplierId,
        payee_name: name || undefined,
        status: createStatus,
        due_date: dueDate || null,
        payment_method: createStatus === 'paid' ? paymentMethod : null,
      });
      showSuccess('Conta a pagar registrada.');
      resetCreateForm();
      setFormPanel(null);
      await load();
      onChanged();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao registrar');
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (p: HubFinancePayable) => {
    setPayingId(null);
    setFormPanel('edit');
    setEditDraft({
      id: p.id,
      category: p.category,
      description: p.description,
      amount: sanitizePayableAmount(String(p.amount)),
      amountConfirmed: p.amount_confirmed !== false,
      payeeKind: payeeKindFromPayable(p),
      payeeStaffId: p.payee_staff_member_id || '',
      payeeSupplierId: p.payee_supplier_id || '',
      payeeName: p.payee_name || '',
      dueDate: p.due_date?.slice(0, 10) || '',
    });
  };

  const onSaveEdit = async () => {
    if (!editDraft || !canWrite) return;
    const v = Number(String(editDraft.amount).replace(',', '.'));
    if (!editDraft.description.trim() || Number.isNaN(v) || v <= 0) {
      showError('Preencha descrição e valor válidos.');
      return;
    }

    let staffId: string | null = editDraft.payeeKind === 'staff' ? editDraft.payeeStaffId || null : null;
    let supplierId: string | null = null;
    let name = editDraft.payeeName.trim();

    if (editDraft.payeeKind === 'staff') {
      if (!staffId && !name) {
        showError('Informe o profissional ou o nome do credor.');
        return;
      }
      supplierId = null;
    } else if (editDraft.payeeKind === 'supplier') {
      staffId = null;
      if (!editDraft.payeeSupplierId && !name) {
        showError('Informe o fornecedor ou o nome do credor.');
        return;
      }
      if (editDraft.payeeSupplierId) {
        supplierId = await resolveSupplierSelection(editDraft.payeeSupplierId);
        if (!supplierId && editDraft.payeeSupplierId) return;
        if (supplierId && !name) {
          const s = suppliers.find((x) => x.id === supplierId);
          name = s?.name || s?.party_name || '';
        }
      }
    } else {
      staffId = null;
      supplierId = null;
      if (!name) {
        showError('Informe o nome do credor.');
        return;
      }
    }

    setSavingEdit(true);
    try {
      await hubFinancialApi.patchPayable(editDraft.id, {
        clinic_id: clinicId,
        amount: v,
        category: editDraft.category,
        description: editDraft.description.trim(),
        payee_staff_member_id: staffId,
        payee_supplier_id: supplierId,
        payee_name: name || undefined,
        due_date: editDraft.dueDate || null,
      });
      showSuccess(
        editDraft.amountConfirmed
          ? 'Título atualizado.'
          : 'Fatura confirmada nesta competência.',
      );
      setEditDraft(null);
      setFormPanel(null);
      await load();
      onChanged();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao atualizar');
    } finally {
      setSavingEdit(false);
    }
  };

  const onMarkPaid = async (payable: HubFinancePayable) => {
    if (!canWrite) {
      showError('Sem permissão.');
      return;
    }
    const needsInvoice = payable.amount_confirmed === false;
    let invoiceAmount: number | undefined;
    if (needsInvoice) {
      const v = Number(String(payAmountForRow).replace(',', '.'));
      if (Number.isNaN(v) || v <= 0) {
        showError('Informe o valor da fatura.');
        return;
      }
      invoiceAmount = v;
    }
    try {
      await hubFinancialApi.payPayable(payable.id, {
        clinic_id: clinicId,
        payment_method: payMethodForRow || 'pix',
        paid_at: paidAtFromYmd(payDateForRow || todayIsoLocal()),
        ...(invoiceAmount != null ? { amount: invoiceAmount } : {}),
      });
      showSuccess(needsInvoice ? 'Fatura confirmada e conta marcada como paga.' : 'Conta marcada como paga.');
      setPayingId(null);
      await load();
      onChanged();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao liquidar');
    }
  };

  const onCancel = async (id: string) => {
    if (!canWrite) return;
    if (!window.confirm('Cancelar este título pendente?')) return;
    try {
      await hubFinancialApi.cancelPayable(id, { clinic_id: clinicId });
      showSuccess('Título cancelado.');
      if (editDraft?.id === id) {
        setEditDraft(null);
        setFormPanel(null);
      }
      await load();
      onChanged();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao cancelar');
    }
  };

  const startScheduleEdit = (schedule: HubPayableSchedule) => {
    setPayingId(null);
    setEditDraft(null);
    setFormPanel('schedule');
    setScheduleDraft({
      id: schedule.id,
      category: schedule.category,
      description: schedule.description,
      amount: sanitizePayableAmount(String(schedule.amount)),
      amountConfirmed: true,
      amountMode: schedule.amount_mode === 'estimated' ? 'estimated' : 'fixed',
      payeeKind: schedule.payee_supplier_id ? 'supplier' : schedule.payee_staff_member_id ? 'staff' : 'other',
      payeeStaffId: schedule.payee_staff_member_id || '',
      payeeSupplierId: schedule.payee_supplier_id || '',
      payeeName: schedule.payee_name || '',
      dueDate: '',
      frequency: schedule.frequency,
      anchorDate: schedule.anchor_date?.slice(0, 10) || '',
      untilDate: schedule.until_date?.slice(0, 10) || '',
      status: schedule.status === 'paused' ? 'paused' : 'active',
    });
  };

  const onSaveSchedule = async () => {
    if (!scheduleDraft || !canWrite) return;
    const v = Number(String(scheduleDraft.amount).replace(',', '.'));
    if (!scheduleDraft.description.trim() || Number.isNaN(v) || v <= 0) {
      showError('Preencha descrição e valor válidos.');
      return;
    }
    if (scheduleDraft.untilDate && scheduleDraft.anchorDate && scheduleDraft.untilDate < scheduleDraft.anchorDate) {
      showError('A data final não pode ser anterior ao primeiro vencimento.');
      return;
    }

    let staffId: string | null = scheduleDraft.payeeKind === 'staff' ? scheduleDraft.payeeStaffId || null : null;
    let supplierId: string | null = null;
    let name = scheduleDraft.payeeName.trim();

    if (scheduleDraft.payeeKind === 'staff') {
      if (!staffId && !name) {
        showError('Informe o profissional ou o nome do credor.');
        return;
      }
    } else if (scheduleDraft.payeeKind === 'supplier') {
      staffId = null;
      if (!scheduleDraft.payeeSupplierId && !name) {
        showError('Informe o fornecedor ou o nome do credor.');
        return;
      }
      if (scheduleDraft.payeeSupplierId) {
        supplierId = await resolveSupplierSelection(scheduleDraft.payeeSupplierId);
        if (!supplierId && scheduleDraft.payeeSupplierId) return;
        if (supplierId && !name) {
          const s = suppliers.find((x) => x.id === supplierId);
          name = s?.name || s?.party_name || '';
        }
      }
    } else {
      staffId = null;
      supplierId = null;
      if (!name) {
        showError('Informe o nome do credor.');
        return;
      }
    }

    setSavingSchedule(true);
    try {
      await hubFinancialApi.patchPayableSchedule(scheduleDraft.id, {
        clinic_id: clinicId,
        amount: v,
        category: scheduleDraft.category,
        description: scheduleDraft.description.trim(),
        payee_staff_member_id: staffId,
        payee_supplier_id: supplierId,
        payee_name: name || undefined,
        amount_mode: scheduleDraft.amountMode,
        until_date: scheduleDraft.untilDate || null,
        status: scheduleDraft.status,
      });
      showSuccess(
        scheduleDraft.amountMode === 'estimated'
          ? 'Recorrência atualizada. As competências pendentes do contrato ficam a confirmar.'
          : 'Recorrência atualizada. Competências pendentes acompanham o contrato.',
      );
      setScheduleDraft(null);
      setFormPanel(null);
      await load();
      onChanged();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao atualizar recorrência');
    } finally {
      setSavingSchedule(false);
    }
  };

  const onToggleSchedule = async (schedule: HubPayableSchedule) => {
    if (!canWrite) return;
    try {
      await hubFinancialApi.patchPayableSchedule(schedule.id, {
        clinic_id: clinicId,
        status: schedule.status === 'paused' ? 'active' : 'paused',
      });
      showSuccess(schedule.status === 'paused' ? 'Recorrência retomada.' : 'Recorrência pausada.');
      await load();
      onChanged();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao atualizar recorrência');
    }
  };

  const onEndSchedule = async (schedule: HubPayableSchedule) => {
    if (!canWrite) return;
    if (!window.confirm('Encerrar esta recorrência? Pendentes com vencimento depois de hoje serão cancelados.')) return;
    try {
      await hubFinancialApi.endPayableSchedule(schedule.id, { clinic_id: clinicId });
      showSuccess('Recorrência encerrada.');
      if (scheduleDraft?.id === schedule.id) {
        setScheduleDraft(null);
        setFormPanel(null);
      }
      await load();
      onChanged();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao encerrar recorrência');
    }
  };

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (b.status === 'pending' && a.status !== 'pending') return 1;
      const toneA = resolveDueDateTone(a.due_date, { status: a.status }).daysUntil ?? 9999;
      const toneB = resolveDueDateTone(b.due_date, { status: b.status }).daysUntil ?? 9999;
      if (a.status === 'pending' && b.status === 'pending' && toneA !== toneB) return toneA - toneB;
      return String(b.created_at).localeCompare(String(a.created_at));
    });
  }, [rows]);

  const visibleRows = useMemo(() => {
    if (statusFilter !== 'pending' || dueQuick === 'all') return sortedRows;
    const weekEnd = daysUntilSunday();
    return sortedRows.filter((row) => {
      if (row.status !== 'pending') return false;
      const days = daysUntilDue(row.due_date);
      if (days == null) return false;
      if (dueQuick === 'overdue') return days < 0;
      if (dueQuick === 'today') return days === 0;
      return days >= 0 && days <= weekEnd;
    });
  }, [sortedRows, statusFilter, dueQuick]);

  const renderAmountModeFields = (
    mode: HubPayableScheduleAmountMode,
    onChange: (next: HubPayableScheduleAmountMode) => void,
    idPrefix: string,
  ) => (
    <div className="hub-finance-page__field-span-6">
      <span className="hub-clientes__label" id={`${idPrefix}-amount-mode-label`}>
        Tipo de valor
      </span>
      <div className="hub-payables__kind-tabs" role="tablist" aria-labelledby={`${idPrefix}-amount-mode-label`}>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'fixed'}
          className={`hub-payables__kind-tab${mode === 'fixed' ? ' hub-payables__kind-tab--active' : ''}`}
          onClick={() => onChange('fixed')}
        >
          Valor fixo
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'estimated'}
          className={`hub-payables__kind-tab${mode === 'estimated' ? ' hub-payables__kind-tab--active' : ''}`}
          onClick={() => onChange('estimated')}
        >
          Valor varia todo mês
        </button>
      </div>
      <p className="hub-clientes__muted hub-payables__field-hint">
        {mode === 'estimated'
          ? 'Serve à previsão até a conta chegar. A fatura confirmada vira a estimativa do mês seguinte.'
          : 'O mesmo valor se repete em cada competência.'}
      </p>
    </div>
  );

  const renderCreateOrEditFields = (
    mode: 'create' | 'edit',
    draft?: EditDraft,
  ) => {
    const isEdit = mode === 'edit' && draft;
    const cat = isEdit ? draft.category : category;
    const kind = isEdit ? draft.payeeKind : payeeKind;
    const staffId = isEdit ? draft.payeeStaffId : payeeStaffId;
    const supplierId = isEdit ? draft.payeeSupplierId : payeeSupplierId;
    const name = isEdit ? draft.payeeName : payeeName;
    const desc = isEdit ? draft.description : description;
    const amt = isEdit ? draft.amount : amount;
    const due = isEdit ? draft.dueDate : dueDate;
    const idPrefix = isEdit ? `fin-ap-edit-${draft.id}` : 'fin-ap';

    const setKind = (next: PayeeKind) => {
      if (isEdit) {
        setEditDraft({
          ...draft,
          payeeKind: next,
          payeeStaffId: next === 'staff' ? draft.payeeStaffId : '',
          payeeSupplierId: next === 'supplier' ? draft.payeeSupplierId : '',
        });
      } else {
        setPayeeKind(next);
        if (next !== 'staff') setPayeeStaffId('');
        if (next !== 'supplier') setPayeeSupplierId('');
        if (next === 'supplier' && category === 'professional_fee') setCategory('supplies');
        if (next === 'staff' && category === 'supplies') setCategory('professional_fee');
      }
    };

    return (
      <div className="hub-payables__sections">
        <section className="hub-finance-page__form-card" aria-labelledby={`${idPrefix}-credor`}>
          <h3 id={`${idPrefix}-credor`} className="hub-finance-page__form-card-title">
            Credor
          </h3>
          <div className="hub-finance-page__form-grid">
        <div className="hub-clientes__field hub-finance-page__field-span-6">
          <label className="hub-clientes__label" htmlFor={`${idPrefix}-payee-kind`}>
            Tipo de credor
          </label>
          <HubSearchableCombobox
            id={`${idPrefix}-payee-kind`}
            options={PAYEE_KIND_OPTIONS}
            value={kind}
            onChange={(v) => setKind((v || kind) as PayeeKind)}
            placeholder="Selecionar tipo…"
            searchPlaceholder="Buscar tipo…"
            ariaLabel="Tipo de credor"
            clearable={false}
          />
        </div>
        {kind === 'staff' ? (
          <div className="hub-clientes__field hub-finance-page__field-span-6">
            <label className="hub-clientes__label" htmlFor={`${idPrefix}-staff`}>
              Profissional
            </label>
            <HubSearchableCombobox
              id={`${idPrefix}-staff`}
              options={staffOptions}
              value={staffId}
              onChange={(v) => {
                const m = staff.find((s) => s.id === v);
                const nextName = m ? m.full_name || m.display_name || '' : name;
                if (isEdit) {
                  setEditDraft({
                    ...draft,
                    payeeStaffId: v,
                    payeeSupplierId: '',
                    payeeName: m ? nextName || draft.payeeName : draft.payeeName,
                  });
                } else {
                  setPayeeStaffId(v);
                  setPayeeSupplierId('');
                  if (m) setPayeeName(nextName);
                }
              }}
              placeholder="Da equipe…"
              searchPlaceholder="Buscar…"
              ariaLabel="Profissional credor"
              clearable
            />
          </div>
        ) : null}
        {kind === 'supplier' ? (
          <div className="hub-clientes__field hub-finance-page__field-span-6">
            <label className="hub-clientes__label" htmlFor={`${idPrefix}-supplier`}>
              Fornecedor
            </label>
            <HubSearchableCombobox
              id={`${idPrefix}-supplier`}
              options={supplierOptions}
              value={supplierId}
              onChange={(v) => {
                const s = suppliers.find((x) => x.id === v);
                const nextName = s ? s.name : name;
                if (isEdit) {
                  setEditDraft({
                    ...draft,
                    payeeSupplierId: v,
                    payeeStaffId: '',
                    payeeName: s ? nextName || draft.payeeName : draft.payeeName,
                  });
                } else {
                  setPayeeSupplierId(v);
                  setPayeeStaffId('');
                  if (s) setPayeeName(nextName);
                }
              }}
              placeholder="Selecionar ou buscar…"
              searchPlaceholder="Buscar fornecedor…"
              ariaLabel="Fornecedor credor"
              allowCreate={canWrite}
              createEntityLabel="fornecedor"
              createEntityGender="m"
              emptyResultsLabel="Nenhum fornecedor encontrado"
              clearable
            />
          </div>
        ) : null}
        <div className="hub-clientes__field hub-finance-page__field-span-6">
          <label className="hub-clientes__label" htmlFor={`${idPrefix}-name`}>
            Nome do credor
          </label>
          <input
            id={`${idPrefix}-name`}
            className="hub-clientes__input"
            value={name}
            onChange={(e) => {
              if (isEdit) setEditDraft({ ...draft, payeeName: e.target.value });
              else setPayeeName(e.target.value);
            }}
            placeholder={
              kind === 'supplier'
                ? 'Preenchido pelo fornecedor, se quiser ajuste'
                : kind === 'staff'
                  ? 'Se não estiver na equipe'
                  : 'Nome livre do credor'
            }
          />
        </div>
          </div>
        </section>
        <section className="hub-finance-page__form-card" aria-labelledby={`${idPrefix}-conta`}>
          <h3 id={`${idPrefix}-conta`} className="hub-finance-page__form-card-title">
            Conta
          </h3>
          <div className="hub-finance-page__form-grid">
        <div className="hub-clientes__field hub-finance-page__field-span-6">
          <label className="hub-clientes__label" htmlFor={`${idPrefix}-cat`}>
            Categoria
          </label>
          <HubSearchableCombobox
            id={`${idPrefix}-cat`}
            options={PAYABLE_CATEGORY_OPTIONS}
            value={cat}
            onChange={(v) => {
              const next = (v || cat) as HubFinancePayableCategory;
              if (isEdit) setEditDraft({ ...draft, category: next });
              else setCategory(next);
            }}
            placeholder="Selecionar categoria…"
            searchPlaceholder="Buscar categoria…"
            ariaLabel="Categoria"
            clearable={false}
          />
        </div>
        <div className="hub-clientes__field hub-finance-page__field-span-6">
          <label className="hub-clientes__label" htmlFor={`${idPrefix}-desc`}>
            Descrição
          </label>
          <input
            id={`${idPrefix}-desc`}
            className="hub-clientes__input"
            value={desc}
            onChange={(e) => {
              if (isEdit) setEditDraft({ ...draft, description: e.target.value });
              else setDescription(e.target.value);
            }}
            placeholder={
              kind === 'supplier'
                ? 'Ex.: Compra de medicação — nota 123'
                : 'Ex.: Honorário anestesista — castração Luna'
            }
          />
        </div>
        {!isEdit && recurring ? renderAmountModeFields(amountMode, setAmountMode, idPrefix) : null}
        <div className="hub-clientes__field hub-finance-page__field-span-2">
          <label className="hub-clientes__label" htmlFor={`${idPrefix}-amt`}>
            {isEdit && draft?.amountConfirmed === false
              ? 'Valor da fatura (R$)'
              : !isEdit && recurring && amountMode === 'estimated'
                ? 'Valor estimado (R$)'
                : 'Valor (R$)'}
          </label>
          <input
            id={`${idPrefix}-amt`}
            className="hub-clientes__input"
            value={amt}
            onChange={(e) => {
              const next = sanitizePayableAmount(e.target.value);
              if (isEdit) setEditDraft({ ...draft, amount: next });
              else setAmount(next);
            }}
            inputMode="decimal"
            autoComplete="off"
          />
          {isEdit && draft?.amountConfirmed === false ? (
            <p className="hub-clientes__muted hub-payables__field-hint">
              Salvar confirma a fatura desta competência, sem marcar como paga.
            </p>
          ) : null}
        </div>
        {isEdit ? (
          <div className="hub-clientes__field hub-finance-page__field-span-6">
            <HubDateField
              id={`${idPrefix}-due`}
              label="Vencimento"
              valueIso={due}
              onChangeIso={(iso) => setEditDraft({ ...draft, dueDate: iso })}
              showTodayButton={false}
            />
          </div>
        ) : null}
          </div>
        </section>
        {!isEdit ? (
          <section className="hub-finance-page__form-card" aria-labelledby={`${idPrefix}-pagamento`}>
            <h3 id={`${idPrefix}-pagamento`} className="hub-finance-page__form-card-title">
              Pagamento
            </h3>
            <div className="hub-payables__kind-tabs" role="tablist" aria-label="Tipo da conta">
              <button
                type="button"
                role="tab"
                aria-selected={!recurring}
                className={`hub-payables__kind-tab${!recurring ? ' hub-payables__kind-tab--active' : ''}`}
                onClick={() => setRecurring(false)}
              >
                Avulsa
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={recurring}
                className={`hub-payables__kind-tab${recurring ? ' hub-payables__kind-tab--active' : ''}`}
                onClick={() => {
                  setCreateStatus('pending');
                  setRecurring(true);
                }}
              >
                Recorrente
              </button>
            </div>
            <p className="hub-finance-page__form-card-sub">
              {recurring
                ? 'Cada competência nasce pendente. Aluguel e folha usam valor fixo; água e luz podem variar todo mês.'
                : 'Pendente fica em aberto até liquidar. Já pago entra no fluxo de caixa agora.'}
            </p>
            {recurring ? (
              <div className="hub-finance-page__form-grid">
                <div className="hub-clientes__field hub-finance-page__field-span-3">
                  <label className="hub-clientes__label" htmlFor={`${idPrefix}-freq`}>
                    Frequência
                  </label>
                  <HubSearchableCombobox
                    id={`${idPrefix}-freq`}
                    options={FREQUENCY_OPTIONS}
                    value={frequency}
                    onChange={(v) => setFrequency((v || 'monthly') as HubPayableScheduleFrequency)}
                    placeholder="Frequência…"
                    searchPlaceholder="Buscar…"
                    ariaLabel="Frequência"
                    clearable={false}
                  />
                </div>
                <div className="hub-clientes__field hub-finance-page__field-span-3">
                  <HubDateField
                    id={`${idPrefix}-first-due`}
                    label="Primeiro vencimento"
                    valueIso={due}
                    onChangeIso={setDueDate}
                    showTodayButton={false}
                  />
                </div>
                <div className="hub-clientes__field hub-finance-page__field-span-6">
                  <HubDateField
                    id={`${idPrefix}-until`}
                    label="Até (opcional)"
                    valueIso={untilDate}
                    onChangeIso={setUntilDate}
                    showTodayButton={false}
                  />
                </div>
                <p className="hub-clientes__muted hub-payables__field-hint hub-finance-page__field-span-6">
                  {RECURRENCE_HORIZON_HINT}
                </p>
              </div>
            ) : (
              <div className="hub-finance-page__form-grid">
                <div className="hub-clientes__field hub-finance-page__field-span-3">
                  <label className="hub-clientes__label" htmlFor={`${idPrefix}-status`}>
                    Situação
                  </label>
                  <HubSearchableCombobox
                    id={`${idPrefix}-status`}
                    options={CREATE_STATUS_OPTIONS}
                    value={createStatus}
                    onChange={(v) => setCreateStatus((v || 'pending') as 'pending' | 'paid')}
                    placeholder="Situação…"
                    searchPlaceholder="Buscar…"
                    ariaLabel="Situação"
                    clearable={false}
                  />
                </div>
                {createStatus === 'pending' ? (
                  <div className="hub-clientes__field hub-finance-page__field-span-3">
                    <HubDateField
                      id={`${idPrefix}-due`}
                      label="Vencimento"
                      valueIso={due}
                      onChangeIso={setDueDate}
                      showTodayButton={false}
                    />
                  </div>
                ) : (
                  <div className="hub-clientes__field hub-finance-page__field-span-3">
                    <label className="hub-clientes__label" htmlFor={`${idPrefix}-pay-method`}>
                      Forma de pagamento
                    </label>
                    <HubSearchableCombobox
                      id={`${idPrefix}-pay-method`}
                      options={PAYMENT_METHOD_OPTIONS}
                      value={paymentMethod}
                      onChange={(v) => setPaymentMethod(v || 'pix')}
                      placeholder="Forma de pagamento…"
                      searchPlaceholder="Buscar…"
                      ariaLabel="Forma de pagamento"
                      clearable={false}
                    />
                  </div>
                )}
              </div>
            )}
          </section>
        ) : null}
      </div>
    );
  };

  const renderScheduleFields = (draft: ScheduleDraft) => {
    const idPrefix = `fin-ap-schedule-${draft.id}`;
    const setKind = (next: PayeeKind) => {
      setScheduleDraft({
        ...draft,
        payeeKind: next,
        payeeStaffId: next === 'staff' ? draft.payeeStaffId : '',
        payeeSupplierId: next === 'supplier' ? draft.payeeSupplierId : '',
      });
    };
    return (
      <div className="hub-payables__sections">
        <section className="hub-finance-page__form-card" aria-labelledby={`${idPrefix}-contrato`}>
          <h3 id={`${idPrefix}-contrato`} className="hub-finance-page__form-card-title">
            Contrato
          </h3>
          <div className="hub-finance-page__form-grid">
            <div className="hub-clientes__field hub-finance-page__field-span-3">
              <span className="hub-clientes__label">Frequência</span>
              <p className="hub-clientes__input" style={{ display: 'flex', alignItems: 'center' }}>
                {FREQUENCY_LABELS[draft.frequency]}
              </p>
            </div>
            <div className="hub-clientes__field hub-finance-page__field-span-3">
              <span className="hub-clientes__label">Primeiro vencimento</span>
              <p className="hub-clientes__input" style={{ display: 'flex', alignItems: 'center' }}>
                {formatDueDateShort(draft.anchorDate).replace('venc. ', '')}
              </p>
            </div>
            <div className="hub-clientes__field hub-finance-page__field-span-6">
              <HubDateField
                id={`${idPrefix}-until`}
                label="Até (opcional)"
                valueIso={draft.untilDate}
                onChangeIso={(iso) => setScheduleDraft({ ...draft, untilDate: iso })}
                showTodayButton={false}
              />
            </div>
            <p className="hub-clientes__muted hub-payables__field-hint hub-finance-page__field-span-6">
              {RECURRENCE_HORIZON_HINT}
            </p>
          </div>
        </section>
        <section className="hub-finance-page__form-card" aria-labelledby={`${idPrefix}-credor`}>
          <h3 id={`${idPrefix}-credor`} className="hub-finance-page__form-card-title">
            Credor
          </h3>
          <div className="hub-finance-page__form-grid">
        <div className="hub-clientes__field hub-finance-page__field-span-6">
          <label className="hub-clientes__label" htmlFor={`${idPrefix}-payee-kind`}>
            Tipo de credor
          </label>
          <HubSearchableCombobox
            id={`${idPrefix}-payee-kind`}
            options={PAYEE_KIND_OPTIONS}
            value={draft.payeeKind}
            onChange={(v) => setKind((v || draft.payeeKind) as PayeeKind)}
            placeholder="Selecionar tipo…"
            searchPlaceholder="Buscar tipo…"
            ariaLabel="Tipo de credor"
            clearable={false}
          />
        </div>
        {draft.payeeKind === 'staff' ? (
          <div className="hub-clientes__field hub-finance-page__field-span-6">
            <label className="hub-clientes__label" htmlFor={`${idPrefix}-staff`}>
              Profissional
            </label>
            <HubSearchableCombobox
              id={`${idPrefix}-staff`}
              options={staffOptions}
              value={draft.payeeStaffId}
              onChange={(v) => {
                const m = staff.find((s) => s.id === v);
                setScheduleDraft({
                  ...draft,
                  payeeStaffId: v,
                  payeeSupplierId: '',
                  payeeName: m ? m.full_name || m.display_name || draft.payeeName : draft.payeeName,
                });
              }}
              placeholder="Da equipe…"
              searchPlaceholder="Buscar…"
              ariaLabel="Profissional credor"
              clearable
            />
          </div>
        ) : null}
        {draft.payeeKind === 'supplier' ? (
          <div className="hub-clientes__field hub-finance-page__field-span-6">
            <label className="hub-clientes__label" htmlFor={`${idPrefix}-supplier`}>
              Fornecedor
            </label>
            <HubSearchableCombobox
              id={`${idPrefix}-supplier`}
              options={supplierOptions}
              value={draft.payeeSupplierId}
              onChange={(v) => {
                const s = suppliers.find((x) => x.id === v);
                setScheduleDraft({
                  ...draft,
                  payeeSupplierId: v,
                  payeeStaffId: '',
                  payeeName: s ? s.name || draft.payeeName : draft.payeeName,
                });
              }}
              placeholder="Selecionar ou buscar…"
              searchPlaceholder="Buscar fornecedor…"
              ariaLabel="Fornecedor credor"
              allowCreate={canWrite}
              createEntityLabel="fornecedor"
              createEntityGender="m"
              emptyResultsLabel="Nenhum fornecedor encontrado"
              clearable
            />
          </div>
        ) : null}
        <div className="hub-clientes__field hub-finance-page__field-span-6">
          <label className="hub-clientes__label" htmlFor={`${idPrefix}-name`}>
            Nome do credor
          </label>
          <input
            id={`${idPrefix}-name`}
            className="hub-clientes__input"
            value={draft.payeeName}
            onChange={(e) => setScheduleDraft({ ...draft, payeeName: e.target.value })}
          />
        </div>
          </div>
        </section>
        <section className="hub-finance-page__form-card" aria-labelledby={`${idPrefix}-conta`}>
          <h3 id={`${idPrefix}-conta`} className="hub-finance-page__form-card-title">
            Conta
          </h3>
          <div className="hub-finance-page__form-grid">
        <div className="hub-clientes__field hub-finance-page__field-span-6">
          <label className="hub-clientes__label" htmlFor={`${idPrefix}-cat`}>
            Categoria
          </label>
          <HubSearchableCombobox
            id={`${idPrefix}-cat`}
            options={PAYABLE_CATEGORY_OPTIONS}
            value={draft.category}
            onChange={(v) =>
              setScheduleDraft({ ...draft, category: (v || draft.category) as HubFinancePayableCategory })
            }
            placeholder="Selecionar categoria…"
            searchPlaceholder="Buscar categoria…"
            ariaLabel="Categoria"
            clearable={false}
          />
        </div>
        <div className="hub-clientes__field hub-finance-page__field-span-6">
          <label className="hub-clientes__label" htmlFor={`${idPrefix}-desc`}>
            Descrição
          </label>
          <input
            id={`${idPrefix}-desc`}
            className="hub-clientes__input"
            value={draft.description}
            onChange={(e) => setScheduleDraft({ ...draft, description: e.target.value })}
          />
        </div>
        {renderAmountModeFields(draft.amountMode, (next) => setScheduleDraft({ ...draft, amountMode: next }), idPrefix)}
        <div className="hub-clientes__field hub-finance-page__field-span-2">
          <label className="hub-clientes__label" htmlFor={`${idPrefix}-amt`}>
            {draft.amountMode === 'estimated' ? 'Valor estimado (R$)' : 'Valor (R$)'}
          </label>
          <input
            id={`${idPrefix}-amt`}
            className="hub-clientes__input"
            value={draft.amount}
            onChange={(e) => setScheduleDraft({ ...draft, amount: sanitizePayableAmount(e.target.value) })}
            inputMode="decimal"
            autoComplete="off"
          />
        </div>
          </div>
        </section>
      </div>
    );
  };

  const formPanelOpen =
    formPanel === 'create' ||
    (formPanel === 'edit' && !!editDraft) ||
    (formPanel === 'schedule' && !!scheduleDraft);
  const formBusy = creating || savingEdit || savingSchedule;

  return (
    <section className="hub-finance-page__section hub-payables">
      <div className="hub-payables__head">
        <div className="hub-payables__head-copy">
          <h2 className="hub-clientes__form-title">Contas a pagar</h2>
          <p className="hub-clientes__subtitle">
            Obrigações da clínica (honorários, fornecedores). Não entra na cobrança do tutor.
          </p>
        </div>
        <div className="hub-payables__head-aside">
          {!loading && statusFilter === 'pending' ? (
            <div className="hub-payables__stat">
              <span className="hub-payables__stat-label">Em aberto</span>
              <span className="hub-payables__stat-value">{formatBrl(pendingTotal)}</span>
              {pendingEstimate.count > 0 ? (
                <span className="hub-payables__stat-estimate">A confirmar {formatBrl(pendingEstimate.total)}</span>
              ) : null}
              {overdueCount > 0 ? (
                <span className="hub-payables__stat-alert">{overdueCount} vencido(s)</span>
              ) : null}
            </div>
          ) : null}
          {canWrite ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              onClick={openCreatePanel}
            >
              <Plus size={16} strokeWidth={2} aria-hidden />
              Nova conta
            </button>
          ) : null}
        </div>
      </div>

      {!canWrite ? (
        <p className="hub-clientes__muted">Apenas leitura — sem permissão para registrar contas a pagar.</p>
      ) : null}

      <div className="hub-payables__toolbar">
        <div className="hub-payables__filters" role="group" aria-label="Filtrar por status">
          {(
            [
              { id: 'pending', label: 'Pendentes' },
              { id: 'paid', label: 'Pagos' },
              { id: 'all', label: 'Todos' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              className={`hub-dayboard__toggle-btn${statusFilter === f.id ? ' hub-dayboard__toggle-btn--active' : ''}`}
              onClick={() => setStatusFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="hub-payables__filters" role="group" aria-label="Filtrar por origem">
          {(
            [
              { id: 'all', label: 'Todas origens' },
              { id: 'surgery', label: 'Cirurgia' },
              { id: 'manual', label: 'Manual' },
              { id: 'recurrence', label: 'Recorrente' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              className={`hub-dayboard__toggle-btn${sourceFilter === f.id ? ' hub-dayboard__toggle-btn--active' : ''}`}
              onClick={() => setSourceFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        {statusFilter === 'pending' ? (
          <div className="hub-payables__filters" role="group" aria-label="Filtrar por vencimento">
            {(
              [
                { id: 'all', label: 'Todos os vencimentos' },
                { id: 'overdue', label: 'Vencidas' },
                { id: 'today', label: 'Vence hoje' },
                { id: 'week', label: 'Esta semana' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                className={`hub-dayboard__toggle-btn${dueQuick === f.id ? ' hub-dayboard__toggle-btn--active' : ''}`}
                onClick={() => setDueQuick(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="hub-payables__period" role="group" aria-label="Período">
            <HubDateField
              id="fin-ap-list-from"
              label="De"
              valueIso={listFrom}
              onChangeIso={setListFrom}
              showTodayButton={false}
            />
            <span className="hub-payables__period-sep" aria-hidden="true">
              —
            </span>
            <HubDateField
              id="fin-ap-list-to"
              label="Até"
              valueIso={listTo}
              onChangeIso={setListTo}
              showTodayButton={false}
            />
          </div>
        )}
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

      {!loading && schedules.length > 0 ? (
        <section className="hub-payables__schedules" aria-label="Recorrências">
          <h3 className="hub-payables__schedules-title">Recorrências</h3>
          <ul className="hub-payables__schedules-list">
            {schedules.map((schedule) => (
              <li key={schedule.id} className="hub-payables__schedule">
                <div className="hub-payables__schedule-main">
                  <strong>{schedule.payee_name}</strong>
                  <span className="hub-payables__chip">{FREQUENCY_LABELS[schedule.frequency]}</span>
                  <span className="hub-payables__chip">{PAYABLE_CATEGORY_LABELS[schedule.category] ?? schedule.category}</span>
                  <span
                    className={`hub-finance-page__status-pill hub-finance-page__status-pill--${
                      schedule.status === 'paused' ? 'cancelled' : 'pending'
                    }`}
                  >
                    {schedule.status === 'paused' ? 'Pausada' : 'Ativa'}
                  </span>
                  <span className="hub-payables__schedule-meta">
                    {formatBrl(Number(schedule.amount))}
                    {schedule.amount_mode === 'estimated' ? (
                      <>
                        {' '}
                        <span className="hub-payables__chip hub-payables__chip--estimate">Estimativa</span>
                      </>
                    ) : null}
                    {' · '}
                    {schedule.next_due_date
                      ? `próximo ${formatDueDateShort(schedule.next_due_date).replace('venc. ', '')}`
                      : `a partir de ${formatDueDateShort(schedule.anchor_date).replace('venc. ', '')}`}
                    {schedule.until_date ? ` · até ${formatDueDateShort(schedule.until_date).replace('venc. ', '')}` : ''}
                  </span>
                </div>
                {canWrite ? (
                  <div className="hub-payables__actions">
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                      onClick={() => void onToggleSchedule(schedule)}
                    >
                      {schedule.status === 'paused' ? 'Retomar' : 'Pausar'}
                    </button>
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                      onClick={() => startScheduleEdit(schedule)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                      onClick={() => void onEndSchedule(schedule)}
                    >
                      Encerrar
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {loading ? (
        <HubLoading variant="block" label="Carregando contas a pagar…" />
      ) : visibleRows.length === 0 ? (
        <div className="hub-finance-page__empty" role="status">
          <span className="hub-finance-page__empty-icon" aria-hidden>
            <Banknote size={24} strokeWidth={1.75} />
          </span>
          <p className="hub-finance-page__empty-title">
            {statusFilter === 'pending' ? 'Nenhum título pendente' : 'Nenhuma conta a pagar no período'}
          </p>
          <p className="hub-finance-page__empty-desc">
            {statusFilter === 'pending'
              ? 'Honorários de cirurgia e títulos manuais pendentes aparecem aqui.'
              : 'Ajuste o período ou o filtro de status para ver outros títulos.'}
          </p>
          {canWrite && statusFilter === 'pending' ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              style={{ marginTop: 12 }}
              onClick={openCreatePanel}
            >
              <Plus size={16} strokeWidth={2} aria-hidden />
              Nova conta
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="hub-payables__list">
          {visibleRows.map((p) => {
            const isEditing = formPanel === 'edit' && editDraft?.id === p.id;
            const isPaying = payingId === p.id;
            const dueInfo = resolveDueDateTone(p.due_date, { status: p.status });
            const toneClass =
              p.status === 'pending' && dueInfo.tone === 'overdue'
                ? ' hub-payables__card--overdue'
                : p.status === 'pending' && dueInfo.tone === 'soon'
                  ? ' hub-payables__card--soon'
                  : '';
            const isGuest =
              !!p.payee_staff_member_id &&
              isGuestAffiliation(staffById.get(p.payee_staff_member_id)?.affiliation);
            const isSupplier = !!p.payee_supplier_id;

            return (
              <li
                key={p.id}
                className={`hub-payables__card${toneClass}${isEditing || isPaying ? ' hub-payables__card--active' : ''}`}
              >
                <div className="hub-payables__card-main">
                  <div className="hub-payables__card-primary">
                    <div className="hub-payables__card-title-row">
                      <h3 className="hub-payables__payee">{p.payee_name}</h3>
                      {isSupplier ? (
                        <span className="hub-clientes__pill hub-payables__pill--supplier">Fornecedor</span>
                      ) : null}
                      {isGuest ? (
                        <span className="hub-clientes__pill hub-equipe__pill--guest">{staffAffiliationLabel('guest')}</span>
                      ) : null}
                      <span
                        className={`hub-finance-page__status-pill hub-finance-page__status-pill--${
                          p.status === 'pending' ? 'pending' : p.status === 'paid' ? 'paid' : 'cancelled'
                        }`}
                      >
                        {PAYABLE_STATUS_LABELS[p.status] ?? p.status}
                      </span>
                    </div>
                    <p className="hub-payables__desc">{p.description}</p>
                    <div className="hub-payables__meta">
                      <span className="hub-payables__chip">
                        {PAYABLE_CATEGORY_LABELS[p.category] ?? p.category}
                      </span>
                      {p.source_type === 'surgery' && p.source_id ? (
                        <Link className="hub-payables__chip hub-payables__chip--link" to={`/hub/clinica/cirurgias/${p.source_id}`}>
                          <Stethoscope size={12} strokeWidth={2} aria-hidden />
                          {p.source_label || 'Cirurgia'}
                        </Link>
                      ) : (
                        <span className={`hub-payables__chip${p.source_type === 'recurrence' ? ' hub-payables__chip--recurrence' : ''}`}>
                          {p.source_label || 'Manual'}
                        </span>
                      )}
                      {p.status === 'pending' ? (
                        <ReceivableDueBadge dueDate={p.due_date} status="pending" showDate />
                      ) : p.due_date ? (
                        <span className="hub-payables__chip muted">{formatDueDateShort(p.due_date)}</span>
                      ) : null}
                      {p.status === 'pending' && dueInfo.label && dueInfo.tone !== 'none' && dueInfo.tone !== 'ok' ? (
                        <span className={`hub-payables__due-hint hub-payables__due-hint--${dueInfo.tone}`}>
                          {dueInfo.label}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="hub-payables__card-amount">
                    <div className="hub-payables__amount-row">
                      <span className="hub-payables__amount">{formatBrl(Number(p.amount))}</span>
                      {p.status === 'pending' && p.amount_confirmed === false ? (
                        <span className="hub-payables__chip hub-payables__chip--estimate">A confirmar</span>
                      ) : null}
                    </div>
                    {p.status === 'pending' && canWrite && !isPaying ? (
                      <div className="hub-payables__actions">
                        <button
                          type="button"
                          className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                          onClick={() => {
                            setFormPanel(null);
                            setEditDraft(null);
                            setPayingId(p.id);
                            setPayMethodForRow('pix');
                            setPayDateForRow(todayIsoLocal());
                            setPayAmountForRow(sanitizePayableAmount(String(p.amount)));
                          }}
                        >
                          Pagar
                        </button>
                        <button
                          type="button"
                          className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                          onClick={() => startEdit(p)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                          onClick={() => void onCancel(p.id)}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {isPaying ? (
                  <div className="hub-payables__panel">
                    <p className="hub-payables__panel-title">Confirmar pagamento</p>
                    <div className="hub-payables__panel-row">
                    {p.amount_confirmed === false ? (
                      <div className="hub-clientes__field" style={{ margin: 0, minWidth: 160, flex: '0 1 180px' }}>
                        <label className="hub-clientes__label" htmlFor={`fin-ap-pay-amt-${p.id}`}>
                          Valor da fatura (R$)
                        </label>
                        <input
                          id={`fin-ap-pay-amt-${p.id}`}
                          className="hub-clientes__input"
                          value={payAmountForRow}
                          onChange={(e) => setPayAmountForRow(sanitizePayableAmount(e.target.value))}
                          inputMode="decimal"
                          autoComplete="off"
                        />
                      </div>
                    ) : null}
                    <div className="hub-clientes__field" style={{ margin: 0, minWidth: 200, flex: '1 1 200px' }}>
                        <label className="hub-clientes__label" htmlFor={`fin-ap-pay-${p.id}`}>
                          Forma de pagamento
                        </label>
                        <HubSearchableCombobox
                          id={`fin-ap-pay-${p.id}`}
                          options={PAYMENT_METHOD_OPTIONS}
                          value={payMethodForRow}
                          onChange={(v) => setPayMethodForRow(v || 'pix')}
                          placeholder="Forma de pagamento…"
                          searchPlaceholder="Buscar…"
                          ariaLabel="Forma de pagamento"
                          clearable={false}
                        />
                      </div>
                      <div className="hub-clientes__field" style={{ margin: 0, minWidth: 160, flex: '0 1 180px' }}>
                        <HubDateField
                          id={`fin-ap-pay-date-${p.id}`}
                          label="Data do pagamento"
                          valueIso={payDateForRow}
                          onChangeIso={setPayDateForRow}
                          showTodayButton={false}
                        />
                      </div>
                      <div className="hub-payables__panel-actions">
                        <button
                          type="button"
                          className="hub-clientes__btn hub-clientes__btn--primary"
                          onClick={() => void onMarkPaid(p)}
                        >
                          {p.amount_confirmed === false ? 'Confirmar e pagar' : 'Confirmar'}{' '}
                          {formatBrl(
                            p.amount_confirmed === false
                              ? Number(String(payAmountForRow).replace(',', '.')) || 0
                              : Number(p.amount),
                          )}
                        </button>
                        <button
                          type="button"
                          className="hub-clientes__btn hub-clientes__btn--ghost"
                          onClick={() => setPayingId(null)}
                        >
                          Voltar
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canWrite ? (
        <HubSidePanel
          open={formPanelOpen}
          onClose={closeFormPanel}
          title={
            formPanel === 'edit'
              ? 'Editar conta a pagar'
              : formPanel === 'schedule'
                ? 'Editar recorrência'
                : 'Nova conta a pagar'
          }
          titleIcon={<Banknote size={20} strokeWidth={1.75} aria-hidden />}
          subtitle={
            formPanel === 'edit'
              ? editDraft && !editDraft.amountConfirmed
                ? 'Informe o valor da fatura. Salvar confirma só esta competência, sem marcar como paga.'
                : 'Atualize credor, valor ou vencimento deste título pendente. Se ele veio de uma recorrência, só esta competência muda.'
              : formPanel === 'schedule'
                ? scheduleDraft?.amountMode === 'estimated'
                  ? 'A estimativa passa para as competências pendentes que ainda seguem o contrato. Cada uma pede a fatura.'
                  : 'O valor e o credor passam para as competências pendentes que ainda seguem o contrato.'
                : recurring
                  ? amountMode === 'estimated'
                    ? 'Contrato contínuo. Cada mês nasce com a estimativa até a fatura ser informada.'
                    : 'Contrato contínuo. As próximas contas nascem mês a mês, até a data final.'
                  : 'Título manual — profissional, fornecedor do estoque ou credor avulso. Cirurgias sincronizam sozinhas.'
          }
          contentKey={
            formPanel === 'edit'
              ? `edit-${editDraft?.id ?? ''}`
              : formPanel === 'schedule'
                ? `schedule-${scheduleDraft?.id ?? ''}`
                : 'create'
          }
          footer={
            <div className="hub-finance-page__drawer-footer">
              <HubCancelButton onClick={closeFormPanel} disabled={formBusy} />
              {formPanel === 'edit' ? (
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary"
                  disabled={formBusy}
                  onClick={() => void onSaveEdit()}
                >
                  {savingEdit
                    ? 'Salvando…'
                    : editDraft && !editDraft.amountConfirmed
                      ? 'Confirmar fatura'
                      : 'Salvar alterações'}
                </button>
              ) : formPanel === 'schedule' ? (
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary"
                  disabled={formBusy}
                  onClick={() => void onSaveSchedule()}
                >
                  {savingSchedule ? 'Salvando…' : 'Salvar recorrência'}
                </button>
              ) : (
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary"
                  disabled={formBusy}
                  onClick={() => void onCreate()}
                >
                  {creating ? 'Registrando…' : recurring ? 'Registrar recorrência' : 'Registrar conta'}
                </button>
              )}
            </div>
          }
        >
          {formPanel === 'edit' && editDraft
            ? renderCreateOrEditFields('edit', editDraft)
            : formPanel === 'schedule' && scheduleDraft
              ? renderScheduleFields(scheduleDraft)
              : renderCreateOrEditFields('create')}
        </HubSidePanel>
      ) : null}
    </section>
  );
};

export default HubPayablesSection;
