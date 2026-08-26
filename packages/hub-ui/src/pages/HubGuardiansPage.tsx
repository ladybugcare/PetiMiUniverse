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
import { HubTabs } from '../components/HubTabs';
import { HubLoading } from '../components/HubLoading';
import { hubGuardiansApi, type HubGuardian, type HubGuardianStats } from '../api/hubGuardiansApi';
import './clientes/clientes.css';
import './clientes/clientes-drawer.css';
import './clientes/clientes-page.css';
import { ClientesMetricsRow } from './clientes/ClientesMetricsRow';
import { ClientesToolbar } from './clientes/ClientesToolbar';
import { ClientesTable } from './clientes/ClientesTable';
import { ClientesPagination } from './clientes/ClientesPagination';
import {
  emptyGuardianForm,
  guardianToFormValues,
  type GuardianFormValues,
} from './clientes/GuardianCreateForm';
import GuardianDrawer from './clientes/GuardianDrawer';
import { formValuesToCreatePayload, formValuesToUpdatePayload } from './clientes/guardianFormPayload';
import { hubQuotesApi, type HubQuote } from '../api/hubQuotesApi';
import { quoteProspectToGuardianFormValues, prospectFromQuote } from './orcamentos/quoteToGuardianForm';
import { clearManualQuoteConversion } from './orcamentos/quoteManualConversionStorage';

type MainTab = 'tutores' | 'empresas';
type PanelMode = 'create' | 'detail' | 'edit' | 'quote_review';

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
  const { loading: permLoading, hasPermission } = usePermissions();
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
  const [careLocationFilter, setCareLocationFilter] = useState<'all' | 'own_unit' | 'partner_clinic'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>('create');
  const [form, setForm] = useState<GuardianFormValues>(emptyGuardianForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [quoteForConversion, setQuoteForConversion] = useState<HubQuote | null>(null);
  const [quoteConversionLoading, setQuoteConversionLoading] = useState(false);

  const accessAllowed = hasPermission('hub.guardians.read');

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
        careLocationKind: careLocationFilter === 'all' ? undefined : careLocationFilter,
      });
      setGuardiansRaw(guardians);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar clientes');
    } finally {
      setLoading(false);
    }
  }, [clinicId, accessAllowed, kindParam, statusFilter, careLocationFilter, debouncedQ, showError]);

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
    if (!clinicId || !accessAllowed) return;
    void loadList();
  }, [clinicId, accessAllowed, loadList]);

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
        setPanelMode(linkGuardianId ? 'quote_review' : 'create');
        setEditingId(null);
        setForm(quoteProspectToGuardianFormValues(quote, prospect));
        setDrawerOpen(true);
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

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, bondFilter, statusFilter, careLocationFilter, mainTab, kindParam]);

  const totalFiltered = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const openCreate = useCallback(() => {
    setSelectedId(null);
    setPanelMode('create');
    setEditingId(null);
    setDrawerOpen(true);
    const defaultKind = mainTab === 'empresas' ? 'company' : 'individual';
    if (fromQuoteId && quoteForConversion) {
      const prospect = prospectFromQuote(quoteForConversion);
      if (prospect) {
        setForm({ ...quoteProspectToGuardianFormValues(quoteForConversion, prospect), client_kind: defaultKind });
      } else {
        setForm({ ...emptyGuardianForm, client_kind: defaultKind });
      }
    } else {
      setForm({ ...emptyGuardianForm, client_kind: defaultKind });
    }
  }, [fromQuoteId, quoteForConversion, mainTab]);

  const selectGuardian = useCallback((g: HubGuardian) => {
    setSelectedId(g.id);
    setPanelMode('detail');
    setEditingId(null);
    setDrawerOpen(true);
  }, []);

  const closePanelDetail = useCallback(() => {
    setDrawerOpen(false);
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

  const startEditFromTable = useCallback((g: HubGuardian) => {
    setSelectedId(g.id);
    setPanelMode('edit');
    setEditingId(g.id);
    setForm(guardianToFormValues(g));
    setDrawerOpen(true);
  }, []);

  const cancelEdit = useCallback(() => {
    if (selectedGuardian) {
      setPanelMode('detail');
      setEditingId(null);
    } else {
      closePanelDetail();
    }
  }, [selectedGuardian, closePanelDetail]);

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
        <HubLoading variant="block" />
      </div>
    );
  }

  const drawerMode: 'create' | 'edit' | 'detail' | 'quote_review' =
    linkGuardianId && fromQuoteId && (panelMode === 'create' || panelMode === 'quote_review')
      ? 'quote_review'
      : panelMode;

  return (
    <div className="hub-clientes hub-clientes-page hub-clientes-page--full-width">
      <div className="hub-clientes__main">
        <HubTabs
          ariaLabel="Clientes"
          items={[
            { id: 'tutores', label: 'Tutores' },
            { id: 'empresas', label: 'Empresas' },
          ]}
          activeId={mainTab}
          onTabChange={(id) => {
            setMainTab(id as 'tutores' | 'empresas');
            closePanelDetail();
            setBondFilter('all');
          }}
        />

        <ClientesMetricsRow mainTab={mainTab} stats={stats} loading={loading && !stats} />

        <ClientesToolbar
          mainTab={mainTab}
          searchQ={searchQ}
          onSearchChange={setSearchQ}
          bondFilter={bondFilter}
          onBondFilterChange={setBondFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          careLocationFilter={careLocationFilter}
          onCareLocationFilterChange={setCareLocationFilter}
          onNewClient={openCreate}
        />

        {loading ? (
          <HubLoading variant="block" label="Carregando lista…" />
        ) : (
          <>
            <ClientesTable
              mainTab={mainTab}
              rows={paginatedRows}
              selectedId={selectedId}
              onSelect={selectGuardian}
              onEdit={startEditFromTable}
              onArchive={handleArchive}
              canWrite={canWrite}
            />
            <ClientesPagination
              page={page}
              pageSize={pageSize}
              total={totalFiltered}
              entityLabel={mainTab === 'empresas' ? 'empresas' : 'tutores'}
              onPageChange={setPage}
              onPageSizeChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
            />
          </>
        )}
      </div>

      <GuardianDrawer
        open={drawerOpen}
        onClose={closePanelDetail}
        onCancelEdit={cancelEdit}
        mode={drawerMode}
        canWrite={canWrite}
        form={form}
        onFormChange={setForm}
        onSubmit={handleSubmit}
        submitting={submitting}
        guardian={selectedGuardian}
        onStartEdit={startEditFromDetail}
        onOpenInNewPage={openInNewPage}
        onArchive={canWrite && selectedGuardian ? () => handleArchive(selectedGuardian) : undefined}
        fromQuoteId={fromQuoteId || undefined}
        quoteConversionLoading={quoteConversionLoading}
        quoteConvShort={quoteConvShort}
        linkGuardianId={linkGuardianId || undefined}
        onContinueToPets={continueToPetsWithExistingGuardian}
      />
    </div>
  );
};

export default HubGuardiansPage;
