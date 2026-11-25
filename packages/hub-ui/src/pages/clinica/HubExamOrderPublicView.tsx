import React, { useMemo } from 'react';
import type { HubPublicExamOrderPayload } from '../../api/hubExamOrderPublicApi';
import { publicExamOrderPdfUrl } from '../../api/hubExamOrderPublicApi';
import { HubClinicalPublicDocShell } from '../../components/clinical/HubClinicalPublicDocShell';

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
      return 'Esta solicitação foi revogada pela clínica emitente e não deve ser utilizada.';
    }
    if (examOrder.status === 'expired') {
      return 'A validade desta solicitação expirou. Consulte a clínica para confirmar se ainda é aplicável.';
    }
    return null;
  }, [examOrder.status]);

  const pdfHref = publicToken?.trim() ? publicExamOrderPdfUrl(publicToken.trim()) : null;

  return (
    <HubClinicalPublicDocShell
      documentTitle="Solicitação de exames"
      parties={{
        clinic: examOrder.clinic,
        pet: examOrder.pet,
        guardian: examOrder.guardian,
        veterinarian: examOrder.veterinarian,
      }}
      status={examOrder.status}
      statusBanner={statusBanner}
      issuedAt={examOrder.issued_at}
      expiresAt={examOrder.expires_at}
      validationCode={examOrder.validation_code}
      contentHashShort={examOrder.content_hash_short}
      disclaimers={examOrder.disclaimers}
      pdfHref={pdfHref}
      pdfFilenamePrefix="exames"
      onCopySuccess={onCopySuccess}
      onCopyError={onCopyError}
    >
      <h2 className="hub-public-rx-doc__section">Exames solicitados</h2>
      {examOrder.exams.length === 0 ? (
        <p className="hub-public-rx-doc__muted">Nenhum exame registrado.</p>
      ) : (
        <ul className="hub-public-rx-doc__items">
          {examOrder.exams.map((ex) => {
            const lab =
              ex.lab_kind === 'external'
                ? ex.external_lab_name ?? ex.lab_name ?? 'Laboratório externo'
                : ex.lab_name ?? 'Laboratório interno';
            return (
              <li key={ex.exam_id} className="hub-public-rx-doc__item">
                <div className="hub-public-rx-doc__item-title">
                  <strong>{ex.exam_type}</strong>
                  {ex.urgency === 'urgent' ? (
                    <span className="hub-public-rx-doc__urgent">Urgente</span>
                  ) : null}
                </div>
                <p className="hub-public-rx-doc__posology">Laboratório: {lab}</p>
                {ex.clinical_indication ? (
                  <p className="hub-public-rx-doc__posology">Indicação clínica: {ex.clinical_indication}</p>
                ) : null}
                {ex.fasting_required ? (
                  <p className="hub-public-rx-doc__posology">Jejum necessário</p>
                ) : null}
                {ex.collection_instructions ? (
                  <p className="hub-public-rx-doc__posology">Coleta: {ex.collection_instructions}</p>
                ) : null}
                {ex.notes?.trim() ? (
                  <p className="hub-public-rx-doc__posology">Observações: {ex.notes.trim()}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </HubClinicalPublicDocShell>
  );
};

export default HubExamOrderPublicView;
