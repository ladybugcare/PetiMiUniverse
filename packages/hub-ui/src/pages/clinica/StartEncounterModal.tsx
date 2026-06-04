import React, { useEffect, useMemo, useState } from 'react';
import { Stethoscope, Folder, FolderPlus, AlertTriangle, Dog, User, Clock } from 'lucide-react';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubCancelButton } from '../../components/HubCancelButton';
import { hubClinicalCasesApi, type HubClinicalCase, type DayBoardItem } from '../../api/hubClinicalApi';
import '../agenda/new-appointment-modal.css';

type StartOpts = {
  hub_case_id?: string | null;
  create_new_case?: boolean;
  new_case_title?: string | null;
};

type Props = {
  open: boolean;
  clinicId: string;
  item: DayBoardItem | null;
  onClose: () => void;
  onStart: (item: DayBoardItem, opts: StartOpts) => Promise<void>;
  starting: boolean;
};

function formatTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const StartEncounterModal: React.FC<Props> = ({ open, clinicId, item, onClose, onStart, starting }) => {
  const [activeCases, setActiveCases] = useState<HubClinicalCase[]>([]);
  const [loadingCases, setLoadingCases] = useState(false);
  const [caseMode, setCaseMode] = useState<'auto' | 'existing' | 'new'>('auto');
  const [selectedCaseId, setSelectedCaseId] = useState('');

  const petId = item?.pet_id ?? null;
  const isEmergency =
    item?.appointment_kind === 'clinical_emergency' ||
    (item?.kind === 'appointment_slot' && !petId);

  useEffect(() => {
    if (!open || !item) {
      setActiveCases([]);
      setCaseMode('auto');
      setSelectedCaseId('');
      return;
    }
    if (!petId || !clinicId) {
      setActiveCases([]);
      setCaseMode('auto');
      setSelectedCaseId('');
      return;
    }
    setLoadingCases(true);
    void hubClinicalCasesApi
      .list(clinicId, { petId: petId ?? undefined })
      .then((r) => {
        const rows = (r.cases ?? []).filter((c) => c.status === 'active' || c.status === 'monitoring');
        setActiveCases(rows);
        setCaseMode(rows.length > 0 ? 'existing' : 'auto');
        setSelectedCaseId(rows.length === 1 ? rows[0]!.id : '');
      })
      .catch(() => setActiveCases([]))
      .finally(() => setLoadingCases(false));
  }, [open, item, petId, clinicId]);

  const caseOptions: HubComboboxOption[] = useMemo(
    () => activeCases.map((c) => ({ value: c.id, label: c.title })),
    [activeCases],
  );

  const canStart =
    !starting &&
    !(caseMode === 'existing' && !selectedCaseId && activeCases.length > 0);

  const handleConfirm = () => {
    if (!item || !canStart) return;
    let opts: StartOpts = {};
    if (petId) {
      if (caseMode === 'existing') {
        opts = { hub_case_id: selectedCaseId || null };
      } else if (caseMode === 'new') {
        opts = { create_new_case: true };
      }
    }
    void onStart(item, opts).catch(() => {});
  };

  const petName = item?.pet?.name ?? (isEmergency ? 'A identificar' : 'Sem pet');
  const tutorName = item?.guardian?.full_name ?? (isEmergency ? 'A identificar' : '—');
  const profName = item?.staff_member?.full_name ?? '(sem profissional)';
  const svcName = item?.service_type?.name ?? item?.title ?? 'Consulta';
  const time = formatTime(item?.starts_at ?? item?.started_at ?? undefined);
  const complaint = item?.notes ?? item?.chief_complaint ?? null;

  const footer = (
    <>
      <HubCancelButton onClick={onClose} disabled={starting} />
      <button
        type="button"
        className="hub-btn hub-btn--primary nam-intake-footer-primary"
        disabled={!canStart}
        onClick={handleConfirm}
      >
        {starting ? (
          'Iniciando…'
        ) : (
          <>
            <Stethoscope size={18} strokeWidth={2} aria-hidden />
            Iniciar atendimento
          </>
        )}
      </button>
    </>
  );

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title="Iniciar atendimento"
      titleIcon={<Stethoscope size={22} strokeWidth={2} aria-hidden />}
      footer={footer}
    >
      <div className="nam-form">
        <div className="nam-section nam-section--quick">
          <div className="nam-quick-card">
            {isEmergency && !petId ? (
              <div className="nam-intake-callout nam-intake-callout--emergency" style={{ marginBottom: 16 }}>
                <AlertTriangle size={16} strokeWidth={2} className="nam-intake-callout__icon" aria-hidden />
                <p>
                  Urgência <strong>sem identificação</strong>. O atendimento será aberto sem pet/tutor. Para{' '}
                  <strong>finalizar</strong> ou abrir <strong>comanda</strong>, a identificação será obrigatória.
                </p>
              </div>
            ) : null}

            <div className="nam-row nam-row--cols2" style={{ marginBottom: 12 }}>
              <div>
                <p className="nam-label" style={{ marginBottom: 4 }}>
                  <Dog size={14} strokeWidth={2} aria-hidden style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  Pet
                </p>
                <p style={{ fontWeight: 600, margin: 0 }}>{petName}</p>
              </div>
              <div>
                <p className="nam-label" style={{ marginBottom: 4 }}>
                  <User size={14} strokeWidth={2} aria-hidden style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  Tutor
                </p>
                <p style={{ margin: 0 }}>{tutorName}</p>
              </div>
            </div>

            <div className="nam-row nam-row--cols2" style={{ marginBottom: 12 }}>
              <div>
                <p className="nam-label" style={{ marginBottom: 4 }}>Serviço</p>
                <p style={{ margin: 0 }}>{svcName}</p>
              </div>
              <div>
                <p className="nam-label" style={{ marginBottom: 4 }}>
                  <Clock size={14} strokeWidth={2} aria-hidden style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  Horário
                </p>
                <p style={{ margin: 0 }}>{time}</p>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <p className="nam-label" style={{ marginBottom: 4 }}>Profissional</p>
              <p style={{ margin: 0 }}>{profName}</p>
            </div>

            {complaint ? (
              <div style={{ marginBottom: 16 }}>
                <p className="nam-label" style={{ marginBottom: 4 }}>Queixa principal</p>
                <p className="nam-muted" style={{ margin: 0, fontStyle: 'italic' }}>{complaint}</p>
              </div>
            ) : null}

            {petId ? (
              <div className="nam-intake-case-box">
                <p className="nam-label nam-intake-case-box__heading">Caso clínico</p>
                {loadingCases ? (
                  <p className="nam-muted">Verificando casos ativos…</p>
                ) : (
                  <>
                    <div className="nam-intake-choice-grid">
                      <button
                        type="button"
                        className={`nam-intake-choice-card${caseMode === 'existing' ? ' nam-intake-choice-card--selected' : ''}`}
                        onClick={() => setCaseMode('existing')}
                        disabled={activeCases.length === 0}
                      >
                        <span className="nam-intake-choice-card__radio" aria-hidden />
                        <Folder size={22} strokeWidth={2} className="nam-intake-choice-card__glyph" aria-hidden />
                        <span className="nam-intake-choice-card__text">
                          <span className="nam-intake-choice-card__title">Caso existente</span>
                          <span className="nam-intake-choice-card__desc">Vincular a um caso ativo.</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`nam-intake-choice-card${caseMode === 'new' ? ' nam-intake-choice-card--selected' : ''}`}
                        onClick={() => setCaseMode('new')}
                      >
                        <span className="nam-intake-choice-card__radio" aria-hidden />
                        <FolderPlus size={22} strokeWidth={2} className="nam-intake-choice-card__glyph" aria-hidden />
                        <span className="nam-intake-choice-card__text">
                          <span className="nam-intake-choice-card__title">Novo caso</span>
                          <span className="nam-intake-choice-card__desc">Iniciar novo episódio.</span>
                        </span>
                      </button>
                    </div>

                    {caseMode === 'existing' && activeCases.length > 0 ? (
                      <div className="nam-field" style={{ marginTop: 12 }}>
                        <label className="nam-label" htmlFor="start-enc-case">
                          Selecione o caso
                        </label>
                        <HubSearchableCombobox
                          id="start-enc-case"
                          className="hub-combobox--clientes"
                          options={caseOptions}
                          value={selectedCaseId}
                          onChange={setSelectedCaseId}
                          placeholder="Selecionar caso…"
                          allowCreate={false}
                        />
                      </div>
                    ) : null}
                    {caseMode === 'new' ? (
                      <p className="nam-muted" style={{ marginTop: 12, marginBottom: 0 }}>
                        Um novo caso será criado com a queixa principal como título.
                      </p>
                    ) : null}
                    {caseMode === 'auto' ? (
                      <p className="nam-muted" style={{ marginTop: 12, marginBottom: 0 }}>
                        Caso criado ou reutilizado automaticamente conforme histórico do pet.
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </HubSidePanel>
  );
};

export default StartEncounterModal;
