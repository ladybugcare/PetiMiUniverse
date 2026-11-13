import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import {
  hubPickupApi,
  type PickupDayBoardItem,
  type PickupRoute,
  type PickupRouteDetailResponse,
} from '../../api/hubPickupApi';
import { HubLoading } from '../../components/HubLoading';
import { HubPrintLayout } from '../../components/print/HubPrintLayout';
import {
  HubPrintFilters,
  describeActivePrintFilters,
  matchesPrintMultiFilter,
  usePrintQueryMultiFilter,
} from '../../components/print/HubPrintFilters';
import {
  formatDateLongPt,
  formatPickupStopAddress,
  formatTimeHm,
  parseYmdLocal,
  toYmdLocal,
} from '../../components/print/printUtils';
import { useAlert } from '../../components/AlertProvider';
import { dayRangeIsoLocal } from '../agenda/agendaFilters';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';
import '../clientes/clientes.css';

const DIRECTION_LABEL: Record<string, string> = {
  pickup: 'Coleta',
  delivery: 'Entrega',
  clinic_return: 'Retorno à clínica',
  unknown: 'Parada',
};

const DIRECTION_OPTIONS = [
  { value: 'pickup', label: 'Coletas' },
  { value: 'delivery', label: 'Entregas' },
  { value: 'clinic_return', label: 'Retornos à clínica' },
];

const ROUTE_STATUS: Record<string, string> = {
  planned: 'Planejada',
  in_progress: 'Em rota',
  done: 'Concluída',
  cancelled: 'Cancelada',
};

type RoutePrintBlock = {
  route: PickupRoute;
  detail: PickupRouteDetailResponse | null;
};

const HubImpressoesPickupPage: React.FC = () => {
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError } = useAlert();
  const [searchParams] = useSearchParams();
  const dateYmd = toYmdLocal(parseYmdLocal(searchParams.get('date')));
  const [directionFilter, setDirectionFilter] = usePrintQueryMultiFilter('sentido');
  const [blocks, setBlocks] = useState<RoutePrintBlock[]>([]);
  const [loose, setLoose] = useState<PickupDayBoardItem[]>([]);
  const [loading, setLoading] = useState(true);

  const canRead = hasPermission('pickup.routes.read');
  const backHref = `/hub/impressoes?date=${encodeURIComponent(dateYmd)}`;

  useEffect(() => {
    if (!clinicId || permLoading || !canRead) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const range = dayRangeIsoLocal(parseYmdLocal(dateYmd));

    (async () => {
      setLoading(true);
      try {
        const [routesRes, boardRes] = await Promise.all([
          hubPickupApi.listRoutes(clinicId, {
            date: dateYmd,
            unitId: unitId ?? undefined,
          }),
          hubPickupApi.dayBoard(clinicId, range, { unitId: unitId ?? undefined }),
        ]);
        if (cancelled) return;

        const routes = (routesRes.routes ?? []).filter((r) => r.status !== 'cancelled');
        const details = await Promise.all(
          routes.map((r) =>
            hubPickupApi.getRoute(r.id, clinicId).catch(() => null as PickupRouteDetailResponse | null),
          ),
        );
        if (cancelled) return;

        setBlocks(
          routes.map((route, i) => ({
            route,
            detail: details[i],
          })),
        );

        const items = boardRes.items ?? [];
        setLoose(items.filter((i) => !i.route_id && i.status !== 'cancelled'));
      } catch (e: unknown) {
        if (!cancelled) {
          showError((e as Error)?.message || 'Erro ao carregar rotas');
          setBlocks([]);
          setLoose([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clinicId, unitId, dateYmd, canRead, permLoading, showError]);

  const subtitle = useMemo(() => formatDateLongPt(dateYmd), [dateYmd]);

  const filterDefs = [
    {
      id: 'sentido',
      label: 'Sentido',
      value: directionFilter,
      options: DIRECTION_OPTIONS,
      onChange: setDirectionFilter,
      placeholder: 'Todos os sentidos',
    },
  ];
  const filterSummary = describeActivePrintFilters(filterDefs);

  const visibleBlocks = useMemo(() => {
    return blocks
      .map((block) => {
        const stops = (block.detail?.stops ?? [])
          .filter((s) => matchesPrintMultiFilter(directionFilter, s.direction))
          .slice()
          .sort((a, b) => a.sequence - b.sequence);
        return { ...block, stops };
      })
      .filter((b) => b.stops.length > 0 || directionFilter.length === 0);
  }, [blocks, directionFilter]);

  const visibleLoose = useMemo(
    () => loose.filter((i) => matchesPrintMultiFilter(directionFilter, i.direction)),
    [loose, directionFilter],
  );

  if (!permLoading && !canRead) {
    return <Navigate to="/hub/impressoes" replace />;
  }

  return (
    <HubPrintLayout
      title="Rotas de leva e traz"
      subtitle={subtitle}
      backTo={backHref}
      backLabel="Impressões"
      filters={<HubPrintFilters filters={filterDefs} />}
      filterSummary={filterSummary}
    >
      {loading ? (
        <HubLoading variant="inline" size="sm" label="Carregando rotas…" />
      ) : visibleBlocks.length === 0 && visibleLoose.length === 0 ? (
        <p className="hub-print-sheet__empty">Nenhuma rota ou parada com os filtros selecionados.</p>
      ) : (
        <>
          {visibleBlocks.map((block, idx) => {
            const r = block.route;
            const stops = block.stops;
            const driver = r.driver?.full_name || block.detail?.route.driver?.full_name || 'Sem motorista';
            const vehicle = r.vehicle_label?.trim() || '—';
            const label = r.label?.trim() || `Rota ${idx + 1}`;
            return (
              <section
                key={r.id}
                className={`hub-print-section${idx > 0 ? ' hub-print-section--page' : ''}`}
              >
                <h2 className="hub-print-section__title">{label}</h2>
                <p className="hub-print-section__meta">
                  {ROUTE_STATUS[r.status] ?? r.status} · {driver} · Veículo: {vehicle}
                  {stops.length ? ` · ${stops.length} parada(s)` : ''}
                </p>
                {stops.length === 0 ? (
                  <p className="hub-print-sheet__empty">Sem paradas nesta rota.</p>
                ) : (
                  <div className="hub-print-table-wrap">
                    <table className="hub-print-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Sentido</th>
                          <th>Horário</th>
                          <th>Pet</th>
                          <th>Tutor</th>
                          <th>Telefone</th>
                          <th>Endereço</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stops.map((s) => (
                          <tr key={s.id}>
                            <td>{s.sequence}</td>
                            <td>{DIRECTION_LABEL[s.direction] ?? s.direction}</td>
                            <td>{formatTimeHm(s.planned_at)}</td>
                            <td>{s.pet?.name || '—'}</td>
                            <td>{s.guardian?.full_name || '—'}</td>
                            <td>{s.guardian?.phone?.trim() || '—'}</td>
                            <td>
                              {formatPickupStopAddress(s.address_snapshot) || (
                                <span className="hub-print-muted">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}

          {visibleLoose.length > 0 ? (
            <section className={`hub-print-section${visibleBlocks.length > 0 ? ' hub-print-section--page' : ''}`}>
              <h2 className="hub-print-section__title">Sem rota</h2>
              <p className="hub-print-section__meta">
                Pernas ainda não montadas em lote ({visibleLoose.length})
              </p>
              <div className="hub-print-table-wrap">
                <table className="hub-print-table">
                  <thead>
                    <tr>
                      <th>Sentido</th>
                      <th>Horário</th>
                      <th>Pet</th>
                      <th>Tutor</th>
                      <th>Telefone</th>
                      <th>Endereço</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLoose
                      .slice()
                      .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
                      .map((item) => (
                        <tr key={item.appointment_id}>
                          <td>{DIRECTION_LABEL[item.direction] ?? item.direction}</td>
                          <td>{formatTimeHm(item.planned_at || item.starts_at)}</td>
                          <td>{item.pet?.name || '—'}</td>
                          <td>{item.guardian?.full_name || '—'}</td>
                          <td>{item.guardian?.phone?.trim() || '—'}</td>
                          <td>{item.address?.trim() || '—'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      )}
    </HubPrintLayout>
  );
};

export default HubImpressoesPickupPage;
