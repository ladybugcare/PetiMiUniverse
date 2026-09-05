import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { useAlert } from '../AlertProvider';
import { HubClinicalDocumentIssuePanel } from './HubClinicalDocumentIssuePanel';
import { HubPrescriptionRevokeModal } from './HubPrescriptionRevokeModal';
import { HubPrescriptionDocumentBadge } from './HubPrescriptionDocumentBadge';
import {
  hubClinicalExamsApi,
  hubSpecialistReferralsApi,
  openBlankPdfPreviewTab,
  openHubClinicalDocumentPdf,
  type HubClinicalDocumentRow,
  type HubEncounter,
  type HubPrescriptionDocumentRow,
} from '../../api/hubClinicalApi';

type DocKind = 'exam_order' | 'specialist_referral';

const DISCLAIMERS: Record<DocKind, string[]> = {
  exam_order: [
    'Documento gerado pelo PetMi Hub para validação de autenticidade. Não substitui guias oficiais de convênios ou laboratórios.',
    'A realização dos exames é de responsabilidade do laboratório indicado e do tutor, conforme orientação veterinária.',
  ],
  specialist_referral: [
    'Documento gerado pelo PetMi Hub para validação de autenticidade. Não substitui documentos regulatórios específicos.',
    'O encaminhamento é uma orientação clínica; a consulta depende de disponibilidade do especialista.',
  ],
};

export function HubEncounterClinicalDocumentsList({
  kind,
  clinicId,
  encounters,
  canWrite = false,
}: {
  kind: DocKind;
  clinicId: string;
  encounters: HubEncounter[];
  canWrite?: boolean;
}) {
  const { showError, showSuccess } = useAlert();
  const [docsByEncounter, setDocsByEncounter] = useState<Record<string, HubClinicalDocumentRow[]>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const hasDocsRef = useRef(false);
  const [issuePanelOpen, setIssuePanelOpen] = useState(false);
  const [issuedDoc, setIssuedDoc] = useState<HubClinicalDocumentRow | null>(null);
  const [issuedPublicUrl, setIssuedPublicUrl] = useState<string | null>(null);
  const [revokeDoc, setRevokeDoc] = useState<HubClinicalDocumentRow | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const reload = useCallback(async () => {
    if (!encounters.length) {
      setDocsByEncounter({});
      return;
    }
    if (hasDocsRef.current) setRefreshing(true);
    else setLoading(true);
    try {
      const entries = await Promise.all(
        encounters.map(async (enc) => {
          const r =
            kind === 'exam_order'
              ? await hubClinicalExamsApi.listOrderDocumentsByEncounter(enc.id, clinicId)
              : await hubSpecialistReferralsApi.listDocumentsByEncounter(enc.id, clinicId);
          return [enc.id, r.documents ?? []] as const;
        }),
      );
      setDocsByEncounter(Object.fromEntries(entries));
      hasDocsRef.current = true;
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar documentos');
      setDocsByEncounter({});
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clinicId, encounters, kind, showError]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openPanel = (doc: HubClinicalDocumentRow) => {
    setIssuedDoc(doc);
    setIssuedPublicUrl(doc.validation_url ?? doc.public_url ?? null);
    setIssuePanelOpen(true);
  };

  const pdfPath = (doc: HubClinicalDocumentRow, referralId?: string) => {
    if (kind === 'exam_order') {
      const q = new URLSearchParams({ clinic_id: clinicId, document_id: doc.id });
      return `/api/hub/clinical/exams/${encodeURIComponent(doc.id)}/pdf?${q}`;
    }
    const q = new URLSearchParams({ clinic_id: clinicId, document_id: doc.id });
    return `/api/hub/clinical/specialist-referrals/${encodeURIComponent(referralId ?? doc.id)}/pdf?${q}`;
  };

  const downloadPdf = async (doc: HubClinicalDocumentRow, referralId?: string) => {
    const preview = openBlankPdfPreviewTab();
    setDownloadingPdf(true);
    try {
      await openHubClinicalDocumentPdf(pdfPath(doc, referralId), `documento-${doc.validation_code ?? doc.id.slice(0, 8)}.pdf`, preview);
    } catch (e: unknown) {
      preview?.close();
      showError((e as Error)?.message || 'Erro ao abrir PDF');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const confirmRevoke = async (reason: string) => {
    if (!revokeDoc) return;
    setRevoking(true);
    try {
      if (kind === 'exam_order') {
        await hubClinicalExamsApi.revokeOrderDocument(revokeDoc.id, { clinic_id: clinicId, reason });
      } else {
        const refId = (revokeDoc as HubClinicalDocumentRow & { referral_id?: string }).referral_id ?? revokeDoc.id;
        await hubSpecialistReferralsApi.revokeDocument(refId, revokeDoc.id, { clinic_id: clinicId, reason });
      }
      setRevokeDoc(null);
      await reload();
      showSuccess('Documento revogado');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao revogar');
    } finally {
      setRevoking(false);
    }
  };

  const allDocs = encounters.flatMap((enc) =>
    (docsByEncounter[enc.id] ?? []).map((doc) => ({ enc, doc })),
  );

  if (loading && !allDocs.length) return <p className="hub-clientes__muted">Carregando documentos…</p>;
  if (!allDocs.length) {
    return (
      <p className="hub-clientes__muted">
        Nenhum documento emitido. Abra o atendimento para solicitar itens e gerar PDF/link validável.
      </p>
    );
  }

  const title = kind === 'exam_order' ? 'Solicitações de exame emitidas' : 'Encaminhamentos emitidos';

  return (
    <>
      {refreshing ? <p className="hub-clientes__muted">Atualizando documentos…</p> : null}
      <h3 className="hub-cws-card__title" style={{ fontSize: '1rem', marginTop: 16 }}>
        {title}
      </h3>
      <ul className="hub-clinic-records__list hub-rx-history-list">
        {allDocs.map(({ enc, doc }) => (
          <li key={doc.id} className="hub-rx-history-list__rx">
            <div className="hub-rx-history-list__rx-head">
              <strong>{doc.validation_code ?? `v${doc.version_no}`}</strong>
              <HubPrescriptionDocumentBadge status={doc.document_status ?? 'valid'} />
              <span className="hub-clientes__muted">
                {new Date(doc.issued_at).toLocaleString('pt-BR')}
                {' · '}
                <Link to={`/hub/clinica/atendimentos/${enc.id}`} className="hub-clientes__link">
                  Atendimento
                </Link>
              </span>
            </div>
            <div className="hub-rx-history-list__actions">
              <button type="button" className="hub-clientes__btn hub-clientes__btn--sm" onClick={() => openPanel(doc)}>
                <ExternalLink size={14} /> Link / QR
              </button>
              <button type="button" className="hub-clientes__btn hub-clientes__btn--sm" onClick={() => void downloadPdf(doc)}>
                Abrir PDF
              </button>
              {canWrite && doc.document_status === 'valid' ? (
                <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm" onClick={() => setRevokeDoc(doc)}>
                  Revogar
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <HubClinicalDocumentIssuePanel
        open={issuePanelOpen}
        onClose={() => setIssuePanelOpen(false)}
        document={issuedDoc}
        publicUrl={issuedPublicUrl}
        contentHashShort={issuedDoc?.content_hash_short ?? null}
        titleReady={kind === 'exam_order' ? 'Solicitação de exames emitida' : 'Encaminhamento emitido'}
        disclaimers={DISCLAIMERS[kind]}
        onDownloadPdf={issuedDoc ? () => void downloadPdf(issuedDoc) : undefined}
        downloading={downloadingPdf}
        onCopySuccess={showSuccess}
        onCopyError={showError}
      />

      <HubPrescriptionRevokeModal
        open={!!revokeDoc}
        onClose={() => setRevokeDoc(null)}
        document={revokeDoc as unknown as HubPrescriptionDocumentRow}
        submitting={revoking}
        onConfirm={confirmRevoke}
      />
    </>
  );
}
