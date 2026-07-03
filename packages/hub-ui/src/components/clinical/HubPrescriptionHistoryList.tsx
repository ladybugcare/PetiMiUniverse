import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useAlert } from '../../components/AlertProvider';
import { HubPrescriptionIssuePanel } from './HubPrescriptionIssuePanel';
import { HubPrescriptionRevokeModal } from './HubPrescriptionRevokeModal';
import { HubPrescriptionDocumentBadge } from './HubPrescriptionDocumentBadge';
import {
  hubClinicalApi,
  openBlankPdfPreviewTab,
  openHubPrescriptionPdf,
  type HubPrescription,
  type HubPrescriptionDocumentRow,
} from '../../api/hubClinicalApi';
import { formatPrescriptionLine } from '../../pages/clinica/clinicalDisplay';

type DocsByPrescription = Record<string, HubPrescriptionDocumentRow[]>;

export type HubPrescriptionHistoryListProps = {
  prescriptions: HubPrescription[];
  clinicId: string;
  canWrite?: boolean;
};

export function HubPrescriptionHistoryList({
  prescriptions,
  clinicId,
  canWrite = false,
}: HubPrescriptionHistoryListProps) {
  const { showError, showSuccess } = useAlert();
  const [docsByRx, setDocsByRx] = useState<DocsByPrescription>({});
  const [loading, setLoading] = useState(false);
  const [issuePanelOpen, setIssuePanelOpen] = useState(false);
  const [issuedDoc, setIssuedDoc] = useState<HubPrescriptionDocumentRow | null>(null);
  const [issuedPublicUrl, setIssuedPublicUrl] = useState<string | null>(null);
  const [issuedHashShort, setIssuedHashShort] = useState<string | null>(null);
  const [issuedPrescriptionId, setIssuedPrescriptionId] = useState<string | null>(null);
  const [revokeCtx, setRevokeCtx] = useState<{ rxId: string; doc: HubPrescriptionDocumentRow } | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const reloadAll = useCallback(async () => {
    if (!clinicId || prescriptions.length === 0) {
      setDocsByRx({});
      return;
    }
    setLoading(true);
    try {
      const entries = await Promise.all(
        prescriptions.map(async (p) => {
          const r = await hubClinicalApi.listPrescriptionDocuments(p.id, clinicId);
          return [p.id, r.documents ?? []] as const;
        }),
      );
      setDocsByRx(Object.fromEntries(entries));
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar histórico de receitas');
      setDocsByRx({});
    } finally {
      setLoading(false);
    }
  }, [clinicId, prescriptions, showError]);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  const openIssuePanel = (rxId: string, doc: HubPrescriptionDocumentRow) => {
    setIssuedPrescriptionId(rxId);
    setIssuedDoc(doc);
    setIssuedPublicUrl(doc.validation_url ?? doc.public_url ?? null);
    setIssuedHashShort(doc.content_hash_short ?? null);
    setIssuePanelOpen(true);
  };

  const downloadPdf = async (rxId: string, documentId?: string) => {
    const pdfPreviewWindow = openBlankPdfPreviewTab();
    setDownloadingPdf(true);
    try {
      const mode = await openHubPrescriptionPdf(rxId, clinicId, documentId, pdfPreviewWindow);
      if (mode === 'download') {
        showSuccess('PDF baixado — verifique a pasta Downloads');
      }
    } catch (e: unknown) {
      pdfPreviewWindow?.close();
      showError((e as Error)?.message || 'Erro ao abrir PDF');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const confirmRevoke = async (reason: string) => {
    if (!revokeCtx) return;
    setRevoking(true);
    try {
      await hubClinicalApi.revokePrescriptionDocument(revokeCtx.rxId, revokeCtx.doc.id, {
        clinic_id: clinicId,
        reason,
      });
      setRevokeCtx(null);
      await reloadAll();
      showSuccess('Receita revogada');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao revogar receita');
    } finally {
      setRevoking(false);
    }
  };

  if (prescriptions.length === 0) {
    return null;
  }

  return (
    <>
      <ul className="hub-clinic-records__list hub-rx-history-list">
        {prescriptions.map((p) => {
          const docs = docsByRx[p.id] ?? [];
          return (
            <li key={p.id} className="hub-rx-history-list__rx">
              <div className="hub-rx-history-list__rx-head">
                <strong>{formatPrescriptionLine(p)}</strong>
                {p.prescribed_at ? (
                  <span className="hub-clientes__muted hub-rx-history-list__date">
                    {new Date(p.prescribed_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                ) : null}
              </div>

              {loading && docs.length === 0 ? (
                <p className="hub-clientes__muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
                  Carregando emissões…
                </p>
              ) : docs.length === 0 ? (
                <div className="hub-rx-history__empty">
                  <p className="hub-clientes__muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
                    Nenhuma receita validável emitida — é possível abrir PDF simples da prescrição.
                  </p>
                  <button
                    type="button"
                    className="hub-clientes__btn hub-clientes__btn--sm"
                    disabled={downloadingPdf}
                    onClick={() => void downloadPdf(p.id)}
                  >
                    {downloadingPdf ? 'Abrindo PDF…' : 'Abrir PDF'}
                  </button>
                </div>
              ) : (
                <div className="hub-rx-history">
                  <span className="hub-clientes__muted" style={{ fontSize: 12 }}>
                    Emissões validáveis
                  </span>
                  <ul className="hub-rx-history__list">
                    {docs.map((d) => {
                      const publicLink = d.validation_url ?? (d.public_url ? hubClinicalApi.publicPrescriptionLink(d.public_url) : '');
                      return (
                        <li key={d.id} className="hub-rx-history__item">
                          <div>
                            <strong>Versão {d.version_no}</strong>
                            {d.validation_code ? ` · ${d.validation_code}` : ''}
                            {d.issued_at
                              ? ` — ${new Date(d.issued_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
                              : ''}
                            {d.issued_by_member?.full_name ? ` — ${d.issued_by_member.full_name}` : ''}
                          </div>
                          <div className="hub-rx-history__item-actions">
                            <HubPrescriptionDocumentBadge status={d.document_status} />
                            <button
                              type="button"
                              className="hub-clientes__btn hub-clientes__btn--sm"
                              disabled={downloadingPdf}
                              onClick={() => void downloadPdf(p.id, d.id)}
                            >
                              {downloadingPdf ? 'Abrindo…' : 'Abrir PDF'}
                            </button>
                            {publicLink ? (
                              <>
                                <a
                                  href={publicLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hub-clientes__btn hub-clientes__btn--sm"
                                >
                                  <ExternalLink size={14} /> Consultar
                                </a>
                                <button
                                  type="button"
                                  className="hub-clientes__btn hub-clientes__btn--sm"
                                  onClick={() => openIssuePanel(p.id, d)}
                                >
                                  Link / QR
                                </button>
                              </>
                            ) : null}
                            {canWrite && d.document_status !== 'revoked' ? (
                              <button
                                type="button"
                                className="hub-clientes__btn hub-clientes__btn--sm hub-clientes__btn--danger-outline"
                                onClick={() => setRevokeCtx({ rxId: p.id, doc: d })}
                              >
                                Revogar
                              </button>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <HubPrescriptionIssuePanel
        open={issuePanelOpen}
        onClose={() => setIssuePanelOpen(false)}
        document={issuedDoc}
        publicUrl={issuedPublicUrl}
        contentHashShort={issuedHashShort}
        downloading={downloadingPdf}
        onDownloadPdf={
          issuedDoc && issuedPrescriptionId
            ? () => void downloadPdf(issuedPrescriptionId, issuedDoc.id)
            : undefined
        }
        onCopySuccess={showSuccess}
        onCopyError={showError}
      />

      <HubPrescriptionRevokeModal
        open={Boolean(revokeCtx)}
        onClose={() => setRevokeCtx(null)}
        document={revokeCtx?.doc ?? null}
        submitting={revoking}
        onConfirm={confirmRevoke}
      />
    </>
  );
}
