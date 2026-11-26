import React, { useEffect, useMemo, useState } from 'react';
import { LogOut } from 'lucide-react';
import { HubSidePanel } from '../../../components/HubSidePanel';
import { HubCancelButton } from '../../../components/HubCancelButton';
import { HubSearchableCombobox } from '../../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../../components/HubSearchableCombobox';
import { hubClinicalApi, type HubHospitalization } from '../../../api/hubClinicalApi';
import { useAlert } from '../../../components/AlertProvider';
import { formatHospDateTime, HOSP_STATUS_LABEL, petInitials } from './hospDisplay';
import { RegisterPetDeathModal } from '../../pets/RegisterPetDeathModal';
import type { PetDeathType } from '../../pets/petDeath';
import '../../agenda/new-appointment-modal.css';

export type HospDischargeStatus = 'discharged' | 'death' | 'transferred';

type Props = {
  open: boolean;
  clinicId: string;
  hospitalization: HubHospitalization | null;
  onClose: () => void;
  onDischarged: () => Promise<void> | void;
};

const OUTCOME_OPTIONS: HubComboboxOption[] = [
  { value: 'discharged', label: 'Alta' },
  { value: 'death', label: 'Óbito' },
  { value: 'transferred', label: 'Transferido' },
];

function stayLabel(admittedAt?: string | null): string {
  if (!admittedAt) return '—';
  const start = new Date(admittedAt).getTime();
  if (Number.isNaN(start)) return '—';
  const hours = Math.max(0, Math.floor((Date.now() - start) / 3_600_000));
  if (hours < 24) return hours <= 1 ? 'há menos de 1 h' : `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
}

function outcomeHint(status: HospDischargeStatus): string {
  if (status === 'death') return 'O óbito será registrado no cadastro do pet. Arquivar o cadastro é opcional.';
  if (status === 'transferred') return 'Informe para onde o pet foi transferido e qualquer orientação de continuidade.';
  return 'Confirme a alta clínica. O leito será liberado e a internação sai da lista ativa.';
}

function confirmLabel(status: HospDischargeStatus): string {
  if (status === 'death') return 'Continuar para óbito';
  if (status === 'transferred') return 'Confirmar transferência';
  return 'Confirmar alta';
}

const HospDischargePanel: React.FC<Props> = ({
  open,
  clinicId,
  hospitalization,
  onClose,
  onDischarged,
}) => {
  const { showError, showSuccess, showWarning } = useAlert();
  const [status, setStatus] = useState<HospDischargeStatus>('discharged');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deathModalOpen, setDeathModalOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStatus('discharged');
    setNotes('');
    setDeathModalOpen(false);
  }, [open, hospitalization?.id]);

  const petName = hospitalization?.hub_pets?.name?.trim() || 'Pet';
  const tutorName = hospitalization?.hub_guardians?.full_name?.trim() || null;
  const bedLabel =
    hospitalization?.hub_hospital_beds?.label ||
    hospitalization?.hub_hospital_beds?.code ||
    null;
  const caseTitle = hospitalization?.hub_clinical_cases?.title?.trim() || null;
  const species = hospitalization?.hub_pets?.species?.trim() || null;

  const facts = useMemo(() => {
    if (!hospitalization) return [] as Array<{ label: string; value: string }>;
    const rows: Array<{ label: string; value: string }> = [];
    if (tutorName) rows.push({ label: 'Tutor', value: tutorName });
    rows.push({ label: 'Leito', value: bedLabel || 'Sem leito' });
    rows.push({
      label: 'Internado desde',
      value: `${formatHospDateTime(hospitalization.admitted_at)} · ${stayLabel(hospitalization.admitted_at)}`,
    });
    if (hospitalization.reason?.trim()) rows.push({ label: 'Motivo', value: hospitalization.reason.trim() });
    if (caseTitle) rows.push({ label: 'Caso clínico', value: caseTitle });
    if (hospitalization.daily_hub_service_type_id || hospitalization.daily_unit_amount != null) {
      const amount =
        hospitalization.daily_unit_amount != null
          ? Number(hospitalization.daily_unit_amount).toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })
          : null;
      rows.push({
        label: 'Diária',
        value: amount
          ? `${amount}${hospitalization.daily_includes_medication ? ' · com medicação' : ''}`
          : hospitalization.daily_includes_medication
            ? 'Com medicação inclusa'
            : 'Configurada',
      });
    }
    return rows;
  }, [hospitalization, tutorName, bedLabel, caseTitle]);

  const saveNonDeath = async () => {
    if (!hospitalization) return;
    setSubmitting(true);
    try {
      await hubClinicalApi.patchHospitalization(hospitalization.id, {
        clinic_id: clinicId,
        status,
        discharge_notes: notes.trim() || null,
      });
      showSuccess(status === 'transferred' ? 'Transferência registrada' : 'Alta registrada');
      onClose();
      await onDischarged();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao encerrar internação');
    } finally {
      setSubmitting(false);
    }
  };

  const save = async () => {
    if (!hospitalization) return;
    if (status === 'death') {
      setDeathModalOpen(true);
      return;
    }
    await saveNonDeath();
  };

  return (
    <>
      <HubSidePanel
        open={open && Boolean(hospitalization) && !deathModalOpen}
        onClose={onClose}
        title="Encerrar internação"
        titleIcon={<LogOut size={18} strokeWidth={2} aria-hidden />}
        subtitle={petName}
        footer={
          <div className="hub-clientes__panel-footer">
            <HubCancelButton onClick={onClose} />
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              disabled={submitting}
              onClick={() => void save()}
            >
              {submitting ? 'Salvando…' : confirmLabel(status)}
            </button>
          </div>
        }
      >
        <div className="hub-form-stack" style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div
              aria-hidden
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'var(--hub-surface-muted, #f3f4f6)',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {petInitials(petName)}
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>{petName}</div>
              <div className="hub-clientes__muted" style={{ fontSize: 13 }}>
                {[species, HOSP_STATUS_LABEL[hospitalization?.status || 'active']].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>

          {facts.length ? (
            <dl style={{ margin: 0, display: 'grid', gap: 8 }}>
              {facts.map((f) => (
                <div key={f.label} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
                  <dt className="hub-clientes__muted" style={{ margin: 0 }}>
                    {f.label}
                  </dt>
                  <dd style={{ margin: 0 }}>{f.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <div className="hub-field">
            <span>Desfecho</span>
            <HubSearchableCombobox
              id="hosp-discharge-outcome"
              options={OUTCOME_OPTIONS}
              value={status}
              onChange={(v) => setStatus((v || 'discharged') as HospDischargeStatus)}
              allowCreate={false}
              clearable={false}
              ariaLabel="Desfecho da internação"
            />
            <p className="hub-clientes__muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
              {outcomeHint(status)}
            </p>
          </div>

          {status !== 'death' ? (
            <label className="hub-field">
              <span>Notas de alta / transferência</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                maxLength={4000}
              />
            </label>
          ) : null}
        </div>
      </HubSidePanel>

      <RegisterPetDeathModal
        open={deathModalOpen && Boolean(hospitalization)}
        onClose={() => setDeathModalOpen(false)}
        clinicId={clinicId}
        pet={
          hospitalization
            ? {
                id: hospitalization.pet_id,
                name: petName,
                species: species || '',
              }
            : null
        }
        deathSource="hospitalization"
        deathRefId={hospitalization?.id}
        hubCaseId={hospitalization?.hub_case_id}
        hubEncounterId={hospitalization?.hub_encounter_id}
        onClinicalSubmit={async (payload) => {
          if (!hospitalization) return;
          const res = (await hubClinicalApi.patchHospitalization(hospitalization.id, {
            clinic_id: clinicId,
            status: 'death',
            discharge_notes: payload.death_notes,
            pet_death: {
              deceased_at: payload.deceased_at,
              death_type: payload.death_type as PetDeathType,
              death_cause: payload.death_cause,
              death_notes: payload.death_notes,
              archive: payload.archive,
            },
          })) as { pet_death_pending?: { future_appointments: number; active_boarding_reservations: number } };
          const pending = res.pet_death_pending;
          if (pending && (pending.future_appointments > 0 || pending.active_boarding_reservations > 0)) {
            showWarning(
              `Há pendências: ${pending.future_appointments} agendamento(s) futuro(s) e ${pending.active_boarding_reservations} reserva(s). Nada foi cancelado automaticamente.`,
            );
          }
          setDeathModalOpen(false);
          onClose();
          await onDischarged();
        }}
      />
    </>
  );
};

export default HospDischargePanel;
