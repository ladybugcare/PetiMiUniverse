import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth, getStoredClinicId, usePermissions, type AppRole } from '@petimi/web-core';
import { hubServiceGroupsApi, type HubServiceGroupRow } from '../../api/hubServiceGroupsApi';
import { hubClinicSettingsApi } from '../../api/hubClinicSettingsApi';
import { useAlert } from '../../components/AlertProvider';
import { ServiceGroupIcon } from '../../components/ServiceGroupIcon';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import { Check, CheckCircle, Layers, LayoutGrid, Pencil, Plus, Search, Trash2, Archive, ArchiveRestore } from 'lucide-react';
import { hexToSoftFill, resolveServiceAccentColor, serviceGroupLabel, slugifyServiceNameToCode } from '../../utils/serviceTypeSlug';
import { HUB_JOB_FUNCTION_OPTIONS } from '../../constants/hubJobFunctions';
import '../clientes/clientes.css';
import '../pets/pets-page.css';
import ServiceGroupAddonsEditor from './ServiceGroupAddonsEditor';
import { HubCheckbox } from '../../components/HubCheckbox';
import { HubCancelButton } from '../../components/HubCancelButton';
import './servicos-page.css';

const AGENDA_SWATCHES = ['#f0642f', '#7b1fa2', '#00897b', '#1565c0', '#f9a825', '#c62828', '#78909c'] as const;

const allowedClinicRoles = ['CADMIN', 'CMANAGER', 'CASSISTANT'] as const;

type InlineMode = 'none' | 'create' | 'edit';

const emptyDraft = () => ({
  name: '',
  slug: '',
  color: '#f0642f',
  display_order: '0',
  description: '',
  job_functions: [] as string[],
});

const HubServicosConfigPage: React.FC = () => {
  const { showError, showSuccess, showConfirm } = useAlert();
  const { user, role: authRole } = useAuth();
  const { role: clinicRole, loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const canWrite = hasPermission('hub.service_types.write');
  const canAgendaPrefsRead = hasPermission('hub.appointments.read');
  const canAgendaPrefsWrite = hasPermission('hub.appointments.write');

  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<HubServiceGroupRow[]>([]);
  const [puppyMaxMonths, setPuppyMaxMonths] = useState(8);
  const [puppyLoading, setPuppyLoading] = useState(false);
  const [puppySaving, setPuppySaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inlineMode, setInlineMode] = useState<InlineMode>('none');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);

  const accessAllowed =
    clinicRole && allowedClinicRoles.includes(clinicRole as (typeof allowedClinicRoles)[number]);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const res = await hubServiceGroupsApi.list(clinicId, true);
      setGroups(res.service_groups || []);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar grupos');
    } finally {
      setLoading(false);
    }
  }, [clinicId, showError]);

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) {
      redirectAwayFromHub(authRole as AppRole);
    }
  }, [permLoading, accessAllowed, authRole]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    void load();
  }, [clinicId, accessAllowed, load]);

  useEffect(() => {
    if (!clinicId || !accessAllowed || !canAgendaPrefsRead) return;
    setPuppyLoading(true);
    hubClinicSettingsApi
      .get(clinicId)
      .then((r) => setPuppyMaxMonths(r.settings.pet_puppy_max_months))
      .catch(() => {})
      .finally(() => setPuppyLoading(false));
  }, [clinicId, accessAllowed, canAgendaPrefsRead]);

  const savePuppySetting = useCallback(async () => {
    if (!clinicId || !canAgendaPrefsWrite) return;
    const n = Math.min(24, Math.max(1, Math.round(Number(puppyMaxMonths)) || 8));
    setPuppySaving(true);
    try {
      const res = await hubClinicSettingsApi.patch(clinicId, n);
      setPuppyMaxMonths(res.settings.pet_puppy_max_months);
      showSuccess('Preferência de filhotes atualizada.');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar');
    } finally {
      setPuppySaving(false);
    }
  }, [clinicId, canAgendaPrefsWrite, puppyMaxMonths, showError, showSuccess]);

  const metrics = useMemo(() => {
    const total = groups.length;
    const inUse = groups.filter((g) => (g.service_count ?? 0) > 0).length;
    const refs = groups.reduce((sum, g) => sum + (g.service_count ?? 0), 0);
    const archived = groups.filter((g) => Boolean(g.archived_at)).length;
    return { total, inUse, refs, archived };
  }, [groups]);

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) => g.name.toLowerCase().includes(q) || (g.slug || '').toLowerCase().includes(q)
    );
  }, [groups, searchQuery]);

  const slugPreview = useMemo(() => {
    const manual = draft.slug.trim();
    if (manual) return slugifyServiceNameToCode(manual);
    return slugifyServiceNameToCode(draft.name);
  }, [draft.name, draft.slug]);

  const openCreate = () => {
    setSelectedId(null);
    setInlineMode('create');
    setEditingId(null);
    setDraft(emptyDraft());
  };

  const openEdit = (g: HubServiceGroupRow) => {
    setSelectedId(g.id);
    setInlineMode('edit');
    setEditingId(g.id);
    setDraft({
      name: g.name,
      slug: g.slug,
      color: g.color,
      display_order: String(g.display_order ?? 0),
      description: g.description?.trim() ?? '',
      job_functions: [...(g.job_functions ?? [])],
    });
  };

  const toggleDraftJobFunction = (title: string) => {
    setDraft((d) => {
      const has = d.job_functions.includes(title);
      return {
        ...d,
        job_functions: has ? d.job_functions.filter((t) => t !== title) : [...d.job_functions, title],
      };
    });
  };

  const cancelInline = () => {
    setInlineMode('none');
    setEditingId(null);
    setSelectedId(null);
    setDraft(emptyDraft());
  };

  const parseDisplayOrder = (): number => {
    const n = Number.parseInt(draft.display_order.trim(), 10);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, 9999);
  };

  const handleSaveInline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicId || !canWrite) return;
    const name = draft.name.trim();
    if (!name) {
      showError('Indique o nome do grupo.');
      return;
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(draft.color.trim())) {
      showError('Cor inválida: use #RRGGBB.');
      return;
    }
    const display_order = parseDisplayOrder();
    setSaving(true);
    try {
      if (inlineMode === 'create') {
        const created = await hubServiceGroupsApi.create({
          clinic_id: clinicId,
          name,
          slug: draft.slug.trim() ? slugifyServiceNameToCode(draft.slug) : undefined,
          color: draft.color.trim(),
          display_order,
          description: draft.description.trim() || null,
        });
        if (draft.job_functions.length > 0) {
          await hubServiceGroupsApi.patchJobFunctions(created.service_group.id, {
            clinic_id: clinicId,
            job_titles: draft.job_functions,
          });
        }
        showSuccess('Grupo criado');
      } else if (inlineMode === 'edit' && editingId) {
        await hubServiceGroupsApi.patch(editingId, {
          clinic_id: clinicId,
          name,
          color: draft.color.trim(),
          display_order,
          description: draft.description.trim() || null,
        });
        await hubServiceGroupsApi.patchJobFunctions(editingId, {
          clinic_id: clinicId,
          job_titles: draft.job_functions,
        });
        showSuccess('Grupo atualizado');
      }
      await load();
      cancelInline();
    } catch (err: unknown) {
      showError((err as Error)?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (g: HubServiceGroupRow) => {
    if (!clinicId || !canWrite) return;
    const n = g.service_count ?? 0;
    if (n > 0) {
      showError(
        `Este grupo está em uso por ${n} serviço(s). Pode arquivá-lo para o ocultar em novos serviços, ou altere o grupo desses serviços antes de apagar.`
      );
      return;
    }
    showConfirm(`Apagar o grupo «${g.name}»?`, () => {
      void (async () => {
        try {
          await hubServiceGroupsApi.remove(g.id, clinicId);
          showSuccess('Grupo removido');
          await load();
          if (editingId === g.id) cancelInline();
        } catch (e: unknown) {
          showError((e as Error)?.message || 'Erro ao apagar');
        }
      })();
    }, 'Apagar');
  };

  const handleSetArchived = (g: HubServiceGroupRow, archived: boolean) => {
    if (!clinicId || !canWrite) return;
    const title = archived
      ? `Arquivar o grupo «${g.name}»?`
      : `Restaurar o grupo «${g.name}»?`;
    const detail = archived
      ? 'Deixa de aparecer ao escolher o grupo em novos serviços. Serviços que já usam este grupo mantêm-se.'
      : 'O grupo volta a aparecer nas listagens de novo serviço.';
    showConfirm(`${title} ${detail}`, () => {
      void (async () => {
        try {
          await hubServiceGroupsApi.patch(g.id, { clinic_id: clinicId, archived });
          showSuccess(archived ? 'Grupo arquivado' : 'Grupo restaurado');
          await load();
        } catch (e: unknown) {
          showError((e as Error)?.message || 'Erro ao atualizar');
        }
      })();
    }, archived ? 'Arquivar' : 'Restaurar');
  };

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!permLoading && !clinicId) {
    return (
      <div className="hub-clientes hub-servicos-page hub-servicos-config hub-pets-page" style={{ padding: 24 }}>
        <p className="hub-clientes__muted">Selecione uma clínica.</p>
      </div>
    );
  }

  if (permLoading || !accessAllowed) {
    return (
      <div className="hub-clientes hub-servicos-page hub-servicos-config hub-pets-page" style={{ padding: 24 }}>
        Carregando…
      </div>
    );
  }

  return (
    <div className="hub-clientes hub-servicos-page hub-servicos-config hub-pets-page">
      <div className="hub-clientes__main">
        <div className="hub-servicos-config__header">
          <div>
            <h1 className="hub-servicos-config__title">Serviços e Funções</h1>
            <p className="hub-clientes__muted hub-servicos-config__lead">
              Grupos de serviços, cores na agenda, funções da equipe por grupo e agenda de filhotes.{' '}
              <Link to="/hub/servicos/servicos" className="hub-servicos-config__back-link">
                Ir ao catálogo de serviços
              </Link>
            </p>
          </div>
        </div>

        <div className="hub-servicos__metrics" aria-live="polite">
          <div className="hub-servicos__metric-card">
            <div className="hub-servicos__metric-card__text">
              <div className="hub-servicos__metric-label">Total de grupos</div>
              <div className="hub-servicos__metric-value">{loading ? '—' : metrics.total.toLocaleString('pt-BR')}</div>
              <div className="hub-servicos__metric-sub">
                Registados nesta clínica
                {metrics.archived > 0 ? ` · ${metrics.archived} arquivado(s)` : ''}
              </div>
            </div>
            <div className="hub-servicos__metric-icon" aria-hidden>
              <Layers size={22} strokeWidth={1.75} />
            </div>
          </div>
          <div className="hub-servicos__metric-card">
            <div className="hub-servicos__metric-card__text">
              <div className="hub-servicos__metric-label">Grupos em uso</div>
              <div className="hub-servicos__metric-value">{loading ? '—' : metrics.inUse.toLocaleString('pt-BR')}</div>
              <div className="hub-servicos__metric-sub">Com pelo menos um serviço</div>
            </div>
            <div className="hub-servicos__metric-icon hub-servicos__metric-icon--muted" aria-hidden>
              <CheckCircle size={22} strokeWidth={1.75} />
            </div>
          </div>
          <div className="hub-servicos__metric-card">
            <div className="hub-servicos__metric-card__text">
              <div className="hub-servicos__metric-label">Serviços mapeados</div>
              <div className="hub-servicos__metric-value">{loading ? '—' : metrics.refs.toLocaleString('pt-BR')}</div>
              <div className="hub-servicos__metric-sub">Soma de serviços por grupo</div>
            </div>
            <div className="hub-servicos__metric-icon" aria-hidden>
              <LayoutGrid size={22} strokeWidth={1.75} />
            </div>
          </div>
        </div>

        <p className="hub-servicos__margin-info" style={{ marginBottom: 16 }}>
          Os grupos Banho &amp; Tosa, Hotel, Creche, Clínica, Cirurgia, Leva e Traz, Internação e Outros são criados
          automaticamente para a clínica (se ainda não existirem). Pode ajustar a cor na agenda e a ordem de listagem.
          O slug de cada grupo alinha-se ao campo «Grupo» dos serviços. Não é possível apagar um grupo enquanto houver
          serviços ativos com esse slug; nesse caso pode <strong>arquivar</strong> para o ocultar ao criar novos
          serviços (os existentes mantêm o grupo).
        </p>

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
                  placeholder="Buscar grupo por nome ou slug…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Buscar grupo por nome ou slug"
                />
              </div>
            </div>
            {canWrite && inlineMode === 'none' ? (
              <button type="button" className="hub-servicos__btn-primary-icon" onClick={openCreate}>
                <Plus size={20} strokeWidth={2.25} aria-hidden />
                Novo grupo
              </button>
            ) : null}
          </div>
        </div>

        {inlineMode !== 'none' && canWrite ? (
          <form className="hub-servicos-config__inline-form" onSubmit={handleSaveInline} style={{ marginBottom: 20 }}>
            <h3 className="hub-servicos-config__inline-title">
              {inlineMode === 'create' ? 'Novo grupo' : 'Editar grupo'}
            </h3>
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor="grp-name">
                Nome *
              </label>
              <input
                id="grp-name"
                className="hub-clientes__input"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Ex.: Banho & Tosa"
                disabled={inlineMode === 'edit'}
              />
              {inlineMode === 'edit' ? (
                <p className="hub-servicos__code-box-muted">O slug não pode ser alterado após criação.</p>
              ) : null}
            </div>
            {inlineMode === 'create' ? (
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="grp-slug">
                  Slug (opcional)
                </label>
                <input
                  id="grp-slug"
                  className="hub-clientes__input"
                  value={draft.slug}
                  onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
                  placeholder="Deixe vazio para gerar a partir do nome"
                />
                <div className="hub-servicos__code-preview">Pré-visualização: {slugPreview || '…'}</div>
              </div>
            ) : null}
            <div className="hub-clientes__field">
              <span className="hub-clientes__label">Cor na agenda *</span>
              <div className="hub-servicos__swatch-row" role="list">
                {AGENDA_SWATCHES.map((hex) => {
                  const selected = draft.color.trim().toLowerCase() === hex.toLowerCase();
                  return (
                    <button
                      key={hex}
                      type="button"
                      className={`hub-servicos__swatch ${selected ? 'hub-servicos__swatch--selected' : ''}`}
                      style={{ backgroundColor: hex }}
                      title={hex}
                      onClick={() => setDraft((d) => ({ ...d, color: hex }))}
                      aria-label={`Cor ${hex}`}
                      aria-pressed={selected}
                    >
                      {selected ? (
                        <span className="hub-servicos__swatch-check">
                          <Check size={16} strokeWidth={3} />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <div className="hub-servicos__color-row">
                <input
                  type="color"
                  value={/^#[0-9A-Fa-f]{6}$/.test(draft.color.trim()) ? draft.color.trim() : '#f0642f'}
                  onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                  aria-label="Escolher cor personalizada"
                />
                <input
                  className="hub-clientes__input"
                  style={{ maxWidth: 120 }}
                  value={draft.color}
                  onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                  placeholder="#RRGGBB"
                />
              </div>
            </div>
            <div className="hub-clientes__field hub-servicos-config__field-full">
              <label className="hub-clientes__label" htmlFor="grp-desc">
                Descrição (opcional)
              </label>
              <textarea
                id="grp-desc"
                className="hub-clientes__input"
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="Ex.: serviços de estética e banho"
              />
            </div>
            <div className="hub-clientes__field hub-servicos-config__field-full">
              <span className="hub-clientes__label">Funções que podem realizar serviços deste grupo</span>
              <p className="hub-clientes__muted" style={{ fontSize: 12, margin: '4px 0 10px' }}>
                Usado na agenda para sugerir profissionais ao escolher um tipo de serviço.
              </p>
              <div className="hub-servicos-config__job-fn-grid">
                {HUB_JOB_FUNCTION_OPTIONS.map((opt) => (
                  <HubCheckbox
                    key={opt.value}
                    checked={draft.job_functions.includes(opt.value)}
                    onChange={() => toggleDraftJobFunction(opt.value)}
                  >
                    {opt.label}
                  </HubCheckbox>
                ))}
              </div>
            </div>
            {inlineMode === 'edit' && editingId && clinicId ? (
              <ServiceGroupAddonsEditor groupId={editingId} clinicId={clinicId} canWrite={canWrite} />
            ) : null}
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor="grp-order">
                Ordem na lista
              </label>
              <input
                id="grp-order"
                className="hub-clientes__input"
                type="number"
                min={0}
                max={9999}
                value={draft.display_order}
                onChange={(e) => setDraft((d) => ({ ...d, display_order: e.target.value }))}
              />
            </div>
            <div className="hub-servicos-config__inline-actions">
              <button type="submit" className="hub-clientes__btn hub-clientes__btn--primary" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              <HubCancelButton onClick={cancelInline} />
            </div>
          </form>
        ) : null}

        {loading ? (
          <p className="hub-clientes__muted">Carregando grupos…</p>
        ) : (
          <div className="hub-servicos__table-wrap">
            <table className="hub-clientes__table">
              <thead>
                <tr>
                  <th>Grupo</th>
                  <th>Slug</th>
                  <th>Cor</th>
                  <th>Ordem</th>
                  <th>Serviços</th>
                  <th className="hub-clientes__th-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="hub-clientes__muted" style={{ textAlign: 'center', padding: 24 }}>
                      {groups.length === 0
                        ? 'Ainda não há grupos. Aguarde a sincronização ou use «Novo grupo».'
                        : 'Nenhum grupo corresponde à pesquisa.'}
                    </td>
                  </tr>
                ) : (
                  filteredGroups.map((g) => {
                    const accent =
                      g.color && /^#[0-9A-Fa-f]{6}$/.test(g.color.trim())
                        ? g.color.trim()
                        : resolveServiceAccentColor(null, g.slug || 'outros');
                    const sel = selectedId === g.id;
                    const isArchived = Boolean(g.archived_at);
                    return (
                      <tr
                        key={g.id}
                        className={sel ? 'hub-clientes__row--selected' : undefined}
                        style={isArchived ? { opacity: 0.88 } : undefined}
                        onClick={() => {
                          setSelectedId(g.id);
                          if (canWrite && inlineMode === 'none') openEdit(g);
                        }}
                      >
                        <td>
                          <div className="hub-servicos__svc-cell">
                            <div
                              className="hub-servicos__svc-icon-ring"
                              style={{ backgroundColor: hexToSoftFill(accent, 0.22) }}
                              aria-hidden
                            >
                              <ServiceGroupIcon group={g.slug || 'outros'} color={accent} size={22} />
                            </div>
                            <div className="hub-servicos__metric-card__text">
                              <div className="hub-servicos__svc-title">
                                {g.name}
                                {isArchived ? (
                                  <span
                                    style={{
                                      marginLeft: 8,
                                      fontSize: 11,
                                      fontWeight: 600,
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.04em',
                                      color: 'var(--hub-muted, #64748b)',
                                    }}
                                  >
                                    Arquivado
                                  </span>
                                ) : null}
                              </div>
                              <div className="hub-servicos__svc-desc">{serviceGroupLabel(g.slug)}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="hub-servicos__code-mono">{g.slug}</span>
                        </td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <span className="hub-servicos__group-dot" style={{ backgroundColor: accent }} aria-hidden />
                            <span className="hub-servicos__code-mono">{accent}</span>
                          </span>
                        </td>
                        <td>{g.display_order ?? 0}</td>
                        <td>{(g.service_count ?? 0).toLocaleString('pt-BR')}</td>
                        <td className="hub-clientes__td-actions" onClick={(e) => e.stopPropagation()}>
                          {canWrite ? (
                            <div className="hub-servicos__row-actions">
                              <button
                                type="button"
                                className="hub-servicos__icon-btn"
                                title="Editar"
                                onClick={() => openEdit(g)}
                                disabled={inlineMode !== 'none'}
                              >
                                <Pencil size={18} strokeWidth={2} />
                              </button>
                              {isArchived ? (
                                <button
                                  type="button"
                                  className="hub-servicos__icon-btn"
                                  title="Restaurar"
                                  onClick={() => handleSetArchived(g, false)}
                                  disabled={inlineMode !== 'none'}
                                >
                                  <ArchiveRestore size={18} strokeWidth={2} />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="hub-servicos__icon-btn"
                                  title="Arquivar"
                                  onClick={() => handleSetArchived(g, true)}
                                  disabled={inlineMode !== 'none'}
                                >
                                  <Archive size={18} strokeWidth={2} />
                                </button>
                              )}
                              <button
                                type="button"
                                className="hub-servicos__icon-btn hub-servicos__icon-btn--danger"
                                title="Apagar"
                                onClick={() => handleDelete(g)}
                                disabled={inlineMode !== 'none'}
                              >
                                <Trash2 size={18} strokeWidth={2} />
                              </button>
                            </div>
                          ) : (
                            <span className="hub-clientes__muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        <div
          className="hub-servicos-config-puppy"
          style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid rgba(0,0,0,0.08)' }}
        >
          <h2 className="hub-servicos-config__title" style={{ fontSize: 18, marginBottom: 8 }}>
            Agenda e preços (filhotes)
          </h2>
          <p className="hub-clientes__muted" style={{ marginBottom: 16, maxWidth: 560 }}>
            Pets com idade inferior a este limite (em meses completos, face à data do agendamento) usam o tier
            «Filhote» na matriz de preços por porte, quando esse tier existir na matriz do serviço. Valor predefinido: 8
            meses.
          </p>
          {canAgendaPrefsRead ? (
            <>
              <div className="hub-clientes__field" style={{ maxWidth: 240 }}>
                <label className="hub-clientes__label" htmlFor="hub-puppy-max-months">
                  Meses máximos como filhote (1–24)
                </label>
                <input
                  id="hub-puppy-max-months"
                  type="number"
                  min={1}
                  max={24}
                  step={1}
                  className="hub-clientes__input"
                  value={puppyMaxMonths}
                  onChange={(e) => setPuppyMaxMonths(Number(e.target.value))}
                  disabled={puppyLoading || !canAgendaPrefsWrite}
                />
              </div>
              {canAgendaPrefsWrite ? (
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary"
                  style={{ marginTop: 12 }}
                  onClick={() => void savePuppySetting()}
                  disabled={puppySaving || puppyLoading}
                >
                  {puppySaving ? 'Salvando…' : 'Salvar preferência'}
                </button>
              ) : null}
            </>
          ) : (
            <p className="hub-clientes__muted">Não tem permissão para ver ou alterar esta preferência.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default HubServicosConfigPage;
