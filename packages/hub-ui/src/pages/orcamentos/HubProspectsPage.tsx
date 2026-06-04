import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  useAuth,
  getStoredClinicId,
  usePermissions,
  type AppRole,
} from '@petimi/web-core';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import { useAlert } from '../../components/AlertProvider';
import { hubProspectsApi, type HubProspect } from '../../api/hubProspectsApi';
import { maskTaxIdForList } from '../../utils/maskTaxId';
import '../clientes/clientes.css';
import './orcamentos-page.css';
import { Plus, Search } from 'lucide-react';

const allowedClinicRoles = ['CADMIN', 'CMANAGER', 'CASSISTANT'] as const;

function useDebounced<T>(value: T, ms: number): T {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

const HubProspectsPage: React.FC = () => {
  const { showError, showSuccess } = useAlert();
  const { user, role: authRole } = useAuth();
  const { role: clinicRole, loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const canWrite = hasPermission('hub.prospects.write');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<HubProspect[]>([]);
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 350);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ full_name: '', tax_id: '', phone: '', email: '' });

  const accessAllowed =
    clinicRole && allowedClinicRoles.includes(clinicRole as (typeof allowedClinicRoles)[number]);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const res = await hubProspectsApi.list(clinicId, debouncedQ || undefined);
      setRows(res.prospects || []);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [clinicId, debouncedQ, showError]);

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) redirectAwayFromHub(authRole as AppRole);
  }, [permLoading, accessAllowed, authRole]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    void load();
  }, [clinicId, accessAllowed, load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicId || !canWrite) return;
    const full_name = form.full_name.trim();
    const tax_id = form.tax_id.trim();
    const phone = form.phone.trim();
    if (!full_name || !tax_id || !phone) {
      showError('Preencha nome, CPF e telefone.');
      return;
    }
    setCreating(true);
    try {
      await hubProspectsApi.create({
        clinic_id: clinicId,
        full_name,
        tax_id,
        phone,
        email: form.email.trim() || null,
      });
      showSuccess('Contato criado');
      setForm({ full_name: '', tax_id: '', phone: '', email: '' });
      await load();
    } catch (err: unknown) {
      showError((err as Error)?.message || 'Erro ao criar');
    } finally {
      setCreating(false);
    }
  };

  const title = useMemo(() => 'Contatos (orçamentos)', []);

  if (!user) return <Navigate to="/login" replace />;
  if (!permLoading && !clinicId) {
    return (
      <div style={{ padding: 24 }}>
        <p className="hub-clientes__muted">Selecione uma clínica.</p>
      </div>
    );
  }
  if (permLoading || !accessAllowed) {
    return (
      <div style={{ padding: 24 }}>
        Carregando…
      </div>
    );
  }

  return (
    <div>
      <h1 className="hub-clientes__title" style={{ marginBottom: 8 }}>
        {title}
      </h1>
      <p className="hub-clientes__muted" style={{ marginBottom: 20 }}>
        Arquivo mínimo para emitir orçamentos sem cadastrar como cliente. CPF mascarado nas listagens.
      </p>

      <div className="hub-servicos__toolbar" style={{ marginBottom: 16 }}>
        <div className="hub-servicos__search-wrap">
          <div className="hub-servicos__search-field">
            <span className="hub-servicos__search-icon">
              <Search size={18} strokeWidth={2} />
            </span>
            <input
              type="search"
              className="hub-servicos__search-input"
              placeholder="Nome, telefone ou CPF…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Buscar contato"
            />
          </div>
        </div>
      </div>

      {canWrite ? (
        <form className="hub-clientes__card" style={{ padding: 16, marginBottom: 24 }} onSubmit={handleCreate}>
          <h2 className="hub-clientes__subtitle" style={{ marginTop: 0 }}>
            Novo contato
          </h2>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
            <div className="hub-clientes__field">
              <label className="hub-clientes__label">Nome *</label>
              <input
                className="hub-clientes__input"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              />
            </div>
            <div className="hub-clientes__field">
              <label className="hub-clientes__label">CPF *</label>
              <input
                className="hub-clientes__input"
                value={form.tax_id}
                onChange={(e) => setForm((f) => ({ ...f, tax_id: e.target.value }))}
              />
            </div>
            <div className="hub-clientes__field">
              <label className="hub-clientes__label">Telefone *</label>
              <input
                className="hub-clientes__input"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="hub-clientes__field">
              <label className="hub-clientes__label">E-mail</label>
              <input
                className="hub-clientes__input"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
          </div>
          <button type="submit" className="hub-clientes__btn hub-clientes__btn--primary" disabled={creating} style={{ marginTop: 12 }}>
            <Plus size={18} strokeWidth={2} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
            {creating ? 'Salvando…' : 'Adicionar contato'}
          </button>
        </form>
      ) : null}

      {loading ? (
        <p className="hub-clientes__muted">Carregando…</p>
      ) : (
        <div className="hub-servicos__table-wrap">
          <table className="hub-clientes__table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>CPF (mascarado)</th>
                <th>Telefone</th>
                <th className="hub-clientes__th-actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="hub-clientes__muted" style={{ textAlign: 'center', padding: 24 }}>
                    Nenhum contato encontrado.
                  </td>
                </tr>
              ) : (
                rows.map((p) => (
                  <tr key={p.id}>
                    <td>{p.full_name}</td>
                    <td className="hub-servicos__code-mono">{maskTaxIdForList(p.tax_id)}</td>
                    <td>{p.phone}</td>
                    <td className="hub-clientes__td-actions">
                      <Link to={`/hub/orcamentos/novo?prospect_id=${encodeURIComponent(p.id)}`} className="hub-clientes__link-btn">
                        Novo orçamento
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default HubProspectsPage;
