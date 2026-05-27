import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  useAuth,
  getStoredClinicId,
  usePermissions,
  type AppRole,
} from '@petimi/web-core';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import { useAlert } from '../../components/AlertProvider';
import { hubProspectsApi } from '../../api/hubProspectsApi';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
import HubQuoteWorkspace, { type HubQuoteCreateContext } from './HubQuoteWorkspace';
import type { HubQuote } from '../../api/hubQuotesApi';
import '../clientes/clientes.css';
import './orcamentos-page.css';

const allowedClinicRoles = ['CADMIN', 'CMANAGER', 'CASSISTANT'] as const;

const HubQuoteNewPage: React.FC = () => {
  const { showError } = useAlert();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prospectIdParam = searchParams.get('prospect_id')?.trim() || '';

  const { user, role: authRole } = useAuth();
  const { role: clinicRole, loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const canWrite = hasPermission('hub.quotes.write');

  const [loadingProspect, setLoadingProspect] = useState(!!prospectIdParam);
  const [prospectLabel, setProspectLabel] = useState<string | null>(null);
  const [resolvedProspectId, setResolvedProspectId] = useState<string | null>(prospectIdParam || null);

  const [inline, setInline] = useState({
    full_name: '',
    tax_id: '',
    phone: '',
    email: '',
  });
  const [draftQuoteId, setDraftQuoteId] = useState<string | null>(null);
  const [lastQuote, setLastQuote] = useState<HubQuote | null>(null);
  const [serviceTypes, setServiceTypes] = useState<HubServiceType[]>([]);

  const accessAllowed =
    clinicRole && allowedClinicRoles.includes(clinicRole as (typeof allowedClinicRoles)[number]);

  const loadProspect = useCallback(async () => {
    if (!clinicId || !prospectIdParam) {
      setLoadingProspect(false);
      return;
    }
    setLoadingProspect(true);
    try {
      const { prospect } = await hubProspectsApi.get(prospectIdParam, clinicId);
      setResolvedProspectId(prospect.id);
      setProspectLabel(`${prospect.full_name} · ${prospect.phone}`);
    } catch {
      setProspectLabel(null);
      setResolvedProspectId(null);
      showError('Contato não encontrado.');
    } finally {
      setLoadingProspect(false);
    }
  }, [clinicId, prospectIdParam, showError]);

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) redirectAwayFromHub(authRole as AppRole);
  }, [permLoading, accessAllowed, authRole]);

  useEffect(() => {
    void loadProspect();
  }, [loadProspect]);

  useEffect(() => {
    if (!clinicId || !canWrite) return;
    void hubServiceTypesApi
      .list(clinicId)
      .then((r) => setServiceTypes(r.service_types ?? []))
      .catch(() => setServiceTypes([]));
  }, [clinicId, canWrite]);

  const createContext: HubQuoteCreateContext | null = useMemo(() => {
    if (resolvedProspectId) return { kind: 'prospect_id', prospect_id: resolvedProspectId };
    if (!prospectIdParam) {
      const fn = inline.full_name.trim();
      const ph = inline.phone.trim();
      const taxDigits = inline.tax_id.replace(/\D/g, '');
      if (!fn || !ph || (taxDigits.length !== 11 && taxDigits.length !== 14)) return null;
      return {
        kind: 'inline_prospect',
        prospect: {
          full_name: fn,
          tax_id: inline.tax_id.trim(),
          phone: ph,
          email: inline.email.trim() || null,
        },
      };
    }
    return null;
  }, [resolvedProspectId, prospectIdParam, inline]);

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
        <p className="hub-clientes__muted">Sem permissão para criar orçamentos.</p>
      </div>
    );
  }

  const contactReady = !!(resolvedProspectId || createContext);

  return (
    <div className="hub-orcamento-novo">
      <header className="hub-orcamento-novo__topbar">
        <div>
          <h1 className="hub-orcamento-novo__topbar-title">Novo orçamento</h1>
          <p className="hub-orcamento-novo__topbar-subtitle">
            {prospectIdParam
              ? 'Contato pré-selecionado. Os dados abaixo ficam só neste orçamento até converter.'
              : 'Sem cadastro de cliente definitivo até aprovação e conversão.'}
          </p>
        </div>
        <div className="hub-orcamento-novo__topbar-actions">
          <button type="button" className="hub-orcamento-novo__btn hub-orcamento-novo__btn--ghost" onClick={() => navigate('/hub/orcamentos')}>
            Cancelar
          </button>
          <button
            type="button"
            className="hub-orcamento-novo__btn hub-orcamento-novo__btn--icon hub-orcamento-novo__btn--ghost"
            aria-label="Fechar"
            onClick={() => navigate('/hub/orcamentos')}
          >
            ×
          </button>
        </div>
      </header>

      {loadingProspect ? (
        <p className="hub-clientes__muted">Carregando contato…</p>
      ) : (
        <>
          <section className="hub-orcamento-novo__card" style={{ marginBottom: 16 }}>
            <div className="hub-orcamento-novo__card-header">
              <div>
                <h2 className="hub-orcamento-novo__card-title">1. Dados do contato</h2>
                <p className="hub-orcamento-novo__card-subtitle">Vinculados apenas a este orçamento (prospect).</p>
              </div>
            </div>
            {resolvedProspectId && prospectLabel ? (
              <p style={{ margin: 0, color: '#4a3b3a' }}>
                <strong>Contato:</strong> {prospectLabel}
              </p>
            ) : !prospectIdParam ? (
              <div className="hub-orcamento-novo__field-grid">
                <div className="hub-orcamento-novo__field">
                  <label className="hub-orcamento-novo__label">Nome *</label>
                  <input
                    className="hub-orcamento-novo__input"
                    value={inline.full_name}
                    onChange={(e) => setInline((s) => ({ ...s, full_name: e.target.value }))}
                  />
                </div>
                <div className="hub-orcamento-novo__field">
                  <label className="hub-orcamento-novo__label">Telefone *</label>
                  <input
                    className="hub-orcamento-novo__input"
                    value={inline.phone}
                    onChange={(e) => setInline((s) => ({ ...s, phone: e.target.value }))}
                  />
                </div>
                <div className="hub-orcamento-novo__field">
                  <label className="hub-orcamento-novo__label">CPF / CNPJ *</label>
                  <input
                    className="hub-orcamento-novo__input"
                    value={inline.tax_id}
                    onChange={(e) => setInline((s) => ({ ...s, tax_id: e.target.value }))}
                  />
                </div>
                <div className="hub-orcamento-novo__field">
                  <label className="hub-orcamento-novo__label">E-mail</label>
                  <input
                    className="hub-orcamento-novo__input"
                    value={inline.email}
                    onChange={(e) => setInline((s) => ({ ...s, email: e.target.value }))}
                  />
                </div>
              </div>
            ) : (
              <p className="hub-clientes__muted">Contato inválido. Volte aos contatos.</p>
            )}
          </section>

          {contactReady ? (
            <HubQuoteWorkspace
              clinicId={clinicId!}
              canWrite={canWrite}
              quote={lastQuote}
              persistedQuoteId={draftQuoteId}
              onPersistedQuoteId={setDraftQuoteId}
              onQuoteUpdated={setLastQuote}
              serviceTypes={serviceTypes}
              createContext={createContext}
            />
          ) : (
            <p className="hub-orcamento-novo__help">
              Preencha nome, telefone e CPF (11 dígitos) ou CNPJ (14 dígitos) do contato para habilitar pets e serviços.
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default HubQuoteNewPage;
