import React, { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { hubPickupApi, type PickupRouteDetailResponse } from '../../api/hubPickupApi';
import { HubLoading } from '../../components/HubLoading';
import { HubPrintLayout } from '../../components/print/HubPrintLayout';
import {
  formatDateLongPt,
  formatPickupStopAddress,
  formatTimeHm,
  toYmdLocal,
} from '../../components/print/printUtils';
import { useAlert } from '../../components/AlertProvider';
import '../clientes/clientes.css';

const DIRECTION_LABEL: Record<string, string> = {
  pickup: 'Coleta',
  delivery: 'Entrega',
  clinic_return: 'Retorno à clínica',
};

const ROUTE_STATUS: Record<string, string> = {
  planned: 'Planejada',
  in_progress: 'Em rota',
  done: 'Concluída',
  cancelled: 'Cancelada',
};

const HubImpressoesPickupRoutePage: React.FC = () => {
  const { routeId } = useParams<{ routeId: string }>();
  const clinicId = getStoredClinicId();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError } = useAlert();
  const [data, setData] = useState<PickupRouteDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const canRead = hasPermission('pickup.routes.read');

  useEffect(() => {
    if (!clinicId || !routeId || permLoading || !canRead) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await hubPickupApi.getRoute(routeId, clinicId);
        if (!cancelled) setData(res);
      } catch (e: unknown) {
        if (!cancelled) {
          showError((e as Error)?.message || 'Erro ao carregar rota');
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId, routeId, canRead, permLoading, showError]);

  if (!permLoading && !canRead) {
    return <Navigate to="/hub/impressoes" replace />;
  }

  if (!routeId) {
    return <p className="hub-clientes__muted">Rota inválida.</p>;
  }

  const route = data?.route;
  const dateYmd = route?.route_date ? String(route.route_date).slice(0, 10) : toYmdLocal(new Date());
  const label = route?.label?.trim() || 'Rota';
  const driver = route?.driver?.full_name || 'Sem motorista';
  const vehicle = route?.vehicle_label?.trim() || '—';
  const stops = (data?.stops ?? []).slice().sort((a, b) => a.sequence - b.sequence);
  const backToDriver = `/hub/leva-e-traz/motorista/${encodeURIComponent(routeId)}`;

  return (
    <HubPrintLayout
      title={label}
      subtitle={`${formatDateLongPt(dateYmd)} · ${ROUTE_STATUS[route?.status ?? ''] ?? route?.status ?? '—'} · ${driver} · Veículo: ${vehicle}`}
      backTo={backToDriver}
      backLabel="Voltar à rota"
      toolbarExtra={
        <Link to={`/hub/impressoes?date=${encodeURIComponent(dateYmd)}`} className="hub-clientes__btn hub-clientes__btn--ghost">
          Impressões do dia
        </Link>
      }
    >
      {loading ? (
        <HubLoading variant="inline" size="sm" label="Carregando rota…" />
      ) : !data ? (
        <p className="hub-print-sheet__empty">Não foi possível carregar esta rota.</p>
      ) : stops.length === 0 ? (
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
                  <td>{formatPickupStopAddress(s.address_snapshot) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </HubPrintLayout>
  );
};

export default HubImpressoesPickupRoutePage;
