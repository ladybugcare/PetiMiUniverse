import React, { useMemo } from 'react';
import QRCode from 'react-qr-code';
import { Copy, Download, ExternalLink } from 'lucide-react';
import { HubModal } from '../HubModal';
import { HubLoading } from '../HubLoading';
import type { HubPrescriptionDocumentRow } from '../../api/hubClinicalApi';
import { hubClinicalApi } from '../../api/hubClinicalApi';
import { HubPrescriptionDocumentBadge } from './HubPrescriptionDocumentBadge';

const DISCLAIMERS = [
  'Validação de autenticidade PetMi Hub — não substitui assinatura qualificada ICP-Brasil.',
  'A dispensação é de responsabilidade do profissional emitente e da farmácia.',
  'Medicamentos controlados ou antimicrobianos podem exigir documentação adicional.',
];

type Props = {
  open: boolean;
  onClose: () => void;
  loading?: boolean;
  error?: string | null;
  document: HubPrescriptionDocumentRow | null;
  publicUrl?: string | null;
  contentHashShort?: string | null;
  onDownloadPdf?: () => void;
  downloading?: boolean;
  onCopySuccess?: (message: string) => void;
  onCopyError?: (message: string) => void;
};

async function copyText(
  label: string,
  value: string,
  onDone?: (msg: string) => void,
  onErr?: (msg: string) => void,
) {
  try {
    await navigator.clipboard.writeText(value);
    onDone?.(`${label} copiado`);
  } catch {
    onErr?.(`Não foi possível copiar ${label.toLowerCase()}`);
  }
}

export function HubPrescriptionIssuePanel({
  open,
  onClose,
  loading,
  error,
  document,
  publicUrl,
  contentHashShort,
  onDownloadPdf,
  downloading,
  onCopySuccess,
  onCopyError,
}: Props) {
  const link = useMemo(() => {
    if (publicUrl) return publicUrl;
    if (document?.validation_url) return document.validation_url;
    if (document?.public_url) return hubClinicalApi.publicPrescriptionLink(document.public_url);
    return '';
  }, [document, publicUrl]);

  if (!open) return null;

  const title = loading ? 'Gerando receita validável…' : 'Receita validável emitida';
  const subtitle =
    loading || !document
      ? 'Aguarde enquanto preparamos o PDF, o link e o código de validação.'
      : `Versão ${document.version_no}${document.validation_code ? ` · ${document.validation_code}` : ''}`;

  return (
    <HubModal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      size="xl"
      footer={
        <button type="button" className="hub-clientes__btn hub-clientes__btn--sm" onClick={onClose}>
          Fechar
        </button>
      }
    >
      {loading ? (
        <HubLoading variant="block" label="Emitindo receita e preparando link público…" />
      ) : error ? (
        <div className="hub-public-quote__banner hub-public-quote__banner--warn" role="alert">
          <p className="hub-public-quote__banner-text">{error}</p>
        </div>
      ) : !document ? (
        <p className="hub-clientes__muted">Não foi possível carregar os dados da emissão.</p>
      ) : (
      <div className="hub-rx-issue">
        <div className="hub-rx-issue__head">
          <HubPrescriptionDocumentBadge status={document.document_status ?? 'valid'} />
          {contentHashShort || document.content_hash_short ? (
            <span className="hub-clientes__muted hub-rx-issue__hash">
              Integridade: {contentHashShort ?? document.content_hash_short}
            </span>
          ) : null}
        </div>

        {document.validation_code ? (
          <div className="hub-rx-issue__row">
            <div>
              <span className="hub-rx-issue__label">Código de validação</span>
              <strong className="hub-rx-issue__code">{document.validation_code}</strong>
            </div>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--sm"
              onClick={() => void copyText('Código', document.validation_code!, onCopySuccess, onCopyError)}
            >
              <Copy size={14} /> Copiar código
            </button>
          </div>
        ) : null}

        {link ? (
          <div className="hub-rx-issue__row">
            <div className="hub-rx-issue__link-wrap">
              <span className="hub-rx-issue__label">Link público</span>
              <a href={link} target="_blank" rel="noopener noreferrer" className="hub-rx-issue__link">
                {link}
                <ExternalLink size={14} />
              </a>
            </div>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--sm"
              onClick={() => void copyText('Link', link, onCopySuccess, onCopyError)}
            >
              <Copy size={14} /> Copiar link
            </button>
          </div>
        ) : null}

        {link ? (
          <div className="hub-rx-issue__qr">
            <QRCode value={link} size={128} level="M" bgColor="#ffffff" fgColor="#4a3b3a" />
            <p className="hub-clientes__muted">Escaneie para abrir a validação pública</p>
          </div>
        ) : (
          <p className="hub-clientes__muted">Link público indisponível — tente reemitir ou contate o suporte.</p>
        )}

        <div className="hub-rx-issue__actions">
          {onDownloadPdf ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
              disabled={downloading}
              onClick={onDownloadPdf}
            >
              <Download size={14} /> {downloading ? 'Gerando PDF…' : 'Baixar PDF'}
            </button>
          ) : null}
        </div>

        <div className="hub-rx-issue__disclaimers">
          <strong>Avisos legais</strong>
          <ul>
            {DISCLAIMERS.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
      )}
    </HubModal>
  );
}
