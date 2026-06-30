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
import { HubLoading } from '../../components/HubLoading';
import { ComandaCheckoutDrawer } from '../finance/ComandaCheckoutDrawer';
import { getSelectedUnitId } from '../../utils/useSelectedUnitId';
import { hubQuotesApi, openHubQuotePdf, type HubQuote } from '../../api/hubQuotesApi';
import { hubGuardiansApi, type HubGuardian } from '../../api/hubGuardiansApi';
import HubQuoteDetailLayout from './HubQuoteDetailLayout';
import {
  buildWhatsAppMessageLinkVariant,
  formatQuoteValidUntil,
  prospectFirstName,
  waMeUrlWithText,
} from './hubQuoteShareUtils';
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
  const [checkoutOpen, setCheckoutOpen] = useState(false);
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

  const openPublicQuoteInNewTab = async () => {
    if (!clinicId || !id || !quote) return;
    setSaving(true);
    try {
      const { public_token } = await hubQuotesApi.ensurePublicToken(id, clinicId);
      const url = hubQuotesApi.publicLink(public_token);
      setQuote((q) => (q ? { ...q, public_token } : q));
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao abrir link público');
    } finally {
      setSaving(false);
    }
  };

  const shareWhatsAppWithMessage = async () => {
    if (!clinicId || !id || !quote) return;
    setSaving(true);
    try {
      const { public_token } = await hubQuotesApi.ensurePublicToken(id, clinicId);
      const publicUrl = hubQuotesApi.publicLink(public_token);
      setQuote((q) => (q ? { ...q, public_token } : q));
      const pr = embedOne(quote.prospect);
      const firstName = prospectFirstName(pr?.full_name);
      const validUntil = formatQuoteValidUntil(quote.expires_at);
      const msg = buildWhatsAppMessageLinkVariant(firstName, publicUrl, validUntil);
      const waUrl = waMeUrlWithText(pr?.phone, msg);
      if (!waUrl) {
        showError('Cadastre um telefone válido no contato do orçamento.');
        return;
      }
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao preparar WhatsApp');
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

  const openQuoteCheckout = () => {
    if (!quote) return;
    const uid = quote.unit_id || getSelectedUnitId();
    if (!uid) {
      showError('Defina a unidade do orçamento ou selecione uma unidade no cabeçalho para abrir o checkout.');
      return;
    }
    setCheckoutOpen(true);
  };

  const openReceivableFromQuote = () => {
    if (!id) return;
    navigate(`/hub/financeiro?source_type=quote&source_id=${encodeURIComponent(id)}`);
  };

  const openAgendaFromQuote = () => {
    if (!id) return;
    const sp = new URLSearchParams({ fromQuote: id, openCreate: '1' });
    navigate(`/hub/appointments?${sp.toString()}`);
  };

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
        <HubLoading variant="block" />
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

  if (loading || !quote) {
    return (
      <div style={{ padding: 24 }}>
        <HubLoading variant="block" label="Carregando orçamento…" />
      </div>
    );
  }

  return (
    <>
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
      onShareOpenPublic={() => void openPublicQuoteInNewTab()}
      onShareWhatsAppWithMessage={() => void shareWhatsAppWithMessage()}
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
      onOpenCheckout={
        canWrite &&
        canCreateReceivable &&
        quote.status === 'accepted' &&
        quote.billing_state !== 'receivable_created' &&
        !quote.billing_waived_at
          ? openQuoteCheckout
          : undefined
      }
      onOpenReceivable={quote.status === 'accepted' ? openReceivableFromQuote : undefined}
      onCreateAppointmentFromQuote={openAgendaFromQuote}
    />
    {clinicId && id && quote && checkoutOpen ? (
      <ComandaCheckoutDrawer
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        clinicId={clinicId}
        unitId={(quote.unit_id || getSelectedUnitId()) as string}
        originType="quote"
        originId={id}
        onSuccess={async () => {
          showSuccess('Cobrança concluída.');
          setCheckoutOpen(false);
          await load();
        }}
      />
    ) : null}
    </>
  );
};

export default HubQuoteDetailPage;
