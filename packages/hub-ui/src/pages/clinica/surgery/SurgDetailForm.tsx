import React, { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { HubAnestheticRisk, HubSurgery } from '../../../api/hubClinicalApi';
import type { HubStaffMember } from '../../../api/hubStaffApi';
import { HubSearchableCombobox } from '../../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../../components/HubSearchableCombobox';
import { SURGERY_ASA_OPTIONS } from './SurgCreateForm';
import '../../agenda/new-appointment-modal.css';

export type SurgDetailTab = 'pre_op' | 'procedure' | 'team' | 'post_op';

export const SURG_DETAIL_TABS: { id: SurgDetailTab; label: string }[] = [
  { id: 'pre_op', label: 'Pré-op' },
  { id: 'procedure', label: 'Procedimento' },
  { id: 'team', label: 'Equipe' },
  { id: 'post_op', label: 'Pós-op' },
];

const TEAM_ROLE_OPTIONS: HubComboboxOption[] = [
  { value: 'Cirurgião', label: 'Cirurgião' },
  { value: 'Anestesista', label: 'Anestesista' },
  { value: 'Auxiliar', label: 'Auxiliar' },
  { value: 'Instrumentador', label: 'Instrumentador' },
  { value: 'Monitoramento', label: 'Monitoramento' },
];

const LATERALITY_OPTIONS: HubComboboxOption[] = [
  { value: 'left', label: 'Esquerdo' },
  { value: 'right', label: 'Direito' },
  { value: 'bilateral', label: 'Bilateral' },
];

export type SurgTeamRow = {
  role: string;
  staffId: string;
  name: string;
};

export type SurgDetailDraft = {
  staffId: string;
  asaRisk: HubAnestheticRisk | '';
  preOp: {
    notes: string;
  };
  procedure: {
    notes: string;
    findings: string;
    complications: string;
    durationMinutes: string;
    laterality: string;
  };
  team: SurgTeamRow[];
  teamNotes: string;
  postOp: {
    notes: string;
    recovery: string;
    instructions: string;
  };
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asStr(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

function emptyTeamRow(): SurgTeamRow {
  return { role: '', staffId: '', name: '' };
}

export function parseSurgDetail(surgery: HubSurgery): SurgDetailDraft {
  const pre = asRecord(surgery.pre_op);
  const proc = asRecord(surgery.procedure);
  const post = asRecord(surgery.post_op);
  const teamRaw = Array.isArray(surgery.team) ? surgery.team : [];
  const team = teamRaw.map((row) => {
    const r = asRecord(row);
    return {
      role: asStr(r.role),
      staffId: asStr(r.staff_id ?? r.hub_staff_member_id),
      name: asStr(r.name ?? r.full_name),
    };
  });
  return {
    staffId: surgery.hub_staff_member_id ?? '',
    asaRisk: (surgery.anesthetic_risk as HubAnestheticRisk | null) ?? '',
    preOp: {
      notes: asStr(pre.notes),
    },
    procedure: {
      notes: asStr(proc.notes ?? proc.description),
      findings: asStr(proc.findings),
      complications: asStr(proc.complications),
      durationMinutes: asStr(proc.duration_minutes),
      laterality: asStr(proc.laterality),
    },
    team: team.length ? team : [emptyTeamRow()],
    teamNotes: surgery.team_notes ?? '',
    postOp: {
      notes: asStr(post.notes) || surgery.post_op_notes || '',
      recovery: asStr(post.recovery),
      instructions: asStr(post.instructions),
    },
  };
}

export function serializeSurgDetail(draft: SurgDetailDraft): {
  hub_staff_member_id: string | null;
  anesthetic_risk: HubAnestheticRisk | null;
  pre_op: Record<string, unknown>;
  procedure: Record<string, unknown>;
  team: Record<string, unknown>[];
  team_notes: string | null;
  post_op: Record<string, unknown>;
} {
  const preOp: Record<string, unknown> = {};
  if (draft.preOp.notes.trim()) preOp.notes = draft.preOp.notes.trim();
  const procedure: Record<string, unknown> = {};
  if (draft.procedure.notes.trim()) procedure.notes = draft.procedure.notes.trim();
  if (draft.procedure.findings.trim()) procedure.findings = draft.procedure.findings.trim();
  if (draft.procedure.complications.trim()) procedure.complications = draft.procedure.complications.trim();
  if (draft.procedure.durationMinutes.trim()) procedure.duration_minutes = draft.procedure.durationMinutes.trim();
  if (draft.procedure.laterality.trim()) procedure.laterality = draft.procedure.laterality.trim();

  const team = draft.team
    .filter((row) => row.role || row.staffId || row.name)
    .map((row) => ({
      role: row.role || null,
      staff_id: row.staffId || null,
      name: row.name || null,
    }));

  const postOp: Record<string, unknown> = {};
  if (draft.postOp.notes.trim()) postOp.notes = draft.postOp.notes.trim();
  if (draft.postOp.recovery.trim()) postOp.recovery = draft.postOp.recovery.trim();
  if (draft.postOp.instructions.trim()) postOp.instructions = draft.postOp.instructions.trim();

  return {
    hub_staff_member_id: draft.staffId || null,
    anesthetic_risk: draft.asaRisk || null,
    pre_op: preOp,
    procedure,
    team,
    team_notes: draft.teamNotes.trim() || null,
    post_op: postOp,
  };
}

type Props = {
  tab: SurgDetailTab;
  draft: SurgDetailDraft;
  staff: HubStaffMember[];
  canWrite: boolean;
  onChange: (next: SurgDetailDraft) => void;
};

const SurgDetailForm: React.FC<Props> = ({ tab, draft, staff, canWrite, onChange }) => {
  const set = (patch: Partial<SurgDetailDraft>) => onChange({ ...draft, ...patch });
  const disabled = !canWrite;

  const staffOptions: HubComboboxOption[] = useMemo(
    () => staff.filter((s) => s.active !== false).map((s) => ({ value: s.id, label: s.full_name })),
    [staff],
  );

  const asaOptions: HubComboboxOption[] = useMemo(
    () => SURGERY_ASA_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    [],
  );

  return (
    <div className="nam-form hub-hosp-admit">
      <div className="nam-quick-card">
        {tab === 'pre_op' ? (
          <>
            <div className="nam-field">
              <label className="nam-label" htmlFor="clinic-surg-detail-staff">
                Responsável
              </label>
              <HubSearchableCombobox
                id="clinic-surg-detail-staff"
                options={staffOptions}
                value={draft.staffId}
                onChange={(v) => set({ staffId: v })}
                placeholder="Veterinário responsável…"
                searchPlaceholder="Buscar profissional…"
                ariaLabel="Responsável da cirurgia"
                disabled={disabled}
                clearable
              />
            </div>
            <div className="nam-field">
              <label className="nam-label" htmlFor="clinic-surg-detail-asa">
                Risco anestésico
              </label>
              <HubSearchableCombobox
                id="clinic-surg-detail-asa"
                options={asaOptions}
                value={draft.asaRisk}
                onChange={(v) => set({ asaRisk: (v as HubAnestheticRisk) || '' })}
                placeholder="Não classificado"
                searchPlaceholder="ASA…"
                ariaLabel="Risco anestésico"
                disabled={disabled}
                clearable
              />
            </div>
            <div className="nam-field">
              <label className="nam-label" htmlFor="clinic-surg-detail-pre-notes">
                Observações pré-operatórias
              </label>
              <textarea
                id="clinic-surg-detail-pre-notes"
                className="nam-textarea"
                rows={3}
                value={draft.preOp.notes}
                disabled={disabled}
                onChange={(e) => set({ preOp: { ...draft.preOp, notes: e.target.value } })}
                placeholder="Medicações, alergias, restrições…"
              />
            </div>
          </>
        ) : null}

        {tab === 'procedure' ? (
          <>
            <div className="nam-row nam-row--cols2">
              <div className="nam-field">
                <label className="nam-label" htmlFor="clinic-surg-detail-duration">
                  Duração (minutos)
                </label>
                <input
                  id="clinic-surg-detail-duration"
                  className="nam-input"
                  inputMode="numeric"
                  value={draft.procedure.durationMinutes}
                  disabled={disabled}
                  onChange={(e) =>
                    set({ procedure: { ...draft.procedure, durationMinutes: e.target.value } })
                  }
                  placeholder="Ex.: 45"
                />
              </div>
              <div className="nam-field">
                <label className="nam-label" htmlFor="clinic-surg-detail-lat">
                  Lateridade
                </label>
                <HubSearchableCombobox
                  id="clinic-surg-detail-lat"
                  options={LATERALITY_OPTIONS}
                  value={draft.procedure.laterality}
                  onChange={(v) => set({ procedure: { ...draft.procedure, laterality: v } })}
                  placeholder="Não se aplica"
                  searchPlaceholder="Lado…"
                  ariaLabel="Lateridade"
                  disabled={disabled}
                  clearable
                />
              </div>
            </div>
            <div className="nam-field">
              <label className="nam-label" htmlFor="clinic-surg-detail-proc">
                Relato do procedimento
              </label>
              <textarea
                id="clinic-surg-detail-proc"
                className="nam-textarea"
                rows={4}
                value={draft.procedure.notes}
                disabled={disabled}
                onChange={(e) => set({ procedure: { ...draft.procedure, notes: e.target.value } })}
                placeholder="O que foi feito, técnica, achados intraoperatórios…"
              />
            </div>
            <div className="nam-field">
              <label className="nam-label" htmlFor="clinic-surg-detail-findings">
                Achados
              </label>
              <textarea
                id="clinic-surg-detail-findings"
                className="nam-textarea"
                rows={3}
                value={draft.procedure.findings}
                disabled={disabled}
                onChange={(e) =>
                  set({ procedure: { ...draft.procedure, findings: e.target.value } })
                }
                placeholder="O que foi encontrado…"
              />
            </div>
            <div className="nam-field">
              <label className="nam-label" htmlFor="clinic-surg-detail-compl">
                Intercorrências
              </label>
              <textarea
                id="clinic-surg-detail-compl"
                className="nam-textarea"
                rows={3}
                value={draft.procedure.complications}
                disabled={disabled}
                onChange={(e) =>
                  set({ procedure: { ...draft.procedure, complications: e.target.value } })
                }
                placeholder="Nenhuma, ou descreva…"
              />
            </div>
          </>
        ) : null}

        {tab === 'team' ? (
          <>
            {draft.team.map((row, index) => (
              <div key={`team-${index}`} className="nam-row nam-row--cols2 hub-surg-team-row">
                <div className="nam-field">
                  <label className="nam-label" htmlFor={`clinic-surg-team-role-${index}`}>
                    Função
                  </label>
                  <HubSearchableCombobox
                    id={`clinic-surg-team-role-${index}`}
                    options={TEAM_ROLE_OPTIONS}
                    value={row.role}
                    onChange={(v) => {
                      const team = draft.team.map((r, i) => (i === index ? { ...r, role: v } : r));
                      set({ team });
                    }}
                    placeholder="Cirurgião, anestesista…"
                    searchPlaceholder="Função…"
                    ariaLabel={`Função ${index + 1}`}
                    disabled={disabled}
                    allowCreate
                    createEntityLabel="função"
                    createEntityGender="f"
                  />
                </div>
                <div className="nam-field">
                  <label className="nam-label" htmlFor={`clinic-surg-team-staff-${index}`}>
                    Profissional
                  </label>
                  <div className="hub-surg-team-row__staff">
                    <HubSearchableCombobox
                      id={`clinic-surg-team-staff-${index}`}
                      options={staffOptions}
                      value={row.staffId}
                      onChange={(v) => {
                        const member = staff.find((s) => s.id === v);
                        const team = draft.team.map((r, i) =>
                          i === index ? { ...r, staffId: v, name: member?.full_name || r.name } : r,
                        );
                        set({ team });
                      }}
                      placeholder="Quem assumiu…"
                      searchPlaceholder="Buscar profissional…"
                      ariaLabel={`Profissional ${index + 1}`}
                      disabled={disabled}
                      clearable
                    />
                    {canWrite && draft.team.length > 1 ? (
                      <button
                        type="button"
                        className="hub-dayboard__action-btn"
                        title="Remover da equipe"
                        aria-label="Remover da equipe"
                        onClick={() => set({ team: draft.team.filter((_, i) => i !== index) })}
                      >
                        <Trash2 size={15} strokeWidth={2} />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
            {canWrite ? (
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost"
                onClick={() => set({ team: [...draft.team, emptyTeamRow()] })}
              >
                <Plus size={15} strokeWidth={2} /> Adicionar profissional
              </button>
            ) : null}
            <div className="nam-field">
              <label className="nam-label" htmlFor="clinic-surg-detail-team-notes">
                Observações da equipe
              </label>
              <textarea
                id="clinic-surg-detail-team-notes"
                className="nam-textarea"
                rows={3}
                value={draft.teamNotes}
                disabled={disabled}
                onChange={(e) => set({ teamNotes: e.target.value })}
                placeholder="Turnos, substituições, observações…"
              />
            </div>
          </>
        ) : null}

        {tab === 'post_op' ? (
          <>
            <div className="nam-field">
              <label className="nam-label" htmlFor="clinic-surg-detail-recovery">
                Recuperação
              </label>
              <textarea
                id="clinic-surg-detail-recovery"
                className="nam-textarea"
                rows={3}
                value={draft.postOp.recovery}
                disabled={disabled}
                onChange={(e) => set({ postOp: { ...draft.postOp, recovery: e.target.value } })}
                placeholder="Extubação, dor, estabilidade…"
              />
            </div>
            <div className="nam-field">
              <label className="nam-label" htmlFor="clinic-surg-detail-post-notes">
                Observações pós-operatórias
              </label>
              <textarea
                id="clinic-surg-detail-post-notes"
                className="nam-textarea"
                rows={3}
                value={draft.postOp.notes}
                disabled={disabled}
                onChange={(e) => set({ postOp: { ...draft.postOp, notes: e.target.value } })}
                placeholder="Medicações, curativo, restrições imediatas…"
              />
            </div>
            <div className="nam-field">
              <label className="nam-label" htmlFor="clinic-surg-detail-instr">
                Orientações ao tutor
              </label>
              <textarea
                id="clinic-surg-detail-instr"
                className="nam-textarea"
                rows={3}
                value={draft.postOp.instructions}
                disabled={disabled}
                onChange={(e) =>
                  set({ postOp: { ...draft.postOp, instructions: e.target.value } })
                }
                placeholder="Colar, alimentação, retorno, sinais de alerta…"
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default SurgDetailForm;
