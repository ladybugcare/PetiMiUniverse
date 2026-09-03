import React, { useState } from 'react';
import { hubClinicalApi } from '../../api/hubClinicalApi';
import { PET_CLINICAL_FLAG_OPTIONS, defaultClinicalFlagLabel } from './petClinicalFlags';
import { useAlert } from '../../components/AlertProvider';

type Props = {
  clinicId: string;
  petId: string;
  source: 'grooming' | 'boarding';
  existingFlagKeys: string[];
  onAdded: () => void;
};

export const PetOperationalAddAlert: React.FC<Props> = ({
  clinicId,
  petId,
  source,
  existingFlagKeys,
  onAdded,
}) => {
  const { showError, showSuccess } = useAlert();
  const available = PET_CLINICAL_FLAG_OPTIONS.filter((o) => !existingFlagKeys.includes(o.key));
  const [flagKey, setFlagKey] = useState(available[0]?.key ?? 'allergy');
  const [busy, setBusy] = useState(false);

  if (available.length === 0) return null;

  const add = async () => {
    setBusy(true);
    try {
      const res = await hubClinicalApi.upsertPetFlag({
        clinic_id: clinicId,
        pet_id: petId,
        flag_key: flagKey,
        label: defaultClinicalFlagLabel(flagKey),
        profile_source: source,
      });
      if ((res as { noop?: boolean }).noop) {
        showSuccess('Este alerta já estava na ficha');
      } else {
        showSuccess('Alerta adicionado à ficha do pet');
      }
      onAdded();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Não foi possível adicionar o alerta');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hub-pet-add-alert" style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <select
        className="hub-clientes__input"
        style={{ minWidth: 160, flex: '1 1 140px' }}
        value={flagKey}
        onChange={(e) => setFlagKey(e.target.value)}
        disabled={busy}
      >
        {available.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="hub-clientes__btn hub-clientes__btn--outline hub-clientes__btn--sm"
        disabled={busy || !flagKey}
        onClick={() => void add()}
      >
        {busy ? 'Salvando…' : 'Adicionar alerta'}
      </button>
    </div>
  );
};
