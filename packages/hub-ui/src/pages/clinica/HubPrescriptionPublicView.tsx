import React, { useMemo } from 'react';
import type { HubPublicPrescriptionMedication, HubPublicPrescriptionPayload } from '../../api/hubPrescriptionPublicApi';
import { publicPrescriptionPdfUrl } from '../../api/hubPrescriptionPublicApi';
import { HubClinicalPublicDocShell } from '../../components/clinical/HubClinicalPublicDocShell';

function medicationQty(it: HubPublicPrescriptionMedication): string {
  return (it.presentation ?? '').trim();
}

function medicationInstructions(it: HubPublicPrescriptionMedication): string {
  return [it.posology, it.concentration ? `(${it.concentration})` : null, it.instructions]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function groupByRoute(meds: HubPublicPrescriptionMedication[]) {
  const order: string[] = [];
  const map = new Map<string, HubPublicPrescriptionMedication[]>();
  for (const med of meds) {
    const key = (med.use_route ?? '').trim() || '__none__';
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(med);
  }
  return order.map((key) => ({
    route: key === '__none__' ? null : key,
    items: map.get(key)!,
  }));
}

export type HubPrescriptionPublicViewProps = {
  prescription: HubPublicPrescriptionPayload;
  /** Token público para link de PDF (somente na rota /receita/:token). */
  publicToken?: string | null;
  onCopySuccess?: (message: string) => void;
  onCopyError?: (message: string) => void;
};

export const HubPrescriptionPublicView: React.FC<HubPrescriptionPublicViewProps> = ({
  prescription,
  publicToken,
  onCopySuccess,
  onCopyError,
}) => {
  const groups = useMemo(() => groupByRoute(prescription.medications ?? []), [prescription.medications]);
  const statusBanner =
    prescription.status === 'revoked'
      ? 'Esta receita foi revogada pela clínica emitente e não deve ser utilizada para dispensação.'
      : prescription.status === 'expired'
        ? 'A validade desta receita expirou. Consulte a clínica para confirmar se ainda é aplicável.'
        : null;

  const pdfHref = publicToken?.trim() ? publicPrescriptionPdfUrl(publicToken.trim()) : null;

  return (
    <HubClinicalPublicDocShell
      documentTitle="Receituário"
      parties={{
        clinic: prescription.clinic,
        pet: prescription.pet,
        guardian: prescription.guardian,
        veterinarian: prescription.veterinarian,
      }}
      status={prescription.status}
      statusBanner={statusBanner}
      issuedAt={prescription.issued_at}
      expiresAt={prescription.expires_at}
      validationCode={prescription.validation_code}
      contentHashShort={prescription.content_hash_short}
      disclaimers={prescription.disclaimers}
      pdfHref={pdfHref}
      pdfFilenamePrefix="receita"
      onCopySuccess={onCopySuccess}
      onCopyError={onCopyError}
    >
      <h2 className="hub-public-rx-doc__section">Prescrição</h2>
      {groups.length === 0 ? (
        <p className="hub-public-rx-doc__muted">Nenhum medicamento registrado.</p>
      ) : (
        groups.map((group) => (
          <section key={group.route ?? 'geral'} className="hub-public-rx-doc__group">
            {group.route ? <h3 className="hub-public-rx-doc__route">{group.route}</h3> : null}
            <ul className="hub-public-rx-doc__meds">
              {group.items.map((med, idx) => {
                const qty = medicationQty(med);
                const instructions = medicationInstructions(med);
                return (
                  <li key={`${med.medication_name}-${idx}`}>
                    <div className="hub-public-rx-doc__med-line">
                      <strong>{med.medication_name}</strong>
                      <span className="hub-public-rx-doc__dots" aria-hidden />
                      {qty ? <span className="hub-public-rx-doc__qty">{qty}</span> : null}
                    </div>
                    {instructions ? <p className="hub-public-rx-doc__posology">{instructions}</p> : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {prescription.notes?.trim() ? (
        <div className="hub-public-rx-doc__notes">
          <strong>Observações</strong>
          <p>{prescription.notes.trim()}</p>
        </div>
      ) : null}
    </HubClinicalPublicDocShell>
  );
};

export default HubPrescriptionPublicView;
