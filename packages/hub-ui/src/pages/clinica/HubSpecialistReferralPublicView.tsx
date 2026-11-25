import React, { useMemo } from 'react';
import type { HubPublicSpecialistReferralPayload } from '../../api/hubSpecialistReferralPublicApi';
import { publicSpecialistReferralPdfUrl } from '../../api/hubSpecialistReferralPublicApi';
import { HubClinicalPublicDocShell } from '../../components/clinical/HubClinicalPublicDocShell';

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
    if (referral.status === 'revoked') {
      return 'Este encaminhamento foi revogado pela clínica emitente e não deve ser utilizado.';
    }
    if (referral.status === 'expired') {
      return 'A validade deste encaminhamento expirou. Consulte a clínica para confirmar se ainda é aplicável.';
    }
    return null;
  }, [referral.status]);

  const pdfHref = publicToken?.trim() ? publicSpecialistReferralPdfUrl(publicToken.trim()) : null;

  return (
    <HubClinicalPublicDocShell
      documentTitle="Encaminhamento a especialista"
      parties={{
        clinic: referral.clinic,
        pet: referral.pet,
        guardian: referral.guardian,
        veterinarian: referral.veterinarian,
      }}
      status={referral.status}
      statusBanner={statusBanner}
      issuedAt={referral.issued_at}
      expiresAt={referral.expires_at}
      validationCode={referral.validation_code}
      contentHashShort={referral.content_hash_short}
      disclaimers={referral.disclaimers}
      pdfHref={pdfHref}
      pdfFilenamePrefix="encaminhamento"
      onCopySuccess={onCopySuccess}
      onCopyError={onCopyError}
    >
      <h2 className="hub-public-rx-doc__section">Encaminhamento</h2>
      {referral.referrals.length === 0 ? (
        <p className="hub-public-rx-doc__muted">Nenhum encaminhamento registrado.</p>
      ) : (
        <ul className="hub-public-rx-doc__items">
          {referral.referrals.map((ref) => (
            <li key={ref.referral_id} className="hub-public-rx-doc__item">
              <div className="hub-public-rx-doc__item-title">
                <strong>{ref.specialty}</strong>
                {ref.priority === 'urgent' ? (
                  <span className="hub-public-rx-doc__urgent">Urgente</span>
                ) : null}
              </div>
              {ref.specialist_name ? (
                <p className="hub-public-rx-doc__posology">Destino: {ref.specialist_name}</p>
              ) : null}
              {ref.specialist_contact ? (
                <p className="hub-public-rx-doc__posology">{ref.specialist_contact}</p>
              ) : null}
              <p className="hub-public-rx-doc__posology">
                <strong>Motivo:</strong> {ref.referral_reason}
              </p>
              {ref.clinical_summary ? (
                <p className="hub-public-rx-doc__posology">
                  <strong>Resumo clínico:</strong> {ref.clinical_summary}
                </p>
              ) : null}
              {ref.notes?.trim() ? (
                <p className="hub-public-rx-doc__posology">Observações: {ref.notes.trim()}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </HubClinicalPublicDocShell>
  );
};

export default HubSpecialistReferralPublicView;
