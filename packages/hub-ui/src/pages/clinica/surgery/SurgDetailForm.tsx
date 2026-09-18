import React, { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { HubAnestheticRisk, HubSurgery, HubSurgeryPayable } from '../../../api/hubClinicalApi';
import type { HubStaffMember } from '../../../api/hubStaffApi';
import { HubSearchableCombobox } from '../../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../../components/HubSearchableCombobox';
import { HubDateField } from '../../../components/HubDateField';
import { staffAffiliationLabel, isGuestAffiliation } from '../../../constants/hubStaffAffiliation';
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

const FEE_STATUS_OPTIONS: HubComboboxOption[] = [
  { value: '', label: 'Sem lançamento' },
  { value: 'pending', label: 'Pendente (a pagar)' },
  { value: 'paid', label: 'Já pago' },
];

const FEE_PAYMENT_OPTIONS: HubComboboxOption[] = [
  { value: 'pix', label: 'PIX' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'transfer', label: 'Transferência' },
  { value: 'credit_card', label: 'Cartão de crédito' },
  { value: 'debit_card', label: 'Cartão de débito' },
  { value: 'other', label: 'Outro' },
];

const LATERALITY_OPTIONS: HubComboboxOption[] = [
  { value: 'left', label: 'Esquerdo' },
  { value: 'right', label: 'Direito' },
  { value: 'bilateral', label: 'Bilateral' },
];

export type SurgTeamFeeStatus = '' | 'pending' | 'paid';

export type SurgTeamRow = {
  role: string;
  staffId: string;
  name: string;
  /** Valor que a clínica paga ao profissional (não vai para a comanda do tutor). */
  feeAmount: string;
  feeStatus: SurgTeamFeeStatus;
  feeDueDate: string;
  feePaymentMethod: string;
  /** Título já liquidado no financeiro — campos de honorário ficam só leitura. */
  feeLockedPaid: boolean;
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
  return {
    role: '',
    staffId: '',
    name: '',
    feeAmount: '',
    feeStatus: '',
    feeDueDate: '',
    feePaymentMethod: '',
    feeLockedPaid: false,
  };
}

function matchPayable(
  payables: HubSurgeryPayable[] | undefined,
  staffId: string,
  role: string,
): HubSurgeryPayable | undefined {
  if (!payables?.length || !staffId || !role) return undefined;
  return payables.find(
    (p) => p.payee_staff_member_id === staffId && (p.source_role || '').trim() === role.trim(),
  );
}

export function parseSurgDetail(
  surgery: HubSurgery,
  payables?: HubSurgeryPayable[],
): SurgDetailDraft {
  const pre = asRecord(surgery.pre_op);
  const proc = asRecord(surgery.procedure);
  const post = asRecord(surgery.post_op);
  const teamRaw = Array.isArray(surgery.team) ? surgery.team : [];
  const team = teamRaw.map((row) => {
    const r = asRecord(row);
    const role = asStr(r.role);
    const staffId = asStr(r.staff_id ?? r.hub_staff_member_id);
    const payable = matchPayable(payables, staffId, role);
    const feeLockedPaid = payable?.status === 'paid';
    return {
      role,
      staffId,
      name: asStr(r.name ?? r.full_name),
      feeAmount: payable ? String(payable.amount) : '',
      feeStatus: (payable?.status === 'paid' || payable?.status === 'pending'
        ? payable.status
        : '') as SurgTeamFeeStatus,
      feeDueDate: payable?.due_date ? String(payable.due_date).slice(0, 10) : '',
      feePaymentMethod: payable?.payment_method ? String(payable.payment_method) : '',
      feeLockedPaid,
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
    .map((row) => {
      const base: Record<string, unknown> = {
        role: row.role || null,
        staff_id: row.staffId || null,
        name: row.name || null,
      };
      const amountRaw = row.feeAmount.trim().replace(',', '.');
      const amount = amountRaw ? Number(amountRaw) : NaN;
      if (row.feeStatus && Number.isFinite(amount) && amount > 0) {
        base.fee_amount = amount;
        base.fee_status = row.feeStatus;
        if (row.feeStatus === 'pending' && row.feeDueDate) base.fee_due_date = row.feeDueDate;
        if (row.feeStatus === 'paid' && row.feePaymentMethod) {
          base.fee_payment_method = row.feePaymentMethod;
        }
      }
      return base;
    });

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
    () =>
      staff
        .filter((s) => s.active !== false)
        .map((s) => ({
          value: s.id,
          label: isGuestAffiliation(s.affiliation)
            ? `${s.full_name} · ${staffAffiliationLabel(s.affiliation)}`
            : s.full_name,
        })),
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
                Risco anestésico (ASA)
              </label>
              <HubSearchableCombobox
                id="clinic-surg-detail-asa"
                options={asaOptions}
                value={draft.asaRisk}
                onChange={(v) => set({ asaRisk: v as HubAnestheticRisk | '' })}
                placeholder="Classificação ASA…"
                searchPlaceholder="Buscar…"
                ariaLabel="Risco anestésico"
                disabled={disabled}
                clearable
              />
            </div>
            <div className="nam-field">
              <label className="nam-label" htmlFor="clinic-surg-detail-preop-notes">
                Observações pré-operatórias
              </label>
              <textarea
                id="clinic-surg-detail-preop-notes"
                className="nam-textarea"
                rows={4}
                value={draft.preOp.notes}
                disabled={disabled}
                onChange={(e) => set({ preOp: { ...draft.preOp, notes: e.target.value } })}
                placeholder="Jejum, exames, intercorrências…"
              />
            </div>
          </>
        ) : null}

        {tab === 'procedure' ? (
          <>
            <div className="nam-field">
              <label className="nam-label" htmlFor="clinic-surg-detail-proc-notes">
                Descrição do procedimento
              </label>
              <textarea
                id="clinic-surg-detail-proc-notes"
                className="nam-textarea"
                rows={4}
                value={draft.procedure.notes}
                disabled={disabled}
                onChange={(e) => set({ procedure: { ...draft.procedure, notes: e.target.value } })}
              />
            </div>
            <div className="nam-row nam-row--cols2">
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
                  onChange={(e) => set({ procedure: { ...draft.procedure, findings: e.target.value } })}
                />
              </div>
              <div className="nam-field">
                <label className="nam-label" htmlFor="clinic-surg-detail-complications">
                  Complicações
                </label>
                <textarea
                  id="clinic-surg-detail-complications"
                  className="nam-textarea"
                  rows={3}
                  value={draft.procedure.complications}
                  disabled={disabled}
                  onChange={(e) =>
                    set({ procedure: { ...draft.procedure, complications: e.target.value } })
                  }
                />
              </div>
            </div>
            <div className="nam-row nam-row--cols2">
              <div className="nam-field">
                <label className="nam-label" htmlFor="clinic-surg-detail-duration">
                  Duração (minutos)
                </label>
                <input
                  id="clinic-surg-detail-duration"
                  className="nam-input"
                  value={draft.procedure.durationMinutes}
                  disabled={disabled}
                  onChange={(e) =>
                    set({ procedure: { ...draft.procedure, durationMinutes: e.target.value } })
                  }
                  inputMode="numeric"
                />
              </div>
              <div className="nam-field">
                <label className="nam-label" htmlFor="clinic-surg-detail-laterality">
                  Lateralidade
                </label>
                <HubSearchableCombobox
                  id="clinic-surg-detail-laterality"
                  options={LATERALITY_OPTIONS}
                  value={draft.procedure.laterality}
                  onChange={(v) => set({ procedure: { ...draft.procedure, laterality: v } })}
                  placeholder="Opcional…"
                  searchPlaceholder="Lateralidade…"
                  ariaLabel="Lateralidade"
                  disabled={disabled}
                  clearable
                />
              </div>
            </div>
          </>
        ) : null}

        {tab === 'team' ? (
          <>
            <p className="hub-clientes__muted" style={{ marginBottom: 12 }}>
              Valor que a clínica paga ao profissional. Não aparece na cobrança do tutor.
            </p>
            {draft.team.map((row, index) => {
              const feeDisabled = disabled || row.feeLockedPaid;
              return (
                <div key={`team-${index}`} className="hub-surg-team-row" style={{ marginBottom: 16 }}>
                  <div className="nam-row nam-row--cols2">
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
                        disabled={feeDisabled}
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
                          disabled={feeDisabled}
                          clearable
                        />
                        {canWrite && draft.team.length > 1 && !row.feeLockedPaid ? (
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
                  <div className="nam-row nam-row--cols2" style={{ marginTop: 8 }}>
                    <div className="nam-field">
                      <label className="nam-label" htmlFor={`clinic-surg-team-fee-${index}`}>
                        Honorário (R$)
                      </label>
                      <input
                        id={`clinic-surg-team-fee-${index}`}
                        className="nam-input"
                        value={row.feeAmount}
                        disabled={feeDisabled}
                        inputMode="decimal"
                        placeholder="Ex.: 800"
                        onChange={(e) => {
                          const team = draft.team.map((r, i) =>
                            i === index ? { ...r, feeAmount: e.target.value } : r,
                          );
                          set({ team });
                        }}
                      />
                    </div>
                    <div className="nam-field">
                      <label className="nam-label" htmlFor={`clinic-surg-team-fee-status-${index}`}>
                        Situação do pagamento
                      </label>
                      <HubSearchableCombobox
                        id={`clinic-surg-team-fee-status-${index}`}
                        options={FEE_STATUS_OPTIONS}
                        value={row.feeStatus}
                        onChange={(v) => {
                          const team = draft.team.map((r, i) =>
                            i === index
                              ? {
                                  ...r,
                                  feeStatus: v as SurgTeamFeeStatus,
                                  feePaymentMethod:
                                    v === 'paid' ? r.feePaymentMethod || 'pix' : r.feePaymentMethod,
                                }
                              : r,
                          );
                          set({ team });
                        }}
                        placeholder="Sem lançamento…"
                        searchPlaceholder="Situação…"
                        ariaLabel={`Situação do honorário ${index + 1}`}
                        disabled={feeDisabled}
                      />
                    </div>
                  </div>
                  {row.feeStatus === 'pending' ? (
                    <div className="nam-field" style={{ marginTop: 8 }}>
                      <HubDateField
                        id={`clinic-surg-team-fee-due-${index}`}
                        label="Vencimento"
                        valueIso={row.feeDueDate}
                        onChangeIso={(iso) => {
                          const team = draft.team.map((r, i) =>
                            i === index ? { ...r, feeDueDate: iso } : r,
                          );
                          set({ team });
                        }}
                        disabled={feeDisabled}
                        showTodayButton={false}
                      />
                    </div>
                  ) : null}
                  {row.feeStatus === 'paid' ? (
                    <div className="nam-field" style={{ marginTop: 8 }}>
                      <label className="nam-label" htmlFor={`clinic-surg-team-fee-pay-${index}`}>
                        Forma de pagamento
                      </label>
                      <HubSearchableCombobox
                        id={`clinic-surg-team-fee-pay-${index}`}
                        options={FEE_PAYMENT_OPTIONS}
                        value={row.feePaymentMethod}
                        onChange={(v) => {
                          const team = draft.team.map((r, i) =>
                            i === index ? { ...r, feePaymentMethod: v } : r,
                          );
                          set({ team });
                        }}
                        placeholder="PIX, transferência…"
                        searchPlaceholder="Forma…"
                        ariaLabel={`Forma de pagamento ${index + 1}`}
                        disabled={feeDisabled}
                      />
                    </div>
                  ) : null}
                  {row.feeLockedPaid ? (
                    <p className="hub-clientes__muted" style={{ marginTop: 6, fontSize: 13 }}>
                      Honorário já liquidado no financeiro — alterações de valor só pelo módulo Contas a
                      pagar (não reabre o título daqui).
                    </p>
                  ) : null}
                </div>
              );
            })}
            {canWrite ? (
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost"
                onClick={() => set({ team: [...draft.team, emptyTeamRow()] })}
              >
                <Plus size={15} strokeWidth={2} /> Adicionar profissional
              </button>
            ) : null}
            <div className="nam-field" style={{ marginTop: 12 }}>
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
              <label className="nam-label" htmlFor="clinic-surg-detail-postop-notes">
                Observações pós-operatórias
              </label>
              <textarea
                id="clinic-surg-detail-postop-notes"
                className="nam-textarea"
                rows={3}
                value={draft.postOp.notes}
                disabled={disabled}
                onChange={(e) => set({ postOp: { ...draft.postOp, notes: e.target.value } })}
              />
            </div>
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
              />
            </div>
            <div className="nam-field">
              <label className="nam-label" htmlFor="clinic-surg-detail-instructions">
                Orientações ao tutor
              </label>
              <textarea
                id="clinic-surg-detail-instructions"
                className="nam-textarea"
                rows={3}
                value={draft.postOp.instructions}
                disabled={disabled}
                onChange={(e) => set({ postOp: { ...draft.postOp, instructions: e.target.value } })}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default SurgDetailForm;
