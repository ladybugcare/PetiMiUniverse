import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Archive, Pencil, Plus } from 'lucide-react';
import { getStoredClinicId, useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import {
  hubInventoryApi,
  type HubManufacturer,
  type HubSupplier,
} from '../../api/hubInventoryApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubCancelButton } from '../../components/HubCancelButton';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import '../clientes/clientes.css';
import '../clientes/clientes-drawer.css';
import '../servicos/servicos-page.css';
import './estoque.css';

type Tab = 'suppliers' | 'manufacturers';

const HubEstoqueFornecedoresPage: React.FC = () => {
  const { showError, showSuccess, showConfirm } = useAlert();
  const { user, role: authRole } = useAuth();
  const { loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const accessAllowed = hasPermission('hub.inventory.read');
  const canWrite = hasPermission('hub.inventory.write');

  const [tab, setTab] = useState<Tab>('suppliers');
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<HubSupplier[]>([]);
  const [manufacturers, setManufacturers] = useState<HubManufacturer[]>([]);

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const [s, m] = await Promise.all([
        hubInventoryApi.suppliers.list(clinicId),
        hubInventoryApi.manufacturers.list(clinicId),
      ]);
      setSuppliers(s.suppliers || []);
      setManufacturers(m.manufacturers || []);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar cadastros');
    } finally {
      setLoading(false);
    }
  }, [clinicId, showError]);

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) redirectAwayFromHub(authRole as AppRole);
  }, [permLoading, accessAllowed, authRole]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    void load();
  }, [clinicId, accessAllowed, load]);

  const openCreate = () => {
    setEditingId(null);
    setName('');
    setTaxId('');
    setPhone('');
    setEmail('');
    setNotes('');
    setPanelOpen(true);
  };

  const openEditSupplier = (s: HubSupplier) => {
    setEditingId(s.id);
    setName(s.name);
    setTaxId(s.tax_id || '');
    setPhone(s.phone || '');
    setEmail(s.email || '');
    setNotes(s.notes || '');
    setPanelOpen(true);
  };

  const openEditManufacturer = (m: HubManufacturer) => {
    setEditingId(m.id);
    setName(m.name);
    setTaxId('');
    setPhone('');
    setEmail('');
    setNotes('');
    setPanelOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicId || !canWrite) return;
    const trimmed = name.trim();
    if (!trimmed) {
      showError('Informe o nome');
      return;
    }
    setSaving(true);
    try {
      if (tab === 'suppliers') {
        if (editingId) {
          await hubInventoryApi.suppliers.patch(editingId, {
            clinic_id: clinicId,
            name: trimmed,
            tax_id: taxId.trim() || null,
            phone: phone.trim() || null,
            email: email.trim() || null,
            notes: notes.trim() || null,
          });
          showSuccess('Fornecedor atualizado');
        } else {
          await hubInventoryApi.suppliers.create({
            clinic_id: clinicId,
            name: trimmed,
            tax_id: taxId.trim() || null,
            phone: phone.trim() || null,
            email: email.trim() || null,
            notes: notes.trim() || null,
          });
          showSuccess('Fornecedor criado');
        }
      } else if (editingId) {
        await hubInventoryApi.manufacturers.patch(editingId, {
          clinic_id: clinicId,
          name: trimmed,
        });
        showSuccess('Fabricante atualizado');
      } else {
        await hubInventoryApi.manufacturers.create({
          clinic_id: clinicId,
          name: trimmed,
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

  return (
    <>
      <div className="hub-clientes hub-servicos-page hub-estoque-page hub-pets-page hub-clientes-page--full-width">
        <div className="hub-clientes__main">
          <div className="hub-servicos__toolbar" style={{ marginBottom: 16 }}>
            <div className="hub-servicos__toolbar-row">
              <div className="hub-clientes__tabs" role="tablist" aria-label="Fornecedores e fabricantes">
                <button
                  type="button"
                  role="tab"
                  className={`hub-clientes__tab${tab === 'suppliers' ? ' hub-clientes__tab--active' : ''}`}
                  aria-selected={tab === 'suppliers'}
                  onClick={() => setTab('suppliers')}
                >
                  Fornecedores ({suppliers.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`hub-clientes__tab${tab === 'manufacturers' ? ' hub-clientes__tab--active' : ''}`}
                  aria-selected={tab === 'manufacturers'}
                  onClick={() => setTab('manufacturers')}
                >
                  Fabricantes ({manufacturers.length})
                </button>
              </div>
              {canWrite && (
                <button type="button" className="hub-servicos__btn-primary-icon" onClick={openCreate}>
                  <Plus size={18} strokeWidth={2.25} aria-hidden />
                  Novo {tab === 'suppliers' ? 'fornecedor' : 'fabricante'}
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <HubLoading variant="block" label="Carregando…" />
          ) : tab === 'suppliers' ? (
            <div className="hub-servicos__table-wrap">
              <table className="hub-clientes__table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>CNPJ/CPF</th>
                    <th>Telefone</th>
                    <th>E-mail</th>
                    {canWrite ? <th className="hub-clientes__th-actions">Ações</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {suppliers.length === 0 ? (
                    <tr>
                      <td colSpan={canWrite ? 5 : 4} className="hub-clientes__muted" style={{ textAlign: 'center', padding: 24 }}>
                        Nenhum fornecedor.
                      </td>
                    </tr>
                  ) : (
                    suppliers.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <strong>{s.name}</strong>
                        </td>
                        <td className="hub-clientes__muted">{s.tax_id || '—'}</td>
                        <td className="hub-clientes__muted">{s.phone || '—'}</td>
                        <td className="hub-clientes__muted">{s.email || '—'}</td>
                        {canWrite ? (
                          <td className="hub-clientes__td-actions">
                            <div className="hub-servicos__row-actions">
                              <button
                                type="button"
                                className="hub-servicos__icon-btn"
                                title="Editar"
                                aria-label="Editar fornecedor"
                                onClick={() => openEditSupplier(s)}
                              >
                                <Pencil size={18} strokeWidth={2} />
                              </button>
                              <button
                                type="button"
                                className="hub-servicos__icon-btn"
                                title="Arquivar"
                                aria-label="Arquivar fornecedor"
                                onClick={() => archiveSupplier(s)}
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
          ) : (
            <div className="hub-servicos__table-wrap">
              <table className="hub-clientes__table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    {canWrite ? <th className="hub-clientes__th-actions">Ações</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {manufacturers.length === 0 ? (
                    <tr>
                      <td colSpan={canWrite ? 2 : 1} className="hub-clientes__muted" style={{ textAlign: 'center', padding: 24 }}>
                        Nenhum fabricante.
                      </td>
                    </tr>
                  ) : (
                    manufacturers.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <strong>{m.name}</strong>
                        </td>
                        {canWrite ? (
                          <td className="hub-clientes__td-actions">
                            <div className="hub-servicos__row-actions">
                              <button
                                type="button"
                                className="hub-servicos__icon-btn"
                                title="Editar"
                                aria-label="Editar fabricante"
                                onClick={() => openEditManufacturer(m)}
                              >
                                <Pencil size={18} strokeWidth={2} />
                              </button>
                              <button
                                type="button"
                                className="hub-servicos__icon-btn"
                                title="Arquivar"
                                aria-label="Arquivar fabricante"
                                onClick={() => archiveManufacturer(m)}
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
          )}
        </div>
      </div>

      <HubSidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={
          editingId
            ? tab === 'suppliers'
              ? 'Editar fornecedor'
              : 'Editar fabricante'
            : tab === 'suppliers'
              ? 'Novo fornecedor'
              : 'Novo fabricante'
        }
        footer={
          <div className="hub-finance-page__drawer-footer">
            <HubCancelButton onClick={() => setPanelOpen(false)} disabled={saving} />
            <button
              type="submit"
              form="hub-estoque-fornecedor-form"
              className="hub-clientes__btn hub-clientes__btn--primary"
              disabled={saving || !canWrite}
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        }
      >
        <div className="hub-clientes-drawer__content">
          <form id="hub-estoque-fornecedor-form" onSubmit={(e) => void handleSave(e)}>
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor="ref-name">
                Nome *
              </label>
              <input
                id="ref-name"
                className="hub-clientes__input"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            {tab === 'suppliers' && (
              <>
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="ref-tax">
                    CNPJ / CPF
                  </label>
                  <input
                    id="ref-tax"
                    className="hub-clientes__input"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                  />
                </div>
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="ref-phone">
                    Telefone
                  </label>
                  <input
                    id="ref-phone"
                    className="hub-clientes__input"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
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
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="ref-notes">
                    Notas
                  </label>
                  <textarea
                    id="ref-notes"
                    className="hub-clientes__textarea"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </>
            )}
          </form>
        </div>
      </HubSidePanel>
    </>
  );
};

export default HubEstoqueFornecedoresPage;
