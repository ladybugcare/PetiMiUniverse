import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  useAuth,
  getStoredClinicId,
  usePermissions,
  type AppRole,
} from '@petimi/web-core';
import { redirectAwayFromHub } from '../utils/redirectAwayFromHub';
import { useAlert } from '../components/AlertProvider';
import { hubGuardiansApi, type HubGuardian, type HubGuardianStats } from '../api/hubGuardiansApi';
import './clientes/clientes.css';
import { ClientesMetricsRow } from './clientes/ClientesMetricsRow';
import { ClientesToolbar } from './clientes/ClientesToolbar';
import { ClientesTable } from './clientes/ClientesTable';
import {
  GuardianCreateForm,
  emptyGuardianForm,
  guardianToFormValues,
  type GuardianFormValues,
} from './clientes/GuardianCreateForm';
import { GuardianDetailPanel } from './clientes/GuardianDetailPanel';
import { formValuesToCreatePayload, formValuesToUpdatePayload } from './clientes/guardianFormPayload';
import { hubQuotesApi, type HubQuote } from '../api/hubQuotesApi';
import { quoteProspectToGuardianFormValues, prospectFromQuote } from './orcamentos/quoteToGuardianForm';
import { clearManualQuoteConversion } from './orcamentos/quoteManualConversionStorage';

const allowedClinicRoles = ['CADMIN', 'CMANAGER', 'CASSISTANT'] as const;

type MainTab = 'tutores' | 'empresas';
type PanelMode = 'create' | 'detail' | 'edit';

function useDebounced<T>(value: T, ms: number): T {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

const HubGuardiansPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromQuoteId = searchParams.get('fromQuote')?.trim() || '';
  const linkGuardianId = searchParams.get('linkGuardianId')?.trim() || '';
  const { showError, showSuccess, showConfirm } = useAlert();
  const { user, role: authRole } = useAuth();
  const { role: clinicRole, loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const canWrite = hasPermission('hub.guardians.write');

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<HubGuardianStats | null>(null);
  const [guardiansRaw, setGuardiansRaw] = useState<HubGuardian[]>([]);
  const [mainTab, setMainTab] = useState<MainTab>('tutores');
  const [searchQ, setSearchQ] = useState('');
  const debouncedQ = useDebounced(searchQ, 350);
  const [bondFilter, setBondFilter] = useState<'all' | 'primary' | 'secondary'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>('create');
  const [form, setForm] = useState<GuardianFormValues>(emptyGuardianForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [quoteForConversion, setQuoteForConversion] = useState<HubQuote | null>(null);
  const [quoteConversionLoading, setQuoteConversionLoading] = useState(false);

  const accessAllowed =
    clinicRole && allowedClinicRoles.includes(clinicRole as (typeof allowedClinicRoles)[number]);

  const kindParam = mainTab === 'tutores' ? 'individual' : 'company';

  const loadStats = useCallback(async () => {
    if (!clinicId) return;
    try {
      const { stats: s } = await hubGuardiansApi.stats(clinicId);
      setStats(s);
    } catch {
      setStats({
        total: 0,
        active_operational: 0,
        new_this_month: 0,
        with_pets: 0,
        pct_active: 0,
        pct_with_pets: 0,
      });
    }
  }, [clinicId]);

  const loadList = useCallback(async () => {
    if (!clinicId || !accessAllowed) return;
    setLoading(true);
    try {
      const { guardians } = await hubGuardiansApi.list(clinicId, true, {
        kind: kindParam,
        status: statusFilter,
        q: debouncedQ || undefined,
      });
      setGuardiansRaw(guardians);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar clientes');
    } finally {
      setLoading(false);
    }
  }, [clinicId, accessAllowed, kindParam, statusFilter, debouncedQ, showError]);

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) {
      redirectAwayFromHub(authRole as AppRole);
    }
  }, [permLoading, accessAllowed, authRole]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    void loadStats();
  }, [clinicId, accessAllowed, loadStats]);

  useEffect(() => {
    if (fromQuoteId) setMainTab('tutores');
  }, [fromQuoteId]);

  useEffect(() => {
    if (!fromQuoteId || !clinicId) {
      setQuoteForConversion(null);
      setQuoteConversionLoading(false);
      return;
    }
    let cancelled = false;
    setQuoteConversionLoading(true);
    void (async () => {
      try {
        const { quote } = await hubQuotesApi.get(fromQuoteId, clinicId);
        if (cancelled) return;
        const prospect = prospectFromQuote(quote);
        if (!prospect) {
          showError('Orçamento sem dados de contacto.');
          setQuoteForConversion(null);
          return;
        }
        setQuoteForConversion(quote);
        setSelectedId(null);
        setPanelMode('create');
        setEditingId(null);
        setForm(quoteProspectToGuardianFormValues(quote, prospect));
      } catch (e: unknown) {
        if (!cancelled) {
          showError((e as Error)?.message || 'Erro ao carregar orçamento');
          setQuoteForConversion(null);
        }
      } finally {
        if (!cancelled) setQuoteConversionLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fromQuoteId, clinicId, showError]);

  const continueToPetsWithExistingGuardian = useCallback(() => {
    if (!fromQuoteId || !linkGuardianId) return;
    clearManualQuoteConversion(fromQuoteId);
    navigate(
      `/hub/pets/novo?fromQuote=${encodeURIComponent(fromQuoteId)}&guardianId=${encodeURIComponent(linkGuardianId)}&petIndex=0`
    );
  }, [fromQuoteId, linkGuardianId, navigate]);

  const quoteConvShort = quoteForConversion?.id.slice(0, 8).toUpperCase() ?? fromQuoteId.slice(0, 8).toUpperCase();


  const selectedGuardian = useMemo(
    () => (selectedId ? guardiansRaw.find((g) => g.id === selectedId) ?? null : null),
    [guardiansRaw, selectedId]
  );

  const filteredRows = useMemo(() => {
    return guardiansRaw.filter((g) => {
      const pets = g.pets ?? [];
      const hasPrimary = pets.some((p) => p.role === 'primary');
      if (bondFilter === 'primary') return hasPrimary;
      if (bondFilter === 'secondary') return pets.length > 0 && !hasPrimary;
      return true;
    });
  }, [guardiansRaw, bondFilter]);

  const openCreate = useCallback(() => {
    setSelectedId(null);
    setPanelMode('create');
    setEditingId(null);
    if (fromQuoteId && quoteForConversion) {
      const prospect = prospectFromQuote(quoteForConversion);
      if (prospect) setForm(quoteProspectToGuardianFormValues(quoteForConversion, prospect));
      else setForm(emptyGuardianForm);
    } else {
      setForm(emptyGuardianForm);
    }
  }, [fromQuoteId, quoteForConversion]);

  const selectGuardian = useCallback((g: HubGuardian) => {
    setSelectedId(g.id);
    setPanelMode('detail');
    setEditingId(null);
  }, []);

  const closePanelDetail = useCallback(() => {
    setSelectedId(null);
    setPanelMode('create');
    setEditingId(null);
    setForm(emptyGuardianForm);
  }, []);

  const startEditFromDetail = useCallback(() => {
    if (!selectedGuardian) return;
    setPanelMode('edit');
    setEditingId(selectedGuardian.id);
    setForm(guardianToFormValues(selectedGuardian));
  }, [selectedGuardian]);

  const cancelEdit = useCallback(() => {
    if (selectedGuardian) {
      setPanelMode('detail');
      setEditingId(null);
    } else {
      openCreate();
    }
  }, [selectedGuardian, openCreate]);

  const openInNewPage = useCallback(() => {
    if (!selectedGuardian) return;
    const path = `/hub/clientes/${selectedGuardian.id}`;
    const url = `${window.location.origin}${path}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [selectedGuardian]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicId || !canWrite) return;
    if (!form.full_name.trim()) {
      showError('Nome é obrigatório');
      return;
    }
    if (!form.phone.trim()) {
      showError('Telefone é obrigatório');
      return;
    }
    if (!form.tax_id.trim()) {
      showError('CPF/CNPJ é obrigatório');
      return;
    }
    setSubmitting(true);
    try {
      if (editingId) {
        await hubGuardiansApi.update(editingId, formValuesToUpdatePayload(form, clinicId));
        showSuccess('Cliente atualizado');
        setPanelMode('detail');
        setEditingId(null);
      } else {
        const { guardian } = await hubGuardiansApi.create(formValuesToCreatePayload(form, clinicId));
        if (fromQuoteId && !linkGuardianId) {
          clearManualQuoteConversion(fromQuoteId);
          navigate(
            `/hub/pets/novo?fromQuote=${encodeURIComponent(fromQuoteId)}&guardianId=${encodeURIComponent(guardian.id)}&petIndex=0`
          );
          return;
        }
        showSuccess('Cliente criado');
        setSelectedId(guardian.id);
        setPanelMode('detail');
        setEditingId(null);
        setForm(emptyGuardianForm);
      }
      await loadList();
      await loadStats();
    } catch (err: unknown) {
      showError((err as Error)?.message || 'Erro ao salvar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = (g: HubGuardian) => {
    if (!clinicId || !canWrite) return;
    showConfirm(`Arquivar o cliente "${g.full_name}"?`, () => {
      void (async () => {
        try {
          await hubGuardiansApi.update(g.id, { clinic_id: clinicId, archived: true });
          showSuccess('Cliente arquivado');
          if (selectedId === g.id) closePanelDetail();
          await loadList();
          await loadStats();
        } catch (err: unknown) {
          showError((err as Error)?.message || 'Erro ao arquivar');
        }
      })();
    }, 'Arquivar');
  };

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!permLoading && !clinicId) {
    return (
      <div className="hub-clientes" style={{ padding: 24 }}>
        <p className="hub-clientes__muted">
          Selecione ou aceda a uma clínica para gerir clientes (PetMi Hub). Inicie sessão no PetMi Vet e escolha uma
          clínica, depois volte ao Hub.
        </p>
      </div>
    );
  }

  if (permLoading || !accessAllowed) {
    return (
      <div className="hub-clientes" style={{ padding: 24 }}>
        Carregando…
      </div>
    );
  }

  return (
    <div className="hub-clientes">
      <div className="hub-clientes__main">
        <div className="hub-clientes__tabs">
          <button
            type="button"
            className={`hub-clientes__tab ${mainTab === 'tutores' ? 'hub-clientes__tab--active' : ''}`}
            onClick={() => {
              setMainTab('tutores');
              closePanelDetail();
            }}
          >
            Tutores
          </button>
          <button
            type="button"
            className={`hub-clientes__tab ${mainTab === 'empresas' ? 'hub-clientes__tab--active' : ''}`}
            onClick={() => {
              setMainTab('empresas');
              closePanelDetail();
            }}
          >
            Empresas
          </button>
        </div>

        <ClientesMetricsRow stats={stats} loading={loading && !stats} />

        <ClientesToolbar
          searchQ={searchQ}
          onSearchChange={setSearchQ}
          bondFilter={bondFilter}
          onBondFilterChange={setBondFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          onNewTutor={openCreate}
        />

        {loading ? (
          <p className="hub-clientes__muted">Carregando lista…</p>
        ) : (
          <ClientesTable
            rows={filteredRows}
            selectedId={selectedId}
            onSelect={selectGuardian}
            onArchive={handleArchive}
            canWrite={canWrite}
          />
        )}
      </div>

      <aside className="hub-clientes__panel">
        <div className="hub-clientes__panel-scroll">
          {panelMode === 'detail' && selectedGuardian ? (
            <GuardianDetailPanel
              guardian={selectedGuardian}
              pets={selectedGuardian.pets ?? []}
              onClose={closePanelDetail}
              onStartEdit={startEditFromDetail}
              onOpenInNewPage={openInNewPage}
              onArchive={canWrite ? () => handleArchive(selectedGuardian) : undefined}
            />
          ) : panelMode === 'edit' && selectedGuardian ? (
            <>
              <div className="hub-clientes__panel-header">
                <h2 className="hub-clientes__form-title" style={{ margin: 0 }}>
                  Editar cliente
                </h2>
                <button type="button" className="hub-clientes__panel-close" aria-label="Cancelar edição" onClick={cancelEdit}>
                  ×
                </button>
              </div>
              <GuardianCreateForm
                value={form}
                onChange={setForm}
                onSubmit={handleSubmit}
                submitting={submitting}
                canWrite={canWrite}
                title=""
              />
            </>
          ) : linkGuardianId && fromQuoteId ? (
            <>
              {fromQuoteId ? (
                <div className="hub-clientes__draft-banner" style={{ marginBottom: 12 }} role="status">
                  <p style={{ margin: 0 }}>
                    {quoteConversionLoading ? (
                      'A carregar orçamento…'
                    ) : (
                      <>
                        A concluir conversão do orçamento #{quoteConvShort}.{' '}
                        <strong>Será usado o tutor existente</strong> — confira os dados do contacto do orçamento e
                        continue para cadastrar os pets.
                      </>
                    )}
                  </p>
                </div>
              ) : null}
              <div className="hub-clientes__panel-header">
                <h2 className="hub-clientes__form-title" style={{ margin: 0 }}>
                  Rever contacto do orçamento
                </h2>
              </div>
              <dl className="hub-clientes__muted" style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
                <div>
                  <dt style={{ fontWeight: 600, color: 'var(--hub-text, #333)' }}>Nome</dt>
                  <dd style={{ margin: 0 }}>{form.full_name || '—'}</dd>
                </div>
                <div>
                  <dt style={{ fontWeight: 600, color: 'var(--hub-text, #333)' }}>Telefone</dt>
                  <dd style={{ margin: 0 }}>{form.phone || '—'}</dd>
                </div>
                <div>
                  <dt style={{ fontWeight: 600, color: 'var(--hub-text, #333)' }}>CPF / CNPJ</dt>
                  <dd style={{ margin: 0 }}>{form.tax_id?.trim() || '—'}</dd>
                </div>
                <div>
                  <dt style={{ fontWeight: 600, color: 'var(--hub-text, #333)' }}>E-mail</dt>
                  <dd style={{ margin: 0 }}>{form.email?.trim() || '—'}</dd>
                </div>
              </dl>
              {!form.tax_id?.trim() ? (
                <p className="hub-clientes__muted" style={{ marginBottom: 12 }}>
                  É obrigatório um CPF/CNPJ no contacto do orçamento para continuar. Atualize o orçamento ou o prospecto
                  e volte a abrir esta conversão.
                </p>
              ) : null}
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary"
                disabled={quoteConversionLoading || !form.tax_id?.trim()}
                onClick={() => continueToPetsWithExistingGuardian()}
              >
                Continuar para pets
              </button>
            </>
          ) : (
            <>
              {fromQuoteId ? (
                <div className="hub-clientes__draft-banner" style={{ marginBottom: 12 }} role="status">
                  <p style={{ margin: 0 }}>
                    {quoteConversionLoading ? (
                      'A carregar orçamento…'
                    ) : (
                      <>
                        A concluir conversão do orçamento #{quoteConvShort}. Confirme ou ajuste os dados do tutor e
                        salve para seguir ao cadastro dos pets.
                      </>
                    )}
                  </p>
                </div>
              ) : null}
              <GuardianCreateForm
                value={form}
                onChange={setForm}
                onSubmit={handleSubmit}
                submitting={submitting}
                canWrite={canWrite}
                title="Cadastrar novo cliente"
              />
            </>
          )}
        </div>
      </aside>
    </div>
  );
};

export default HubGuardiansPage;
