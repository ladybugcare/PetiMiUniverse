import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { useAlert } from '../../components/AlertProvider';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { hubClinicalApi, type HubSurgery, type HubAnestheticRisk } from '../../api/hubClinicalApi';
import { hubPetsApi, type HubPet } from '../../api/hubPetsApi';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubCancelButton } from '../../components/HubCancelButton';
import ClinicalCaseLinkFields, {
  type ClinicalCaseLinkValue,
  isCaseLinkResolved,
} from '../../components/clinical/ClinicalCaseLinkFields';

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Agendada',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

const ASA_OPTIONS: { value: HubAnestheticRisk; label: string }[] = [
  { value: 'I', label: 'I — Saudável' },
  { value: 'II', label: 'II — Doença sistêmica leve' },
  { value: 'III', label: 'III — Doença sistêmica grave' },
  { value: 'IV', label: 'IV — Risco de vida' },
  { value: 'V', label: 'V — Moribundo' },
  { value: 'VI', label: 'VI — Morte encefálica / doador' },
  { value: 'E', label: 'E — Emergência' },
];

type DetailPanel = {
  surgery: HubSurgery;
  tab: 'pre_op' | 'procedure' | 'team' | 'post_op';
};

export type HubClinicSurgeriesPageProps = {
  /** Lista embutida no Consultório (sem botão primário de criação). */
  embedded?: boolean;
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
  presetPetId?: string | null;
  presetCaseId?: string | null;
};

const HubClinicSurgeriesPage: React.FC<HubClinicSurgeriesPageProps> = ({
  embedded = false,
  createOpen: createOpenProp,
  onCreateOpenChange,
  presetPetId,
  presetCaseId,
}) => {
  const clinicId = getStoredClinicId();
  const { showError, showSuccess } = useAlert();
  const { hasPermission } = usePermissions();
  const [searchParams] = useSearchParams();
  const canRead = hasPermission('hub.clinic.read');
  const canWrite = hasPermission('hub.clinic.write');
  const [rows, setRows] = useState<HubSurgery[]>([]);
  const [createOpenInternal, setCreateOpenInternal] = useState(false);
  const createControlled = createOpenProp !== undefined;
  const createOpen = createControlled ? Boolean(createOpenProp) : createOpenInternal;
  const setCreateOpen = (open: boolean) => {
    onCreateOpenChange?.(open);
    if (!createControlled) setCreateOpenInternal(open);
  };
  const [detail, setDetail] = useState<DetailPanel | null>(null);
  const [pets, setPets] = useState<HubPet[]>([]);

  // Create form state
  const [petId, setPetId] = useState('');
  const [title, setTitle] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [asaRisk, setAsaRisk] = useState<HubAnestheticRisk | ''>('');
  const [preOpNotes, setPreOpNotes] = useState('');
  const [caseLink, setCaseLink] = useState<ClinicalCaseLinkValue>({});
  const [hasActiveCases, setHasActiveCases] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Detail edit state
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailRaw, setDetailRaw] = useState('');

  // Link-case for orphan surgeries
  const [linkCaseSurg, setLinkCaseSurg] = useState<HubSurgery | null>(null);
  const [linkCaseValue, setLinkCaseValue] = useState<ClinicalCaseLinkValue>({});
  const [linkCaseHasActive, setLinkCaseHasActive] = useState(false);
  const [linkCaseSubmitting, setLinkCaseSubmitting] = useState(false);

  const reload = () => {
    if (!clinicId) return Promise.resolve();
    return hubClinicalApi.listSurgeries(clinicId).then((r) => setRows(r.surgeries ?? []));
  };

  useEffect(() => {
    if (!clinicId || !canRead) return;
    void reload().catch(() => setRows([]));
  }, [clinicId, canRead]);

  useEffect(() => {
    if (!clinicId || !createOpen) return;
    void hubPetsApi.list(clinicId).then((r) => setPets(r.pets ?? [])).catch(() => setPets([]));
  }, [clinicId, createOpen]);

  useEffect(() => {
    if (!detail) return;
    const s = detail.surgery;
    const tab = detail.tab;
    let val: unknown = {};
    if (tab === 'pre_op') val = s.pre_op ?? {};
    else if (tab === 'procedure') val = s.procedure ?? {};
    else if (tab === 'team') val = s.team ?? [];
    else if (tab === 'post_op') val = s.post_op ?? {};
    setDetailRaw(JSON.stringify(val, null, 2));
  }, [detail?.tab, detail?.surgery.id]);

  // Prefill: props do Consultório ou query em rota legada standalone.
  useEffect(() => {
    if (presetPetId) setPetId(presetPetId);
    if (presetCaseId) setCaseLink({ hub_case_id: presetCaseId });
  }, [presetPetId, presetCaseId, createOpen]);

  useEffect(() => {
    if (embedded) return;
    const qPet = searchParams.get('pet_id');
    const qCase = searchParams.get('hub_case_id');
    if (!qPet && !qCase) return;
    setCreateOpen(true);
    if (qPet) setPetId(qPet);
    if (qCase) setCaseLink({ hub_case_id: qCase });
  }, []);

  const petOptions: HubComboboxOption[] = useMemo(
    () => pets.map((p) => ({ value: p.id, label: p.name })),
    [pets],
  );

  const resetCreateForm = () => {
    setPetId('');
    setTitle('');
    setScheduledAt('');
    setAsaRisk('');
    setPreOpNotes('');
    setCaseLink({});
    setHasActiveCases(false);
  };

  const create = async () => {
    if (!clinicId || !petId || !title.trim()) return;
    if (!isCaseLinkResolved(caseLink, hasActiveCases)) {
      showError('Selecione um caso clínico ou escolha criar um novo antes de continuar.');
      return;
    }
    setSubmitting(true);
    try {
      await hubClinicalApi.createSurgery({
        clinic_id: clinicId,
        pet_id: petId,
        title: title.trim(),
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        anesthetic_risk: asaRisk || null,
        pre_op: preOpNotes.trim() ? { notes: preOpNotes.trim() } : {},
        ...caseLink,
      });
      setCreateOpen(false);
      resetCreateForm();
      await reload();
      showSuccess('Cirurgia agendada');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao criar cirurgia');
    } finally {
      setSubmitting(false);
    }
  };

  const patchStatus = async (id: string, status: string) => {
    if (!clinicId) return;
    try {
      await hubClinicalApi.patchSurgery(id, { clinic_id: clinicId, status });
      await reload();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao atualizar cirurgia');
    }
  };

  const saveDetailTab = async () => {
    if (!detail || !clinicId) return;
    setDetailSaving(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(detailRaw);
      } catch {
        showError('JSON inválido. Verifique a formatação.');
        setDetailSaving(false);
        return;
      }
      await hubClinicalApi.patchSurgery(detail.surgery.id, {
        clinic_id: clinicId,
        [detail.tab]: parsed,
      });
      await reload();
      showSuccess('Salvo');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar');
    } finally {
      setDetailSaving(false);
    }
  };

  const confirmLinkCase = async () => {
    if (!clinicId || !linkCaseSurg) return;
    if (!isCaseLinkResolved(linkCaseValue, linkCaseHasActive)) {
      showError('Selecione um caso clínico ou escolha criar um novo.');
      return;
    }
    setLinkCaseSubmitting(true);
    try {
      await hubClinicalApi.patchSurgery(linkCaseSurg.id, {
        clinic_id: clinicId,
        ...linkCaseValue,
      });
      setLinkCaseSurg(null);
      setLinkCaseValue({});
      await reload();
      showSuccess('Cirurgia vinculada ao caso');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao vincular caso');
    } finally {
      setLinkCaseSubmitting(false);
    }
  };

  const openDetail = (surgery: HubSurgery) => {
    setDetail({ surgery, tab: 'pre_op' });
  };

  const canSubmitCreate = !!petId && !!title.trim() && !submitting && isCaseLinkResolved(caseLink, hasActiveCases);

  const visibleRows = useMemo(() => {
    if (!embedded) return rows;
    return rows.filter((s) => s.status === 'scheduled' || s.status === 'in_progress');
  }, [rows, embedded]);

  if (!canRead) {
    return <p className="hub-clientes__muted hub-clinic-page__pad">Sem permissão.</p>;
  }

  return (
    <div className={`hub-clinic-surgeries${embedded ? ' hub-clinic-surgeries--embedded' : ''}`}>
      {canWrite && !embedded && (
        <div className="hub-clientes__toolbar">
          <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={() => setCreateOpen(true)}>
            Nova cirurgia
          </button>
        </div>
      )}

      <div className="hub-clientes__table-wrap">
        <table className="hub-clientes__table">
          <thead>
            <tr>
              <th>Procedimento</th>
              <th>Status</th>
              <th>Agendada</th>
              <th>Pet</th>
              <th>Risco ASA</th>
              <th>Caso</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="hub-clientes__muted" style={{ textAlign: 'center', padding: 28 }}>
                  {embedded ? 'Nenhuma cirurgia em andamento ou agendada.' : 'Nenhuma cirurgia registrada.'}
                </td>
              </tr>
            ) : (
              visibleRows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <button
                      type="button"
                      className="hub-clientes__link"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                      onClick={() => openDetail(s)}
                    >
                      {s.title}
                    </button>
                  </td>
                  <td>{STATUS_LABEL[s.status] || s.status}</td>
                  <td>{s.scheduled_at ? String(s.scheduled_at).slice(0, 16).replace('T', ' ') : '—'}</td>
                  <td>{s.hub_pets?.name || s.pet_id}</td>
                  <td>{s.anesthetic_risk ? `ASA ${s.anesthetic_risk}` : '—'}</td>
                  <td>
                    {s.hub_case_id ? (
                      <span style={{ color: 'var(--color-success, green)', fontSize: 12 }}>Vinculado</span>
                    ) : (
                      <span style={{ color: 'var(--color-warning, #b45309)', fontSize: 12 }}>Sem caso</span>
                    )}
                  </td>
                  <td style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {canWrite && s.status === 'scheduled' ? (
                      <button
                        type="button"
                        className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                        onClick={() => void patchStatus(s.id, 'in_progress')}
                      >
                        Iniciar
                      </button>
                    ) : null}
                    {canWrite && s.status === 'in_progress' ? (
                      <button
                        type="button"
                        className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                        onClick={() => void patchStatus(s.id, 'completed')}
                      >
                        Concluir
                      </button>
                    ) : null}
                    {canWrite && !s.hub_case_id && (
                      <button
                        type="button"
                        className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                        onClick={() => { setLinkCaseSurg(s); setLinkCaseValue({}); setLinkCaseHasActive(false); }}
                      >
                        Vincular caso
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Painel de criação */}
      <HubSidePanel
        open={createOpen}
        onClose={() => { setCreateOpen(false); resetCreateForm(); }}
        title="Nova cirurgia"
        footer={
          <div className="hub-clientes__panel-footer">
            <HubCancelButton onClick={() => { setCreateOpen(false); resetCreateForm(); }} />
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              disabled={!canSubmitCreate}
              onClick={() => void create()}
            >
              {submitting ? 'Salvando…' : 'Agendar'}
            </button>
          </div>
        }
      >
        <div className="hub-clientes__form-stack">
          <span className="hub-clientes__label">Pet</span>
          <HubSearchableCombobox
            id="clinic-surgery-pet"
            className="hub-combobox--clientes"
            options={petOptions}
            value={petId}
            onChange={(v) => { setPetId(v); setCaseLink({}); setHasActiveCases(false); }}
            placeholder="Buscar pet…"
          />
          {clinicId && petId && (
            <ClinicalCaseLinkFields
              clinicId={clinicId}
              petId={petId}
              value={caseLink}
              onChange={(v) => setCaseLink(v)}
              onHasActiveCases={setHasActiveCases}
              disabled={submitting}
            />
          )}
          <span className="hub-clientes__label">Procedimento</span>
          <input className="hub-clientes__input" value={title} onChange={(e) => setTitle(e.target.value)} />
          <span className="hub-clientes__label">Data e hora</span>
          <input
            type="datetime-local"
            className="hub-clientes__input"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
          <span className="hub-clientes__label">Risco anestésico (ASA)</span>
          <select
            className="hub-clientes__input"
            value={asaRisk}
            onChange={(e) => setAsaRisk(e.target.value as HubAnestheticRisk | '')}
          >
            <option value="">Não classificado</option>
            {ASA_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span className="hub-clientes__label">Notas pré-operatórias</span>
          <textarea
            className="hub-clientes__textarea"
            rows={3}
            placeholder="Jejum, medicações, exames pré-op…"
            value={preOpNotes}
            onChange={(e) => setPreOpNotes(e.target.value)}
          />
        </div>
      </HubSidePanel>

      {/* Painel de vincular caso (órfão) */}
      <HubSidePanel
        open={!!linkCaseSurg}
        onClose={() => { setLinkCaseSurg(null); setLinkCaseValue({}); }}
        title={`Vincular caso — ${linkCaseSurg?.title ?? 'Cirurgia'}`}
        footer={
          <div className="hub-clientes__panel-footer">
            <HubCancelButton onClick={() => { setLinkCaseSurg(null); setLinkCaseValue({}); }} />
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              disabled={linkCaseSubmitting || !isCaseLinkResolved(linkCaseValue, linkCaseHasActive)}
              onClick={() => void confirmLinkCase()}
            >
              {linkCaseSubmitting ? 'Salvando…' : 'Vincular'}
            </button>
          </div>
        }
      >
        <div className="hub-clientes__form-stack">
          {clinicId && linkCaseSurg && (
            <ClinicalCaseLinkFields
              clinicId={clinicId}
              petId={linkCaseSurg.pet_id}
              value={linkCaseValue}
              onChange={(v) => {
                setLinkCaseValue(v);
                setLinkCaseHasActive(true);
              }}
              disabled={linkCaseSubmitting}
            />
          )}
        </div>
      </HubSidePanel>

      {/* Painel de detalhes / edição de seções */}
      <HubSidePanel
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.surgery.title ?? 'Cirurgia'}
        footer={
          canWrite ? (
            <div className="hub-clientes__panel-footer">
              <HubCancelButton onClick={() => setDetail(null)} />
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary"
                disabled={detailSaving}
                onClick={() => void saveDetailTab()}
              >
                {detailSaving ? 'Salvando…' : 'Salvar seção'}
              </button>
            </div>
          ) : null
        }
      >
        {detail && (
          <div className="hub-clientes__form-stack">
            {/* CTA pós-op: disponível em andamento ou concluída */}
            {canWrite && (detail.surgery.status === 'in_progress' || detail.surgery.status === 'completed') && (
              <Link
                to={`/hub/clinica?admit=1&pet_id=${encodeURIComponent(detail.surgery.pet_id)}${detail.surgery.hub_case_id ? `&hub_case_id=${encodeURIComponent(detail.surgery.hub_case_id)}` : ''}`}
                className="hub-clientes__btn hub-clientes__btn--ghost"
                style={{ marginBottom: 8, display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}
              >
                Internar pós-operatório
              </Link>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {(['pre_op', 'procedure', 'team', 'post_op'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`hub-clientes__btn hub-clientes__btn--${detail.tab === tab ? 'primary' : 'ghost'} hub-clientes__btn--sm`}
                  onClick={() => setDetail((d) => d ? { ...d, tab } : d)}
                >
                  {{ pre_op: 'Pré-op', procedure: 'Procedimento', team: 'Equipe', post_op: 'Pós-op' }[tab]}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-muted, #888)', margin: '0 0 4px' }}>
              Edite o JSON abaixo. Os campos são livres — use os que fizer sentido para o caso.
            </p>
            <textarea
              className="hub-clientes__textarea"
              rows={16}
              style={{ fontFamily: 'monospace', fontSize: 13 }}
              value={detailRaw}
              onChange={(e) => setDetailRaw(e.target.value)}
              readOnly={!canWrite}
            />
            {detail.surgery.anesthetic_risk && (
              <p style={{ fontSize: 12, marginTop: 4 }}>
                <strong>Risco ASA:</strong> {detail.surgery.anesthetic_risk}
              </p>
            )}
          </div>
        )}
      </HubSidePanel>
    </div>
  );
};

export default HubClinicSurgeriesPage;
