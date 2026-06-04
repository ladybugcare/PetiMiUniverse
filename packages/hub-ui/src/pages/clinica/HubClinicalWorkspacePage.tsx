import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { useAlert } from '../../components/AlertProvider';
import '../clientes/clientes.css';
import {
  hubClinicalApi,
  hubEncountersApi,
  type HubEncounter,
  type HubEncounterEvent,
  type HubPrescription,
  type HubClinicalAttachment,
} from '../../api/hubClinicalApi';
import { hubInventoryApi, type HubInventoryItem } from '../../api/hubInventoryApi';
import { ComandaCheckoutDrawer } from '../finance/ComandaCheckoutDrawer';
import { getSelectedUnitId } from '../../utils/useSelectedUnitId';
import { formatEventAt, formatEventBody, formatEventTitle, formatPrescriptionLine, todayYmd } from './clinicalDisplay';
import { petAgeDetailedLabel } from '../pets/petAge';
import './clinica-page.css';

// ── Debounced auto-save ──────────────────────────────────────────────────────

function useDebouncedSave(
  encounterId: string | undefined,
  clinicId: string | null,
  canWrite: boolean,
  onSaved: () => void,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Record<string, unknown>>({});

  const flush = useCallback(async () => {
    if (!encounterId || !clinicId || !canWrite) return;
    const body = { ...pending.current, clinic_id: clinicId };
    if (Object.keys(body).length <= 1) return;
    pending.current = {};
    await hubEncountersApi.patch(encounterId, body);
    onSaved();
  }, [encounterId, clinicId, canWrite, onSaved]);

  const queue = useCallback(
    (patch: Record<string, unknown>) => {
      if (!canWrite) return;
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush().catch(() => {});
      }, 700);
    },
    [canWrite, flush],
  );

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { queue, flush };
}

// ── Seção colapsável ─────────────────────────────────────────────────────────

function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="hub-clinic-section">
      <button
        type="button"
        className="hub-clinic-section__header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="hub-clinic-section__title">{title}</span>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {open && <div className="hub-clinic-section__body">{children}</div>}
    </div>
  );
}

// ── Workspace principal ───────────────────────────────────────────────────────

const HubClinicalWorkspacePage: React.FC = () => {
  const { encounterId } = useParams<{ encounterId: string }>();
  const navigate = useNavigate();
  const clinicId = getStoredClinicId();
  const { showError, showSuccess } = useAlert();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('hub.clinic.write');
  const canCreateReceivable = hasPermission('hub.receivables.create');

  const [encounter, setEncounter] = useState<HubEncounter | null>(null);
  const [flags, setFlags] = useState<Array<{ flag_key: string; label: string }>>([]);
  const [events, setEvents] = useState<HubEncounterEvent[]>([]);
  const [evTitle, setEvTitle] = useState('');
  const [evBody, setEvBody] = useState('');
  const [saveHint, setSaveHint] = useState('');
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [templates, setTemplates] = useState<Array<Record<string, unknown>>>([]);
  const [templateId, setTemplateId] = useState('');

  // Amend (edição pós-finalização)
  const [amendOpen, setAmendOpen] = useState(false);
  const [amendReason, setAmendReason] = useState('');
  const [amending, setAmending] = useState(false);
  const [versions, setVersions] = useState<Array<{
    id: string;
    version_no: number;
    change_reason: string | null;
    created_at: string;
    changed_by_member: { id: string; full_name: string } | null;
  }>>([]);

  const onSaved = useCallback(() => {
    setSaveHint('Salvo');
    setTimeout(() => setSaveHint(''), 2000);
  }, []);

  const { queue } = useDebouncedSave(encounterId, clinicId, canWrite, onSaved);

  const load = useCallback(async () => {
    if (!clinicId || !encounterId) return;
    setLoading(true);
    try {
      const { encounter: enc } = await hubEncountersApi.get(encounterId, clinicId);
      setEncounter(enc);
      const [fl, ev] = await Promise.all([
        hubClinicalApi.listPetFlags(clinicId, enc.pet_id),
        hubClinicalApi.listEvents(clinicId, enc.pet_id),
      ]);
      setFlags(fl.flags ?? []);
      setEvents(ev.events ?? []);
      const tpl = await hubClinicalApi.listTemplates(clinicId);
      setTemplates(tpl.templates ?? []);
      if (enc.status === 'completed') {
        const vRes = await hubEncountersApi.getVersions(encounterId, clinicId);
        setVersions(vRes.versions ?? []);
      }
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar atendimento');
    } finally {
      setLoading(false);
    }
  }, [clinicId, encounterId, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchField = (key: string, value: unknown) => {
    setEncounter((prev) => (prev ? { ...prev, [key]: value } : prev));
    queue({ [key]: value });
  };

  const patchNested = (root: 'anamnesis' | 'physical_exam' | 'diagnosis', field: string, value: unknown) => {
    setEncounter((prev) => {
      if (!prev) return prev;
      const block = { ...(prev[root] as Record<string, unknown>), [field]: value };
      queue({ [root]: block });
      return { ...prev, [root]: block };
    });
  };

  const applyTemplate = async () => {
    if (!clinicId || !encounterId || !templateId || !canWrite || encounter?.status === 'completed') return;
    try {
      await hubClinicalApi.applyTemplate(encounterId, clinicId, templateId);
      await load();
      showSuccess('Template aplicado');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao aplicar template');
    }
  };

  const finish = async () => {
    if (!clinicId || !encounterId || !canWrite) return;
    setCompleting(true);
    try {
      const { encounter: enc } = await hubEncountersApi.complete(encounterId, clinicId);
      setEncounter(enc);
      showSuccess('Atendimento finalizado');
      navigate('/hub/clinica/atendimentos');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao finalizar');
    } finally {
      setCompleting(false);
    }
  };

  const handleAmend = async () => {
    if (!clinicId || !encounterId || !canWrite || !amendReason.trim()) return;
    setAmending(true);
    try {
      const { encounter: enc } = await hubEncountersApi.amend(encounterId, {
        clinic_id: clinicId,
        change_reason: amendReason.trim(),
        chief_complaint: encounter?.chief_complaint,
        summary_notes: encounter?.summary_notes,
        anamnesis: encounter?.anamnesis,
        physical_exam: encounter?.physical_exam,
        diagnosis: encounter?.diagnosis,
        hub_staff_member_id: encounter?.hub_staff_member_id,
      });
      setEncounter(enc);
      setAmendOpen(false);
      setAmendReason('');
      showSuccess('Atendimento atualizado com registro de alteração');
      await load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar alteração');
    } finally {
      setAmending(false);
    }
  };

  if (loading || !encounter) {
    return <p style={{ padding: 24 }}>{loading ? 'Carregando atendimento…' : 'Atendimento não encontrado.'}</p>;
  }

  const pet = encounter.pet;
  const pe = (encounter.physical_exam || {}) as Record<string, unknown>;
  const an = (encounter.anamnesis || {}) as Record<string, unknown>;
  const dx = (encounter.diagnosis || {}) as Record<string, unknown>;
  const weight = pe.weight_kg != null && pe.weight_kg !== '' ? `${pe.weight_kg} kg` : '—';
  const readOnly = !canWrite || encounter.status === 'completed';
  const clinicalCheckoutUnitId = encounter.unit_id ?? getSelectedUnitId();

  return (
    <>
      <div className="hub-clientes hub-clinic-workspace">
        <Link
          to="/hub/clinica/atendimentos"
          className="hub-clientes__btn hub-clientes__btn--ghost hub-clinic-workspace__back"
        >
          <ArrowLeft size={16} /> Voltar à fila
        </Link>

        {/* Cabeçalho do pet */}
        <header className="hub-clinic-pet-header">
          <h2 className="hub-clinic-pet-header__name">{pet?.name || 'Pet'}</h2>
          {encounter.case && (
            <p className="hub-clinic-pet-header__case">
              Caso clínico:{' '}
              <Link to={`/hub/clinica/casos/${encounter.hub_case_id}`} className="hub-clientes__link">
                {encounter.case.title}
              </Link>
              <span className={`hub-clinic-cases__badge hub-clinic-cases__badge--${encounter.case.status}`} style={{ marginLeft: 8 }}>
                {encounter.case.status === 'active' && 'Ativo'}
                {encounter.case.status === 'monitoring' && 'Monitoramento'}
                {encounter.case.status === 'resolved' && 'Resolvido'}
                {encounter.case.status === 'cancelled' && 'Cancelado'}
              </span>
            </p>
          )}
          <div className="hub-clinic-pet-header__grid">
            <span>Espécie: {pet?.species || '—'}</span>
            <span>Raça: {pet?.breed || '—'}</span>
            <span>Porte: {pet?.size_tier || '—'}</span>
            <span>Idade: {petAgeDetailedLabel(pet?.birth_date ?? null)}</span>
            <span>Peso (exame): {weight}</span>
            <span>Tutor: {encounter.guardian?.full_name || '—'}</span>
            <span>Profissional: {encounter.staff_member?.full_name || '—'}</span>
          </div>
          {flags.length > 0 && (
            <div className="hub-clinic-pet-header__alerts">
              {flags.map((f) => (
                <span key={f.flag_key} className="hub-clinic-alert-chip">
                  {f.label}
                </span>
              ))}
            </div>
          )}
          {canWrite && encounter.status !== 'completed' && templates.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={{ padding: 8, minWidth: 180 }}>
                <option value="">Aplicar template…</option>
                {templates.map((t) => (
                  <option key={String(t.id)} value={String(t.id)}>
                    {String(t.name)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="hub-clinic-btn hub-clinic-btn--ghost"
                disabled={!templateId}
                onClick={() => void applyTemplate()}
              >
                Aplicar
              </button>
            </div>
          )}

          {encounter.status === 'completed' && (
            <div className="hub-clinic-workspace__completed-banner">
              <span>Atendimento finalizado em {encounter.completed_at ? new Date(encounter.completed_at).toLocaleDateString('pt-BR') : '—'}</span>
              {canWrite && (
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                  onClick={() => setAmendOpen(true)}
                >
                  Editar com motivo
                </button>
              )}
            </div>
          )}
        </header>

        {/* Seções colapsáveis */}
        <div className="hub-clinic-sections">
          <Section title="Queixa principal e resumo" defaultOpen>
            <div className="hub-clinic-field">
              <label htmlFor="chief_complaint">Queixa principal</label>
              <textarea
                id="chief_complaint"
                value={encounter.chief_complaint || ''}
                disabled={readOnly}
                onChange={(e) => patchField('chief_complaint', e.target.value || null)}
              />
            </div>
            <div className="hub-clinic-field">
              <label htmlFor="summary_notes">Resumo / evolução do caso</label>
              <textarea
                id="summary_notes"
                value={encounter.summary_notes || ''}
                disabled={readOnly}
                onChange={(e) => patchField('summary_notes', e.target.value || null)}
              />
            </div>
          </Section>

          <Section title="Anamnese">
            {(['history', 'diet', 'behavior', 'medications', 'chief_complaint_detail'] as const).map((field) => (
              <div key={field} className="hub-clinic-field">
                <label htmlFor={`an_${field}`}>
                  {field === 'history' ? 'Histórico'
                    : field === 'diet' ? 'Alimentação'
                    : field === 'behavior' ? 'Comportamento'
                    : field === 'medications' ? 'Medicamentos em uso'
                    : 'Detalhe da queixa'}
                </label>
                <textarea
                  id={`an_${field}`}
                  value={String(an[field] ?? '')}
                  disabled={readOnly}
                  onChange={(e) => patchNested('anamnesis', field, e.target.value)}
                />
              </div>
            ))}
          </Section>

          <Section title="Exame físico">
            {(
              [
                ['weight_kg', 'Peso (kg)'],
                ['temperature_c', 'Temperatura (°C)'],
                ['heart_rate', 'FC (bpm)'],
                ['respiratory_rate', 'FR (irpm)'],
                ['hydration', 'Hidratação'],
                ['mucosa', 'Mucosas'],
              ] as const
            ).map(([field, label]) => (
              <div key={field} className="hub-clinic-field">
                <label htmlFor={`pe_${field}`}>{label}</label>
                <input
                  id={`pe_${field}`}
                  type="text"
                  value={String(pe[field] ?? '')}
                  disabled={readOnly}
                  onChange={(e) => patchNested('physical_exam', field, e.target.value)}
                />
              </div>
            ))}
            <div className="hub-clinic-field">
              <label htmlFor="pe_notes">Observações do exame</label>
              <textarea
                id="pe_notes"
                value={String(pe.notes ?? '')}
                disabled={readOnly}
                onChange={(e) => patchNested('physical_exam', 'notes', e.target.value)}
              />
            </div>
          </Section>

          <Section title="Diagnóstico">
            <div className="hub-clinic-field">
              <label htmlFor="dx_suspicions">Hipóteses / suspeitas</label>
              <textarea
                id="dx_suspicions"
                value={String(dx.suspicions ?? '')}
                disabled={readOnly}
                onChange={(e) => patchNested('diagnosis', 'suspicions', e.target.value)}
              />
            </div>
            <div className="hub-clinic-field">
              <label htmlFor="dx_conclusion">Conclusão</label>
              <textarea
                id="dx_conclusion"
                value={String(dx.conclusion ?? '')}
                disabled={readOnly}
                onChange={(e) => patchNested('diagnosis', 'conclusion', e.target.value)}
              />
            </div>
          </Section>

          <Section title="Evolução clínica">
            {!readOnly && (
              <div className="hub-clientes__form-stack" style={{ marginBottom: 16 }}>
                <label className="hub-clientes__label" htmlFor="ev_title">
                  Título da evolução
                </label>
                <input
                  id="ev_title"
                  className="hub-clientes__input"
                  value={evTitle}
                  onChange={(e) => setEvTitle(e.target.value)}
                />
                <label className="hub-clientes__label" htmlFor="ev_body">
                  Texto
                </label>
                <textarea
                  id="ev_body"
                  className="hub-clientes__textarea"
                  rows={3}
                  value={evBody}
                  onChange={(e) => setEvBody(e.target.value)}
                />
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                  disabled={!evTitle.trim()}
                  onClick={() => {
                    if (!clinicId || !encounter) return;
                    void hubClinicalApi
                      .createEvent({
                        clinic_id: clinicId,
                        pet_id: encounter.pet_id,
                        hub_encounter_id: encounter.id,
                        event_type: 'note',
                        title: evTitle.trim(),
                        body: evBody.trim() || null,
                      })
                      .then((r) => {
                        setEvents((prev) => [r.event, ...prev]);
                        setEvTitle('');
                        setEvBody('');
                        showSuccess('Evolução registrada');
                      })
                      .catch((e: unknown) => showError((e as Error)?.message || 'Erro ao salvar evolução'));
                  }}
                >
                  Registrar evolução
                </button>
              </div>
            )}
            <div className="hub-clinic-timeline">
              {events.length === 0 ? (
                <p className="hub-clientes__muted">Sem eventos registrados ainda.</p>
              ) : (
                events.map((ev) => (
                  <div key={ev.id} className="hub-clinic-timeline__item">
                    <strong>{formatEventTitle(ev)}</strong>
                    {formatEventBody(ev) ? <p className="hub-clinic-timeline__body">{formatEventBody(ev)}</p> : null}
                    <small className="hub-clientes__muted">{formatEventAt(ev)}</small>
                  </div>
                ))
              )}
            </div>
          </Section>

          <Section title="Prescrições">
            <HubWorkspacePrescriptions encounter={encounter} clinicId={clinicId!} readOnly={readOnly} />
          </Section>

          <Section title="Vacinas aplicadas">
            <HubWorkspaceVaccinations encounter={encounter} clinicId={clinicId!} readOnly={readOnly} />
          </Section>

          <Section title="Exames e anexos">
            <HubWorkspaceAttachments encounter={encounter} clinicId={clinicId!} readOnly={readOnly} />
          </Section>

          {versions.length > 0 && (
            <Section title={`Histórico de alterações (${versions.length})`}>
              <ul className="hub-clinic-records__list">
                {versions.map((v) => (
                  <li key={v.id}>
                    <strong>v{v.version_no}</strong>
                    {' — '}
                    {v.change_reason || '(sem motivo informado)'}
                    {v.changed_by_member ? ` · ${v.changed_by_member.full_name}` : ''}
                    <small className="hub-clientes__muted" style={{ marginLeft: 8 }}>
                      {new Date(v.created_at).toLocaleString('pt-BR')}
                    </small>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <footer className="hub-clinic-workspace__footer">
          <span className="hub-clinic-save-hint">{saveHint}</span>
          {canCreateReceivable ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost"
              disabled={!clinicalCheckoutUnitId}
              title={
                clinicalCheckoutUnitId
                  ? 'Conferir itens e registrar pagamento ou pendência'
                  : 'Selecione uma unidade no cabeçalho para usar dinheiro no caixa.'
              }
              onClick={() => {
                if (!clinicalCheckoutUnitId) {
                  showError('Selecione uma unidade no cabeçalho para abrir o checkout.');
                  return;
                }
                setCheckoutOpen(true);
              }}
            >
              Abrir checkout
            </button>
          ) : null}
          {canWrite && encounter.status !== 'completed' && (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              disabled={completing}
              onClick={() => void finish()}
            >
              {completing ? 'Finalizando…' : 'Finalizar atendimento'}
            </button>
          )}
        </footer>
      </div>

      {/* Modal de emenda (edição pós-finalização) */}
      {amendOpen && (
        <div className="hub-clinic-amend-overlay">
          <div className="hub-clinic-amend-modal">
            <h3>Editar atendimento finalizado</h3>
            <p className="hub-clientes__muted">
              Este atendimento foi finalizado. Informe o motivo da alteração para continuar.
            </p>
            <label className="hub-clientes__label" htmlFor="amend_reason">
              Motivo da alteração <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <textarea
              id="amend_reason"
              className="hub-clientes__textarea"
              rows={3}
              value={amendReason}
              onChange={(e) => setAmendReason(e.target.value)}
              placeholder="Ex.: Correção de diagnóstico após resultado de exame"
            />
            <div className="hub-clinic-amend-modal__footer">
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost"
                onClick={() => { setAmendOpen(false); setAmendReason(''); }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary"
                disabled={amending || !amendReason.trim()}
                onClick={() => void handleAmend()}
              >
                {amending ? 'Salvando…' : 'Salvar com motivo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {clinicId && checkoutOpen && clinicalCheckoutUnitId ? (
        <ComandaCheckoutDrawer
          open={checkoutOpen}
          onClose={() => setCheckoutOpen(false)}
          clinicId={clinicId}
          unitId={clinicalCheckoutUnitId}
          originType="encounter"
          originId={encounter.id}
          onSuccess={() => {
            showSuccess('Checkout concluído.');
            setCheckoutOpen(false);
            void load();
          }}
        />
      ) : null}
    </>
  );
};

// ── Sub-componentes ───────────────────────────────────────────────────────────

function HubWorkspacePrescriptions({
  encounter,
  clinicId,
  readOnly,
}: {
  encounter: HubEncounter;
  clinicId: string;
  readOnly: boolean;
}) {
  const { showError } = useAlert();
  const [items, setItems] = useState<HubPrescription[]>([]);
  const [med, setMed] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');
  const [duration, setDuration] = useState('');
  const [inventoryId, setInventoryId] = useState('');
  const [medicationItems, setMedicationItems] = useState<HubInventoryItem[]>([]);

  useEffect(() => {
    void hubClinicalApi.listPrescriptions(clinicId, encounter.pet_id).then((r) => setItems(r.prescriptions ?? []));
    void hubInventoryApi.items
      .list(clinicId, false, 'medication')
      .then((r) => setMedicationItems(r.items ?? []))
      .catch(() => setMedicationItems([]));
  }, [clinicId, encounter.pet_id]);

  const add = async () => {
    if (!med.trim()) return;
    try {
      await hubClinicalApi.createPrescription({
        clinic_id: clinicId,
        hub_encounter_id: encounter.id,
        pet_id: encounter.pet_id,
        hub_staff_member_id: encounter.hub_staff_member_id,
        items: [
          {
            medication_name: med.trim(),
            dosage: dosage.trim() || null,
            frequency: frequency.trim() || null,
            duration: duration.trim() || null,
            instructions: null,
            hub_inventory_item_id: inventoryId || null,
          },
        ],
      });
      setMed('');
      setDosage('');
      setFrequency('');
      setDuration('');
      setInventoryId('');
      const r = await hubClinicalApi.listPrescriptions(clinicId, encounter.pet_id);
      setItems(r.prescriptions ?? []);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao criar prescrição');
    }
  };

  return (
    <>
      {!readOnly && (
        <div className="hub-clientes__form-stack" style={{ marginBottom: 16 }}>
          <input className="hub-clientes__input" placeholder="Medicamento" value={med} onChange={(e) => setMed(e.target.value)} />
          <input className="hub-clientes__input" placeholder="Dosagem" value={dosage} onChange={(e) => setDosage(e.target.value)} />
          <input className="hub-clientes__input" placeholder="Frequência" value={frequency} onChange={(e) => setFrequency(e.target.value)} />
          <input className="hub-clientes__input" placeholder="Duração" value={duration} onChange={(e) => setDuration(e.target.value)} />
          {medicationItems.length > 0 ? (
            <select className="hub-clientes__input" value={inventoryId} onChange={(e) => setInventoryId(e.target.value)}>
              <option value="">Item de estoque (opcional)</option>
              {medicationItems.map((it) => (
                <option key={it.id} value={it.id}>{it.name}</option>
              ))}
            </select>
          ) : null}
          <button type="button" className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm" onClick={() => void add()}>
            Adicionar
          </button>
        </div>
      )}
      <ul className="hub-clinic-records__list">
        {items
          .filter((p) => p.hub_encounter_id === encounter.id)
          .map((p) => (
            <li key={p.id}>{formatPrescriptionLine(p)}</li>
          ))}
      </ul>
    </>
  );
}

function HubWorkspaceVaccinations({
  encounter,
  clinicId,
  readOnly,
}: {
  encounter: HubEncounter;
  clinicId: string;
  readOnly: boolean;
}) {
  const { showError } = useAlert();
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [vaccine, setVaccine] = useState('');
  const [batch, setBatch] = useState('');

  useEffect(() => {
    void hubClinicalApi.listVaccinations(clinicId, encounter.pet_id).then((r) => setItems(r.vaccinations ?? []));
  }, [clinicId, encounter.pet_id]);

  const add = async () => {
    if (!vaccine.trim()) return;
    try {
      await hubClinicalApi.createVaccination({
        clinic_id: clinicId,
        pet_id: encounter.pet_id,
        hub_encounter_id: encounter.id,
        vaccine_name: vaccine,
        batch_number: batch || undefined,
        administered_at: todayYmd(),
      });
      setVaccine('');
      setBatch('');
      const r = await hubClinicalApi.listVaccinations(clinicId, encounter.pet_id);
      setItems(r.vaccinations ?? []);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registar vacina');
    }
  };

  return (
    <>
      {!readOnly && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <input placeholder="Vacina" value={vaccine} onChange={(e) => setVaccine(e.target.value)} />
          <input placeholder="Lote" value={batch} onChange={(e) => setBatch(e.target.value)} />
          <button type="button" className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm" onClick={() => void add()}>
            Registrar
          </button>
        </div>
      )}
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {items.map((v) => (
          <li key={String(v.id)}>
            {String(v.vaccine_name)} — {String(v.administered_at || '').slice(0, 10)}
          </li>
        ))}
      </ul>
    </>
  );
}

function HubWorkspaceAttachments({
  encounter,
  clinicId,
  readOnly,
}: {
  encounter: HubEncounter;
  clinicId: string;
  readOnly: boolean;
}) {
  const { showError } = useAlert();
  const [items, setItems] = useState<HubClinicalAttachment[]>([]);
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);

  const reload = () =>
    hubClinicalApi.listAttachments(clinicId, { encounterId: encounter.id }).then((r) => setItems(r.attachments ?? []));

  useEffect(() => {
    void reload();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId, encounter.id]);

  const onFile = async (file: File | null) => {
    if (!file || readOnly) return;
    setUploading(true);
    try {
      await hubClinicalApi.uploadAttachmentFile({
        clinicId,
        petId: encounter.pet_id,
        encounterId: encounter.id,
        file,
        title: title.trim() || file.name,
      });
      setTitle('');
      await reload();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao enviar exame');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {!readOnly && (
        <div className="hub-clientes__form-stack" style={{ marginBottom: 16, maxWidth: 480 }}>
          <input
            className="hub-clientes__input"
            placeholder="Título do exame"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            disabled={uploading}
          />
          {uploading ? <p className="hub-clientes__muted">Enviando arquivo…</p> : null}
        </div>
      )}
      <ul className="hub-clinic-records__list">
        {items.map((a) => (
          <li key={a.id}>
            <a href={a.storage_path} target="_blank" rel="noreferrer">
              {a.title || a.file_name}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

export default HubClinicalWorkspacePage;
