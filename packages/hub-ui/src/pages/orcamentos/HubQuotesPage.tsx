import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  useAuth,
  getStoredClinicId,
  usePermissions,
  type AppRole,
} from '@petimi/web-core';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import { useAlert } from '../../components/AlertProvider';
import { hubQuotesApi, openHubQuotePdf, type HubQuote, type HubQuotePet, type HubQuoteStatus } from '../../api/hubQuotesApi';
import '../clientes/clientes.css';
import '../pets/pets-page.css';
import '../servicos/servicos-page.css';
import './orcamentos-page.css';
import {
  BadgeCheck,
  Eye,
  FileDown,
  FileText,
  LayoutGrid,
  Pencil,
  Plus,
  Search,
  Send,
  Share2,
} from 'lucide-react';

const allowedClinicRoles = ['CADMIN', 'CMANAGER', 'CASSISTANT'] as const;

function statusClass(s: HubQuoteStatus): string {
  return `hub-orcamentos__status hub-orcamentos__status--${s}`;
}

function statusLabel(s: HubQuoteStatus): string {
  const m: Record<HubQuoteStatus, string> = {
    draft: 'Rascunho',
    sent: 'Enviado',
    awaiting_return: 'Aguardando retorno',
    accepted: 'Aprovado',
    expired: 'Expirado',
    cancelled: 'Cancelado',
  };
  return m[s] || s;
}

function prospectOne(q: HubQuote): { full_name?: string; tax_id?: string | null; phone?: string; email?: string | null } | null {
  const p = q.prospect;
  if (!p) return null;
  return Array.isArray(p) ? p[0] : p;
}

function petsSorted(q: HubQuote): HubQuotePet[] {
  const raw = q.pets;
  if (!raw?.length) return [];
  return [...raw].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function petCellLabel(q: HubQuote): string {
  const pets = petsSorted(q);
  if (pets.length === 0) return '—';
  const labels = pets.map((p, i) => {
    const n = p.display_name?.trim();
    if (n) return n;
    const sp = (p.species || '').trim();
    return sp || `Pet ${i + 1}`;
  });
  if (labels.length <= 2) return labels.join(', ');
  return `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;
}

function normSearch(s: string): string {
  return s.trim().toLowerCase();
}

function quoteMatchesSearch(q: HubQuote, qry: string): boolean {
  if (!qry) return true;
  const pr = prospectOne(q);
  const hay: string[] = [];
  if (pr?.full_name) hay.push(pr.full_name);
  if (pr?.tax_id) hay.push(pr.tax_id);
  if (pr?.phone) hay.push(pr.phone);
  if (pr?.email) hay.push(pr.email);
  for (const p of petsSorted(q)) {
    hay.push(p.display_name || '', p.species || '', p.breed || '');
  }
  hay.push(q.id);
  const n = normSearch(qry);
  return hay.some((x) => normSearch(x).includes(n));
}

function formatExpCell(q: HubQuote): { text: string; warn: boolean } {
  if (!q.expires_at) return { text: '—', warn: false };
  const d = new Date(q.expires_at);
  const expired =
    d.getTime() < Date.now() && q.status !== 'accepted' && q.status !== 'cancelled' && q.status !== 'expired';
  return {
    text: d.toLocaleDateString('pt-BR', { dateStyle: 'medium' }),
    warn: expired,
  };
}

const HubQuotesPage: React.FC = () => {
  const navigate = useNavigate();
  const { showError, showSuccess } = useAlert();
  const { user, role: authRole } = useAuth();
  const { role: clinicRole, loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const canWrite = hasPermission('hub.quotes.write');
  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState<HubQuote[]>([]);
  const [statusFilter, setStatusFilter] = useState<HubQuoteStatus | ''>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const accessAllowed =
    clinicRole && allowedClinicRoles.includes(clinicRole as (typeof allowedClinicRoles)[number]);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const res = await hubQuotesApi.list(clinicId);
      setQuotes(res.quotes || []);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar');
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

  const metrics = useMemo(() => {
    const total = quotes.length;
    const drafts = quotes.filter((q) => q.status === 'draft').length;
    const pipeline = quotes.filter((q) => q.status === 'sent' || q.status === 'awaiting_return').length;
    const approved = quotes.filter((q) => q.status === 'accepted').length;
    return { total, drafts, pipeline, approved };
  }, [quotes]);

  const filteredQuotes = useMemo(() => {
    const qry = searchQuery.trim();
    return quotes.filter((q) => {
      if (statusFilter && q.status !== statusFilter) return false;
      return quoteMatchesSearch(q, qry);
    });
  }, [quotes, statusFilter, searchQuery]);

  const openPdfRow = async (quoteId: string) => {
    if (!clinicId) return;
    const k = `pdf:${quoteId}`;
    setBusyKey(k);
    try {
      await openHubQuotePdf(quoteId, clinicId);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao abrir PDF');
    } finally {
      setBusyKey(null);
    }
  };

  const copyPublicRow = async (quoteId: string) => {
    if (!clinicId) return;
    const k = `link:${quoteId}`;
    setBusyKey(k);
    try {
      const { public_token } = await hubQuotesApi.ensurePublicToken(quoteId, clinicId);
      const url = hubQuotesApi.publicLink(public_token);
      await navigator.clipboard.writeText(url);
      showSuccess('Link público copiado');
      setQuotes((prev) =>
        prev.map((q) => (q.id === quoteId ? { ...q, public_token } : q)),
      );
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao gerar link');
    } finally {
      setBusyKey(null);
    }
  };

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
        Carregando…
      </div>
    );
  }

  return (
    <div className="hub-servicos-page hub-orcamentos-quote-list">
      <div className="hub-servicos__metrics" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Total de orçamentos</div>
            <div className="hub-servicos__metric-value">{loading ? '—' : metrics.total.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">Nesta clínica</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <LayoutGrid size={22} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Rascunhos</div>
            <div className="hub-servicos__metric-value">{loading ? '—' : metrics.drafts.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">Ainda não enviados</div>
          </div>
          <div className="hub-servicos__metric-icon hub-servicos__metric-icon--muted" aria-hidden>
            <FileText size={22} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Em negociação</div>
            <div className="hub-servicos__metric-value">{loading ? '—' : metrics.pipeline.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">Enviado ou aguardando retorno</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Send size={22} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Aprovados</div>
            <div className="hub-servicos__metric-value">{loading ? '—' : metrics.approved.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">Convertíveis em cliente</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <BadgeCheck size={22} strokeWidth={1.75} />
          </div>
        </div>
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
                placeholder="Buscar por nome do contato, pet, telefone, e-mail ou ID…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Buscar orçamentos"
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
        <div className="hub-servicos__toolbar-row">
          <div className="hub-servicos__filter-field">
            <span className="hub-clientes__label">Estado do orçamento</span>
            <select
              className="hub-clientes__select-input"
              value={statusFilter}
              onChange={(e) => setStatusFilter((e.target.value || '') as HubQuoteStatus | '')}
              aria-label="Filtrar por estado do orçamento"
            >
              <option value="">Todos</option>
              <option value="draft">Rascunho</option>
              <option value="sent">Enviado</option>
              <option value="awaiting_return">Aguardando retorno</option>
              <option value="accepted">Aprovado</option>
              <option value="expired">Expirado</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
          <div style={{ flex: 1 }} />
        </div>
      </div>

      <p className="hub-clientes__muted" style={{ marginTop: 0, marginBottom: 16 }}>
        A listagem reflete os filtros acima. As métricas consideram todos os orçamentos carregados.
        {canWrite
          ? ' Rascunho: ícone de editar altera conteúdo; ícone de partilha gera o link público quando necessário.'
          : ' Pode abrir a vista e o PDF; a partilha do link público requer permissão de edição.'}
      </p>

      {loading ? (
        <p className="hub-clientes__muted">Carregando…</p>
      ) : (
        <div className="hub-servicos__table-wrap">
          <table className="hub-clientes__table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Pet</th>
                <th>Estado do orçamento</th>
                <th className="hub-servicos__td-money">Total</th>
                <th>Data de criação</th>
                <th>Expiração</th>
                <th className="hub-clientes__th-actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuotes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="hub-clientes__muted" style={{ textAlign: 'center', padding: 24 }}>
                    {quotes.length === 0
                      ? 'Sem orçamentos ainda.'
                      : 'Nenhum orçamento corresponde à pesquisa ou ao filtro de estado.'}
                  </td>
                </tr>
              ) : (
                filteredQuotes.map((q) => {
                  const pr = prospectOne(q);
                  const exp = formatExpCell(q);
                  return (
                    <tr
                      key={q.id}
                      className="hub-orcamentos-quote-list__row-click"
                      onClick={() => navigate(`/hub/orcamentos/${q.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <div className="hub-servicos__metric-card__text">
                          <div className="hub-servicos__svc-title">{pr?.full_name?.trim() || '—'}</div>
                        </div>
                      </td>
                      <td>
                        <span className="hub-orcamentos-quote-list__pet-cell">{petCellLabel(q)}</span>
                      </td>
                      <td>
                        <span className={statusClass(q.status)}>{statusLabel(q.status)}</span>
                      </td>
                      <td className="hub-servicos__td-money">
                        {Number(q.total_amount).toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: q.currency || 'BRL',
                        })}
                      </td>
                      <td>{q.created_at ? new Date(q.created_at).toLocaleDateString('pt-BR', { dateStyle: 'medium' }) : '—'}</td>
                      <td>
                        <span className={exp.warn ? 'hub-orcamentos-quote-list__expire--warn' : undefined}>{exp.text}</span>
                      </td>
                      <td className="hub-clientes__td-actions" onClick={(e) => e.stopPropagation()}>
                        <div className="hub-servicos__row-actions">
                          <Link
                            to={`/hub/orcamentos/${q.id}`}
                            className="hub-servicos__icon-btn"
                            title="Abrir vista do orçamento"
                            aria-label="Abrir vista do orçamento"
                          >
                            <Eye size={18} strokeWidth={2} />
                          </Link>
                          {canWrite && q.status === 'draft' ? (
                            <Link
                              to={`/hub/orcamentos/${q.id}/editar`}
                              className="hub-servicos__icon-btn"
                              title="Editar conteúdo"
                              aria-label="Editar conteúdo"
                            >
                              <Pencil size={18} strokeWidth={2} />
                            </Link>
                          ) : null}
                          <button
                            type="button"
                            className="hub-servicos__icon-btn"
                            title="Baixar PDF"
                            aria-label="Baixar PDF"
                            disabled={busyKey !== null}
                            onClick={() => void openPdfRow(q.id)}
                          >
                            <FileDown
                              size={18}
                              strokeWidth={2}
                              className={busyKey === `pdf:${q.id}` ? 'hub-orcamentos-quote-list__spin' : undefined}
                            />
                          </button>
                          {canWrite ? (
                            <button
                              type="button"
                              className="hub-servicos__icon-btn"
                              title="Copiar link público"
                              aria-label="Copiar link público"
                              disabled={busyKey !== null}
                              onClick={() => void copyPublicRow(q.id)}
                            >
                              <Share2
                                size={18}
                                strokeWidth={2}
                                className={busyKey === `link:${q.id}` ? 'hub-orcamentos-quote-list__spin' : undefined}
                              />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default HubQuotesPage;
