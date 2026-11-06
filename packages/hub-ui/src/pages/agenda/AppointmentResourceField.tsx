import React, { useEffect, useMemo, useState } from 'react';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import { hubResourcesApi, type ResourceAvailability } from '../../api/hubResourcesApi';
import { toEndIsoTs, toIsoTs } from './appointmentSchedulingUtils';

export type AppointmentResourceValue = {
  hubResourceId: string | null;
  resourceLabel: string;
};

type AppointmentResourceFieldProps = {
  id: string;
  clinicId: string | null;
  unitId: string | null;
  serviceTypeId: string | null;
  dateYmd: string;
  startsHm: string;
  endsHm: string;
  excludeAppointmentId?: string | null;
  value: AppointmentResourceValue;
  onChange: (next: AppointmentResourceValue) => void;
};

const EMPTY_AVAILABILITY: ResourceAvailability = {
  uses_catalog: false,
  field_label: 'Recurso / Sala',
  policy: 'optional',
  kinds: [],
  resources: [],
  active_count: 0,
  overlapping_count: 0,
  capacity_warning: null,
};

export const AppointmentResourceField: React.FC<AppointmentResourceFieldProps> = ({
  id,
  clinicId,
  unitId,
  serviceTypeId,
  dateYmd,
  startsHm,
  endsHm,
  excludeAppointmentId,
  value,
  onChange,
}) => {
  const [availability, setAvailability] = useState<ResourceAvailability>(EMPTY_AVAILABILITY);

  const window = useMemo(() => {
    if (!dateYmd || !startsHm || !endsHm) return null;
    try {
      return {
        startsAt: toIsoTs(dateYmd, startsHm),
        endsAt: toEndIsoTs(dateYmd, startsHm, endsHm),
      };
    } catch {
      return null;
    }
  }, [dateYmd, startsHm, endsHm]);

  useEffect(() => {
    if (!clinicId || !unitId || !serviceTypeId || !window) {
      setAvailability(EMPTY_AVAILABILITY);
      return;
    }
    let cancelled = false;
    void hubResourcesApi
      .availability({
        clinicId,
        unitId,
        serviceTypeId,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        excludeAppointmentId,
        mode: 'window',
      })
      .then((res) => {
        if (!cancelled) setAvailability(res);
      })
      .catch(() => {
        if (!cancelled) setAvailability(EMPTY_AVAILABILITY);
      });
    return () => {
      cancelled = true;
    };
  }, [clinicId, unitId, serviceTypeId, window, excludeAppointmentId]);

  const multipleKinds = new Set(availability.resources.map((r) => r.kind_name)).size > 1;
  const options = availability.resources.map((r) => ({
    value: r.id,
    label: `${multipleKinds ? `${r.kind_name} · ` : ''}${r.name}${r.busy ? ' · ocupado' : ''}`,
  }));

  if (!availability.uses_catalog) {
    return (
      <div className="nam-field">
        <label className="nam-label" htmlFor={id}>
          Recurso / Sala
        </label>
        <input
          id={id}
          className="nam-input"
          type="text"
          placeholder="Ex.: Mesa 1, Sala…"
          value={value.resourceLabel}
          onChange={(e) => onChange({ hubResourceId: null, resourceLabel: e.target.value })}
        />
      </div>
    );
  }

  return (
    <div className="nam-field">
      <label className="nam-label" htmlFor={id}>
        {availability.field_label}
      </label>
      <HubSearchableCombobox
        id={id}
        options={options}
        value={value.hubResourceId ?? ''}
        onChange={(nextId) => {
          const picked = availability.resources.find((r) => r.id === nextId);
          onChange({
            hubResourceId: picked?.id ?? null,
            resourceLabel: picked?.name ?? '',
          });
        }}
        placeholder="Definir na hora do atendimento"
        searchPlaceholder={`Buscar ${availability.field_label.toLowerCase()}…`}
        clearable
        ariaLabel={availability.field_label}
      />
      {availability.capacity_warning ? (
        <p className="nam-staff-compat-warn" role="status">
          {availability.capacity_warning}
        </p>
      ) : null}
    </div>
  );
};
