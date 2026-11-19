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
  STATUS_OPTIONS,
  computeDisplayServiceLabel,
  type AgendaAppointment,
} from '../agenda/agendaModel';
import { SERVICE_GROUP_OPTIONS } from '../../utils/serviceTypeSlug';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';
import '../clientes/clientes.css';

const GROUP_OPTIONS = SERVICE_GROUP_OPTIONS.map((g) => ({ value: g.value, label: g.label }));
const STATUS_FILTER_OPTIONS = STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }));

const HubImpressoesAgendaPage: React.FC = () => {
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError } = useAlert();
  const [searchParams] = useSearchParams();
  const dateYmd = toYmdLocal(parseYmdLocal(searchParams.get('date')));
  const fromAgenda = searchParams.get('from') === 'agenda';
  const searchQ = (searchParams.get('q') ?? '').trim();
  const [groupFilter, setGroupFilter] = usePrintQueryMultiFilter('grupo');
  const [professionalFilter, setProfessionalFilter] = usePrintQueryMultiFilter('profissional');
  const [resourceFilter, setResourceFilter] = usePrintQueryMultiFilter('recurso');
  const [statusFilter, setStatusFilter] = usePrintQueryMultiFilter('status');
  const { serviceIds, setServiceIds, options: allServiceOptions, services } =
    usePrintServiceTypeFilter();
  const [rows, setRows] = useState<AgendaAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  const canRead = hasPermission('hub.appointments.read');
  const backHref = fromAgenda
    ? `/hub/appointments?date=${encodeURIComponent(dateYmd)}`
    : `/hub/impressoes?date=${encodeURIComponent(dateYmd)}`;
  const backLabel = fromAgenda ? 'Agenda' : 'Impressões';

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
        // Inclui cancelados para permitir filtro explícito de status; exclusão padrão fica no filtered.
        const mapped = (appointments ?? [])
          .map(mapHubAppointmentToAgenda)
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

  const professionalOptions = useMemo(() => {
    const map = new Map<string, string>();
    let hasNa = false;
    for (const a of rows) {
      if (!a.professionalId) {
        hasNa = true;
        continue;
      }
      const label =
        a.professionalName && a.professionalName !== '—'
          ? a.professionalName
          : a.professionalId;
      if (!map.has(a.professionalId)) map.set(a.professionalId, label);
    }
    const opts = Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
    if (hasNa || professionalFilter.includes('__na__')) {
      opts.push({ value: '__na__', label: 'Não atribuído' });
    }
    for (const id of professionalFilter) {
      if (id !== '__na__' && !opts.some((o) => o.value === id)) {
        opts.push({
          value: id,
          label: id.length > 12 ? `Profissional (${id.slice(0, 8)}…)` : `Profissional (${id})`,
        });
      }
    }
    return opts;
  }, [rows, professionalFilter]);

  const resourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of rows) {
      const r = (a.resourceLabel ?? '').trim();
      if (r && r !== '—') set.add(r);
    }
    for (const r of resourceFilter) {
      if (r.trim()) set.add(r.trim());
    }
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((value) => ({ value, label: value }));
  }, [rows, resourceFilter]);

  const filtered = useMemo(() => {
    const q = searchQ.toLowerCase();
    return rows.filter((a) => {
      if (statusFilter.length === 0) {
        if (a.status === 'cancelled') return false;
      } else if (!matchesPrintMultiFilter(statusFilter, a.status)) {
        return false;
      }

      if (!matchesPrintMultiFilter(groupFilter, a.group)) return false;

      if (professionalFilter.length > 0) {
        const wantsNa = professionalFilter.includes('__na__');
        const ids = professionalFilter.filter((id) => id !== '__na__');
        const matchId = a.professionalId != null && ids.includes(a.professionalId);
        const matchNa = wantsNa && a.professionalId == null;
        if (!matchId && !matchNa) return false;
      }

      if (resourceFilter.length > 0) {
        const r = (a.resourceLabel ?? '').trim();
        if (!r || !resourceFilter.includes(r)) return false;
      }

      if (serviceIds.length > 0) {
        const ids = [
          a.hub_service_type_id,
          ...(a.services ?? []).map((s) => s.hub_service_type_id),
        ].filter(Boolean) as string[];
        if (!ids.some((id) => serviceIds.includes(id))) return false;
      }

      if (q) {
        const blob =
          `${a.petName} ${a.guardianName} ${a.serviceName} ${a.professionalName} ${a.partnerClinic?.name ?? ''}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }

      return true;
    });
  }, [
    rows,
    groupFilter,
    serviceIds,
    professionalFilter,
    resourceFilter,
    statusFilter,
    searchQ,
  ]);

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
    {
      id: 'profissional',
      label: 'Profissional',
      value: professionalFilter,
      options: professionalOptions,
      onChange: setProfessionalFilter,
      placeholder: 'Todos os profissionais',
    },
    {
      id: 'recurso',
      label: 'Recurso',
      value: resourceFilter,
      options: resourceOptions,
      onChange: setResourceFilter,
      placeholder: 'Todos os recursos',
    },
    {
      id: 'status',
      label: 'Status',
      value: statusFilter,
      options: STATUS_FILTER_OPTIONS,
      onChange: setStatusFilter,
      placeholder: 'Todos (exceto cancelados)',
    },
  ];
  const filtersSummary = describeActivePrintFilters(filterDefs);
  const filterSummary = searchQ
    ? filtersSummary
      ? `${filtersSummary} · Busca: ${searchQ}`
      : `Busca: ${searchQ}`
    : filtersSummary;
  const subtitle = useMemo(() => formatDateLongPt(dateYmd), [dateYmd]);

  if (!permLoading && !canRead) {
    return <Navigate to="/hub/impressoes" replace />;
  }

  return (
    <HubPrintLayout
      title="Agenda do dia"
      subtitle={subtitle}
      backTo={backHref}
      backLabel={backLabel}
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
