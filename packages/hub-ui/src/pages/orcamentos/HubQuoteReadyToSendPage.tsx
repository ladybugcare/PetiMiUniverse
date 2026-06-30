import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Check, Copy, Download, ExternalLink, MessageCircle } from 'lucide-react';
import {
  useAuth,
  getStoredClinicId,
  usePermissions,
  type AppRole,
} from '@petimi/web-core';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import { useAlert } from '../../components/AlertProvider';
import { HubTabs } from '../../components/HubTabs';
import { HubLoading } from '../../components/HubLoading';
import { hubQuotesApi, downloadHubQuotePdf, type HubQuote } from '../../api/hubQuotesApi';
import { embedOne } from './hubQuoteViewUtils';
import {
  buildWhatsAppMessageLinkVariant,
  buildWhatsAppMessagePdfVariant,
  formatQuoteValidUntil,
  prospectFirstName,
  waMeUrlWithText,
} from './hubQuoteShareUtils';
import '../clientes/clientes.css';
import './orcamentos-page.css';

const allowedClinicRoles = ['CADMIN', 'CMANAGER', 'CASSISTANT'] as const;

type MessageVariant = 'link' | 'pdf';

const HubQuoteReadyToSendPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, role: authRole } = useAuth();
  const { role: clinicRole, loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const { showError, showSuccess } = useAlert();
  const copyDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<HubQuote | null>(null);
  const [publicUrl, setPublicUrl] = useState('');
  const [messageVariant, setMessageVariant] = useState<MessageVariant>('link');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [messageCopied, setMessageCopied] = useState(false);

  const accessAllowed =
    clinicRole && allowedClinicRoles.includes(clinicRole as (typeof allowedClinicRoles)[number]);
  const canWrite = hasPermission('hub.quotes.write');

  const load = useCallback(async () => {
    if (!clinicId || !id) return;
    setLoading(true);
    try {
      const { quote: q } = await hubQuotesApi.get(id, clinicId);
      setQuote(q);
      let token = q.public_token;
      if (!token) {
        const { public_token } = await hubQuotesApi.ensurePublicToken(id, clinicId);
        token = public_token;
        setQuote((prev) => (prev ? { ...prev, public_token: token } : prev));
      }
      setPublicUrl(hubQuotesApi.publicLink(token));
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar');
      setQuote(null);
      setPublicUrl('');
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
  const firstName = useMemo(() => prospectFirstName(prospect?.full_name), [prospect]);
  const validUntilLabel = useMemo(() => formatQuoteValidUntil(quote?.expires_at), [quote?.expires_at]);
  const prospectPhone = prospect?.phone?.trim() ?? '';

  const messageText = useMemo(() => {
    if (!publicUrl) return '';
    return messageVariant === 'link'
      ? buildWhatsAppMessageLinkVariant(firstName, publicUrl, validUntilLabel)
      : buildWhatsAppMessagePdfVariant(firstName, publicUrl, validUntilLabel);
  }, [firstName, messageVariant, publicUrl, validUntilLabel]);

  const whatsAppHref = useMemo(() => {
    if (!messageText) return null;
    return waMeUrlWithText(prospectPhone, messageText);
  }, [messageText, prospectPhone]);

  useEffect(() => {
    setMessageCopied(false);
    if (copyDoneTimerRef.current) {
      clearTimeout(copyDoneTimerRef.current);
      copyDoneTimerRef.current = null;
    }
  }, [messageVariant, messageText]);

  useEffect(
    () => () => {
      if (copyDoneTimerRef.current) clearTimeout(copyDoneTimerRef.current);
    },
    [],
  );

  const copyMessage = async () => {
    if (!messageText) return;
    try {
      await navigator.clipboard.writeText(messageText);
      setMessageCopied(true);
      if (copyDoneTimerRef.current) clearTimeout(copyDoneTimerRef.current);
      copyDoneTimerRef.current = setTimeout(() => {
        setMessageCopied(false);
        copyDoneTimerRef.current = null;
      }, 2800);
    } catch {
      showError('Não foi possível copiar. Selecione o texto manualmente.');
    }
  };

  const openWhatsAppShare = () => {
    if (!whatsAppHref) {
      showError('Cadastre um telefone válido no contato do orçamento para abrir o WhatsApp.');
      return;
    }
    window.open(whatsAppHref, '_blank', 'noopener,noreferrer');
  };

  const copyLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      showSuccess('Link copiado');
    } catch {
      showError('Não foi possível copiar o link.');
    }
  };

  const handleDownloadPdf = async () => {
    if (!clinicId || !id) return;
    setPdfBusy(true);
    try {
      await downloadHubQuotePdf(id, clinicId);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao baixar PDF');
    } finally {
      setPdfBusy(false);
    }
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
  if (!canWrite) {
    return (
      <div style={{ padding: 24 }}>
        <p className="hub-clientes__muted">Sem permissão.</p>
      </div>
    );
  }

  if (!loading && quote?.status === 'draft') {
    return <Navigate to={`/hub/orcamentos/${id}/editar`} replace />;
  }

  if (!loading && !quote) {
    return (
      <div className="hub-orcamento-novo" style={{ padding: 24 }}>
        <p>Orçamento não encontrado.</p>
        <Link to="/hub/orcamentos" className="hub-clientes__link-btn">
          Voltar aos orçamentos
        </Link>
      </div>
    );
  }

  if (loading || !quote) {
    return (
      <div className="hub-orcamento-novo" style={{ padding: 24 }}>
        <HubLoading variant="block" label="Carregando orçamento…" />
      </div>
    );
  }

  return (
    <div className="hub-orcamento-novo hub-quote-ready">
      <header className="hub-orcamento-novo__topbar">
        <div>
          <p className="hub-quote-ready__eyebrow">Orçamento pronto para envio</p>
          <h1 className="hub-orcamento-novo__topbar-title" style={{ marginTop: 4 }}>
            Orçamento criado com sucesso
          </h1>
          <p className="hub-orcamento-novo__topbar-subtitle">
            Copie a mensagem abaixo e envie para o cliente pelo WhatsApp.
          </p>
        </div>
        <div className="hub-orcamento-novo__topbar-actions">
          <Link to={`/hub/orcamentos/${id}`} className="hub-orcamento-novo__btn hub-orcamento-novo__btn--ghost">
            Ver ficha interna
          </Link>
        </div>
      </header>

      <HubTabs
        ariaLabel="Modelo de mensagem"
        activeId={messageVariant}
        onTabChange={(tabId) => setMessageVariant(tabId as 'link' | 'pdf')}
        items={[
          { id: 'link', label: 'Mensagem com link' },
          { id: 'pdf', label: 'Mensagem com PDF' },
        ]}
      />

      <section className="hub-orcamento-novo__card hub-quote-ready__message-card">
        <pre className="hub-quote-ready__message-pre" tabIndex={0}>
          {messageText}
        </pre>
        <div className="hub-quote-ready__message-actions">
          <button
            type="button"
            className="hub-orcamento-novo__btn hub-orcamento-novo__btn--outline"
            onClick={() => void copyMessage()}
            aria-live="polite"
          >
            {messageCopied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
            {messageCopied ? 'Mensagem copiada!' : 'Copiar mensagem'}
          </button>
          <button
            type="button"
            className="hub-orcamento-novo__btn hub-orcamento-novo__btn--primary"
            disabled={!whatsAppHref}
            title={!whatsAppHref ? 'Cadastre o telefone do contato no orçamento para usar o WhatsApp' : undefined}
            onClick={openWhatsAppShare}
          >
            <MessageCircle size={18} aria-hidden />
            Abrir WhatsApp
          </button>
        </div>
        {!whatsAppHref ? (
          <p className="hub-quote-ready__wa-hint">
            Sem telefone no contato: use «Copiar mensagem» ou edite o orçamento para incluir o número e habilitar o
            WhatsApp.
          </p>
        ) : null}
      </section>

      <section className="hub-orcamento-novo__card hub-quote-ready__links-card">
        <label className="hub-orcamento-novo__label" htmlFor="hub-quote-ready-public-url">
          Link público
        </label>
        <div className="hub-quote-ready__url-row">
          <input
            id="hub-quote-ready-public-url"
            className="hub-orcamento-novo__input hub-quote-ready__url-input"
            readOnly
            value={publicUrl}
            onFocus={(e) => e.target.select()}
          />
          <button
            type="button"
            className="hub-orcamento-novo__btn hub-orcamento-novo__btn--outline"
            onClick={() => void copyLink()}
          >
            <Copy size={18} aria-hidden />
            Copiar link
          </button>
        </div>

        <div className="hub-quote-ready__actions-row">
          <button
            type="button"
            className="hub-orcamento-novo__btn hub-orcamento-novo__btn--outline"
            disabled={pdfBusy}
            onClick={() => void handleDownloadPdf()}
          >
            <Download size={18} aria-hidden />
            {pdfBusy ? 'A gerar…' : 'Baixar PDF'}
          </button>
          <a
            className="hub-orcamento-novo__btn hub-orcamento-novo__btn--primary"
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={18} aria-hidden />
            Ver orçamento público
          </a>
        </div>
      </section>

      <div className="hub-quote-ready__footer">
        <Link to="/hub/orcamentos/novo" className="hub-orcamento-novo__btn hub-orcamento-novo__btn--ghost hub-quote-ready__new-quote">
          Criar novo orçamento
        </Link>
      </div>
    </div>
  );
};

export default HubQuoteReadyToSendPage;
