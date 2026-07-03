import React, { useMemo } from 'react';
import { Copy, Download } from 'lucide-react';
import type { HubPublicSpecialistReferralPayload } from '../../api/hubSpecialistReferralPublicApi';
import { publicSpecialistReferralPdfUrl } from '../../api/hubSpecialistReferralPublicApi';
import { HubPrescriptionDocumentBadge } from '../../components/clinical/HubPrescriptionDocumentBadge';

async function copyText(value: string, onDone?: () => void, onErr?: (msg: string) => void) {
  try {
    await navigator.clipboard.writeText(value);
    onDone?.();
  } catch {
    onErr?.('Não foi possível copiar');
  }
}

export type HubSpecialistReferralPublicViewProps = {
  referral: HubPublicSpecialistReferralPayload;
  publicToken?: string | null;
  onCopySuccess?: (message: string) => void;
  onCopyError?: (message: string) => void;
};

export const HubSpecialistReferralPublicView: React.FC<HubSpecialistReferralPublicViewProps> = ({
  referral,
  publicToken,
  onCopySuccess,
  onCopyError,
}) => {
  const statusBanner = useMemo(() => {
    if (referral.status === 'revoked') return 'Este encaminhamento foi revogado pela clínica emitente.';
    if (referral.status === 'expired') return 'A validade deste encaminhamento expirou. Consulte a clínica.';
    return null;
  }, [referral.status]);

  const pdfHref = publicToken?.trim() ? publicSpecialistReferralPdfUrl(publicToken.trim()) : null;
  const vetCrmv = [referral.veterinarian.crmv, referral.veterinarian.crmv_uf].filter(Boolean).join('/');

  return (
    <div className="hub-public-quote">
      <div className="hub-public-quote__shell">
        <header className="hub-public-quote__header">
          <div className="hub-public-quote__header-main">
            <p className="hub-public-quote__eyebrow">Encaminhamento a especialista</p>
            <h1 className="hub-public-quote__clinic">{referral.clinic.name}</h1>
            <p className="hub-public-quote__tagline">Documento validável emitido pelo PetMi Hub.</p>
          </div>
          <aside className="hub-public-quote__meta-card">
            <p className="hub-public-quote__meta-label">Código</p>
            <p className="hub-public-quote__meta-value hub-public-quote__meta-value--accent">{referral.validation_code}</p>
            <p className="hub-public-quote__meta-label">Situação</p>
            <p className="hub-public-quote__meta-value">
              <HubPrescriptionDocumentBadge status={referral.status} />
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
            <strong>{referral.pet.name}</strong>
            {referral.pet.species ? ` · ${referral.pet.species}` : ''}
          </p>
          <p>Tutor: {referral.guardian.full_name}</p>
          <p>
            Veterinário: {referral.veterinarian.full_name}
            {vetCrmv ? ` · CRMV ${vetCrmv}` : ''}
          </p>
        </section>

        <section className="hub-public-quote__section">
          <h2>Encaminhamentos</h2>
          <ul className="hub-public-quote__items">
            {referral.referrals.map((ref) => (
              <li key={ref.referral_id}>
                <strong>{ref.specialty}</strong>
                {ref.specialist_name ? <p>Destino: {ref.specialist_name}</p> : null}
                {ref.specialist_contact ? <p className="hub-clientes__muted">{ref.specialist_contact}</p> : null}
                <p>Motivo: {ref.referral_reason}</p>
                {ref.clinical_summary ? <p>Resumo: {ref.clinical_summary}</p> : null}
                {ref.priority === 'urgent' ? <p className="hub-public-quote__meta-value--warn">Prioridade urgente</p> : null}
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
              onClick={() => void copyText(referral.validation_code, () => onCopySuccess?.('Código copiado'), onCopyError)}
            >
              <Copy size={14} /> Copiar código
            </button>
          </div>
        ) : null}

        <footer className="hub-public-quote__legal">
          <strong>Avisos legais</strong>
          <ul>
            {referral.disclaimers.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </footer>
      </div>
    </div>
  );
};

export default HubSpecialistReferralPublicView;
