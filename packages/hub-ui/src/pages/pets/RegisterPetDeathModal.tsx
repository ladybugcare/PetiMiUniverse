import React, { useEffect, useMemo, useState } from 'react';
import { HeartCrack } from 'lucide-react';
import { HubModal } from '../../components/HubModal';
import { HubCancelButton } from '../../components/HubCancelButton';
import { HubDateField } from '../../components/HubDateField';
import { HubTimeField } from '../../components/HubTimeField';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { useAlert } from '../../components/AlertProvider';
import { hubPetsApi, type HubPet, type HubPetDeathPending } from '../../api/hubPetsApi';
import {
  DEATH_TYPE_OPTIONS,
  fromDateAndHm,
  joinDeceasedLocal,
  splitDeceasedLocal,
  toDatetimeLocalValue,
  type PetDeathSource,
  type PetDeathType,
} from './petDeath';
import '../clientes/clientes.css';
import './register-pet-death-modal.css';

export type RegisterPetDeathModalProps = {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  pet: Pick<HubPet, 'id' | 'name' | 'species'> | null;
  /** Origem do registro; default manual. */
  deathSource?: PetDeathSource;
  deathRefId?: string | null;
  hubCaseId?: string | null;
  hubEncounterId?: string | null;
  /**
   * Se informado, o modal NÃO chama a API de pets — devolve o payload para o fluxo clínico
   * gravar óbito + desfecho no mesmo request.
   */
  onClinicalSubmit?: (payload: {
    deceased_at: string;
    death_type: PetDeathType;
    death_cause: string | null;
    death_notes: string | null;
    archive: boolean;
  }) => Promise<void> | void;
  onRegistered?: (result: {
    pet: HubPet;
    pending?: HubPetDeathPending;
    archived?: boolean;
  }) => void;
};

const TYPE_OPTIONS: HubComboboxOption[] = [
  { value: '', label: 'Selecione a classificação…' },
  ...DEATH_TYPE_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
  })),
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function defaultDeathType(source: PetDeathSource): PetDeathType | '' {
  if (source === 'encounter') return 'euthanasia';
  return '';
}

export const RegisterPetDeathModal: React.FC<RegisterPetDeathModalProps> = ({
  open,
  onClose,
  clinicId,
  pet,
  deathSource = 'manual',
  deathRefId = null,
  hubCaseId = null,
  hubEncounterId = null,
  onClinicalSubmit,
  onRegistered,
}) => {
  const { showError, showSuccess, showWarning } = useAlert();
  const [deceasedLocal, setDeceasedLocal] = useState(toDatetimeLocalValue());
  const [deathType, setDeathType] = useState<PetDeathType | ''>('');
  const [deathCause, setDeathCause] = useState('');
  const [deathNotes, setDeathNotes] = useState('');
  const [archive, setArchive] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const deceasedParts = useMemo(() => splitDeceasedLocal(deceasedLocal), [deceasedLocal]);

  useEffect(() => {
    if (!open) return;
    setDeceasedLocal(toDatetimeLocalValue());
    setDeathType(defaultDeathType(deathSource));
    setDeathCause('');
    setDeathNotes('');
    setArchive(false);
    setConfirmed(false);
  }, [open, pet?.id, deathSource]);

  const petName = pet?.name?.trim() || 'Pet';
  const species = pet?.species?.trim() || null;

  const canSubmit = useMemo(
    () => Boolean(confirmed && deathType && deceasedParts.dateIso && deceasedParts.hm && !submitting),
    [confirmed, deathType, deceasedParts.dateIso, deceasedParts.hm, submitting],
  );

  const submit = async () => {
    if (!pet || !clinicId) return;
    if (!deathType) {
      showError('Selecione a classificação do óbito.');
      return;
    }
    if (!confirmed) {
      showError('Confirme explicitamente o registro de óbito.');
      return;
    }
    if (!deceasedParts.dateIso || !deceasedParts.hm) {
      showError('Informe a data e a hora do óbito.');
      return;
    }
    const deceased_at = fromDateAndHm(deceasedParts.dateIso, deceasedParts.hm);
    if (new Date(deceased_at).getTime() > Date.now() + 60_000) {
      showError('A data do óbito não pode ser futura.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        deceased_at,
        death_type: deathType,
        death_cause: deathCause.trim() || null,
        death_notes: deathNotes.trim() || null,
        archive,
      };

      if (onClinicalSubmit) {
        await onClinicalSubmit(payload);
        showSuccess('Óbito registrado');
        onClose();
        return;
      }

      const res = await hubPetsApi.registerDeath(pet.id, {
        clinic_id: clinicId,
        ...payload,
        death_source: deathSource,
        death_ref_id: deathRefId,
        hub_case_id: hubCaseId,
        hub_encounter_id: hubEncounterId,
      });
      showSuccess(archive ? 'Óbito registrado e cadastro arquivado' : 'Óbito registrado');
      const pending = res.pending;
      if (pending && (pending.future_appointments > 0 || pending.active_boarding_reservations > 0)) {
        showWarning(
          `Há pendências: ${pending.future_appointments} agendamento(s) futuro(s) e ${pending.active_boarding_reservations} reserva(s) de hotel/creche. Revise manualmente — nada foi cancelado automaticamente.`,
        );
      }
      onRegistered?.(res);
      onClose();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registrar óbito');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <HubModal
      open={open && Boolean(pet)}
      onClose={onClose}
      title="Registrar óbito"
      subtitle="Registro clínico — independente do arquivamento"
      size="lg"
      footer={
        <div className="hub-clientes__panel-footer">
          <HubCancelButton onClick={onClose} disabled={submitting} />
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary hub-pet-death__footer-primary"
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            <HeartCrack size={16} aria-hidden />
            {submitting ? 'Registrando…' : 'Confirmar óbito'}
          </button>
        </div>
      }
    >
      <div className="hub-pet-death">
        <div className="hub-pet-death__identity" aria-label={`Pet ${petName}`}>
          <div className="hub-pet-death__avatar" aria-hidden>
            {initials(petName)}
          </div>
          <div className="hub-pet-death__identity-body">
            <p className="hub-pet-death__identity-name">{petName}</p>
            {species ? <p className="hub-pet-death__identity-meta">{species}</p> : null}
          </div>
        </div>

        <p className="hub-pet-death__callout">
          O pet <strong>deixa de entrar</strong> em novas agendas, vacinas, reservas e vendas.
          Prontuário, serviços abertos e financeiro existente são preservados. Arquivar o cadastro é
          opcional e separado deste registro.
        </p>

        <div className="hub-pet-death__when" role="group" aria-label="Data e hora do óbito">
          <HubDateField
            id="pet-death-date"
            label="Data do óbito"
            valueIso={deceasedParts.dateIso}
            onChangeIso={(iso) => setDeceasedLocal(joinDeceasedLocal(iso, deceasedParts.hm))}
            showTodayButton
            required
          />
          <HubTimeField
            id="pet-death-time"
            label="Hora"
            valueHm={deceasedParts.hm}
            onChangeHm={(hm) => setDeceasedLocal(joinDeceasedLocal(deceasedParts.dateIso, hm))}
            showNowButton
            minuteStep={1}
            required
          />
        </div>

        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="pet-death-type">
            Classificação
          </label>
          <HubSearchableCombobox
            id="pet-death-type"
            className="hub-combobox--clientes"
            options={TYPE_OPTIONS}
            value={deathType}
            onChange={(v) => setDeathType((v || '') as PetDeathType | '')}
            allowCreate={false}
            clearable={false}
            ariaLabel="Classificação do óbito"
            placeholder="Selecione a classificação…"
          />
        </div>

        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="pet-death-cause">
            Causa clínica <span className="hub-clientes__muted">(opcional)</span>
          </label>
          <input
            id="pet-death-cause"
            type="text"
            className="hub-clientes__input"
            value={deathCause}
            onChange={(e) => setDeathCause(e.target.value)}
            maxLength={2000}
            placeholder="Ex.: insuficiência renal crônica"
          />
        </div>

        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="pet-death-notes">
            Observações <span className="hub-clientes__muted">(opcional)</span>
          </label>
          <textarea
            id="pet-death-notes"
            className="hub-clientes__textarea"
            value={deathNotes}
            onChange={(e) => setDeathNotes(e.target.value)}
            rows={4}
            maxLength={4000}
            placeholder="Contexto para o prontuário e o acompanhamento do tutor"
          />
        </div>

        <div className="hub-pet-death__options">
          <label className="hub-pet-death__check">
            <input
              type="checkbox"
              checked={archive}
              onChange={(e) => setArchive(e.target.checked)}
            />
            <span className="hub-pet-death__check-copy">
              <span className="hub-pet-death__check-title">Arquivar o cadastro</span>
              <span className="hub-pet-death__check-hint">
                Ação administrativa. Dá para desarquivar depois sem apagar o óbito.
              </span>
            </span>
          </label>

          <label className="hub-pet-death__check hub-pet-death__check--confirm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span className="hub-pet-death__check-copy">
              <span className="hub-pet-death__check-title">
                Confirmo o registro de óbito de {petName}
              </span>
              <span className="hub-pet-death__check-hint">
                Obrigatório para liberar o botão de confirmação.
              </span>
            </span>
          </label>
        </div>
      </div>
    </HubModal>
  );
};

export default RegisterPetDeathModal;
