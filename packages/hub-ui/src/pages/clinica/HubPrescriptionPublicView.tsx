import React, { useMemo } from 'react';
import { Copy, Download } from 'lucide-react';
import type { HubPublicPrescriptionMedication, HubPublicPrescriptionPayload } from '../../api/hubPrescriptionPublicApi';
import { publicPrescriptionPdfUrl } from '../../api/hubPrescriptionPublicApi';
import { HubPrescriptionDocumentBadge } from '../../components/clinical/HubPrescriptionDocumentBadge';

function medicationQty(it: HubPublicPrescriptionMedication): string {
  return [it.quantity, it.presentation].filter(Boolean).join(' ').trim();
}

function medicationInstructions(it: HubPublicPrescriptionMedication): string {
  return [
    it.posology,
    it.duration ? `durante ${it.duration}` : null,
    it.concentration ? `(${it.concentration})` : null,
    it.instructions,
  ]
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

function veterinarianLabel(v: HubPublicPrescriptionPayload['veterinarian']): string {
  const crmv = [v.crmv, v.crmv_uf].filter(Boolean).join('/');
  return crmv ? `${v.full_name} · CRMV ${crmv}` : v.full_name;
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
  const groups = useMemo(() => groupByRoute(prescription.medications ?? []), [prescription.medications]);
  const statusBanner =
    prescription.status === 'revoked'
      ? {
          className: 'hub-public-rx-doc__banner hub-public-rx-doc__banner--warn',
          text: 'Esta receita foi revogada pela clínica emitente e não deve ser utilizada para dispensação.',
        }
      : prescription.status === 'expired'
        ? {
            className: 'hub-public-rx-doc__banner hub-public-rx-doc__banner--warn',
            text: 'A validade desta receita expirou. Consulte a clínica para confirmar se ainda é aplicável.',
          }
        : null;

  const pdfHref = publicToken?.trim() ? publicPrescriptionPdfUrl(publicToken.trim()) : null;
  const issuedDate = prescription.issued_at
    ? new Date(prescription.issued_at).toLocaleDateString('pt-BR')
    : '—';
  const validUntilDate = prescription.expires_at
    ? new Date(prescription.expires_at).toLocaleDateString('pt-BR')
    : null;

  return (
    <div className="hub-public-rx-doc">
      <article className="hub-public-rx-doc__sheet">
        <header className="hub-public-rx-doc__clinic">
          <strong>{prescription.clinic.name || 'Clínica'}</strong>
          {prescription.clinic.address_line ? <span>{prescription.clinic.address_line}</span> : null}
          {prescription.clinic.phone ? <span>{prescription.clinic.phone}</span> : null}
          {prescription.clinic.email ? <span>{prescription.clinic.email}</span> : null}
          <span className="hub-public-rx-doc__vet-name">{prescription.veterinarian.full_name}</span>
        </header>

        <h1 className="hub-public-rx-doc__title">Receituário</h1>
        <hr className="hub-public-rx-doc__rule" />

        {statusBanner ? (
          <div className={statusBanner.className} role="status">
            {statusBanner.text}
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
              <dd>{prescription.pet.name}</dd>
            </div>
            <div>
              <dt>Espécie</dt>
              <dd>{prescription.pet.species || 'Não informado'}</dd>
            </div>
            <div>
              <dt>Raça</dt>
              <dd>{prescription.pet.breed || 'Não informado'}</dd>
            </div>
            <div>
              <dt>Idade</dt>
              <dd>{prescription.pet.age_label || 'Não informado'}</dd>
            </div>
          </dl>
          <dl>
            <div>
              <dt>Responsável</dt>
              <dd>{prescription.guardian.full_name}</dd>
            </div>
            <div>
              <dt>Endereço</dt>
              <dd>{prescription.guardian.address_line || 'Não informado'}</dd>
            </div>
            <div>
              <dt>Telefone</dt>
              <dd>{prescription.guardian.phone || 'Não informado'}</dd>
            </div>
            <div>
              <dt>CPF</dt>
              <dd>{prescription.guardian.tax_id_display || 'Não informado'}</dd>
            </div>
            <div>
              <dt>RG</dt>
              <dd>{prescription.guardian.id_doc_number || 'Não informado'}</dd>
            </div>
          </dl>
        </div>

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

        <div className="hub-public-rx-doc__sign">
          <div className="hub-public-rx-doc__sign-line" />
          <p>{veterinarianLabel(prescription.veterinarian)}</p>
        </div>

        <aside className="hub-public-rx-doc__validation" aria-label="Validação">
          <div>
            <p className="hub-public-rx-doc__meta-label">Código</p>
            <p className="hub-public-rx-doc__code">{prescription.validation_code || '—'}</p>
            <p className="hub-public-rx-doc__meta-label">Situação</p>
            <HubPrescriptionDocumentBadge status={prescription.status} />
            {prescription.expires_at ? (
              <>
                <p className="hub-public-rx-doc__meta-label">Válida até</p>
                <p>{new Date(prescription.expires_at).toLocaleDateString('pt-BR', { dateStyle: 'long' })}</p>
              </>
            ) : null}
            <p className="hub-public-rx-doc__meta-label">Integridade</p>
            <p className="hub-public-rx-doc__hash">{prescription.content_hash_short}</p>
          </div>
          <div className="hub-public-rx-doc__actions">
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
        </aside>

        {(prescription.disclaimers ?? []).length > 0 ? (
          <footer className="hub-public-rx-doc__disclaimers">
            <p className="hub-public-rx-doc__meta-label">Avisos legais</p>
            <ul>
              {prescription.disclaimers.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </footer>
        ) : null}
      </article>
    </div>
  );
};

export default HubPrescriptionPublicView;
