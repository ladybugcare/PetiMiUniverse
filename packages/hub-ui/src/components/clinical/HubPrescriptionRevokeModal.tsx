import React, { useEffect, useMemo, useState } from 'react';
import { HubModal } from '../HubModal';
import type { HubPrescriptionDocumentRow } from '../../api/hubClinicalApi';

const REVOKE_REASON_PRESETS = [
  { id: 'posology', label: 'Erro de posologia' },
  { id: 'medication', label: 'Medicamento incorreto' },
  { id: 'patient', label: 'Dados do paciente incorretos' },
  { id: 'duplicate', label: 'Emissão duplicada' },
  { id: 'tutor', label: 'Solicitação do tutor' },
  { id: 'other', label: 'Outros' },
] as const;

type PresetId = (typeof REVOKE_REASON_PRESETS)[number]['id'];

type Props = {
  open: boolean;
  onClose: () => void;
  document: HubPrescriptionDocumentRow | null;
  onConfirm: (reason: string) => Promise<void>;
  submitting?: boolean;
};

export function HubPrescriptionRevokeModal({ open, onClose, document, onConfirm, submitting }: Props) {
  const [presetId, setPresetId] = useState<PresetId | ''>('');
  const [otherReason, setOtherReason] = useState('');

  useEffect(() => {
    if (!open) {
      setPresetId('');
      setOtherReason('');
    }
  }, [open]);

  const selectedPreset = useMemo(
    () => REVOKE_REASON_PRESETS.find((p) => p.id === presetId) ?? null,
    [presetId],
  );

  const finalReason = useMemo(() => {
    if (!selectedPreset) return '';
    if (selectedPreset.id === 'other') return otherReason.trim();
    return selectedPreset.label;
  }, [selectedPreset, otherReason]);

  const canSubmit = finalReason.length >= 10 && finalReason.length <= 500;

  return (
    <HubModal
      open={open}
      onClose={onClose}
      title="Revogar receita validável"
      subtitle={
        document
          ? `Versão ${document.version_no}${document.validation_code ? ` · ${document.validation_code}` : ''}`
          : undefined
      }
      footer={
        <>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
            disabled={submitting}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--danger hub-clientes__btn--sm"
            disabled={!canSubmit || submitting}
            onClick={() => void onConfirm(finalReason)}
          >
            {submitting ? 'Revogando…' : 'Confirmar revogação'}
          </button>
        </>
      }
    >
      <p className="hub-rx-revoke__lead">
        A receita deixará de constar como válida na consulta pública. Escolha o motivo da revogação.
      </p>

      <div className="hub-rx-revoke__options" role="radiogroup" aria-label="Motivo da revogação">
        {REVOKE_REASON_PRESETS.map((preset) => {
          const selected = presetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`hub-rx-revoke__option${selected ? ' hub-rx-revoke__option--selected' : ''}`}
              disabled={submitting}
              onClick={() => setPresetId(preset.id)}
            >
              <span className="hub-rx-revoke__radio" aria-hidden />
              <span className="hub-rx-revoke__option-label">{preset.label}</span>
            </button>
          );
        })}
      </div>

      {presetId === 'other' ? (
        <div className="hub-rx-revoke__other">
          <label className="hub-rx-revoke__other-label" htmlFor="hub-rx-revoke-other">
            Descreva o motivo (mínimo 10 caracteres)
          </label>
          <textarea
            id="hub-rx-revoke-other"
            className="hub-clientes__input"
            rows={3}
            value={otherReason}
            disabled={submitting}
            placeholder="Descreva o motivo da revogação"
            onChange={(e) => setOtherReason(e.target.value)}
          />
          <p className="hub-rx-revoke__counter">{otherReason.trim().length}/500 caracteres</p>
        </div>
      ) : null}
    </HubModal>
  );
}
