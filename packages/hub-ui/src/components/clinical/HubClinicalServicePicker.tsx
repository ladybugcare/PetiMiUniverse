import React, { useEffect, useMemo, useState } from 'react';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
import { HubSearchableCombobox } from '../HubSearchableCombobox';
import type { OperationalClinicalServiceGroup } from '../../utils/serviceTypeSlug';
import {
  filterServicesByClinicalGroup,
  formatServicePriceLabel,
} from './clinicalServiceCatalog';

export type ClinicalServicePick = {
  hub_service_type_id: string;
  unit_amount: string;
};

type Props = {
  clinicId: string;
  group: OperationalClinicalServiceGroup;
  value: ClinicalServicePick;
  onChange: (next: ClinicalServicePick) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Quando true, mostra campo de valor se o serviço for price_mode=variable (ou sempre se forcePriceInput). */
  allowPriceOverride?: boolean;
  forcePriceInput?: boolean;
  id?: string;
};

export function HubClinicalServicePicker({
  clinicId,
  group,
  value,
  onChange,
  label = 'Serviço',
  placeholder = 'Buscar serviço…',
  disabled,
  allowPriceOverride = true,
  forcePriceInput = false,
  id = 'clinical-svc',
}: Props) {
  const [services, setServices] = useState<HubServiceType[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    void hubServiceTypesApi
      .list(clinicId)
      .then((r) => {
        const filtered = filterServicesByClinicalGroup(r.service_types ?? [], group).sort((a, b) =>
          a.name.localeCompare(b.name, 'pt-BR'),
        );
        setServices(filtered);
      })
      .catch(() => setServices([]))
      .finally(() => setLoading(false));
  }, [clinicId, group]);

  const selected = services.find((s) => s.id === value.hub_service_type_id) ?? null;
  const isVariable = selected?.price_mode === 'variable' || forcePriceInput;
  const showPrice = allowPriceOverride && Boolean(selected) && isVariable;

  const options = useMemo(
    () =>
      services.map((s) => ({
        value: s.id,
        label: `${s.name} — ${formatServicePriceLabel(s.sale_amount)}`,
      })),
    [services],
  );

  return (
    <div className="hub-clinic-field hub-cws-field-tight">
      <label htmlFor={id}>{label}</label>
      <HubSearchableCombobox
        id={id}
        options={options}
        value={value.hub_service_type_id}
        onChange={(next) => {
          const svc = services.find((s) => s.id === next);
          onChange({
            hub_service_type_id: next,
            unit_amount: svc ? String(Number(svc.sale_amount ?? 0)) : '',
          });
        }}
        placeholder={loading ? 'Carregando…' : placeholder}
        searchPlaceholder="Nome do serviço…"
        disabled={disabled || loading || services.length === 0}
        ariaLabel={label}
        clearable
      />
      {services.length === 0 && !loading ? (
        <p className="hub-cws-exam-form__hint">
          Nenhum serviço do grupo cadastrado. Cadastre em Serviços →{' '}
          {group === 'cirurgia' ? 'Cirurgia' : group === 'internacao' ? 'Internação' : 'Clínica'}.
        </p>
      ) : null}
      {showPrice ? (
        <div className="hub-clinic-field hub-cws-field-tight" style={{ marginTop: 8 }}>
          <label htmlFor={`${id}-amount`}>Valor cobrado (R$)</label>
          <input
            id={`${id}-amount`}
            inputMode="decimal"
            className="hub-orcamento-novo__input"
            value={value.unit_amount}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, unit_amount: e.target.value })}
            placeholder={
              selected?.price_min != null || selected?.price_max != null
                ? `Faixa ${formatServicePriceLabel(selected.price_min)} – ${formatServicePriceLabel(selected.price_max)}`
                : 'Informe o valor'
            }
          />
          {selected?.price_mode === 'variable' ? (
            <p className="hub-cws-exam-form__hint">
              Este serviço permite alterar o valor na hora. Valores fora da faixa ficam pendentes de
              aprovação financeira.
            </p>
          ) : null}
        </div>
      ) : selected && !isVariable ? (
        <p className="hub-cws-exam-form__hint">
          Na comanda: {formatServicePriceLabel(selected.sale_amount)} ({selected.name}).
        </p>
      ) : null}
    </div>
  );
}
