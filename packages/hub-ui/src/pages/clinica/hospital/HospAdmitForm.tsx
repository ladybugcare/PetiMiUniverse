import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Dog, Loader2, User } from 'lucide-react';
import type { HubHospitalBed } from '../../../api/hubClinicalApi';
import { hubGuardiansApi, type HubGuardianPet } from '../../../api/hubGuardiansApi';
import { hubPetsApi } from '../../../api/hubPetsApi';
import type { HubStaffMember } from '../../../api/hubStaffApi';
import { HubSearchableCombobox } from '../../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../../components/HubSearchableCombobox';
import ClinicalCaseLinkFields, {
  type ClinicalCaseLinkValue,
} from '../../../components/clinical/ClinicalCaseLinkFields';
import { isCatSpecies, isDogSpecies } from '../anamnesisOptions';
import { HOSP_ADMIT_REASON_OPTIONS, buildHospAdmitReason } from './hospDisplay';
import '../../agenda/new-appointment-modal.css';

export type HospAdmitDraft = {
  guardianId: string;
  petId: string;
  bedId: string;
  reasonKey: string;
  reasonDetail: string;
  notes: string;
  staffId: string;
  caseLink: ClinicalCaseLinkValue;
};

type Props = {
  clinicId: string;
  open?: boolean;
  beds: HubHospitalBed[];
  staff: HubStaffMember[];
  draft: HospAdmitDraft;
  onChange: (next: HospAdmitDraft) => void;
  onHasActiveCases: (hasActive: boolean) => void;
  submitting?: boolean;
};

function speciesLabel(species?: string | null): string | null {
  if (!species?.trim()) return null;
  if (isDogSpecies(species)) return 'Canino';
  if (isCatSpecies(species)) return 'Felino';
  return species.trim();
}

const HospAdmitForm: React.FC<Props> = ({
  clinicId,
  open = true,
  beds,
  staff,
  draft,
  onChange,
  onHasActiveCases,
  submitting = false,
}) => {
  const set = (patch: Partial<HospAdmitDraft>) => onChange({ ...draft, ...patch });
  const reasonText = buildHospAdmitReason(draft.reasonKey, draft.reasonDetail);

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

  const selectedPet = guardianPets.find((p) => p.id === draft.petId) ?? null;

  const petOptions: HubComboboxOption[] = useMemo(
    () =>
      guardianPets.map((p) => ({
        value: p.id,
        label: p.name,
        icon: <Dog size={18} strokeWidth={2} aria-hidden />,
      })),
    [guardianPets],
  );

  const reasonOptions: HubComboboxOption[] = useMemo(() => {
    const opts = HOSP_ADMIT_REASON_OPTIONS.map((o) => ({ value: o.key, label: o.label }));
    const cur = draft.reasonKey.trim();
    if (cur && !opts.some((o) => o.value === cur)) {
      opts.push({ value: cur, label: cur });
    }
    return opts;
  }, [draft.reasonKey]);

  const bedOptions: HubComboboxOption[] = useMemo(
    () =>
      beds
        .filter((b) => b.status === 'available' || !b.status)
        .map((b) => ({ value: b.id, label: b.label || b.code })),
    [beds],
  );

  const staffOptions: HubComboboxOption[] = useMemo(
    () =>
      staff
        .filter((s) => s.active !== false)
        .map((s) => ({ value: s.id, label: s.full_name })),
    [staff],
  );

  useEffect(() => {
    if (!draft.petId) onHasActiveCases(false);
  }, [draft.petId, onHasActiveCases]);

  const petMeta = selectedPet
    ? [speciesLabel(selectedPet.species), selectedPet.breed].filter(Boolean).join(' · ')
    : '';

  return (
    <div className="nam-form hub-hosp-admit">
      <div className="nam-quick-card">
        <div className="nam-row nam-row--cols2">
          <div className="nam-field">
            <label className="nam-label" htmlFor="clinic-admit-guardian">
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
                id="clinic-admit-guardian"
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
            <label className="nam-label" htmlFor={draft.guardianId ? 'clinic-admit-pet' : undefined}>
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
                  id="clinic-admit-pet"
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

        <div className="nam-row nam-row--cols2">
          <div className="nam-field">
            <label className="nam-label" htmlFor="clinic-admit-reason">
              Motivo *
            </label>
            <HubSearchableCombobox
              id="clinic-admit-reason"
              options={reasonOptions}
              value={draft.reasonKey}
              onChange={(v) => set({ reasonKey: v })}
              placeholder="Selecionar motivo…"
              searchPlaceholder="Buscar ou criar motivo…"
              ariaLabel="Motivo da internação"
              disabled={submitting}
              allowCreate
              createEntityLabel="motivo"
              createEntityGender="m"
              clearable
            />
          </div>
          <div className="nam-field">
            <label className="nam-label" htmlFor="clinic-admit-reason-detail">
              Complemento
            </label>
            <input
              id="clinic-admit-reason-detail"
              className="nam-input"
              value={draft.reasonDetail}
              disabled={submitting}
              onChange={(e) => set({ reasonDetail: e.target.value })}
              placeholder={
                draft.reasonKey === 'pos_cirurgico'
                  ? 'Ex.: OSH, enterotomia…'
                  : 'Detalhe clínico, se precisar'
              }
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
            suggestedTitle={reasonText || null}
            emptyActiveHint="Nenhum caso ativo — um novo caso será criado com esta internação."
            blankTitleHint="Se ficar em branco, usamos o motivo da internação."
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

        <div className="nam-row nam-row--cols2">
          <div className="nam-field">
            <label className="nam-label" htmlFor="clinic-admit-bed">
              Leito
            </label>
            <HubSearchableCombobox
              id="clinic-admit-bed"
              options={bedOptions}
              value={draft.bedId}
              onChange={(v) => set({ bedId: v })}
              placeholder="Sem leito por enquanto"
              searchPlaceholder="Código do leito…"
              ariaLabel="Leito"
              disabled={submitting}
              clearable
            />
          </div>
          <div className="nam-field">
            <label className="nam-label" htmlFor="clinic-admit-staff">
              Responsável
            </label>
            <HubSearchableCombobox
              id="clinic-admit-staff"
              options={staffOptions}
              value={draft.staffId}
              onChange={(v) => set({ staffId: v })}
              placeholder="Quem assume a internação…"
              searchPlaceholder="Buscar profissional…"
              ariaLabel="Responsável"
              disabled={submitting}
              clearable
            />
          </div>
        </div>

        <div className="nam-field">
          <label className="nam-label" htmlFor="clinic-admit-notes">
            Observações
          </label>
          <textarea
            id="clinic-admit-notes"
            className="nam-textarea"
            rows={3}
            value={draft.notes}
            disabled={submitting}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="Jejum, medicações em uso, restrições…"
          />
        </div>
      </div>
    </div>
  );
};

export default HospAdmitForm;
