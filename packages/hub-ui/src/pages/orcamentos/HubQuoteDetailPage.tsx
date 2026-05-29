import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  useAuth,
  getStoredClinicId,
  usePermissions,
  type AppRole,
} from '@petimi/web-core';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import { useAlert } from '../../components/AlertProvider';
import { hubFinancialApi } from '../../api/hubFinancialApi';
import { hubQuotesApi, openHubQuotePdf, type HubQuote } from '../../api/hubQuotesApi';
import { hubGuardiansApi, type HubGuardian } from '../../api/hubGuardiansApi';
import HubQuoteDetailLayout from './HubQuoteDetailLayout';
import '../clientes/clientes.css';
import './orcamentos-page.css';

const allowedClinicRoles = ['CADMIN', 'CMANAGER', 'CASSISTANT'] as const;

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? x[0] ?? null : x;
}

function normTax(s: string): string {
  return s.replace(/\D/g, '');
}

function viewerName(user: unknown): string {
  const u = user as { email?: string; user_metadata?: { full_name?: string; name?: string } } | null;
  if (!u) return '—';
  return (u.user_metadata?.full_name || u.user_metadata?.name || u.email || 'Utilizador').trim();
}

const HubQuoteDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showError, showSuccess, showConfirm } = useAlert();
  const { user, role: authRole } = useAuth();
  const { role: clinicRole, loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const canWrite = hasPermission('hub.quotes.write');
  const canCreateReceivable = hasPermission('hub.receivables.create');

  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<HubQuote | null>(null);
  const [saving, setSaving] = useState(false);
  const [dupGuardians, setDupGuardians] = useState<HubGuardian[]>([]);

  const accessAllowed =
    clinicRole && allowedClinicRoles.includes(clinicRole as (typeof allowedClinicRoles)[number]);

  const load = useCallback(async () => {
    if (!clinicId || !id) return;
    setLoading(true);
    try {
      const { quote: q } = await hubQuotesApi.get(id, clinicId);
      setQuote(q);
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

  const prospect = useMemo(() => embedOne(quote?.prospect), [quote]);

  const isDraft = quote?.status === 'draft';
  const canConvert = Boolean(quote && (quote.status === 'sent' || quote.status === 'awaiting_return'));
  const canReopenForEdit = Boolean(
    quote &&
      canWrite &&
      (quote.status === 'sent' ||
        quote.status === 'awaiting_return' ||
        quote.status === 'expired' ||
        quote.status === 'cancelled'),
  );

  const loadDupGuardians = async () => {
    if (!clinicId || !prospect?.tax_id) return;
    try {
      const { guardians } = await hubGuardiansApi.list(clinicId, true, {
        kind: 'individual',
        status: 'active',
        q: prospect.tax_id,
      });
      const n = normTax(prospect.tax_id);
      const filtered = (guardians || []).filter((g) => g.tax_id && normTax(g.tax_id) === n);
      setDupGuardians(filtered);
    } catch {
      setDupGuardians([]);
    }
  };

  const handleConvert = async (linkId?: string) => {
    if (!clinicId || !id) return;
    setSaving(true);
    try {
      await hubQuotesApi.convert(id, {
        clinic_id: clinicId,
        link_to_guardian_id: linkId,
      });
      showSuccess('Convertido em cliente (tutor + pets)');
      await load();
      setDupGuardians([]);
    } catch (e: unknown) {
      const msg = (e as Error)?.message || '';
      showError(msg);
      if (msg.includes('Já existe tutor')) {
        await loadDupGuardians();
      }
    } finally {
      setSaving(false);
    }
  };

  const copyPublicLink = async () => {
    if (!clinicId || !id || !quote) return;
    setSaving(true);
    try {
      const { public_token } = await hubQuotesApi.ensurePublicToken(id, clinicId);
      const url = hubQuotesApi.publicLink(public_token);
      await navigator.clipboard.writeText(url);
      showSuccess('Link público copiado');
      setQuote((q) => (q ? { ...q, public_token } : q));
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao gerar link');
    } finally {
      setSaving(false);
    }
  };

  const openPdf = async () => {
    if (!clinicId || !id) return;
    try {
      await openHubQuotePdf(id, clinicId);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao abrir PDF');
    }
  };

  const generateReceivableFromQuote = async () => {
    if (!clinicId || !id || !quote) return;
    const brl = Number(quote.total_amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: quote.currency || 'BRL' });
    showConfirm(`Gerar cobrança de ${brl} a partir deste orçamento?`, async () => {
      setSaving(true);
      try {
        await hubFinancialApi.createReceivable({
          clinic_id: clinicId,
          source_type: 'quote',
          source_id: id,
        });
        showSuccess('Cobrança criada.');
        await load();
      } catch (e: unknown) {
        showError((e as Error)?.message || 'Erro ao gerar cobrança');
      } finally {
        setSaving(false);
      }
    });
  };

  if (!user) return <Navigate to="/login" replace />;
  if (!permLoading && !clinicId) {
    return (
      <div style={{ padding: 24 }}>
        <p className="hub-clientes__muted">Selecione uma clínica.</p>
      </div>
    );
  }
  if (permLoading || !accessAllowed) return <div style={{ padding: 24 }}>Carregando…</div>;
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

  return (
    <HubQuoteDetailLayout
      quote={quote}
      quoteId={id}
      viewerLabel={viewerName(user)}
      canWrite={canWrite}
      saving={saving}
      isDraft={Boolean(isDraft)}
      canReopenForEdit={canReopenForEdit}
      canConvert={canConvert}
      dupGuardians={dupGuardians}
      onSend={() => {
        showConfirm('Enviar este orçamento ao cliente?', async () => {
          if (!clinicId) return;
          try {
            await hubQuotesApi.send(id, clinicId);
            navigate(`/hub/orcamentos/${id}/pronto-para-envio`);
          } catch (e: unknown) {
            showError((e as Error)?.message || 'Erro');
          }
        });
      }}
      onAwaitingReturn={async () => {
        if (!clinicId) return;
        try {
          await hubQuotesApi.awaitingReturn(id, clinicId);
          showSuccess('Marcado como aguardando retorno');
          await load();
        } catch (e: unknown) {
          showError((e as Error)?.message || 'Erro');
        }
      }}
      onReopenDraft={() => {
        showConfirm(
          'Reabrir para edição? O orçamento volta a Rascunho: data de envio, validade e o link público atual serão removidos. Depois de alterar, envie novamente ao cliente.',
          async () => {
            if (!clinicId) return;
            setSaving(true);
            try {
              const { quote: q } = await hubQuotesApi.reopenDraft(id, clinicId);
              setQuote(q);
              showSuccess('Orçamento reaberto como rascunho — já pode editar.');
            } catch (e: unknown) {
              showError((e as Error)?.message || 'Erro ao reabrir');
            } finally {
              setSaving(false);
            }
          },
        );
      }}
      onDuplicate={async () => {
        if (!clinicId) return;
        try {
          const { quote: q } = await hubQuotesApi.duplicate(id, clinicId);
          showSuccess('Orçamento duplicado');
          navigate(`/hub/orcamentos/${q.id}`);
        } catch (e: unknown) {
          showError((e as Error)?.message || 'Erro');
        }
      }}
      onCancel={() => {
        showConfirm('Cancelar este orçamento?', async () => {
          if (!clinicId) return;
          try {
            await hubQuotesApi.cancel(id, clinicId);
            showSuccess('Cancelado');
            await load();
          } catch (e: unknown) {
            showError((e as Error)?.message || 'Erro');
          }
        });
      }}
      onDeleteDraft={() => {
        showConfirm('Apagar este rascunho?', async () => {
          if (!clinicId) return;
          try {
            await hubQuotesApi.remove(id, clinicId);
            showSuccess('Removido');
            navigate('/hub/orcamentos');
          } catch (e: unknown) {
            showError((e as Error)?.message || 'Erro');
          }
        });
      }}
      onOpenPdf={() => void openPdf()}
      onCopyPublic={() => void copyPublicLink()}
      onGuidedConvert={(linkId) => {
        const sp = new URLSearchParams();
        sp.set('fromQuote', id);
        if (linkId) sp.set('linkGuardianId', linkId);
        navigate(`/hub/clientes?${sp.toString()}`);
      }}
      onQuickConvert={
        canWrite
          ? () =>
              showConfirm(
                'A conversão rápida cria o tutor e todos os pets do orçamento de uma vez, sem passar pelo assistente de cadastro. Deseja continuar?',
                () => {
                  void handleConvert();
                },
              )
          : undefined
      }
      onGenerateReceivable={
        canWrite &&
        canCreateReceivable &&
        quote.status === 'accepted' &&
        quote.billing_state === 'awaiting_billing'
          ? () => void generateReceivableFromQuote()
          : undefined
      }
    />
  );
};

export default HubQuoteDetailPage;
