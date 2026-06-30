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
import { HubLoading } from '../../components/HubLoading';
import { hubProspectsApi, type HubProspect } from '../../api/hubProspectsApi';
import { maskTaxIdForList } from '../../utils/maskTaxId';
import '../clientes/clientes.css';
import '../pets/pets-page.css';
import '../servicos/servicos-page.css';
import './orcamentos-page.css';
import { CalendarDays, LayoutGrid, Mail, Plus, Search, UserMinus } from 'lucide-react';

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

  const metrics = useMemo(() => {
    const total = rows.length;
    const withEmail = rows.filter((p) => Boolean(p.email?.trim())).length;
    const withoutEmail = Math.max(0, total - withEmail);
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - weekMs;
    const recent = rows.filter((p) => new Date(p.created_at).getTime() > cutoff).length;
    return { total, withEmail, withoutEmail, recent };
  }, [rows]);

  if (!user) return <Navigate to="/login" replace />;
  if (!permLoading && !clinicId) {
    return (
      <div className="hub-servicos-page" style={{ padding: 24 }}>
        <p className="hub-clientes__muted">Selecione uma clínica.</p>
      </div>
    );
  }
  if (permLoading || !accessAllowed) {
    return (
      <div className="hub-servicos-page" style={{ padding: 24 }}>
        <HubLoading variant="block" />
      </div>
    );
  }

  return (
    <div className="hub-servicos-page hub-orcamentos-contatos">
      <div className="hub-servicos__metrics" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Total de contatos</div>
            <div className="hub-servicos__metric-value">{loading ? '—' : metrics.total.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">Nesta clínica (lista atual)</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <LayoutGrid size={22} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Com e-mail</div>
            <div className="hub-servicos__metric-value">{loading ? '—' : metrics.withEmail.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">Para envio de orçamento</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Mail size={22} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Sem e-mail</div>
            <div className="hub-servicos__metric-value">{loading ? '—' : metrics.withoutEmail.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">Só telefone / presencial</div>
          </div>
          <div className="hub-servicos__metric-icon hub-servicos__metric-icon--muted" aria-hidden>
            <UserMinus size={22} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Novos (7 dias)</div>
            <div className="hub-servicos__metric-value">{loading ? '—' : metrics.recent.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">Criados na última semana</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <CalendarDays size={22} strokeWidth={1.75} />
          </div>
        </div>
      </div>

      <div className="hub-clientes__title-block" style={{ marginTop: 8, marginBottom: 12 }}>
        <h1 className="hub-clientes__title">Contatos (orçamentos)</h1>
        <p className="hub-clientes__subtitle">
          Arquivo mínimo para emitir orçamentos sem cadastrar como cliente. CPF mascarado nas listagens.
        </p>
      </div>

      <div className="hub-servicos__toolbar">
        <div className="hub-servicos__toolbar-row">
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
          {canWrite ? (
            <Link to="/hub/orcamentos/novo" className="hub-servicos__btn-primary-icon">
              <Plus size={20} strokeWidth={2.25} aria-hidden />
              Novo orçamento
            </Link>
          ) : null}
        </div>
      </div>

      <p className="hub-clientes__muted" style={{ marginTop: 0, marginBottom: 16 }}>
        A listagem reflete a pesquisa acima. Os totais nas métricas consideram os contatos carregados nesta vista.
        {canWrite ? ' Para criar um orçamento a partir de um contato, use a coluna Ações.' : ''}
      </p>

      {canWrite ? (
        <form className="hub-orcamentos-contatos__form-panel" onSubmit={handleCreate}>
          <h2 className="hub-orcamentos-contatos__form-title">Novo contato</h2>
          <div className="hub-orcamentos-contatos__form-grid">
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
          <button type="submit" className="hub-servicos__btn-primary-icon hub-orcamentos-contatos__submit" disabled={creating}>
            <Plus size={20} strokeWidth={2.25} aria-hidden />
            {creating ? 'Salvando…' : 'Adicionar contato'}
          </button>
        </form>
      ) : null}

      {loading ? (
        <HubLoading variant="block" label="Carregando lista…" />
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
                    <td>
                      <div className="hub-servicos__metric-card__text">
                        <div className="hub-servicos__svc-title">{p.full_name}</div>
                      </div>
                    </td>
                    <td className="hub-servicos__code-mono">{maskTaxIdForList(p.tax_id)}</td>
                    <td>{p.phone}</td>
                    <td className="hub-clientes__td-actions">
                      <Link
                        to={`/hub/orcamentos/novo?prospect_id=${encodeURIComponent(p.id)}`}
                        className="hub-orcamentos-contatos__row-link"
                      >
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
