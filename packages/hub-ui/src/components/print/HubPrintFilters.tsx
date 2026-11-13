import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getStoredClinicId } from '@petimi/web-core';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
import { HubMultiSelectCombobox } from '../HubMultiSelectCombobox';
import { serviceGroupLabel } from '../../utils/serviceTypeSlug';

export type HubPrintSelectFilter = {
  id: string;
  label: string;
  value: string[];
  options: Array<{ value: string; label: string }>;
  onChange: (value: string[]) => void;
  placeholder?: string;
};

/** Lê/grava filtro multi na query (`a,b,c`; vazio = todos). */
export function usePrintQueryMultiFilter(key: string): [string[], (next: string[]) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(key)?.trim() ?? '';
  const value = useMemo(
    () =>
      raw
        ? raw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    [raw],
  );

  const setValue = (next: string[]) => {
    const params = new URLSearchParams(searchParams);
    const cleaned = next.map((s) => s.trim()).filter(Boolean);
    if (cleaned.length === 0) params.delete(key);
    else params.set(key, cleaned.join(','));
    setSearchParams(params, { replace: true });
  };

  return [value, setValue];
}

/** Carrega tipos de serviço ativos, opcionalmente limitados a grupos. */
export function usePrintServiceTypes(groupSlugs?: readonly string[]): {
  services: HubServiceType[];
  loading: boolean;
} {
  const clinicId = getStoredClinicId();
  const [services, setServices] = useState<HubServiceType[]>([]);
  const [loading, setLoading] = useState(true);
  const groupsKey = groupSlugs?.slice().sort().join(',') ?? '';

  useEffect(() => {
    if (!clinicId) {
      setServices([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void hubServiceTypesApi
      .list(clinicId)
      .then((res) => {
        if (cancelled) return;
        let list = (res.service_types ?? []).filter((s) => !s.is_addon);
        if (groupSlugs?.length) {
          const allowed = new Set(groupSlugs);
          list = list.filter((s) => allowed.has(String(s.service_group || '')));
        }
        list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        setServices(list);
      })
      .catch(() => {
        if (!cancelled) setServices([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clinicId, groupsKey]);

  return { services, loading };
}

export function serviceTypeFilterOptions(
  services: HubServiceType[],
): Array<{ value: string; label: string }> {
  return services.map((s) => ({
    value: s.id,
    label: `${s.name}${s.service_group ? ` (${serviceGroupLabel(s.service_group)})` : ''}`,
  }));
}

/** Vazio = todos; senão precisa bater em pelo menos um valor. */
export function matchesPrintMultiFilter(selected: string[], candidate: string | null | undefined): boolean {
  if (selected.length === 0) return true;
  if (candidate == null || candidate === '') return false;
  return selected.includes(candidate);
}

type Props = {
  filters: HubPrintSelectFilter[];
};

/** Barra de filtros só na tela (some na impressão). */
export const HubPrintFilters: React.FC<Props> = ({ filters }) => {
  if (filters.length === 0) return null;

  return (
    <div className="hub-print-filters hub-print-no-print" aria-label="Filtros da impressão">
      {filters.map((f) => (
        <div key={f.id} className="hub-print-filters__field">
          <label htmlFor={`hub-print-filter-${f.id}`}>{f.label}</label>
          <HubMultiSelectCombobox
            id={`hub-print-filter-${f.id}`}
            className="hub-combobox--clientes hub-print-filters__combobox"
            options={f.options}
            value={f.value}
            onChange={f.onChange}
            placeholder={f.placeholder ?? `Todos · ${f.label.toLowerCase()}`}
            searchPlaceholder={`Buscar ${f.label.toLowerCase()}…`}
            allowCreate={false}
            ariaLabel={f.label}
          />
        </div>
      ))}
    </div>
  );
};

/** Texto curto dos filtros ativos para o cabeçalho do papel. */
export function describeActivePrintFilters(
  filters: Array<{ label: string; value: string[]; options: Array<{ value: string; label: string }> }>,
): string | null {
  const parts = filters
    .filter((f) => f.value.length > 0)
    .map((f) => {
      const labels = f.value.map((v) => f.options.find((o) => o.value === v)?.label ?? v);
      return `${f.label}: ${labels.join(', ')}`;
    });
  return parts.length ? parts.join(' · ') : null;
}

export function usePrintServiceTypeFilter(groupSlugs?: readonly string[]) {
  const [serviceIds, setServiceIds] = usePrintQueryMultiFilter('servico');
  const { services, loading } = usePrintServiceTypes(groupSlugs);
  const options = useMemo(() => serviceTypeFilterOptions(services), [services]);
  return { serviceIds, setServiceIds, services, options, loading };
}

export default HubPrintFilters;
