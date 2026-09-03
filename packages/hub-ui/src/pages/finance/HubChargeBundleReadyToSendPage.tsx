import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Check, Copy, Download, ExternalLink, MessageCircle } from 'lucide-react';
import { useAuth, getStoredClinicId, usePermissions, type AppRole } from '@petimi/web-core';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubTabs } from '../../components/HubTabs';
import {
  downloadHubChargeBundlePdf,
  hubFinancialApi,
  type HubChargeBundle,
} from '../../api/hubFinancialApi';
import {
  buildWhatsAppMessageBundleLinkVariant,
  buildWhatsAppMessageBundlePdfVariant,
  formatBrlLabel,
  formatDueDateLabel,
  guardianFirstName,
  waMeUrlWithText,
} from './hubChargeBundleShareUtils';
import '../clientes/clientes.css';
import '../orcamentos/orcamentos-page.css';

type MessageVariant = 'link' | 'pdf';

const HubChargeBundleReadyToSendPage: React.FC = () => {
  const { bundleId } = useParams<{ bundleId: string }>();
  const { user, role: authRole } = useAuth();
  const { loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const { showError } = useAlert();
  const copyDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState<HubChargeBundle | null>(null);
  const [publicUrl, setPublicUrl] = useState('');
  const [messageVariant, setMessageVariant] = useState<MessageVariant>('link');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [messageCopied, setMessageCopied] = useState(false);

  const accessAllowed = hasPermission('hub.receivables.create');

  const load = useCallback(async () => {
    if (!clinicId || !bundleId) return;
    setLoading(true);
    try {
      const { bundle: row } = await hubFinancialApi.getChargeBundle(bundleId, clinicId);
      setBundle(row);
      setPublicUrl(hubFinancialApi.chargeBundlePublicLink(row.public_token));
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar lote');
      setBundle(null);
      setPublicUrl('');
    } finally {
      setLoading(false);
    }
  }, [bundleId, clinicId, showError]);

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) redirectAwayFromHub(authRole as AppRole);
  }, [permLoading, accessAllowed, authRole]);

  useEffect(() => {
    void load();
  }, [load]);

  const guardian = bundle?.guardian ?? null;
  const firstName = useMemo(() => guardianFirstName(guardian?.full_name), [guardian]);
  const amountLabel = useMemo(
    () => formatBrlLabel(Number(bundle?.balance_due ?? bundle?.total_amount ?? 0)),
    [bundle],
  );
  const dueDateLabel = useMemo(() => formatDueDateLabel(bundle?.due_date ?? null), [bundle]);
  const itemsCount = bundle?.items?.length ?? 0;
  const guardianPhone = guardian?.phone?.trim() ?? '';

  const messageText = useMemo(() => {
    if (!publicUrl || !bundle) return '';
    return messageVariant === 'link'
      ? buildWhatsAppMessageBundleLinkVariant(firstName, publicUrl, amountLabel, dueDateLabel, itemsCount)
      : buildWhatsAppMessageBundlePdfVariant(firstName, publicUrl, amountLabel, dueDateLabel, itemsCount);
  }, [amountLabel, bundle, dueDateLabel, firstName, itemsCount, messageVariant, publicUrl]);

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

  const markSentBestEffort = () => {
    if (!clinicId || !bundleId) return;
    void hubFinancialApi.markChargeBundleSent(bundleId, clinicId).catch(() => undefined);
  };

  const copyMessage = async () => {
    if (!messageText) return;
    try {
      await navigator.clipboard.writeText(messageText);
      setMessageCopied(true);
      markSentBestEffort();
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
    markSentBestEffort();
    window.open(whatsAppHref, '_blank', 'noopener,noreferrer');
  };

  const copyLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      markSentBestEffort();
    } catch {
      showError('Não foi possível copiar o link.');
    }
  };

  const handleDownloadPdf = async () => {
    if (!clinicId || !bundleId) return;
    setPdfBusy(true);
    try {
      await downloadHubChargeBundlePdf(bundleId, clinicId);
      markSentBestEffort();
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
  if (!bundleId) return <Navigate to="/hub/financeiro" replace />;

  if (!loading && !bundle) {
    return (
      <div className="hub-orcamento-novo" style={{ padding: 24 }}>
        <p>Lote não encontrado.</p>
        <Link to="/hub/financeiro" className="hub-clientes__link-btn">
          Voltar ao financeiro
        </Link>
      </div>
    );
  }

  if (loading || !bundle) {
    return (
      <div className="hub-orcamento-novo" style={{ padding: 24 }}>
        <HubLoading variant="block" label="Carregando lote…" />
      </div>
    );
  }

  return (
    <div className="hub-orcamento-novo hub-quote-ready">
      <header className="hub-orcamento-novo__topbar">
        <div>
          <p className="hub-quote-ready__eyebrow">Cobrança agrupada pronta para envio</p>
          <h1 className="hub-orcamento-novo__topbar-title" style={{ marginTop: 4 }}>
            Lote pronto para compartilhar
          </h1>
          <p className="hub-orcamento-novo__topbar-subtitle">
            {itemsCount} cobrança(s) · {amountLabel}
            {dueDateLabel !== '—' ? ` · venc. ${dueDateLabel}` : ''}
          </p>
        </div>
        <div className="hub-orcamento-novo__topbar-actions">
          <Link to="/hub/financeiro" className="hub-orcamento-novo__btn hub-orcamento-novo__btn--ghost">
            Voltar ao financeiro
          </Link>
        </div>
      </header>

      <HubTabs
        ariaLabel="Modelo de mensagem"
        activeId={messageVariant}
        onTabChange={(tabId) => setMessageVariant(tabId as MessageVariant)}
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
      </section>

      <section className="hub-orcamento-novo__card hub-quote-ready__links-card">
        <label className="hub-orcamento-novo__label" htmlFor="hub-bundle-ready-public-url">
          Link público
        </label>
        <div className="hub-quote-ready__url-row">
          <input
            id="hub-bundle-ready-public-url"
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
            onClick={markSentBestEffort}
          >
            <ExternalLink size={18} aria-hidden />
            Ver cobrança pública
          </a>
        </div>
      </section>
    </div>
  );
};

export default HubChargeBundleReadyToSendPage;
