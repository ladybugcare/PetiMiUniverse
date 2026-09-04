import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Home, Stethoscope } from 'lucide-react';
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
import {
  prescriptionItemFacts,
  prescriptionItemKindLabel,
  prescriptionKind,
  prescriptionKindLabel,
  type PrescriptionKind,
} from '../../pages/clinica/clinicalDisplay';

type DocsByPrescription = Record<string, HubPrescriptionDocumentRow[]>;

export type HubPrescriptionHistoryListProps = {
  prescriptions: HubPrescription[];
  clinicId: string;
  canWrite?: boolean;
};

const KIND_ORDER: PrescriptionKind[] = ['clinic', 'home', 'mixed'];

const KIND_GROUP: Record<PrescriptionKind, { title: string; hint: string }> = {
  clinic: {
    title: 'Prescrições',
    hint: 'Aplicadas na clínica',
  },
  home: {
    title: 'Receitas',
    hint: 'Para uso em casa',
  },
  mixed: {
    title: 'Prescrição e receita',
    hint: 'Itens da clínica e para casa no mesmo registro',
  },
};

function emptyDocsCopy(kind: PrescriptionKind): string {
  if (kind === 'clinic') return 'Aplicada na clínica. Não há receita para o tutor levar para casa.';
  if (kind === 'mixed') {
    return 'Há itens de clínica e de casa. Ainda não há receita validável para o que vai para casa.';
  }
  return 'Receita ainda sem emissão validável. Dá para abrir um PDF simples.';
}

function formatRxDateTime(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

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

  const grouped = useMemo(() => {
    const buckets: Record<PrescriptionKind, HubPrescription[]> = { clinic: [], home: [], mixed: [] };
    for (const rx of prescriptions) {
      buckets[prescriptionKind(rx)].push(rx);
    }
    for (const kind of KIND_ORDER) {
      buckets[kind].sort(
        (a, b) => new Date(b.prescribed_at || 0).getTime() - new Date(a.prescribed_at || 0).getTime(),
      );
    }
    return buckets;
  }, [prescriptions]);

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
      <div className="hub-rx-history-list">
        {KIND_ORDER.map((kind) => {
          const rows = grouped[kind];
          if (rows.length === 0) return null;
          const group = KIND_GROUP[kind];
          return (
            <section key={kind} className="hub-rx-group" aria-label={`${group.title} — ${group.hint}`}>
              <header className="hub-rx-group__head">
                <h3 className="hub-rx-group__title">{group.title}</h3>
                <p className="hub-rx-group__hint">{group.hint}</p>
              </header>
              <ul className="hub-rx-cards">
                {rows.map((p) => {
                  const docs = docsByRx[p.id] ?? [];
                  const items = p.items ?? [];
                  return (
                    <li key={p.id} className={`hub-rx-card hub-rx-card--${kind}`}>
                      <div className="hub-rx-card__head">
                        <span className={`hub-rx-kind hub-rx-kind--${kind}`}>
                          {kind === 'clinic' ? <Stethoscope size={12} aria-hidden /> : <Home size={12} aria-hidden />}
                          {prescriptionKindLabel(kind)}
                        </span>
                        {p.prescribed_at ? (
                          <span className="hub-clientes__muted hub-rx-card__date">
                            {formatRxDateTime(p.prescribed_at)}
                          </span>
                        ) : null}
                      </div>

                      {items.length === 0 ? (
                        <p className="hub-rx-card__notes">{p.notes?.trim() || 'Sem medicamentos neste registro.'}</p>
                      ) : (
                        <ul className="hub-rx-card__meds">
                          {items.map((it, idx) => {
                            const facts = prescriptionItemFacts(it);
                            return (
                              <li key={it.id ?? `${p.id}-${idx}`} className="hub-rx-med">
                                <div className="hub-rx-med__name-row">
                                  <strong className="hub-rx-med__name">{it.medication_name}</strong>
                                  {kind === 'mixed' ? (
                                    <span className="hub-rx-kind hub-rx-kind--item">
                                      {prescriptionItemKindLabel(it)}
                                    </span>
                                  ) : null}
                                </div>
                                {facts.length > 0 ? (
                                  <dl className="hub-rx-med__facts">
                                    {facts.map((fact) => (
                                      <div key={`${fact.label}-${fact.value}`} className="hub-rx-med__fact">
                                        <dt>{fact.label}</dt>
                                        <dd>{fact.value}</dd>
                                      </div>
                                    ))}
                                  </dl>
                                ) : null}
                                {it.instructions ? (
                                  <p className="hub-rx-med__instructions">{it.instructions}</p>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {p.notes?.trim() && items.length > 0 ? (
                        <p className="hub-rx-card__notes">{p.notes.trim()}</p>
                      ) : null}

                      {loading && docs.length === 0 ? (
                        <p className="hub-clientes__muted hub-rx-card__docs-hint">Carregando emissões…</p>
                      ) : docs.length === 0 ? (
                        <div className="hub-rx-history__empty">
                          <p className="hub-clientes__muted hub-rx-card__docs-hint">{emptyDocsCopy(kind)}</p>
                          {kind !== 'clinic' ? (
                            <button
                              type="button"
                              className="hub-clientes__btn hub-clientes__btn--outline hub-clientes__btn--sm"
                              disabled={downloadingPdf}
                              onClick={() => void downloadPdf(p.id)}
                            >
                              {downloadingPdf ? 'Abrindo PDF…' : 'Abrir PDF'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                              disabled={downloadingPdf}
                              onClick={() => void downloadPdf(p.id)}
                            >
                              {downloadingPdf ? 'Abrindo PDF…' : 'Abrir PDF da prescrição'}
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="hub-rx-history">
                          <span className="hub-rx-card__docs-label">
                            {kind === 'clinic' ? 'Documentos da prescrição' : 'Receitas emitidas'}
                          </span>
                          <ul className="hub-rx-history__list">
                            {docs.map((d) => {
                              const publicLink =
                                d.validation_url ??
                                (d.public_url ? hubClinicalApi.publicPrescriptionLink(d.public_url) : '');
                              return (
                                <li key={d.id} className="hub-rx-history__item">
                                  <div>
                                    <strong>Versão {d.version_no}</strong>
                                    {d.validation_code ? ` · ${d.validation_code}` : ''}
                                    {d.issued_at ? ` — ${formatRxDateTime(d.issued_at)}` : ''}
                                    {d.issued_by_member?.full_name ? ` — ${d.issued_by_member.full_name}` : ''}
                                  </div>
                                  <div className="hub-rx-history__item-actions">
                                    <HubPrescriptionDocumentBadge status={d.document_status} />
                                    <button
                                      type="button"
                                      className="hub-clientes__btn hub-clientes__btn--outline hub-clientes__btn--sm"
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
                                          className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                                        >
                                          <ExternalLink size={14} /> Consultar
                                        </a>
                                        <button
                                          type="button"
                                          className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
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
            </section>
          );
        })}
      </div>

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
