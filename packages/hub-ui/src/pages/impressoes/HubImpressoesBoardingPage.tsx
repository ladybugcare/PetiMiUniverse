import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { hubBoardingApi, type BoardingOpsStay } from '../../api/hubBoardingApi';
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
import { BOARDING_STAGE_LABELS, type BoardingStage } from '../boarding/boardingStages';
import { BOARDING_SERVICE_GROUPS } from '../../utils/serviceTypeSlug';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';
import '../clientes/clientes.css';

const MODE_OPTIONS = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'daycare', label: 'Creche' },
];

const VIEW_OPTIONS = [
  { value: 'present', label: 'Hospedados agora' },
  { value: 'arrivals', label: 'Chegadas do dia' },
  { value: 'departures', label: 'Saídas do dia' },
  { value: 'expected', label: 'Previstos (ainda não chegaram)' },
];

function stayMatchesView(s: BoardingOpsStay, views: string[]): boolean {
  if (views.length === 0) return true;
  return views.some((view) => {
    if (view === 'present') {
      return ['checked_in', 'checkout_preparing', 'ready_for_handoff'].includes(String(s.stage));
    }
    if (view === 'arrivals') return Boolean(s.is_arrival);
    if (view === 'departures') return Boolean(s.is_departure) || s.stage === 'checked_out';
    if (view === 'expected') return s.stage === 'reserved';
    return false;
  });
}

function modeLabel(mode: string): string {
  if (mode === 'hotel') return 'Hotel';
  if (mode === 'daycare') return 'Creche';
  return mode || '—';
}

function stageLabel(stage: string): string {
  return BOARDING_STAGE_LABELS[stage as BoardingStage] ?? stage;
}

const HubImpressoesBoardingPage: React.FC = () => {
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError } = useAlert();
  const [searchParams] = useSearchParams();
  const dateYmd = toYmdLocal(parseYmdLocal(searchParams.get('date')));
  const [modeFilter, setModeFilter] = usePrintQueryMultiFilter('modo');
  const [viewFilter, setViewFilter] = usePrintQueryMultiFilter('vista');
  const { serviceIds, setServiceIds, services, options: serviceOptions } = usePrintServiceTypeFilter(
    BOARDING_SERVICE_GROUPS,
  );
  const [stays, setStays] = useState<BoardingOpsStay[]>([]);
  const [loading, setLoading] = useState(true);

  const canRead = hasPermission('boarding.reservations.read');
  const backHref = `/hub/impressoes?date=${encodeURIComponent(dateYmd)}`;

  useEffect(() => {
    if (!clinicId || permLoading || !canRead) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await hubBoardingApi.opsBoard(clinicId, {
          unitId: unitId ?? undefined,
          dateYmd,
        });
        if (!cancelled) setStays(res.stays ?? []);
      } catch (e: unknown) {
        if (!cancelled) {
          showError((e as Error)?.message || 'Erro ao carregar Hotel & Creche');
          setStays([]);
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
    const selectedServices = services.filter((svc) => serviceIds.includes(svc.id));
    return stays
      .filter((s) => {
        if (s.stage === 'cancelled' || s.stage === 'no_show') return false;
        if (!matchesPrintMultiFilter(modeFilter, s.mode)) return false;
        if (!stayMatchesView(s, viewFilter)) return false;
        if (selectedServices.length > 0) {
          const allowedModes = new Set<string>(
            selectedServices.map((svc) =>
              String(svc.service_group) === 'creche' ? 'daycare' : 'hotel',
            ),
          );
          if (!allowedModes.has(String(s.mode))) return false;
        }
        return true;
      })
      .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
  }, [stays, modeFilter, viewFilter, serviceIds, services]);

  const filterDefs = [
    {
      id: 'modo',
      label: 'Modalidade',
      value: modeFilter,
      options: MODE_OPTIONS,
      onChange: setModeFilter,
      placeholder: 'Hotel e Creche',
    },
    {
      id: 'vista',
      label: 'Vista',
      value: viewFilter,
      options: VIEW_OPTIONS,
      onChange: setViewFilter,
      placeholder: 'Todos do dia',
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

  if (!permLoading && !canRead) {
    return <Navigate to="/hub/impressoes" replace />;
  }

  return (
    <HubPrintLayout
      title="Hotel & Creche — painel do dia"
      subtitle={formatDateLongPt(dateYmd)}
      backTo={backHref}
      backLabel="Impressões"
      filters={<HubPrintFilters filters={filterDefs} />}
      filterSummary={filterSummary}
    >
      {loading ? (
        <HubLoading variant="inline" size="sm" label="Carregando hospedagens…" />
      ) : filtered.length === 0 ? (
        <p className="hub-print-sheet__empty">Nenhuma estadia com os filtros selecionados.</p>
      ) : (
        <div className="hub-print-table-wrap">
          <table className="hub-print-table">
            <thead>
              <tr>
                <th>Modalidade</th>
                <th>Pet</th>
                <th>Tutor</th>
                <th>Telefone</th>
                <th>Entrada</th>
                <th>Saída</th>
                <th>Espaço</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.key}>
                  <td>
                    {modeLabel(s.mode)}
                    {s.daycare_shift?.label ? ` · ${s.daycare_shift.label}` : ''}
                  </td>
                  <td>{s.pet?.name || '—'}</td>
                  <td>{s.guardian?.full_name || '—'}</td>
                  <td>{s.guardian?.phone?.trim() || '—'}</td>
                  <td>{formatTimeHm(s.checked_in_at || s.starts_at)}</td>
                  <td>{formatTimeHm(s.checked_out_at || s.ends_at)}</td>
                  <td>{s.space?.name || '—'}</td>
                  <td>{stageLabel(String(s.stage))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </HubPrintLayout>
  );
};

export default HubImpressoesBoardingPage;
