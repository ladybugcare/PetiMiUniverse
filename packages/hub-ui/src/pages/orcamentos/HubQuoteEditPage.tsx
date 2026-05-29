import React, { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  useAuth,
  getStoredClinicId,
  usePermissions,
  type AppRole,
} from '@petimi/web-core';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import { useAlert } from '../../components/AlertProvider';
import { HubCancelButton } from '../../components/HubCancelButton';
import { hubQuotesApi, type HubQuote } from '../../api/hubQuotesApi';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
import HubQuoteWorkspace from './HubQuoteWorkspace';
import '../clientes/clientes.css';
import './orcamentos-page.css';

const allowedClinicRoles = ['CADMIN', 'CMANAGER', 'CASSISTANT'] as const;

/**
 * Edição do conteúdo do orçamento (rascunho). A vista de leitura fica em `/hub/orcamentos/:id`.
 */
const HubQuoteEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showError } = useAlert();
  const { user, role: authRole } = useAuth();
  const { role: clinicRole, loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const canWrite = hasPermission('hub.quotes.write');

  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<HubQuote | null>(null);
  const [serviceTypes, setServiceTypes] = useState<HubServiceType[]>([]);

  const accessAllowed =
    clinicRole && allowedClinicRoles.includes(clinicRole as (typeof allowedClinicRoles)[number]);

  const load = useCallback(async () => {
    if (!clinicId || !id) return;
    setLoading(true);
    try {
      const [{ quote: q }, stRes] = await Promise.all([
        hubQuotesApi.get(id, clinicId),
        hubServiceTypesApi.list(clinicId).catch(() => ({ service_types: [] as HubServiceType[] })),
      ]);
      setQuote(q);
      setServiceTypes(stRes.service_types || []);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar');
      setQuote(null);
    } finally {
      setLoading(false);
    }
  }, [clinicId, id, showError]);

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) redirectAwayFromHub(authRole as AppRole);
  }, [permLoading, accessAllowed, authRole]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user) return <Navigate to="/login" replace />;
  if (!permLoading && !clinicId) {
    return (
      <div style={{ padding: 24 }}>
        <p className="hub-clientes__muted">Selecione uma clínica.</p>
      </div>
    );
  }
  if (permLoading || !accessAllowed) return <div style={{ padding: 24 }}>Carregando…</div>;
  if (!canWrite) {
    return (
      <div style={{ padding: 24 }}>
        <p className="hub-clientes__muted">Sem permissão para editar orçamentos.</p>
        <Link to={id ? `/hub/orcamentos/${id}` : '/hub/orcamentos'} className="hub-clientes__link-btn">
          Voltar
        </Link>
      </div>
    );
  }
  if (!id) return <Navigate to="/hub/orcamentos" replace />;

  if (!loading && !quote) {
    return (
      <div style={{ padding: 24 }}>
        <p>Orçamento não encontrado.</p>
        <Link to="/hub/orcamentos">Voltar</Link>
      </div>
    );
  }

  if (loading || !quote) return <div style={{ padding: 24 }}>Carregando…</div>;

  if (quote.status !== 'draft') {
    return <Navigate to={`/hub/orcamentos/${quote.id}`} replace />;
  }

  return (
    <div className="hub-orcamento-novo">
      <header className="hub-orcamento-novo__topbar">
        <div>
          <p style={{ margin: 0 }}>
            <Link to={`/hub/orcamentos/${id}`} className="hub-clientes__link-btn">
              ← Vista do orçamento
            </Link>
          </p>
          <h1 className="hub-orcamento-novo__topbar-title" style={{ marginTop: 8 }}>
            Editar orçamento
          </h1>
          <p className="hub-orcamento-novo__topbar-subtitle">Rascunho — altere pets, serviços e valores; depois envie ao cliente.</p>
        </div>
        <div className="hub-orcamento-novo__topbar-actions">
          <HubCancelButton onClick={() => navigate(`/hub/orcamentos/${id}`)}>Fechar editor</HubCancelButton>
        </div>
      </header>

      <HubQuoteWorkspace
        clinicId={clinicId!}
        canWrite={canWrite}
        quote={quote}
        persistedQuoteId={quote.id}
        onPersistedQuoteId={() => {}}
        onQuoteUpdated={(q) => setQuote(q)}
        serviceTypes={serviceTypes}
        createContext={null}
        hideGenerateAndSend={false}
      />
    </div>
  );
};

export default HubQuoteEditPage;
