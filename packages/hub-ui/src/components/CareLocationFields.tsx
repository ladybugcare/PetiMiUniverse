import React, { useEffect, useState } from 'react';
import {
  hubPartnerClinicsApi,
  type CareLocationKind,
  type HubPartnerClinic,
} from '../api/hubPartnerClinicsApi';
import './CareLocationFields.css';

export type CareLocationValue = {
  care_location_kind: CareLocationKind;
  hub_partner_clinic_id: string | null;
};

type Props = {
  clinicId: string;
  value: CareLocationValue;
  onChange: (next: CareLocationValue) => void;
  disabled?: boolean;
  /** id prefix for labels */
  idPrefix?: string;
};

/**
 * Seletor de local de atendimento: unidade própria (header) vs clínica parceira.
 */
export const CareLocationFields: React.FC<Props> = ({
  clinicId,
  value,
  onChange,
  disabled,
  idPrefix = 'care-loc',
}) => {
  const [partners, setPartners] = useState<HubPartnerClinic[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clinicId) return;
    let cancelled = false;
    setLoading(true);
    void hubPartnerClinicsApi
      .list(clinicId)
      .then((res) => {
        if (!cancelled) setPartners(res.partner_clinics ?? []);
      })
      .catch(() => {
        if (!cancelled) setPartners([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clinicId]);

  return (
    <div className="hub-care-loc">
      <span className="nam-label">Local do atendimento</span>
      <div className="hub-care-loc__kinds" role="radiogroup" aria-label="Local do atendimento">
        <label className="hub-care-loc__radio">
          <input
            type="radio"
            name={`${idPrefix}-kind`}
            checked={value.care_location_kind === 'own_unit'}
            disabled={disabled}
            onChange={() =>
              onChange({ care_location_kind: 'own_unit', hub_partner_clinic_id: null })
            }
          />
          Unidade própria
        </label>
        <label className="hub-care-loc__radio">
          <input
            type="radio"
            name={`${idPrefix}-kind`}
            checked={value.care_location_kind === 'partner_clinic'}
            disabled={disabled}
            onChange={() =>
              onChange({
                care_location_kind: 'partner_clinic',
                hub_partner_clinic_id: value.hub_partner_clinic_id,
              })
            }
          />
          Clínica parceira
        </label>
      </div>

      {value.care_location_kind === 'partner_clinic' ? (
        <>
          <label className="nam-label" htmlFor={`${idPrefix}-partner`}>
            Parceira
          </label>
          <select
            id={`${idPrefix}-partner`}
            className="nam-input"
            disabled={disabled || loading}
            value={value.hub_partner_clinic_id ?? ''}
            onChange={(e) =>
              onChange({
                care_location_kind: 'partner_clinic',
                hub_partner_clinic_id: e.target.value || null,
              })
            }
            required
          >
            <option value="">{loading ? 'Carregando…' : 'Selecione…'}</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.city ? ` (${p.city})` : ''}
              </option>
            ))}
          </select>
          {!loading && partners.length === 0 ? (
            <p className="hub-care-loc__hint">
              Nenhuma parceira ativa. Cadastre em Configurações → Clínicas parceiras.
            </p>
          ) : null}
        </>
      ) : (
        <p className="hub-care-loc__hint">Usa a unidade selecionada no cabeçalho.</p>
      )}
    </div>
  );
};

export const CareLocationBadge: React.FC<{
  care_location_kind?: CareLocationKind | string | null;
  partner_clinic?: { id: string; name: string } | null;
}> = ({ care_location_kind, partner_clinic }) => {
  if (care_location_kind !== 'partner_clinic') return null;
  const name = partner_clinic?.name?.trim();
  return (
    <span className="hub-care-loc-badge" title={name || 'Clínica parceira'}>
      Parceira{name ? `: ${name}` : ''}
    </span>
  );
};

export default CareLocationFields;
