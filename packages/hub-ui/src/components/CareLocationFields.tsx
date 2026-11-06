import React, { useEffect, useMemo, useState } from 'react';
import {
  hubPartnerClinicsApi,
  type CareLocationKind,
  type HubPartnerClinic,
} from '../api/hubPartnerClinicsApi';
import { HubSearchableCombobox } from './HubSearchableCombobox';
import type { HubComboboxOption } from './HubSearchableCombobox';
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

  const partnerOptions: HubComboboxOption[] = useMemo(
    () =>
      partners.map((p) => ({
        value: p.id,
        label: p.city ? `${p.name} (${p.city})` : p.name,
        searchText: [p.name, p.city, p.district, p.street, p.address_line]
          .filter(Boolean)
          .join(' '),
      })),
    [partners],
  );

  return (
    <div className="hub-care-loc">
      <span className="nam-label hub-care-loc__label" id={`${idPrefix}-kind-label`}>
        Local do atendimento
      </span>
      <div
        className="hub-care-loc__seg"
        role="radiogroup"
        aria-labelledby={`${idPrefix}-kind-label`}
      >
        <button
          type="button"
          role="radio"
          aria-checked={value.care_location_kind === 'own_unit'}
          className={
            value.care_location_kind === 'own_unit' ? 'hub-care-loc__seg-btn hub-care-loc__seg-btn--on' : 'hub-care-loc__seg-btn'
          }
          disabled={disabled}
          onClick={() => onChange({ care_location_kind: 'own_unit', hub_partner_clinic_id: null })}
        >
          Unidade própria
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={value.care_location_kind === 'partner_clinic'}
          className={
            value.care_location_kind === 'partner_clinic'
              ? 'hub-care-loc__seg-btn hub-care-loc__seg-btn--on'
              : 'hub-care-loc__seg-btn'
          }
          disabled={disabled}
          onClick={() =>
            onChange({
              care_location_kind: 'partner_clinic',
              hub_partner_clinic_id: value.hub_partner_clinic_id,
            })
          }
        >
          Clínica parceira
        </button>
      </div>

      {value.care_location_kind === 'partner_clinic' ? (
        <div className="hub-care-loc__partner">
          <label className="nam-label hub-care-loc__label" htmlFor={`${idPrefix}-partner`}>
            Parceira
          </label>
          <HubSearchableCombobox
            id={`${idPrefix}-partner`}
            className="hub-combobox--clientes"
            options={partnerOptions}
            value={value.hub_partner_clinic_id ?? ''}
            onChange={(v) =>
              onChange({
                care_location_kind: 'partner_clinic',
                hub_partner_clinic_id: v || null,
              })
            }
            placeholder={loading ? 'Carregando…' : 'Selecionar parceira'}
            searchPlaceholder="Buscar parceira…"
            allowCreate={false}
            disabled={disabled || loading}
            clearable={false}
            emptyResultsLabel="Nenhuma parceira encontrada"
          />
          {!loading && partners.length === 0 ? (
            <p className="hub-care-loc__hint">
              Nenhuma parceira ativa. Cadastre em Configurações → Clínicas parceiras.
            </p>
          ) : null}
        </div>
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
