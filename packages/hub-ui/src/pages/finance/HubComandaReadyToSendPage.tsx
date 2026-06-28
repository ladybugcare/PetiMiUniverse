import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
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
import {
  hubComandaApi,
  downloadHubComandaPdf,
  type HubComandaDetailResponse,
  type HubComandaGuardianEmbed,
} from '../../api/hubComandaApi';
import {
  buildWhatsAppMessageComandaLinkVariant,
  buildWhatsAppMessageComandaPdfVariant,
  formatBrlLabel,
  guardianFirstName,
  waMeUrlWithText,
} from './hubComandaShareUtils';
import '../clientes/clientes.css';
import '../orcamentos/orcamentos-page.css';

const allowedClinicRoles = ['CADMIN', 'CMANAGER', 'CASSISTANT'] as const;

type MessageVariant = 'link' | 'pdf';

function extractGuardian(comanda: Record<string, unknown>): HubComandaGuardianEmbed | null {
  const g = comanda.guardian as HubComandaGuardianEmbed | null | undefined;
  if (!g?.id) return null;
  return g;
}

const HubComandaReadyToSendPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const financeMode = location.pathname.includes('/financeiro/');
  const comandaBasePath = financeMode ? `/hub/financeiro/comanda/${id}` : `/hub/caixa/comanda/${id}`;
  const moduleHomePath = financeMode ? '/hub/financeiro' : '/hub/caixa';
  const moduleLabel = financeMode ? 'Financeiro' : 'Caixa';
  const { user, role: authRole } = useAuth();
  const { role: clinicRole, loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const { showError } = useAlert();
  const copyDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<HubComandaDetailResponse | null>(null);
  const [publicUrl, setPublicUrl] = useState('');
  const [messageVariant, setMessageVariant] = useState<MessageVariant>('link');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [messageCopied, setMessageCopied] = useState(false);

  const accessAllowed =
    clinicRole && allowedClinicRoles.includes(clinicRole as (typeof allowedClinicRoles)[number]);
  const canWrite = hasPermission('hub.receivables.create');

  const load = useCallback(async () => {
    if (!clinicId || !id) return;
    setLoading(true);
    try {
      const d = await hubComandaApi.getComandaDetail(id, clinicId);
      setDetail(d);
      const { public_token } = await hubComandaApi.ensurePublicToken(id, clinicId);
      setPublicUrl(hubComandaApi.publicLink(public_token));
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar');
      setDetail(null);
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

  const guardian = useMemo(
    () => (detail?.comanda ? extractGuardian(detail.comanda as Record<string, unknown>) : null),
    [detail],
  );
  const firstName = useMemo(() => guardianFirstName(guardian?.full_name), [guardian]);
  const totalLabel = useMemo(() => {
    const c = detail?.comanda as Record<string, unknown> | undefined;
    return formatBrlLabel(Number(c?.total_amount ?? 0));
  }, [detail]);
  const guardianPhone = guardian?.phone?.trim() ?? '';

  const messageText = useMemo(() => {
    if (!publicUrl) return '';
    return messageVariant === 'link'
      ? buildWhatsAppMessageComandaLinkVariant(firstName, publicUrl, totalLabel)
      : buildWhatsAppMessageComandaPdfVariant(firstName, publicUrl, totalLabel);
  }, [firstName, messageVariant, publicUrl, totalLabel]);

  const whatsAppHref = useMemo(() => {
    if (!messageText) return null;
    return waMeUrlWithText(guardianPhone, messageText);
  }, [messageText, guardianPhone]);

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
      showError('Cadastre um telefone válido no tutor para abrir o WhatsApp.');
      return;
    }
    window.open(whatsAppHref, '_blank', 'noopener,noreferrer');
  };

  const copyLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
    } catch {
      showError('Não foi possível copiar o link.');
    }
  };

  const handleDownloadPdf = async () => {
    if (!clinicId || !id) return;
    setPdfBusy(true);
    try {
      await downloadHubComandaPdf(id, clinicId);
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
  if (!id) return <Navigate to={moduleHomePath} replace />;
  if (!canWrite) {
    return (
      <div style={{ padding: 24 }}>
        <p className="hub-clientes__muted">Sem permissão.</p>
      </div>
    );
  }

  if (!loading && !detail) {
    return (
      <div className="hub-orcamento-novo" style={{ padding: 24 }}>
        <p>Comanda não encontrada.</p>
        <Link to={moduleHomePath} className="hub-clientes__link-btn">
          Voltar ao {moduleLabel.toLowerCase()}
        </Link>
      </div>
    );
  }

  if (loading || !detail) {
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
          <p className="hub-quote-ready__eyebrow">Comanda pronta para envio</p>
          <h1 className="hub-orcamento-novo__topbar-title" style={{ marginTop: 4 }}>
            Comanda pronta para compartilhar
          </h1>
          <p className="hub-orcamento-novo__topbar-subtitle">
            Copie a mensagem abaixo e envie para o cliente pelo WhatsApp.
          </p>
        </div>
        <div className="hub-orcamento-novo__topbar-actions">
          <Link to={comandaBasePath} className="hub-orcamento-novo__btn hub-orcamento-novo__btn--ghost">
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
            title={!whatsAppHref ? 'Cadastre o telefone do tutor para usar o WhatsApp' : undefined}
            onClick={openWhatsAppShare}
          >
            <MessageCircle size={18} aria-hidden />
            Abrir WhatsApp
          </button>
        </div>
        {!whatsAppHref ? (
          <p className="hub-quote-ready__wa-hint">
            Sem telefone no tutor: use «Copiar mensagem» ou atualize o cadastro do cliente para habilitar o WhatsApp.
          </p>
        ) : null}
      </section>

      <section className="hub-orcamento-novo__card hub-quote-ready__links-card">
        <label className="hub-orcamento-novo__label" htmlFor="hub-comanda-ready-public-url">
          Link público
        </label>
        <div className="hub-quote-ready__url-row">
          <input
            id="hub-comanda-ready-public-url"
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
            Ver comanda pública
          </a>
        </div>
      </section>
    </div>
  );
};

export default HubComandaReadyToSendPage;
