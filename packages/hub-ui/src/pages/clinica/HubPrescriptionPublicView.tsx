import React, { useMemo } from 'react';
import { Copy, Download } from 'lucide-react';
import type { HubPublicPrescriptionMedication, HubPublicPrescriptionPayload } from '../../api/hubPrescriptionPublicApi';
import { publicPrescriptionPdfUrl } from '../../api/hubPrescriptionPublicApi';
import { HubPrescriptionDocumentBadge } from '../../components/clinical/HubPrescriptionDocumentBadge';

function formatSnapshotMedicationMeta(it: HubPublicPrescriptionMedication): string {
  const parts = [
    it.presentation ? `Apresentação: ${it.presentation}` : null,
    it.concentration ? `Concentração: ${it.concentration}` : null,
    it.quantity ? `Qtd: ${it.quantity}` : null,
    it.posology ? `Posologia: ${it.posology}` : null,
    it.duration ? `Duração: ${it.duration}` : null,
    it.administration === 'administered_in_clinic' ? 'Administração na clínica' : null,
    it.instructions ? it.instructions : null,
  ].filter(Boolean);
  return parts.join(' · ') || '—';
}

function veterinarianLabel(v: HubPublicPrescriptionPayload['veterinarian']): string {
  const crmv = [v.crmv, v.crmv_uf].filter(Boolean).join('/');
  return crmv ? `${v.full_name} · CRMV ${crmv}` : v.full_name;
}

function petLabel(pet: HubPublicPrescriptionPayload['pet']): string {
  const parts = [pet.name];
  if (pet.species) parts.push(pet.species);
  if (pet.breed) parts.push(pet.breed);
  return parts.join(' · ');
}

async function copyText(value: string, onDone?: () => void, onErr?: (msg: string) => void) {
  try {
    await navigator.clipboard.writeText(value);
    onDone?.();
  } catch {
    onErr?.('Não foi possível copiar');
  }
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
  const medications = useMemo(() => prescription.medications ?? [], [prescription.medications]);
  const statusBanner =
    prescription.status === 'revoked'
      ? {
          className: 'hub-public-quote__banner hub-public-quote__banner--warn',
          text: 'Esta receita foi revogada pela clínica emitente e não deve ser utilizada para dispensação.',
        }
      : prescription.status === 'expired'
        ? {
            className: 'hub-public-quote__banner hub-public-quote__banner--warn',
            text: 'A validade desta receita expirou. Consulte a clínica para confirmar se ainda é aplicável.',
          }
        : null;

  const pdfHref = publicToken?.trim() ? publicPrescriptionPdfUrl(publicToken.trim()) : null;

  return (
    <div className="hub-public-quote">
      <div className="hub-public-quote__shell">
        <header className="hub-public-quote__header">
          <div className="hub-public-quote__header-main">
            <p className="hub-public-quote__eyebrow">Receita veterinária</p>
            <h1 className="hub-public-quote__clinic">{prescription.clinic.name || 'Clínica'}</h1>
            <p className="hub-public-quote__tagline">Documento validável emitido pelo PetMi Hub.</p>
          </div>
          <aside className="hub-public-quote__meta-card" aria-label="Resumo da receita">
            <p className="hub-public-quote__meta-label">Código</p>
            <p className="hub-public-quote__meta-value hub-public-quote__meta-value--accent">
              {prescription.validation_code || '—'}
            </p>
            <p className="hub-public-quote__meta-label">Situação</p>
            <p className="hub-public-quote__meta-value">
              <HubPrescriptionDocumentBadge status={prescription.status} />
            </p>
            <p className="hub-public-quote__meta-label">Emitida em</p>
            <p className="hub-public-quote__meta-value">
              {prescription.issued_at
                ? new Date(prescription.issued_at).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })
                : '—'}
            </p>
            {prescription.expires_at ? (
              <>
                <p className="hub-public-quote__meta-label">Válida até</p>
                <p
                  className={`hub-public-quote__meta-value${prescription.status === 'expired' ? ' hub-public-quote__meta-value--warn' : ''}`}
                >
                  {new Date(prescription.expires_at).toLocaleDateString('pt-BR', { dateStyle: 'long' })}
                </p>
              </>
            ) : null}
            <p className="hub-public-quote__meta-label">Versão</p>
            <p className="hub-public-quote__meta-value">{prescription.document_version}</p>
            <p className="hub-public-quote__meta-label">Integridade</p>
            <p className="hub-public-quote__meta-value hub-public-rx__hash">{prescription.content_hash_short}</p>
          </aside>
        </header>

        {statusBanner ? (
          <div className={statusBanner.className} role="status">
            <p className="hub-public-quote__banner-text">{statusBanner.text}</p>
          </div>
        ) : null}

        <div className="hub-public-quote__grid-2">
          <section className="hub-public-quote__card">
            <h2 className="hub-public-quote__card-title">Paciente e tutor</h2>
            <dl className="hub-public-quote__dl">
              <dt>Pet</dt>
              <dd>{petLabel(prescription.pet)}</dd>
              <dt>Tutor</dt>
              <dd>{prescription.guardian.full_name}</dd>
            </dl>
          </section>
          <section className="hub-public-quote__card">
            <h2 className="hub-public-quote__card-title">Profissional</h2>
            <dl className="hub-public-quote__dl">
              <dt>Veterinário(a)</dt>
              <dd>{veterinarianLabel(prescription.veterinarian)}</dd>
            </dl>
          </section>
        </div>

        <section className="hub-public-quote__card">
          <h2 className="hub-public-quote__card-title">Medicamentos</h2>
          {medications.length === 0 ? (
            <p className="hub-public-quote__muted">Nenhum medicamento registrado.</p>
          ) : (
            <ol className="hub-public-rx__med-list">
              {medications.map((med, idx) => (
                <li key={`${med.medication_name}-${idx}`} className="hub-public-rx__med-item">
                  <strong>{med.medication_name}</strong>
                  <span className="hub-public-rx__med-meta">{formatSnapshotMedicationMeta(med)}</span>
                </li>
              ))}
            </ol>
          )}
          {prescription.notes?.trim() ? (
            <div className="hub-public-rx__notes">
              <p className="hub-public-quote__meta-label">Observações</p>
              <p>{prescription.notes.trim()}</p>
            </div>
          ) : null}
        </section>

        <div className="hub-public-rx__actions">
          {prescription.validation_code ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--sm"
              onClick={() =>
                void copyText(
                  prescription.validation_code,
                  () => onCopySuccess?.('Código copiado'),
                  (msg) => onCopyError?.(msg),
                )
              }
            >
              <Copy size={14} /> Copiar código
            </button>
          ) : null}
          {pdfHref ? (
            <a
              href={pdfHref}
              target="_blank"
              rel="noopener noreferrer"
              className="hub-clientes__btn hub-clientes__btn--sm"
            >
              <Download size={14} /> Baixar PDF
            </a>
          ) : null}
        </div>

        {(prescription.disclaimers ?? []).length > 0 ? (
          <footer className="hub-public-rx__disclaimers">
            <p className="hub-public-quote__meta-label">Avisos legais</p>
            <ul>
              {prescription.disclaimers.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </footer>
        ) : null}
      </div>
    </div>
  );
};

export default HubPrescriptionPublicView;
