import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { hubAgendaApi } from '../../api/hubAgendaApi';
import { HubLoading } from '../../components/HubLoading';
import { HubPrintLayout } from '../../components/print/HubPrintLayout';
import {
  HubPrintFilters,
  describeActivePrintFilters,
  matchesPrintMultiFilter,
  usePrintQueryMultiFilter,
  usePrintServiceTypeFilter,
} from '../../components/print/HubPrintFilters';
import {
  formatDateLongPt,
  formatTimeHm,
  parseYmdLocal,
  toYmdLocal,
} from '../../components/print/printUtils';
import { useAlert } from '../../components/AlertProvider';
import { dayRangeIsoLocal, loadAgendaPersistedFilters, isUuid } from '../agenda/agendaFilters';
import { mapHubAppointmentToAgenda } from '../agenda/mapHubAgenda';
import {
  STATUS_META,
  computeDisplayServiceLabel,
  type AgendaAppointment,
} from '../agenda/agendaModel';
import { SERVICE_GROUP_OPTIONS } from '../../utils/serviceTypeSlug';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';
import '../clientes/clientes.css';

const GROUP_OPTIONS = SERVICE_GROUP_OPTIONS.map((g) => ({ value: g.value, label: g.label }));

const HubImpressoesAgendaPage: React.FC = () => {
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError } = useAlert();
  const [searchParams] = useSearchParams();
  const dateYmd = toYmdLocal(parseYmdLocal(searchParams.get('date')));
  const [groupFilter, setGroupFilter] = usePrintQueryMultiFilter('grupo');
  const { serviceIds, setServiceIds, options: allServiceOptions, services } =
    usePrintServiceTypeFilter();
  const [rows, setRows] = useState<AgendaAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  const canRead = hasPermission('hub.appointments.read');
  const backHref = `/hub/impressoes?date=${encodeURIComponent(dateYmd)}`;

  const serviceOptions = useMemo(() => {
    if (groupFilter.length === 0) return allServiceOptions;
    const allowed = new Set(groupFilter);
    return services
      .filter((s) => allowed.has(String(s.service_group)))
      .map((s) => ({
        value: s.id,
        label: s.name,
      }));
  }, [allServiceOptions, services, groupFilter]);

  useEffect(() => {
    if (serviceIds.length === 0) return;
    const allowed = new Set(serviceOptions.map((o) => o.value));
    const next = serviceIds.filter((id) => allowed.has(id));
    if (next.length !== serviceIds.length) setServiceIds(next);
  }, [serviceIds, serviceOptions, setServiceIds]);

  useEffect(() => {
    if (!clinicId || permLoading || !canRead) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const cursor = parseYmdLocal(dateYmd);
    const range = dayRangeIsoLocal(cursor);
    const persisted = loadAgendaPersistedFilters();

    (async () => {
      setLoading(true);
      try {
        const params: Parameters<typeof hubAgendaApi.list>[0] = {
          clinic_id: clinicId,
          from: range.from,
          to: range.to,
        };
        if (unitId) params.unit_id = unitId;
        else if (persisted.unit && persisted.unit !== 'all' && isUuid(persisted.unit)) {
          params.unit_id = persisted.unit;
        }

        const { appointments } = await hubAgendaApi.list(params);
        if (cancelled) return;
        const mapped = (appointments ?? [])
          .map(mapHubAppointmentToAgenda)
          .filter((a) => a.status !== 'cancelled')
          .sort((a, b) => a.start.getTime() - b.start.getTime());
        setRows(mapped);
      } catch (e: unknown) {
        if (!cancelled) {
          showError((e as Error)?.message || 'Erro ao carregar agenda');
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clinicId, unitId, dateYmd, canRead, permLoading, showError]);

  const filtered = useMemo(() => {
    return rows.filter((a) => {
      if (!matchesPrintMultiFilter(groupFilter, a.group)) return false;
      if (serviceIds.length === 0) return true;
      const ids = [
        a.hub_service_type_id,
        ...(a.services ?? []).map((s) => s.hub_service_type_id),
      ].filter(Boolean) as string[];
      return ids.some((id) => serviceIds.includes(id));
    });
  }, [rows, groupFilter, serviceIds]);

  const filterDefs = [
    {
      id: 'grupo',
      label: 'Grupo',
      value: groupFilter,
      options: GROUP_OPTIONS,
      onChange: setGroupFilter,
      placeholder: 'Todos os grupos',
    },
    {
      id: 'servico',
      label: 'Serviço',
      value: serviceIds,
      options: serviceOptions,
      onChange: setServiceIds,
      placeholder: 'Todos os serviços',
    },
  ];
  const filterSummary = describeActivePrintFilters(filterDefs);
  const subtitle = useMemo(() => formatDateLongPt(dateYmd), [dateYmd]);

  if (!permLoading && !canRead) {
    return <Navigate to="/hub/impressoes" replace />;
  }

  return (
    <HubPrintLayout
      title="Agenda do dia"
      subtitle={subtitle}
      backTo={backHref}
      backLabel="Impressões"
      filters={<HubPrintFilters filters={filterDefs} />}
      filterSummary={filterSummary}
    >
      {loading ? (
        <HubLoading variant="inline" size="sm" label="Carregando agenda…" />
      ) : filtered.length === 0 ? (
        <p className="hub-print-sheet__empty">Nenhum agendamento com os filtros selecionados.</p>
      ) : (
        <div className="hub-print-table-wrap">
          <table className="hub-print-table">
            <thead>
              <tr>
                <th>Horário</th>
                <th>Pet</th>
                <th>Tutor</th>
                <th>Serviço</th>
                <th>Profissional / recurso</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const service = computeDisplayServiceLabel(a);
                const pro =
                  [a.professionalName !== '—' ? a.professionalName : null, a.resourceLabel || null]
                    .filter(Boolean)
                    .join(' · ') || '—';
                return (
                  <tr key={a.id}>
                    <td>
                      {formatTimeHm(a.start)}
                      {a.end ? `–${formatTimeHm(a.end)}` : ''}
                    </td>
                    <td>{a.petName || '—'}</td>
                    <td>{a.guardianName || '—'}</td>
                    <td>{service}</td>
                    <td>{pro}</td>
                    <td>{STATUS_META[a.status]?.label ?? a.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </HubPrintLayout>
  );
};

export default HubImpressoesAgendaPage;
