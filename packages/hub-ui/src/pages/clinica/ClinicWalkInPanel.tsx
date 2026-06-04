import React, { useEffect, useMemo, useState } from 'react';
import { User, Dog, Loader2, Stethoscope, Calendar, Siren, Info, Zap } from 'lucide-react';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { hubStaffApi, type HubStaffMember } from '../../api/hubStaffApi';
import { HubCancelButton } from '../../components/HubCancelButton';
import { hubGuardiansApi, type HubGuardianPet } from '../../api/hubGuardiansApi';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
import { isOperationalClinicalGroup, normalizeServiceGroupSlug, serviceGroupLabel } from '../../utils/serviceTypeSlug';
import type { NewAppointmentInitial } from '../agenda/NewAppointmentModal';
import { todayYmd } from './clinicalDisplay';
import '../agenda/new-appointment-modal.css';

type Props = {
  open: boolean;
  clinicId: string;
  onClose: () => void;
  /** Abre a agenda principal com o formulário de novo agendamento pré-preenchido (rotina → «agendar»). */
  onScheduleAgenda?: (initial: NewAppointmentInitial) => void;
  /**
   * Chamado ao confirmar a entrada. Cria apenas um `hub_appointments` com status `checked_in`.
   * A seleção de caso clínico acontece mais tarde no modal "Iniciar atendimento".
   */
  onSubmit: (payload: {
    petId?: string | null;
    guardianId?: string | null;
    staffId?: string | null;
    complaint: string;
    hubServiceTypeId: string;
    entryKind: 'routine' | 'emergency';
    durationMinutes: number;
  }) => Promise<void>;
  submitting: boolean;
};

const ClinicWalkInPanel: React.FC<Props> = ({ open, clinicId, onClose, onSubmit, onScheduleAgenda, submitting }) => {
  const [staff, setStaff] = useState<HubStaffMember[]>([]);
  const [guardianOptions, setGuardianOptions] = useState<HubComboboxOption[]>([]);
  const [guardiansLoading, setGuardiansLoading] = useState(false);
  const [guardianId, setGuardianId] = useState('');
  const [guardianPets, setGuardianPets] = useState<HubGuardianPet[]>([]);
  const [petId, setPetId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [serviceTypeId, setServiceTypeId] = useState('');
  const [clinicalServiceOptions, setClinicalServiceOptions] = useState<HubComboboxOption[]>([]);
  const [complaint, setComplaint] = useState('');
  const [entryKind, setEntryKind] = useState<'routine' | 'emergency'>('routine');
  /** Rotina: atender já (encaixe na agenda) ou só abrir o fluxo de agendamento. */
  const [routineAgendaMode, setRoutineAgendaMode] = useState<'immediate' | 'schedule'>('immediate');
  const [clinicalServiceRows, setClinicalServiceRows] = useState<HubServiceType[]>([]);

  useEffect(() => {
    if (!open) {
      setGuardianId('');
      setGuardianPets([]);
      setPetId('');
      setStaffId('');
      setServiceTypeId('');
      setComplaint('');
      setEntryKind('routine');
      setRoutineAgendaMode('immediate');
      setClinicalServiceRows([]);
      return;
    }
    if (!clinicId) return;
    void hubStaffApi.list(clinicId).then((r) => setStaff(r.staff ?? []));
  }, [open, clinicId]);

  useEffect(() => {
    if (!open || !clinicId) return;
    setGuardiansLoading(true);
    void hubGuardiansApi
      .list(clinicId, false, { status: 'active' })
      .then(({ guardians }) => {
        setGuardianOptions(
          guardians.map((g) => ({
            value: g.id,
            label: g.full_name,
            icon: <User size={18} strokeWidth={2} aria-hidden />,
          })),
        );
      })
      .catch(() => setGuardianOptions([]))
      .finally(() => setGuardiansLoading(false));
  }, [open, clinicId]);

  useEffect(() => {
    if (!open || !clinicId) return;
    void hubServiceTypesApi.list(clinicId, false, false).then((r) => {
      const rows = (r.service_types ?? []).filter((st) => {
        if (st.active === false) return false;
        if (st.deleted_at) return false;
        const g = normalizeServiceGroupSlug(st.service_group);
        return isOperationalClinicalGroup(g);
      });
      setClinicalServiceRows(rows);
      setClinicalServiceOptions(
        rows.map((st) => ({
          value: st.id,
          label: `${st.name} (${serviceGroupLabel(normalizeServiceGroupSlug(st.service_group))})`,
        })),
      );
    });
  }, [open, clinicId]);

  useEffect(() => {
    if (!guardianId || !clinicId) {
      setGuardianPets([]);
      setPetId('');
      return;
    }
    void hubGuardiansApi.getById(guardianId, clinicId).then(({ pets }) => {
      setGuardianPets(pets ?? []);
      setPetId((prev) => {
        if (prev && pets.some((p) => p.id === prev)) return prev;
        if (pets.length === 1) return pets[0]!.id;
        return '';
      });
    });
  }, [guardianId, clinicId]);

  const staffOptions: HubComboboxOption[] = useMemo(
    () => staff.filter((s) => s.active !== false).map((s) => ({ value: s.id, label: s.full_name })),
    [staff],
  );

  const petOptions: HubComboboxOption[] = useMemo(
    () => guardianPets.map((p) => ({ value: p.id, label: p.name })),
    [guardianPets],
  );

  const canStartNow =
    Boolean(serviceTypeId) &&
    !submitting &&
    (entryKind === 'emergency' || routineAgendaMode === 'immediate') &&
    // Rotina: exige tutor e pet; emergência: pode abrir sem eles.
    (entryKind === 'emergency' || (Boolean(guardianId) && Boolean(petId)));

  const canScheduleAgenda =
    Boolean(onScheduleAgenda) &&
    Boolean(guardianId) &&
    Boolean(petId) &&
    Boolean(serviceTypeId) &&
    !submitting &&
    entryKind === 'routine' &&
    routineAgendaMode === 'schedule';

  const handleStartNow = () => {
    if (!canStartNow) return;
    const st = clinicalServiceRows.find((x) => x.id === serviceTypeId);
    const dur =
      typeof st?.default_duration_minutes === 'number' && st.default_duration_minutes > 0
        ? st.default_duration_minutes
        : 60;
    void onSubmit({
      petId: petId || null,
      guardianId: guardianId || null,
      staffId: staffId || null,
      complaint,
      hubServiceTypeId: serviceTypeId,
      entryKind,
      durationMinutes: dur,
    })
      .then(() => {
        setGuardianId('');
        setGuardianPets([]);
        setPetId('');
        setStaffId('');
        setServiceTypeId('');
        setComplaint('');
        setEntryKind('routine');
        setRoutineAgendaMode('immediate');
      })
      .catch(() => {
        /* erro tratado na página */
      });
  };

  const goScheduleOnMainAgenda = () => {
    if (!canScheduleAgenda || !onScheduleAgenda) return;
    const st = clinicalServiceRows.find((x) => x.id === serviceTypeId);
    if (!st) return;
    const petName = guardianPets.find((p) => p.id === petId)?.name ?? '';
    const guardianName = guardianOptions.find((g) => g.value === guardianId)?.label ?? '';
    const dur =
      typeof st.default_duration_minutes === 'number' && st.default_duration_minutes > 0
        ? st.default_duration_minutes
        : 30;
    const q = complaint.trim();
    onScheduleAgenda({
      date: todayYmd(),
      guardian_id: guardianId,
      guardian_name: guardianName,
      pet_id: petId,
      pet_name: petName,
      hub_staff_member_id: staffId || null,
      services: [
        {
          hub_service_type_id: serviceTypeId,
          name: st.name,
          duration_minutes: dur,
        },
      ],
      notes: q || null,
      title: q ? q.slice(0, 200) : `${st.name} — ${petName}`,
    });
  };


  const footer = (
    <>
      <HubCancelButton onClick={onClose} disabled={submitting} />
      {entryKind === 'routine' && routineAgendaMode === 'schedule' && onScheduleAgenda ? (
        <button type="button" className="hub-btn hub-btn--primary nam-intake-footer-primary" disabled={!canScheduleAgenda} onClick={goScheduleOnMainAgenda}>
          <Calendar size={18} strokeWidth={2} aria-hidden />
          Abrir agenda para agendar
        </button>
      ) : (
        <button type="button" className="hub-btn hub-btn--primary nam-intake-footer-primary" disabled={!canStartNow} onClick={handleStartNow}>
          {submitting ? (
            'Registrando…'
          ) : entryKind === 'emergency' ? (
            <>
              <Zap size={18} strokeWidth={2} aria-hidden />
              Registrar urgência na fila
            </>
          ) : (
            <>
              <Stethoscope size={18} strokeWidth={2} aria-hidden />
              Registrar na fila
            </>
          )}
        </button>
      )}
    </>
  );

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title="Atendimento clínico"
      titleIcon={<Stethoscope size={22} strokeWidth={2} aria-hidden />}
      footer={footer}
    >
      <div className="nam-form">
        <div className="nam-section nam-section--quick">
          <div className="nam-quick-card">
            <div className="nam-row nam-row--cols2">
              <div className="nam-field">
                <label className="nam-label" htmlFor="clinic-walkin-guardian">
                  Tutor
                </label>
                {guardiansLoading ? (
                  <div className="nam-field-shell nam-field-shell--waiting" aria-busy="true">
                    <span className="nam-field-shell__icon">
                      <Loader2 size={18} strokeWidth={2} className="nam-field-shell__spin" aria-hidden />
                    </span>
                    <span className="nam-field-shell__text">Carregando tutores…</span>
                  </div>
                ) : (
                  <HubSearchableCombobox
                    id="clinic-walkin-guardian"
                    className="hub-combobox--clientes"
                    options={guardianOptions}
                    value={guardianId}
                    onChange={setGuardianId}
                    placeholder="Buscar tutor…"
                    triggerIcon={<User size={18} strokeWidth={2} aria-hidden />}
                    ariaLabel="Selecionar tutor"
                    allowCreate={false}
                  />
                )}
              </div>
              <div className="nam-field">
                <label className="nam-label" htmlFor={guardianId ? 'clinic-walkin-pet' : undefined}>
                  Pet
                </label>
                {guardianId ? (
                  petOptions.length > 0 ? (
                    <HubSearchableCombobox
                      id="clinic-walkin-pet"
                      className="hub-combobox--clientes"
                      options={petOptions}
                      value={petId}
                      onChange={setPetId}
                      placeholder="Selecionar pet…"
                      triggerIcon={<Dog size={18} strokeWidth={2} aria-hidden />}
                      ariaLabel="Selecionar pet"
                      allowCreate={false}
                    />
                  ) : (
                    <div className="nam-field-shell nam-field-shell--empty" role="status">
                      <span className="nam-field-shell__icon" aria-hidden>
                        <Dog size={18} strokeWidth={2} />
                      </span>
                      <span className="nam-field-shell__text">Nenhum pet cadastrado para este tutor</span>
                    </div>
                  )
                ) : (
                  <div className="nam-field-shell nam-field-shell--blocked" role="status">
                    <span className="nam-field-shell__icon" aria-hidden>
                      <Dog size={18} strokeWidth={2} />
                    </span>
                    <span className="nam-field-shell__text">Selecione um tutor primeiro</span>
                  </div>
                )}
              </div>
            </div>

            <div className="nam-intake-walkin-entry-compact">
              <div className="nam-field" style={{ marginTop: 4 }}>
                <span className="nam-label">Tipo de entrada</span>
                <div className="nam-intake-choice-grid">
                  <button
                    type="button"
                    className={`nam-intake-choice-card${entryKind === 'routine' ? ' nam-intake-choice-card--selected' : ''}`}
                    onClick={() => {
                      setEntryKind('routine');
                      setRoutineAgendaMode('immediate');
                    }}
                  >
                    <span className="nam-intake-choice-card__radio" aria-hidden />
                    <Calendar size={18} strokeWidth={2} className="nam-intake-choice-card__glyph" aria-hidden />
                    <span className="nam-intake-choice-card__text">
                      <span className="nam-intake-choice-card__title">Consulta de rotina</span>
                      <span className="nam-intake-choice-card__desc">Agendamento planejado e não urgente.</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`nam-intake-choice-card${entryKind === 'emergency' ? ' nam-intake-choice-card--selected' : ''}`}
                    onClick={() => setEntryKind('emergency')}
                  >
                    <span className="nam-intake-choice-card__radio" aria-hidden />
                    <Siren size={18} strokeWidth={2} className="nam-intake-choice-card__glyph" aria-hidden />
                    <span className="nam-intake-choice-card__text">
                      <span className="nam-intake-choice-card__title">Urgência / emergência</span>
                      <span className="nam-intake-choice-card__desc">
                        Atendimento imediato para casos de urgência ou emergência.
                      </span>
                    </span>
                  </button>
                </div>
                {entryKind === 'emergency' ? (
                  <div className="nam-intake-callout nam-intake-callout--emergency nam-intake-callout--walkin-tight">
                    <Siren size={16} strokeWidth={2} className="nam-intake-callout__icon" aria-hidden />
                    <p>
                      A urgência entra na fila como <strong>Aguardando</strong> — tutor e pet são{' '}
                      <strong>opcionais</strong> neste momento e podem ser identificados antes do atendimento. O
                      profissional clica <strong>Atender</strong> na fila para iniciar.
                    </p>
                  </div>
                ) : (
                  <div className="nam-intake-callout nam-intake-callout--info nam-intake-callout--walkin-tight">
                    <Info size={16} strokeWidth={2} className="nam-intake-callout__icon" aria-hidden />
                    <p>
                      Na rotina você pode <strong>registrar na fila agora</strong> (encaixe) ou{' '}
                      <strong>só agendar</strong> outro horário na agenda. O profissional inicia o atendimento pela
                      fila. O tutor é obrigatório nas duas opções.
                    </p>
                  </div>
                )}
              </div>

              {entryKind === 'routine' && onScheduleAgenda ? (
                <div className="nam-field" style={{ marginTop: 6 }}>
                  <span className="nam-label">Rotina — próximo passo</span>
                  <div className="nam-intake-choice-grid">
                    <button
                      type="button"
                      className={`nam-intake-choice-card${routineAgendaMode === 'immediate' ? ' nam-intake-choice-card--selected' : ''}`}
                      onClick={() => setRoutineAgendaMode('immediate')}
                    >
                      <span className="nam-intake-choice-card__radio" aria-hidden />
                      <Stethoscope size={18} strokeWidth={2} className="nam-intake-choice-card__glyph" aria-hidden />
                      <span className="nam-intake-choice-card__text">
                        <span className="nam-intake-choice-card__title">Atender agora</span>
                        <span className="nam-intake-choice-card__desc">Encaixe na agenda principal no horário atual.</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`nam-intake-choice-card${routineAgendaMode === 'schedule' ? ' nam-intake-choice-card--selected' : ''}`}
                      onClick={() => setRoutineAgendaMode('schedule')}
                    >
                      <span className="nam-intake-choice-card__radio" aria-hidden />
                      <Calendar size={18} strokeWidth={2} className="nam-intake-choice-card__glyph" aria-hidden />
                      <span className="nam-intake-choice-card__text">
                        <span className="nam-intake-choice-card__title">Agendar outro horário</span>
                        <span className="nam-intake-choice-card__desc">
                          Abre a agenda principal para escolher data e hora.
                        </span>
                      </span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="nam-field">
              <label className="nam-label" htmlFor="clinic-walkin-service">
                Serviço (Clínica, Internação ou Cirurgia)
              </label>
              {clinicalServiceOptions.length === 0 ? (
                <p className="nam-muted">
                  Nenhum tipo de serviço ativo nessas áreas. Configure em Serviços (grupos Clínica, Internação ou
                  Cirurgia).
                </p>
              ) : (
                <HubSearchableCombobox
                  id="clinic-walkin-service"
                  className="hub-combobox--clientes"
                  options={clinicalServiceOptions}
                  value={serviceTypeId}
                  onChange={setServiceTypeId}
                  placeholder="Selecionar serviço…"
                  triggerIcon={<Stethoscope size={18} strokeWidth={2} aria-hidden />}
                  ariaLabel="Selecionar serviço clínico"
                  allowCreate={false}
                />
              )}
            </div>

            <div className="nam-field">
              <label className="nam-label" htmlFor="clinic-walkin-staff">
                Profissional
              </label>
              <HubSearchableCombobox
                id="clinic-walkin-staff"
                className="hub-combobox--clientes"
                options={staffOptions}
                value={staffId}
                onChange={setStaffId}
                placeholder="Selecionar…"
                triggerIcon={<User size={18} strokeWidth={2} aria-hidden />}
                ariaLabel="Selecionar profissional"
                allowCreate={false}
              />
            </div>

            <div className="nam-field">
              <label className="nam-label" htmlFor="walk_complaint">
                Queixa principal
              </label>
              <textarea
                id="walk_complaint"
                className="nam-textarea"
                value={complaint}
                onChange={(e) => setComplaint(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="Descreva o motivo do atendimento…"
              />
              <p className="nam-char-count">{complaint.length}/1000</p>
            </div>

          </div>
        </div>
      </div>
    </HubSidePanel>
  );
};

export default ClinicWalkInPanel;
