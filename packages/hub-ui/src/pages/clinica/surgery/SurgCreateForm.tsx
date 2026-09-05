import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Dog, Loader2, User } from 'lucide-react';
import type { HubAnestheticRisk } from '../../../api/hubClinicalApi';
import { hubGuardiansApi, type HubGuardianPet } from '../../../api/hubGuardiansApi';
import { hubPetsApi } from '../../../api/hubPetsApi';
import type { HubStaffMember } from '../../../api/hubStaffApi';
import { HubSearchableCombobox } from '../../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../../components/HubSearchableCombobox';
import { HubMultiSelectCombobox } from '../../../components/HubMultiSelectCombobox';
import ClinicalCaseLinkFields, {
  type ClinicalCaseLinkValue,
} from '../../../components/clinical/ClinicalCaseLinkFields';
import { isCatSpecies, isDogSpecies } from '../anamnesisOptions';
import {
  EXAM_TYPE_OPTIONS,
  examTypeLabel,
  uniqueExamTypes,
} from '../examOrderOptions';
import '../../agenda/new-appointment-modal.css';

export const SURGERY_PROCEDURE_OPTIONS: HubComboboxOption[] = [
  { value: 'Ovariohisterectomia (OSH)', label: 'Ovariohisterectomia (OSH)' },
  { value: 'Orquiectomia', label: 'Orquiectomia' },
  { value: 'Piómetra', label: 'Piómetra' },
  { value: 'Cesariana', label: 'Cesariana' },
  { value: 'Laparotomia exploratória', label: 'Laparotomia exploratória' },
  { value: 'Enterotomia / enterectomia', label: 'Enterotomia / enterectomia' },
  { value: 'Cistotomia', label: 'Cistotomia' },
  { value: 'Nodulectomia', label: 'Nodulectomia' },
  { value: 'Mastectomia', label: 'Mastectomia' },
  { value: 'Herniorrafia', label: 'Herniorrafia' },
  { value: 'Extração dentária', label: 'Extração dentária' },
  { value: 'Enucleação', label: 'Enucleação' },
  { value: 'Osteossíntese', label: 'Osteossíntese' },
  { value: 'Amputação', label: 'Amputação' },
  { value: 'Biopsia', label: 'Biópsia' },
];

export const SURGERY_ASA_OPTIONS: { value: HubAnestheticRisk; label: string }[] = [
  { value: 'I', label: 'I — Saudável' },
  { value: 'II', label: 'II — Doença sistêmica leve' },
  { value: 'III', label: 'III — Doença sistêmica grave' },
  { value: 'IV', label: 'IV — Risco de vida' },
  { value: 'V', label: 'V — Moribundo' },
  { value: 'VI', label: 'VI — Morte encefálica / doador' },
  { value: 'E', label: 'E — Emergência' },
];

export type SurgCreateDraft = {
  guardianId: string;
  petId: string;
  title: string;
  scheduledAt: string;
  asaRisk: HubAnestheticRisk | '';
  staffId: string;
  notes: string;
  caseLink: ClinicalCaseLinkValue;
  examTypes: string[];
  labKind: 'internal' | 'external';
  labName: string;
  fastingRequired: boolean;
  examIndication: string;
};

export function emptySurgCreateDraft(staffId = ''): SurgCreateDraft {
  return {
    guardianId: '',
    petId: '',
    title: '',
    scheduledAt: '',
    asaRisk: '',
    staffId,
    notes: '',
    caseLink: {},
    examTypes: [],
    labKind: 'internal',
    labName: '',
    fastingRequired: false,
    examIndication: '',
  };
}

type Props = {
  clinicId: string;
  open?: boolean;
  staff: HubStaffMember[];
  draft: SurgCreateDraft;
  onChange: (next: SurgCreateDraft) => void;
  onHasActiveCases: (hasActive: boolean) => void;
  submitting?: boolean;
};

function speciesLabel(species?: string | null): string | null {
  if (!species?.trim()) return null;
  if (isDogSpecies(species)) return 'Canino';
  if (isCatSpecies(species)) return 'Felino';
  return species.trim();
}

const SurgCreateForm: React.FC<Props> = ({
  clinicId,
  open = true,
  staff,
  draft,
  onChange,
  onHasActiveCases,
  submitting = false,
}) => {
  const set = (patch: Partial<SurgCreateDraft>) => onChange({ ...draft, ...patch });

  const [guardianOptions, setGuardianOptions] = useState<HubComboboxOption[]>([]);
  const [guardiansLoading, setGuardiansLoading] = useState(false);
  const [guardianPets, setGuardianPets] = useState<HubGuardianPet[]>([]);
  const [guardianPetsLoading, setGuardianPetsLoading] = useState(false);

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
    if (!open || !clinicId || !draft.guardianId) {
      setGuardianPets([]);
      setGuardianPetsLoading(false);
      return;
    }
    let cancelled = false;
    setGuardianPetsLoading(true);
    void hubGuardiansApi
      .getById(draft.guardianId, clinicId)
      .then(({ pets }) => {
        if (cancelled) return;
        const rows = pets ?? [];
        setGuardianPets(rows);
        if (draft.petId && rows.some((p) => p.id === draft.petId)) return;
        if (rows.length === 1 && !draft.petId) {
          onChange({ ...draft, petId: rows[0]!.id, caseLink: {} });
        }
      })
      .catch(() => {
        if (!cancelled) setGuardianPets([]);
      })
      .finally(() => {
        if (!cancelled) setGuardianPetsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clinicId, draft.guardianId]);

  useEffect(() => {
    if (!open || !clinicId || !draft.petId || draft.guardianId) return;
    let cancelled = false;
    void hubPetsApi
      .list(clinicId)
      .then((r) => {
        if (cancelled) return;
        const pet = (r.pets ?? []).find((p) => p.id === draft.petId);
        const gid = pet?.primary_guardian?.guardian_id;
        if (gid) onChange({ ...draft, guardianId: gid });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clinicId, draft.petId, draft.guardianId]);

  useEffect(() => {
    if (!draft.petId) onHasActiveCases(false);
  }, [draft.petId, onHasActiveCases]);

  const selectedPet = guardianPets.find((p) => p.id === draft.petId) ?? null;
  const petMeta = selectedPet
    ? [speciesLabel(selectedPet.species), selectedPet.breed].filter(Boolean).join(' · ')
    : '';

  const petOptions: HubComboboxOption[] = useMemo(
    () =>
      guardianPets.map((p) => ({
        value: p.id,
        label: p.name,
        icon: <Dog size={18} strokeWidth={2} aria-hidden />,
      })),
    [guardianPets],
  );

  const procedureOptions = useMemo(() => {
    const opts = [...SURGERY_PROCEDURE_OPTIONS];
    const cur = draft.title.trim();
    if (cur && !opts.some((o) => o.value.toLowerCase() === cur.toLowerCase())) {
      opts.push({ value: draft.title, label: draft.title });
    }
    return opts;
  }, [draft.title]);

  const staffOptions: HubComboboxOption[] = useMemo(
    () =>
      staff
        .filter((s) => s.active !== false)
        .map((s) => ({ value: s.id, label: s.full_name })),
    [staff],
  );

  const asaOptions: HubComboboxOption[] = useMemo(
    () => SURGERY_ASA_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    [],
  );

  const examTypeOptions = useMemo(() => {
    const opts = EXAM_TYPE_OPTIONS.map((o) => ({ value: o.key, label: o.key }));
    for (const cur of draft.examTypes) {
      if (cur && !opts.some((o) => o.value === cur)) opts.push({ value: cur, label: cur });
    }
    return opts;
  }, [draft.examTypes]);

  const caseTitle = draft.title.trim() || null;

  return (
    <div className="nam-form hub-hosp-admit">
      <div className="nam-quick-card">
        <div className="nam-row nam-row--cols2">
          <div className="nam-field">
            <label className="nam-label" htmlFor="clinic-surg-guardian">
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
                id="clinic-surg-guardian"
                options={guardianOptions}
                value={draft.guardianId}
                onChange={(v) => onChange({ ...draft, guardianId: v, petId: '', caseLink: {} })}
                placeholder="Buscar tutor…"
                searchPlaceholder="Nome do tutor…"
                triggerIcon={<User size={18} strokeWidth={2} aria-hidden />}
                ariaLabel="Selecionar tutor"
                disabled={submitting}
                allowCreate={false}
              />
            )}
          </div>
          <div className="nam-field">
            <label className="nam-label" htmlFor={draft.guardianId ? 'clinic-surg-pet' : undefined}>
              Pet
            </label>
            {draft.guardianId ? (
              guardianPetsLoading ? (
                <div className="nam-field-shell nam-field-shell--waiting" aria-busy="true">
                  <span className="nam-field-shell__icon">
                    <Loader2 size={18} strokeWidth={2} className="nam-field-shell__spin" aria-hidden />
                  </span>
                  <span className="nam-field-shell__text">Carregando pets…</span>
                </div>
              ) : petOptions.length > 0 ? (
                <HubSearchableCombobox
                  id="clinic-surg-pet"
                  options={petOptions}
                  value={draft.petId}
                  onChange={(v) => onChange({ ...draft, petId: v, caseLink: {} })}
                  placeholder="Selecionar pet…"
                  searchPlaceholder="Nome do pet…"
                  triggerIcon={<Dog size={18} strokeWidth={2} aria-hidden />}
                  ariaLabel="Selecionar pet"
                  disabled={submitting}
                  allowCreate={false}
                />
              ) : (
                <div className="nam-field-shell nam-field-shell--empty" role="status">
                  <span className="nam-field-shell__icon" aria-hidden>
                    <Dog size={18} strokeWidth={2} />
                  </span>
                  <span className="nam-field-shell__text">Nenhum pet neste tutor</span>
                </div>
              )
            ) : (
              <div className="nam-field-shell nam-field-shell--blocked" role="status">
                <span className="nam-field-shell__icon" aria-hidden>
                  <Dog size={18} strokeWidth={2} />
                </span>
                <span className="nam-field-shell__text">Selecione um tutor primeiro</span>
                <ChevronDown size={18} strokeWidth={2} className="nam-field-shell__chevron" aria-hidden />
              </div>
            )}
            {petMeta ? <p className="nam-muted hub-hosp-admit__pet-meta">{petMeta}</p> : null}
          </div>
        </div>

        <div className="nam-field">
          <label className="nam-label" htmlFor="clinic-surg-title">
            Procedimento *
          </label>
          <HubSearchableCombobox
            id="clinic-surg-title"
            options={procedureOptions}
            value={draft.title}
            onChange={(v) => set({ title: v })}
            placeholder="Selecionar ou criar procedimento…"
            searchPlaceholder="OSH, cistotomia, extração…"
            ariaLabel="Procedimento"
            disabled={submitting}
            allowCreate
            createEntityLabel="procedimento"
            createEntityGender="m"
          />
        </div>

        <div className="nam-row nam-row--cols2">
          <div className="nam-field">
            <label className="nam-label" htmlFor="clinic-surg-when">
              Data e hora *
            </label>
            <input
              id="clinic-surg-when"
              type="datetime-local"
              className="nam-input"
              value={draft.scheduledAt}
              disabled={submitting}
              onChange={(e) => set({ scheduledAt: e.target.value })}
            />
          </div>
          <div className="nam-field">
            <label className="nam-label" htmlFor="clinic-surg-asa">
              Risco anestésico
            </label>
            <HubSearchableCombobox
              id="clinic-surg-asa"
              options={asaOptions}
              value={draft.asaRisk}
              onChange={(v) => set({ asaRisk: (v as HubAnestheticRisk) || '' })}
              placeholder="Não classificado"
              searchPlaceholder="ASA…"
              ariaLabel="Risco anestésico"
              disabled={submitting}
              clearable
            />
          </div>
        </div>

        {clinicId && draft.petId ? (
          <ClinicalCaseLinkFields
            clinicId={clinicId}
            petId={draft.petId}
            value={draft.caseLink}
            onChange={(v) => set({ caseLink: v })}
            onHasActiveCases={onHasActiveCases}
            disabled={submitting}
            suggestedTitle={caseTitle}
            emptyActiveHint="Nenhum caso ativo — um novo caso será criado com esta cirurgia."
            blankTitleHint="Se ficar em branco, usamos o nome do procedimento."
            tone="agenda"
          />
        ) : (
          <div className="nam-field">
            <span className="nam-label">Caso clínico</span>
            <div className="nam-field-shell nam-field-shell--blocked" role="status">
              <span className="nam-field-shell__text">Selecione o tutor e o pet para vincular o caso</span>
            </div>
          </div>
        )}

        <div className="nam-field">
          <label className="nam-label" htmlFor="clinic-surg-staff">
            Responsável
          </label>
          <HubSearchableCombobox
            id="clinic-surg-staff"
            options={staffOptions}
            value={draft.staffId}
            onChange={(v) => set({ staffId: v })}
            placeholder="Quem opera / assume…"
            searchPlaceholder="Buscar profissional…"
            ariaLabel="Responsável"
            disabled={submitting}
            clearable
          />
        </div>

        <div className="nam-field">
          <label className="nam-label" htmlFor="clinic-surg-exams">
            Exames pré-operatórios
          </label>
          <HubMultiSelectCombobox
            id="clinic-surg-exams"
            options={examTypeOptions}
            value={draft.examTypes}
            onChange={(next) => set({ examTypes: uniqueExamTypes(next) })}
            placeholder="Hemograma, bioquímica, RX… (opcional)"
            searchPlaceholder="Buscar exame…"
            allowCreate
            createEntityLabel="exame"
            resolveLabel={examTypeLabel}
            ariaLabel="Exames pré-operatórios"
            disabled={submitting}
          />
        </div>

        {draft.examTypes.length > 0 ? (
          <>
            <div className="nam-row nam-row--cols2">
              <div className="nam-field">
                <span className="nam-label">Laboratório</span>
                <div className="hub-hosp-admit__seg" role="group" aria-label="Laboratório">
                  <button
                    type="button"
                    className={draft.labKind === 'internal' ? 'is-on' : undefined}
                    disabled={submitting}
                    onClick={() => set({ labKind: 'internal' })}
                  >
                    Lab interno
                  </button>
                  <button
                    type="button"
                    className={draft.labKind === 'external' ? 'is-on' : undefined}
                    disabled={submitting}
                    onClick={() => set({ labKind: 'external' })}
                  >
                    Lab externo
                  </button>
                </div>
              </div>
              <div className="nam-field">
                <label className="nam-label" htmlFor="clinic-surg-lab">
                  {draft.labKind === 'external' ? 'Nome do laboratório' : 'Lab interno'}
                </label>
                <input
                  id="clinic-surg-lab"
                  className="nam-input"
                  value={draft.labName}
                  disabled={submitting}
                  onChange={(e) => set({ labName: e.target.value })}
                  placeholder={draft.labKind === 'external' ? 'Nome do laboratório' : 'Opcional'}
                />
              </div>
            </div>

            <div className="nam-row nam-row--cols2">
              <div className="nam-field">
                <span className="nam-label">Jejum</span>
                <div className="hub-hosp-admit__seg" role="group" aria-label="Jejum">
                  <button
                    type="button"
                    className={!draft.fastingRequired ? 'is-on' : undefined}
                    disabled={submitting}
                    onClick={() => set({ fastingRequired: false })}
                  >
                    Sem jejum
                  </button>
                  <button
                    type="button"
                    className={draft.fastingRequired ? 'is-on' : undefined}
                    disabled={submitting}
                    onClick={() => set({ fastingRequired: true })}
                  >
                    Jejum necessário
                  </button>
                </div>
              </div>
              <div className="nam-field">
                <label className="nam-label" htmlFor="clinic-surg-exam-ind">
                  Indicação dos exames
                </label>
                <input
                  id="clinic-surg-exam-ind"
                  className="nam-input"
                  value={draft.examIndication}
                  disabled={submitting}
                  onChange={(e) => set({ examIndication: e.target.value })}
                  placeholder="Pré-operatório, avaliação…"
                />
              </div>
            </div>
          </>
        ) : null}

        <div className="nam-field">
          <label className="nam-label" htmlFor="clinic-surg-notes">
            Observações pré-operatórias
          </label>
          <textarea
            id="clinic-surg-notes"
            className="nam-textarea"
            rows={3}
            value={draft.notes}
            disabled={submitting}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="Medicações, alergias, restrições, o que a equipe precisa saber…"
          />
        </div>
      </div>
    </div>
  );
};

export default SurgCreateForm;
