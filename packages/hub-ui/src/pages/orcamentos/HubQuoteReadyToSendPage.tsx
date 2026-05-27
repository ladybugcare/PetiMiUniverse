import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Copy, Download, ExternalLink } from 'lucide-react';
import {
  useAuth,
  getStoredClinicId,
  usePermissions,
  type AppRole,
} from '@petimi/web-core';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import { useAlert } from '../../components/AlertProvider';
import { hubQuotesApi, downloadHubQuotePdf, type HubQuote } from '../../api/hubQuotesApi';
import '../clientes/clientes.css';
import './orcamentos-page.css';

const allowedClinicRoles = ['CADMIN', 'CMANAGER', 'CASSISTANT'] as const;

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? x[0] ?? null : x;
}

function prospectFirstName(fullName: string | undefined | null): string {
  const t = (fullName ?? '').trim();
  if (!t) return 'cliente';
  return t.split(/\s+/)[0] ?? t;
}

function formatQuoteValidUntil(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function buildWhatsAppMessageLinkVariant(firstName: string, publicLink: string, validUntil: string): string {
  return [
    `Olá, ${firstName}! 😊`,
    '',
    'Segue o orçamento dos serviços dos seus pets:',
    publicLink,
    '',
    `Válido até ${validUntil}.`,
    'Qualquer dúvida, é só me chamar! 🧡',
  ].join('\n');
}

function buildWhatsAppMessagePdfVariant(firstName: string, publicLink: string, validUntil: string): string {
  return [
    `Olá, ${firstName}! 😊`,
    '',
    'Segue o PDF do orçamento dos serviços dos seus pets.',
    '',
    'Você também pode visualizar online:',
    publicLink,
    '',
    `Válido até ${validUntil}.`,
    'Qualquer dúvida, é só me chamar! 🧡',
  ].join('\n');
}

type MessageVariant = 'link' | 'pdf';

const HubQuoteReadyToSendPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, role: authRole } = useAuth();
  const { role: clinicRole, loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const { showError, showSuccess } = useAlert();

  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<HubQuote | null>(null);
  const [publicUrl, setPublicUrl] = useState('');
  const [messageVariant, setMessageVariant] = useState<MessageVariant>('link');
  const [pdfBusy, setPdfBusy] = useState(false);

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

  const messageText = useMemo(() => {
    if (!publicUrl) return '';
    return messageVariant === 'link'
      ? buildWhatsAppMessageLinkVariant(firstName, publicUrl, validUntilLabel)
      : buildWhatsAppMessagePdfVariant(firstName, publicUrl, validUntilLabel);
  }, [firstName, messageVariant, publicUrl, validUntilLabel]);

  const copyMessage = async () => {
    if (!messageText) return;
    try {
      await navigator.clipboard.writeText(messageText);
      showSuccess('Mensagem copiada');
    } catch {
      showError('Não foi possível copiar. Selecione o texto manualmente.');
    }
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
  if (permLoading || !accessAllowed) return <div style={{ padding: 24 }}>Carregando…</div>;
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
        <p className="hub-clientes__muted">Carregando…</p>
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

      <div className="hub-quote-ready__segment" role="tablist" aria-label="Modelo de mensagem">
        <button
          type="button"
          role="tab"
          aria-selected={messageVariant === 'link'}
          className={`hub-quote-ready__segment-btn${messageVariant === 'link' ? ' hub-quote-ready__segment-btn--active' : ''}`}
          onClick={() => setMessageVariant('link')}
        >
          Mensagem com link
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={messageVariant === 'pdf'}
          className={`hub-quote-ready__segment-btn${messageVariant === 'pdf' ? ' hub-quote-ready__segment-btn--active' : ''}`}
          onClick={() => setMessageVariant('pdf')}
        >
          Mensagem com PDF
        </button>
      </div>

      <section className="hub-orcamento-novo__card hub-quote-ready__message-card">
        <pre className="hub-quote-ready__message-pre" tabIndex={0}>
          {messageText}
        </pre>
        <button
          type="button"
          className="hub-orcamento-novo__btn hub-orcamento-novo__btn--primary hub-quote-ready__btn-wide"
          onClick={() => void copyMessage()}
        >
          <Copy size={18} aria-hidden />
          Copiar mensagem
        </button>
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
