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
} from '../../api/hubFinancialApi';
import { hubInventoryApi, type HubSupplier } from '../../api/hubInventoryApi';
import { hubStaffApi, type HubStaffMember } from '../../api/hubStaffApi';
import { isGuestAffiliation, staffAffiliationLabel } from '../../constants/hubStaffAffiliation';
import { formatDueDateShort, resolveDueDateTone } from './dueDateTone';
import { ReceivableDueBadge } from './ReceivableDueBadge';

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
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
type SourceFilter = 'all' | 'surgery' | 'manual';

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
  payeeKind: PayeeKind;
  payeeStaffId: string;
  payeeSupplierId: string;
  payeeName: string;
  dueDate: string;
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
  const [staff, setStaff] = useState<HubStaffMember[]>([]);
  const [suppliers, setSuppliers] = useState<HubSupplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [listFrom, setListFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [listTo, setListTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [formPanel, setFormPanel] = useState<'create' | 'edit' | null>(null);

  const [payeeKind, setPayeeKind] = useState<PayeeKind>('staff');
  const [payeeStaffId, setPayeeStaffId] = useState('');
  const [payeeSupplierId, setPayeeSupplierId] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [category, setCategory] = useState<HubFinancePayableCategory>('professional_fee');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [createStatus, setCreateStatus] = useState<'pending' | 'paid'>('pending');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payMethodForRow, setPayMethodForRow] = useState('pix');
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
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
    () => rows.filter((r) => r.status === 'pending').reduce((acc, r) => acc + Number(r.amount || 0), 0),
    [rows],
  );

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
      const [payables, staffRes, suppliersRes] = await Promise.all([
        hubFinancialApi.listPayables(clinicId, unitId, {
          from: listFrom,
          to: listTo,
          status: statusFilter === 'all' ? undefined : statusFilter,
          source_type: sourceFilter === 'all' ? undefined : sourceFilter,
        }),
        hubStaffApi.list(clinicId, { active_only: true }).catch(() => ({ staff: [] as HubStaffMember[] })),
        hubInventoryApi.suppliers.list(clinicId).catch(() => ({ suppliers: [] as HubSupplier[] })),
      ]);
      setRows(payables);
      setStaff(staffRes.staff ?? []);
      setSuppliers(suppliersRes.suppliers ?? []);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar contas a pagar');
      setRows([]);
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
    if (creating || savingEdit) return;
    setFormPanel(null);
    setEditDraft(null);
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
      amount: String(p.amount),
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
      showSuccess('Título atualizado.');
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

  const onMarkPaid = async (id: string) => {
    if (!canWrite) {
      showError('Sem permissão.');
      return;
    }
    try {
      await hubFinancialApi.payPayable(id, {
        clinic_id: clinicId,
        payment_method: payMethodForRow || 'pix',
      });
      showSuccess('Conta marcada como paga.');
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
      <div className="hub-finance-page__form-grid">
        <div className="hub-clientes__field hub-finance-page__field-span-3">
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
        <div className="hub-clientes__field hub-finance-page__field-span-3">
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
        <div className="hub-clientes__field hub-finance-page__field-span-2">
          <label className="hub-clientes__label" htmlFor={`${idPrefix}-amt`}>
            Valor (R$)
          </label>
          <input
            id={`${idPrefix}-amt`}
            className="hub-clientes__input"
            value={amt}
            onChange={(e) => {
              if (isEdit) setEditDraft({ ...draft, amount: e.target.value });
              else setAmount(e.target.value);
            }}
            inputMode="decimal"
          />
        </div>
        {!isEdit ? (
          <div className="hub-clientes__field hub-finance-page__field-span-2">
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
        ) : null}
        {(isEdit || createStatus === 'pending') ? (
          <div className="hub-clientes__field hub-finance-page__field-span-2">
            <HubDateField
              id={`${idPrefix}-due`}
              label="Vencimento"
              valueIso={due}
              onChangeIso={(iso) => {
                if (isEdit) setEditDraft({ ...draft, dueDate: iso });
                else setDueDate(iso);
              }}
              showTodayButton={false}
            />
          </div>
        ) : (
          <div className="hub-clientes__field hub-finance-page__field-span-2">
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
    );
  };

  const formPanelOpen = formPanel === 'create' || (formPanel === 'edit' && !!editDraft);
  const formBusy = creating || savingEdit;

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
        <HubLoading variant="block" label="Carregando contas a pagar…" />
      ) : sortedRows.length === 0 ? (
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
          {sortedRows.map((p) => {
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
                        <span className="hub-payables__chip">{p.source_label || 'Manual'}</span>
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
                    <span className="hub-payables__amount">{formatBrl(Number(p.amount))}</span>
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
                      <div className="hub-payables__panel-actions">
                        <button
                          type="button"
                          className="hub-clientes__btn hub-clientes__btn--primary"
                          onClick={() => void onMarkPaid(p.id)}
                        >
                          Confirmar {formatBrl(Number(p.amount))}
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
          title={formPanel === 'edit' ? 'Editar conta a pagar' : 'Nova conta a pagar'}
          titleIcon={<Banknote size={20} strokeWidth={1.75} aria-hidden />}
          subtitle={
            formPanel === 'edit'
              ? 'Atualize credor, valor ou vencimento deste título pendente.'
              : 'Título manual — profissional, fornecedor do estoque ou credor avulso. Cirurgias sincronizam sozinhas.'
          }
          contentKey={formPanel === 'edit' ? `edit-${editDraft?.id ?? ''}` : 'create'}
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
                  {savingEdit ? 'Salvando…' : 'Salvar alterações'}
                </button>
              ) : (
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary"
                  disabled={formBusy}
                  onClick={() => void onCreate()}
                >
                  {creating ? 'Registrando…' : 'Registrar conta'}
                </button>
              )}
            </div>
          }
        >
          {formPanel === 'edit' && editDraft
            ? renderCreateOrEditFields('edit', editDraft)
            : renderCreateOrEditFields('create')}
        </HubSidePanel>
      ) : null}
    </section>
  );
};

export default HubPayablesSection;
