import React, { useEffect, useMemo, useState } from 'react';
import { LogOut } from 'lucide-react';
import { HubSidePanel } from '../../../components/HubSidePanel';
import { HubCancelButton } from '../../../components/HubCancelButton';
import { HubSearchableCombobox } from '../../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../../components/HubSearchableCombobox';
import { hubClinicalApi, type HubHospitalization } from '../../../api/hubClinicalApi';
import { useAlert } from '../../../components/AlertProvider';
import { formatHospDateTime, HOSP_STATUS_LABEL, petInitials } from './hospDisplay';
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
  if (status === 'death') return 'Registre o contexto do óbito para o prontuário e o acompanhamento do tutor.';
  if (status === 'transferred') return 'Informe para onde o pet foi transferido e qualquer orientação de continuidade.';
  return 'Confirme a alta clínica. O leito será liberado e a internação sai da lista ativa.';
}

function confirmLabel(status: HospDischargeStatus): string {
  if (status === 'death') return 'Registrar óbito';
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
  const { showError, showSuccess } = useAlert();
  const [status, setStatus] = useState<HospDischargeStatus>('discharged');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStatus('discharged');
    setNotes('');
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

  const save = async () => {
    if (!hospitalization) return;
    setSubmitting(true);
    try {
      await hubClinicalApi.patchHospitalization(hospitalization.id, {
        clinic_id: clinicId,
        status,
        discharge_notes: notes.trim() || null,
      });
      showSuccess(
        status === 'death'
          ? 'Óbito registrado'
          : status === 'transferred'
            ? 'Transferência registrada'
            : 'Alta registrada',
      );
      onClose();
      await onDischarged();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao encerrar internação');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <HubSidePanel
      open={open && Boolean(hospitalization)}
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
      <div className="nam-form hub-hosp-discharge">
        <section className="hub-hosp-discharge__card" aria-label="Resumo da internação">
          <div className="hub-hosp-discharge__pet-head">
            <span className="hub-hosp-discharge__avatar" aria-hidden>
              {petInitials(petName)}
            </span>
            <div className="hub-hosp-discharge__pet-identity">
              <p className="hub-hosp-discharge__pet-name">{petName}</p>
              <p className="hub-hosp-discharge__pet-meta">
                {[species, HOSP_STATUS_LABEL[hospitalization?.status || ''] || 'Internado']
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </div>
          {facts.length > 0 ? (
            <dl className="hub-hosp-discharge__facts">
              {facts.map((fact) => (
                <div key={fact.label} className="hub-hosp-discharge__fact">
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </section>

        <section className="hub-hosp-discharge__card" aria-label="Encerramento">
          <div className="nam-field">
            <label className="nam-label" htmlFor="hosp-discharge-outcome">
              Tipo de encerramento
            </label>
            <HubSearchableCombobox
              id="hosp-discharge-outcome"
              className="hub-combobox--clientes"
              options={OUTCOME_OPTIONS}
              value={status}
              onChange={(v) => setStatus((v as HospDischargeStatus) || 'discharged')}
              placeholder="Selecionar…"
              allowCreate={false}
              ariaLabel="Tipo de encerramento"
              disabled={submitting}
            />
            <p className="nam-muted hub-hosp-discharge__hint">{outcomeHint(status)}</p>
          </div>

          <div className="nam-field">
            <label className="nam-label" htmlFor="hosp-discharge-notes">
              Observações
            </label>
            <textarea
              id="hosp-discharge-notes"
              className="hub-clientes__textarea"
              rows={4}
              value={notes}
              disabled={submitting}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                status === 'death'
                  ? 'Ex.: horário, causa presumida, orientação ao tutor…'
                  : status === 'transferred'
                    ? 'Ex.: clínica de destino, responsável, documentos enviados…'
                    : 'Ex.: recomendações de alta, medicação em casa, retorno…'
              }
            />
          </div>
        </section>
      </div>
    </HubSidePanel>
  );
};

export default HospDischargePanel;
