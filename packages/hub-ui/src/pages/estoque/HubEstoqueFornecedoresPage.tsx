import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Archive, Building2, Pencil, Plus, Search } from 'lucide-react';
import { getStoredClinicId, useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import {
  hubInventoryApi,
  type HubManufacturer,
  type HubSupplier,
} from '../../api/hubInventoryApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubCancelButton } from '../../components/HubCancelButton';
import { HubBrPhoneInput } from '../../components/HubBrPhoneInput';
import { HubBrTaxIdInput } from '../../components/HubBrTaxIdInput';
import { formatBrPhoneDisplay, formatBrPhoneFromApi } from '../../utils/formatBrPhone';
import { formatBrTaxIdDisplay, formatBrTaxIdFromApi } from '../../utils/formatBrTaxId';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import HubEstoqueFilterChips from './HubEstoqueFilterChips';
import { partnerDisplayLabel } from './estoqueShared';
import '../clientes/clientes.css';
import '../clientes/clientes-drawer.css';
import '../servicos/servicos-page.css';
import './estoque.css';

type Tab = 'suppliers' | 'manufacturers';

type PartnerFormState = {
  name: string;
  party_name: string;
  tax_id: string;
  phone: string;
  email: string;
  notes: string;
};

const emptyPartnerForm = (): PartnerFormState => ({
  name: '',
  party_name: '',
  tax_id: '',
  phone: '',
  email: '',
  notes: '',
});

function fromSupplier(s: HubSupplier): PartnerFormState {
  return {
    name: s.name,
    party_name: s.party_name ?? '',
    tax_id: formatBrTaxIdFromApi(s.tax_id),
    phone: formatBrPhoneFromApi(s.phone),
    email: s.email ?? '',
    notes: s.notes ?? '',
  };
}

function fromManufacturer(m: HubManufacturer): PartnerFormState {
  return {
    name: m.name,
    party_name: m.party_name ?? '',
    tax_id: formatBrTaxIdFromApi(m.tax_id),
    phone: formatBrPhoneFromApi(m.phone),
    email: m.email ?? '',
    notes: m.notes ?? '',
  };
}

const HubEstoqueFornecedoresPage: React.FC = () => {
  const { showError, showSuccess, showConfirm } = useAlert();
  const { user, role: authRole } = useAuth();
  const { loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const accessAllowed = hasPermission('hub.inventory.read');
  const canWrite = hasPermission('hub.inventory.write');

  const [tab, setTab] = useState<Tab>('suppliers');
  const [query, setQuery] = useState('');
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(clinicId);
  const [suppliers, setSuppliers] = useState<HubSupplier[]>([]);
  const [manufacturers, setManufacturers] = useState<HubManufacturer[]>([]);

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PartnerFormState>(emptyPartnerForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!clinicId) return;
    begin();
    try {
      const [s, m] = await Promise.all([
        hubInventoryApi.suppliers.list(clinicId),
        hubInventoryApi.manufacturers.list(clinicId),
      ]);
      setSuppliers(s.suppliers || []);
      setManufacturers(m.manufacturers || []);
      succeed();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar cadastros');
    } finally {
      finish();
    }
  }, [clinicId, showError, begin, succeed, finish]);

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) redirectAwayFromHub(authRole as AppRole);
  }, [permLoading, accessAllowed, authRole]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    void load();
  }, [clinicId, accessAllowed, load]);

  const q = query.trim().toLowerCase();
  const visibleSuppliers = useMemo(() => {
    if (!q) return suppliers;
    return suppliers.filter((s) =>
      [s.name, s.party_name, s.tax_id, s.phone, s.email].some((v) => (v || '').toLowerCase().includes(q)),
    );
  }, [suppliers, q]);
  const visibleManufacturers = useMemo(() => {
    if (!q) return manufacturers;
    return manufacturers.filter((m) =>
      [m.name, m.party_name, m.tax_id, m.phone, m.email].some((v) => (v || '').toLowerCase().includes(q)),
    );
  }, [manufacturers, q]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyPartnerForm());
    setPanelOpen(true);
  };

  const openEditSupplier = (s: HubSupplier) => {
    setEditingId(s.id);
    setForm(fromSupplier(s));
    setPanelOpen(true);
  };

  const openEditManufacturer = (m: HubManufacturer) => {
    setEditingId(m.id);
    setForm(fromManufacturer(m));
    setPanelOpen(true);
  };

  const contactPayload = () => ({
    party_name: form.party_name.trim() || null,
    tax_id: form.tax_id.trim() || null,
    phone: form.phone.trim() || null,
    email: form.email.trim() || null,
    notes: form.notes.trim() || null,
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicId || !canWrite) return;
    const trimmed = form.name.trim();
    if (!trimmed) {
      showError('Informe o nome do cadastro');
      return;
    }
    setSaving(true);
    try {
      if (tab === 'suppliers') {
        if (editingId) {
          await hubInventoryApi.suppliers.patch(editingId, {
            clinic_id: clinicId,
            name: trimmed,
            ...contactPayload(),
          });
          showSuccess('Fornecedor atualizado');
        } else {
          await hubInventoryApi.suppliers.create({
            clinic_id: clinicId,
            name: trimmed,
            ...contactPayload(),
          });
          showSuccess('Fornecedor criado');
        }
      } else if (editingId) {
        await hubInventoryApi.manufacturers.patch(editingId, {
          clinic_id: clinicId,
          name: trimmed,
          ...contactPayload(),
        });
        showSuccess('Fabricante atualizado');
      } else {
        await hubInventoryApi.manufacturers.create({
          clinic_id: clinicId,
          name: trimmed,
          ...contactPayload(),
        });
        showSuccess('Fabricante criado');
      }
      setPanelOpen(false);
      await load();
    } catch (err: unknown) {
      showError((err as Error)?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const archiveSupplier = (s: HubSupplier) => {
    if (!clinicId || !canWrite) return;
    showConfirm(
      `Arquivar fornecedor "${s.name}"?`,
      async () => {
        try {
          await hubInventoryApi.suppliers.patch(s.id, { clinic_id: clinicId, archived: true });
          showSuccess('Arquivado');
          await load();
        } catch (e: unknown) {
          showError((e as Error)?.message || 'Erro');
        }
      },
      'Arquivar',
    );
  };

  const archiveManufacturer = (m: HubManufacturer) => {
    if (!clinicId || !canWrite) return;
    showConfirm(
      `Arquivar fabricante "${m.name}"?`,
      async () => {
        try {
          await hubInventoryApi.manufacturers.patch(m.id, { clinic_id: clinicId, archived: true });
          showSuccess('Arquivado');
          await load();
        } catch (e: unknown) {
          showError((e as Error)?.message || 'Erro');
        }
      },
      'Arquivar',
    );
  };

  if (!user) return <Navigate to="/login" replace />;
  if (!permLoading && !clinicId) {
    return (
      <div className="hub-clientes hub-estoque-page" style={{ padding: 24 }}>
        <p className="hub-clientes__muted">Selecione uma clínica.</p>
      </div>
    );
  }
  if (permLoading || !accessAllowed) {
    return (
      <div className="hub-clientes hub-estoque-page" style={{ padding: 24 }}>
        <HubLoading variant="block" />
      </div>
    );
  }

  const isSupplier = tab === 'suppliers';
  const entityLabel = isSupplier ? 'fornecedor' : 'fabricante';
  const panelTitle = editingId
    ? isSupplier
      ? 'Editar fornecedor'
      : 'Editar fabricante'
    : isSupplier
      ? 'Novo fornecedor'
      : 'Novo fabricante';

  const renderPartnerRows = (
    rows: Array<HubSupplier | HubManufacturer>,
    onEdit: (row: HubSupplier | HubManufacturer) => void,
    onArchive: (row: HubSupplier | HubManufacturer) => void,
    emptyLabel: string,
  ) => (
    <>
      <div className="hub-servicos__table-wrap hub-clientes__table-wrap--desktop">
        <table className="hub-clientes__table">
          <thead>
            <tr>
              <th>Cadastro</th>
              <th>Empresa ou pessoa</th>
              <th>CNPJ/CPF</th>
              <th>Contato</th>
              {canWrite ? <th className="hub-clientes__th-actions">Ações</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={canWrite ? 5 : 4} className="hub-clientes__muted" style={{ textAlign: 'center', padding: 24 }}>
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="hub-packages__row"
                  onClick={() => {
                    if (canWrite) onEdit(row);
                  }}
                  style={{ cursor: canWrite ? 'pointer' : 'default' }}
                >
                  <td>
                    <strong>{row.name}</strong>
                  </td>
                  <td className="hub-clientes__muted">{row.party_name || '—'}</td>
                  <td className="hub-clientes__muted">{formatBrTaxIdDisplay(row.tax_id)}</td>
                  <td className="hub-clientes__muted">
                    {[row.phone ? formatBrPhoneDisplay(row.phone) : '', row.email].filter(Boolean).join(' · ') || '—'}
                  </td>
                  {canWrite ? (
                    <td className="hub-clientes__td-actions" onClick={(e) => e.stopPropagation()}>
                      <div className="hub-servicos__row-actions">
                        <button
                          type="button"
                          className="hub-servicos__icon-btn"
                          title="Editar"
                          aria-label={`Editar ${entityLabel}`}
                          onClick={() => onEdit(row)}
                        >
                          <Pencil size={18} strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          className="hub-servicos__icon-btn"
                          title="Arquivar"
                          aria-label={`Arquivar ${entityLabel}`}
                          onClick={() => onArchive(row)}
                        >
                          <Archive size={18} strokeWidth={2} />
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="hub-clientes__mobile-list" aria-label={`Lista de ${entityLabel}s`}>
        {rows.length === 0 ? (
          <p className="hub-clientes__muted" style={{ textAlign: 'center', padding: 16 }}>
            {emptyLabel}
          </p>
        ) : (
          rows.map((row) => (
            <button
              key={row.id}
              type="button"
              className="hub-clientes__mobile-card"
              onClick={() => {
                if (canWrite) onEdit(row);
              }}
              disabled={!canWrite}
            >
              <div className="hub-clientes__mobile-card-top">
                <div className="hub-clientes__mobile-card-main">
                  <span className="hub-clientes__mobile-card-name">{row.name}</span>
                  <span className="hub-clientes__muted hub-clientes__mobile-card-contact">
                    {row.party_name || 'Sem empresa ou pessoa'}
                    {row.tax_id ? ` · ${formatBrTaxIdDisplay(row.tax_id)}` : ''}
                  </span>
                </div>
              </div>
              <div className="hub-clientes__mobile-card-foot">
                <span className="hub-clientes__muted">
                  {row.phone ? formatBrPhoneDisplay(row.phone) : 'Sem telefone'}
                </span>
                <span className="hub-clientes__muted">{row.email || 'Sem e-mail'}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </>
  );

  return (
    <>
      <div className="hub-clientes hub-servicos-page hub-estoque-page hub-pets-page hub-clientes-page--full-width">
        <div className="hub-clientes__main">
          <div className="hub-servicos-config__header">
            <div>
              <h1 className="hub-servicos-config__title">Fornecedores</h1>
              <p className="hub-clientes__muted hub-servicos-config__lead">
                Cadastro de quem vende para a clínica e das marcas dos produtos. Um mesmo fornecedor pode atender vários
                itens.
              </p>
            </div>
          </div>

          <div className="hub-servicos__metrics hub-estoque__metrics" aria-live="polite">
            <button
              type="button"
              className={`hub-servicos__metric-card hub-estoque__metric-btn${tab === 'suppliers' ? ' hub-estoque__metric-btn--active' : ''}`}
              onClick={() => setTab('suppliers')}
            >
              <div className="hub-servicos__metric-card__text">
                <div className="hub-servicos__metric-label">Fornecedores</div>
                <div className="hub-servicos__metric-value">
                  {loading ? '—' : suppliers.length.toLocaleString('pt-BR')}
                </div>
                <div className="hub-servicos__metric-sub">Quem vende para a clínica</div>
              </div>
              <div className="hub-servicos__metric-icon" aria-hidden>
                <Building2 size={22} strokeWidth={1.75} />
              </div>
            </button>
            <button
              type="button"
              className={`hub-servicos__metric-card hub-estoque__metric-btn${tab === 'manufacturers' ? ' hub-estoque__metric-btn--active' : ''}`}
              onClick={() => setTab('manufacturers')}
            >
              <div className="hub-servicos__metric-card__text">
                <div className="hub-servicos__metric-label">Fabricantes</div>
                <div className="hub-servicos__metric-value">
                  {loading ? '—' : manufacturers.length.toLocaleString('pt-BR')}
                </div>
                <div className="hub-servicos__metric-sub">Marcas dos produtos</div>
              </div>
              <div className="hub-servicos__metric-icon" aria-hidden>
                <Building2 size={22} strokeWidth={1.75} />
              </div>
            </button>
          </div>

          <div className="hub-servicos__toolbar">
            <div className="hub-servicos__toolbar-row hub-estoque__toolbar-filters">
              <HubEstoqueFilterChips
                ariaLabel="Tipo de cadastro"
                value={tab}
                options={[
                  { id: 'suppliers', label: `Fornecedores (${suppliers.length})` },
                  { id: 'manufacturers', label: `Fabricantes (${manufacturers.length})` },
                ]}
                onChange={(id) => {
                  setTab(id);
                  setQuery('');
                }}
              />
              {canWrite && (
                <button type="button" className="hub-servicos__btn-primary-icon" onClick={openCreate}>
                  <Plus size={18} strokeWidth={2.25} aria-hidden />
                  Novo {entityLabel}
                </button>
              )}
            </div>
            <div className="hub-servicos__toolbar-row">
              <div className="hub-servicos__search-wrap">
                <div className="hub-servicos__search-field">
                  <span className="hub-servicos__search-icon">
                    <Search size={18} strokeWidth={2} aria-hidden />
                  </span>
                  <input
                    type="search"
                    className="hub-servicos__search-input"
                    placeholder={`Buscar ${entityLabel}, empresa ou contato…`}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Buscar cadastros"
                  />
                </div>
              </div>
            </div>
          </div>

          <HubRefreshingBanner show={refreshing} label="Atualizando cadastros…" />
          {loading && suppliers.length === 0 && manufacturers.length === 0 ? (
            <HubLoading variant="block" label="Carregando…" />
          ) : isSupplier ? (
            renderPartnerRows(
              visibleSuppliers,
              (row) => openEditSupplier(row as HubSupplier),
              (row) => archiveSupplier(row as HubSupplier),
              'Nenhum fornecedor.',
            )
          ) : (
            renderPartnerRows(
              visibleManufacturers,
              (row) => openEditManufacturer(row as HubManufacturer),
              (row) => archiveManufacturer(row as HubManufacturer),
              'Nenhum fabricante.',
            )
          )}
        </div>
      </div>

      <HubSidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={panelTitle}
        titleIcon={<Building2 size={20} strokeWidth={2} aria-hidden />}
        subtitle={editingId ? partnerDisplayLabel(form.name, form.party_name) : undefined}
        footer={
          <div className="hub-finance-page__drawer-footer">
            <HubCancelButton onClick={() => setPanelOpen(false)} disabled={saving} />
            <button
              type="submit"
              form="hub-estoque-fornecedor-form"
              className="hub-clientes__btn hub-clientes__btn--primary"
              disabled={saving || !canWrite}
            >
              {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Criar cadastro'}
            </button>
          </div>
        }
      >
        <div className="hub-clientes-drawer__content hub-estoque-drawer">
          <form id="hub-estoque-fornecedor-form" onSubmit={(e) => void handleSave(e)}>
            <section className="hub-estoque-drawer__section">
              <h3 className="hub-estoque-drawer__section-title">Identificação</h3>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="ref-name">
                  {isSupplier ? 'Nome do cadastro *' : 'Nome da marca *'}
                </label>
                <input
                  id="ref-name"
                  className="hub-clientes__input"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={isSupplier ? 'Ex.: Distribuidora Centro' : 'Ex.: Zoetis'}
                />
                <p className="hub-estoque__hint-ean">Como aparece na lista e ao vincular itens do estoque.</p>
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="ref-party">
                  Empresa ou pessoa
                </label>
                <input
                  id="ref-party"
                  className="hub-clientes__input"
                  value={form.party_name}
                  onChange={(e) => setForm((f) => ({ ...f, party_name: e.target.value }))}
                  placeholder={isSupplier ? 'Ex.: Maria Souza ou Pet Atacado Ltda.' : 'Ex.: Zoetis Indústria de Produtos Ltda.'}
                />
                <p className="hub-estoque__hint-ean">
                  Quem de fato {isSupplier ? 'fornece' : 'fabrica'}. Um mesmo cadastro pode atender vários produtos.
                </p>
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="ref-tax">
                  CNPJ / CPF
                </label>
                <HubBrTaxIdInput
                  id="ref-tax"
                  className="hub-clientes__input"
                  value={form.tax_id}
                  onChange={(tax_id) => setForm((f) => ({ ...f, tax_id }))}
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                />
              </div>
            </section>

            <section className="hub-estoque-drawer__section">
              <h3 className="hub-estoque-drawer__section-title">Contato</h3>
              <div className="hub-estoque-drawer__row">
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="ref-phone">
                    Telefone
                  </label>
                  <HubBrPhoneInput
                    id="ref-phone"
                    className="hub-clientes__input"
                    value={form.phone}
                    onChange={(phone) => setForm((f) => ({ ...f, phone }))}
                    placeholder="(11) 99999-0000"
                  />
                </div>
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="ref-email">
                    E-mail
                  </label>
                  <input
                    id="ref-email"
                    className="hub-clientes__input"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="contato@empresa.com"
                  />
                </div>
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="ref-notes">
                  Notas
                </label>
                <textarea
                  id="ref-notes"
                  className="hub-clientes__textarea"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Condições, prazo, produtos que costuma fornecer…"
                />
              </div>
            </section>
          </form>
        </div>
      </HubSidePanel>
    </>
  );
};

export default HubEstoqueFornecedoresPage;
