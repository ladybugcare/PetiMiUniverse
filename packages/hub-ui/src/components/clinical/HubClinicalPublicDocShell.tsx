import React, { useState } from 'react';
import { Copy, Download } from 'lucide-react';
import { HubPrescriptionDocumentBadge } from './HubPrescriptionDocumentBadge';
import { HubPublicVetStamp } from './HubPublicVetStamp';
import {
  copyPublicClinicalText,
  downloadPublicClinicalPdf,
  veterinarianPublicLabel,
} from './hubPublicClinicalDocUtils';

export type HubClinicalPublicDocParties = {
  clinic: {
    name: string;
    phone?: string | null;
    email?: string | null;
    address_line?: string | null;
  };
  pet: {
    name: string;
    species?: string | null;
    breed?: string | null;
    age_label?: string | null;
  };
  guardian: {
    full_name: string;
    phone?: string | null;
    tax_id_display?: string | null;
    id_doc_number?: string | null;
    address_line?: string | null;
  };
  veterinarian: {
    full_name: string;
    crmv?: string | null;
    crmv_uf?: string | null;
    signature_image_url?: string | null;
    stamp_image_url?: string | null;
  };
};

export type HubClinicalPublicDocShellProps = {
  documentTitle: string;
  parties: HubClinicalPublicDocParties;
  status: 'valid' | 'revoked' | 'expired';
  statusBanner?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  validationCode: string;
  contentHashShort: string;
  disclaimers?: string[];
  pdfHref?: string | null;
  pdfFilenamePrefix: string;
  children: React.ReactNode;
  onCopySuccess?: (message: string) => void;
  onCopyError?: (message: string) => void;
};

export const HubClinicalPublicDocShell: React.FC<HubClinicalPublicDocShellProps> = ({
  documentTitle,
  parties,
  status,
  statusBanner,
  issuedAt,
  expiresAt,
  validationCode,
  contentHashShort,
  disclaimers = [],
  pdfHref,
  pdfFilenamePrefix,
  children,
  onCopySuccess,
  onCopyError,
}) => {
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const issuedDate = issuedAt ? new Date(issuedAt).toLocaleDateString('pt-BR') : '—';
  const validUntilDate = expiresAt ? new Date(expiresAt).toLocaleDateString('pt-BR') : null;
  const hasStamp =
    Boolean(parties.veterinarian.signature_image_url?.trim()) ||
    Boolean(parties.veterinarian.stamp_image_url?.trim());

  const handleDownloadPdf = async () => {
    if (!pdfHref || downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      const mode = await downloadPublicClinicalPdf(pdfHref, `${pdfFilenamePrefix}-${validationCode || 'documento'}`);
      if (mode === 'download') onCopySuccess?.('PDF baixado — verifique a pasta Downloads');
      else onCopySuccess?.('PDF aberto em nova aba');
    } catch (e: unknown) {
      onCopyError?.((e as Error)?.message || 'Não foi possível baixar o PDF');
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="hub-public-rx-doc">
      <article className="hub-public-rx-doc__sheet">
        <header className="hub-public-rx-doc__clinic">
          <strong>{parties.clinic.name || 'Clínica'}</strong>
          {parties.clinic.address_line ? <span>{parties.clinic.address_line}</span> : null}
          {parties.clinic.phone ? <span>{parties.clinic.phone}</span> : null}
          {parties.clinic.email ? <span>{parties.clinic.email}</span> : null}
          <span className="hub-public-rx-doc__vet-name">{parties.veterinarian.full_name}</span>
        </header>

        <h1 className="hub-public-rx-doc__title">{documentTitle}</h1>
        <hr className="hub-public-rx-doc__rule" />

        {statusBanner ? (
          <div className="hub-public-rx-doc__banner hub-public-rx-doc__banner--warn" role="status">
            {statusBanner}
          </div>
        ) : null}

        <div className="hub-public-rx-doc__id-head">
          <strong>Identificação do pet e responsável</strong>
          <div className="hub-public-rx-doc__dates">
            <span>Emitida em: {issuedDate}</span>
            {validUntilDate ? <span>Válida até: {validUntilDate}</span> : null}
          </div>
        </div>

        <div className="hub-public-rx-doc__id-grid">
          <dl>
            <div>
              <dt>Pet</dt>
              <dd>{parties.pet.name}</dd>
            </div>
            <div>
              <dt>Espécie</dt>
              <dd>{parties.pet.species || 'Não informado'}</dd>
            </div>
            <div>
              <dt>Raça</dt>
              <dd>{parties.pet.breed || 'Não informado'}</dd>
            </div>
            <div>
              <dt>Idade</dt>
              <dd>{parties.pet.age_label || 'Não informado'}</dd>
            </div>
          </dl>
          <dl>
            <div>
              <dt>Responsável</dt>
              <dd>{parties.guardian.full_name}</dd>
            </div>
            <div>
              <dt>Endereço</dt>
              <dd>{parties.guardian.address_line || 'Não informado'}</dd>
            </div>
            <div>
              <dt>Telefone</dt>
              <dd>{parties.guardian.phone || 'Não informado'}</dd>
            </div>
            <div>
              <dt>CPF</dt>
              <dd>{parties.guardian.tax_id_display || 'Não informado'}</dd>
            </div>
            <div>
              <dt>RG</dt>
              <dd>{parties.guardian.id_doc_number || 'Não informado'}</dd>
            </div>
          </dl>
        </div>

        {children}

        <div className="hub-public-rx-doc__sign">
          <HubPublicVetStamp
            className="hub-public-rx-doc__sign-images"
            signatureUrl={parties.veterinarian.signature_image_url}
            stampUrl={parties.veterinarian.stamp_image_url}
          />
          {!hasStamp ? <div className="hub-public-rx-doc__sign-line" /> : null}
          <p>{veterinarianPublicLabel(parties.veterinarian)}</p>
        </div>

        <aside className="hub-public-rx-doc__validation" aria-label="Validação">
          <div>
            <p className="hub-public-rx-doc__meta-label">Código</p>
            <p className="hub-public-rx-doc__code">{validationCode || '—'}</p>
            <p className="hub-public-rx-doc__meta-label">Situação</p>
            <HubPrescriptionDocumentBadge status={status} />
            {expiresAt ? (
              <>
                <p className="hub-public-rx-doc__meta-label">Válida até</p>
                <p>{new Date(expiresAt).toLocaleDateString('pt-BR', { dateStyle: 'long' })}</p>
              </>
            ) : null}
            <p className="hub-public-rx-doc__meta-label">Integridade</p>
            <p className="hub-public-rx-doc__hash">{contentHashShort}</p>
          </div>
          <div className="hub-public-rx-doc__actions">
            {validationCode ? (
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--sm"
                onClick={() =>
                  void copyPublicClinicalText(
                    validationCode,
                    () => onCopySuccess?.('Código copiado'),
                    (msg) => onCopyError?.(msg),
                  )
                }
              >
                <Copy size={14} /> Copiar código
              </button>
            ) : null}
            {pdfHref ? (
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--sm"
                disabled={downloadingPdf}
                onClick={() => void handleDownloadPdf()}
              >
                <Download size={14} /> {downloadingPdf ? 'Baixando…' : 'Baixar PDF'}
              </button>
            ) : null}
          </div>
        </aside>

        {disclaimers.length > 0 ? (
          <footer className="hub-public-rx-doc__disclaimers">
            <p className="hub-public-rx-doc__meta-label">Avisos legais</p>
            <ul>
              {disclaimers.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </footer>
        ) : null}
      </article>
    </div>
  );
};

export default HubClinicalPublicDocShell;
