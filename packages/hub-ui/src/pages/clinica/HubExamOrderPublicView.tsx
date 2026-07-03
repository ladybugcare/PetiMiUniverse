import React, { useMemo } from 'react';
import { Copy, Download } from 'lucide-react';
import type { HubPublicExamOrderPayload } from '../../api/hubExamOrderPublicApi';
import { publicExamOrderPdfUrl } from '../../api/hubExamOrderPublicApi';
import { HubPrescriptionDocumentBadge } from '../../components/clinical/HubPrescriptionDocumentBadge';

async function copyText(value: string, onDone?: () => void, onErr?: (msg: string) => void) {
  try {
    await navigator.clipboard.writeText(value);
    onDone?.();
  } catch {
    onErr?.('Não foi possível copiar');
  }
}

export type HubExamOrderPublicViewProps = {
  examOrder: HubPublicExamOrderPayload;
  publicToken?: string | null;
  onCopySuccess?: (message: string) => void;
  onCopyError?: (message: string) => void;
};

export const HubExamOrderPublicView: React.FC<HubExamOrderPublicViewProps> = ({
  examOrder,
  publicToken,
  onCopySuccess,
  onCopyError,
}) => {
  const statusBanner = useMemo(() => {
    if (examOrder.status === 'revoked') {
      return 'Esta solicitação foi revogada pela clínica emitente.';
    }
    if (examOrder.status === 'expired') {
      return 'A validade desta solicitação expirou. Consulte a clínica.';
    }
    return null;
  }, [examOrder.status]);

  const pdfHref = publicToken?.trim() ? publicExamOrderPdfUrl(publicToken.trim()) : null;
  const vetCrmv = [examOrder.veterinarian.crmv, examOrder.veterinarian.crmv_uf].filter(Boolean).join('/');

  return (
    <div className="hub-public-quote">
      <div className="hub-public-quote__shell">
        <header className="hub-public-quote__header">
          <div className="hub-public-quote__header-main">
            <p className="hub-public-quote__eyebrow">Solicitação de exames</p>
            <h1 className="hub-public-quote__clinic">{examOrder.clinic.name}</h1>
            <p className="hub-public-quote__tagline">Documento validável emitido pelo PetMi Hub.</p>
          </div>
          <aside className="hub-public-quote__meta-card">
            <p className="hub-public-quote__meta-label">Código</p>
            <p className="hub-public-quote__meta-value hub-public-quote__meta-value--accent">{examOrder.validation_code}</p>
            <p className="hub-public-quote__meta-label">Situação</p>
            <p className="hub-public-quote__meta-value">
              <HubPrescriptionDocumentBadge status={examOrder.status} />
            </p>
          </aside>
        </header>

        {statusBanner ? (
          <div className="hub-public-quote__banner hub-public-quote__banner--warn" role="alert">
            <p className="hub-public-quote__banner-text">{statusBanner}</p>
          </div>
        ) : null}

        <section className="hub-public-quote__section">
          <h2>Pet e tutor</h2>
          <p>
            <strong>{examOrder.pet.name}</strong>
            {examOrder.pet.species ? ` · ${examOrder.pet.species}` : ''}
          </p>
          <p>Tutor: {examOrder.guardian.full_name}</p>
          <p>
            Veterinário: {examOrder.veterinarian.full_name}
            {vetCrmv ? ` · CRMV ${vetCrmv}` : ''}
          </p>
        </section>

        <section className="hub-public-quote__section">
          <h2>Exames solicitados</h2>
          <ul className="hub-public-quote__items">
            {examOrder.exams.map((ex) => (
              <li key={ex.exam_id}>
                <strong>{ex.exam_type}</strong>
                <span className="hub-clientes__muted">
                  {ex.lab_kind === 'external' ? ex.external_lab_name ?? ex.lab_name : ex.lab_name ?? 'Lab interno'}
                </span>
                {ex.clinical_indication ? <p>Indicação: {ex.clinical_indication}</p> : null}
                {ex.fasting_required ? <p>Jejum necessário</p> : null}
                {ex.collection_instructions ? <p>Coleta: {ex.collection_instructions}</p> : null}
              </li>
            ))}
          </ul>
        </section>

        {pdfHref ? (
          <div className="hub-public-quote__actions">
            <a href={pdfHref} className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm" target="_blank" rel="noreferrer">
              <Download size={14} /> Baixar PDF
            </a>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--sm"
              onClick={() => void copyText(examOrder.validation_code, () => onCopySuccess?.('Código copiado'), onCopyError)}
            >
              <Copy size={14} /> Copiar código
            </button>
          </div>
        ) : null}

        <footer className="hub-public-quote__legal">
          <strong>Avisos legais</strong>
          <ul>
            {examOrder.disclaimers.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </footer>
      </div>
    </div>
  );
};

export default HubExamOrderPublicView;
