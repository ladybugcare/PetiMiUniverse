import React, { useCallback, useEffect, useState } from 'react';
import { MapPin, PlusCircle, Truck, User } from 'lucide-react';
import { getStoredClinicId } from '@petimi/web-core';
import { hubPickupApi, type PickupRoute, type PickupRouteStatus } from '../../api/hubPickupApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';

const STATUS_LABELS: Record<PickupRouteStatus, string> = {
  planned: 'Planejada',
  in_progress: 'Em rota',
  done: 'Concluída',
  cancelled: 'Cancelada',
};

const STATUS_CLASS: Record<PickupRouteStatus, string> = {
  planned: 'hub-clientes__pill',
  in_progress: 'hub-clientes__pill hub-clinic-queue__pill--progress',
  done: 'hub-clientes__pill hub-clinic-queue__pill--done',
  cancelled: 'hub-clientes__pill hub-clinic-queue__pill--waiting',
};

function formatDate(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

type Props = {
  dateYmd: string;
  unitId?: string;
  canManage: boolean;
  onBuildRoute: () => void;
  onSelectRoute: (route: PickupRoute) => void;
  refreshTrigger?: number;
};

const PickupRoutePanel: React.FC<Props> = ({
  dateYmd,
  unitId,
  canManage,
  onBuildRoute,
  onSelectRoute,
  refreshTrigger,
}) => {
  const clinicId = getStoredClinicId();
  const { showError } = useAlert();
  const [routes, setRoutes] = useState<PickupRoute[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const res = await hubPickupApi.listRoutes(clinicId, { date: dateYmd, unitId });
      setRoutes(res.routes ?? []);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar rotas');
    } finally {
      setLoading(false);
    }
  }, [clinicId, dateYmd, unitId, showError]);

  useEffect(() => {
    void load();
  }, [load, refreshTrigger]);

  return (
    <div className="hub-pickup-route-panel">
      <div className="hub-pickup-route-panel__header">
        <span className="hub-pickup-route-panel__title">
          <Truck size={15} aria-hidden />
          Rotas do dia — {formatDate(dateYmd)}
        </span>
        {canManage ? (
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--sm hub-clientes__btn--primary"
            onClick={onBuildRoute}
          >
            <PlusCircle size={14} aria-hidden />
            Nova rota
          </button>
        ) : null}
      </div>

      {loading ? (
        <HubLoading variant="inline" size="sm" label="Carregando rotas…" />
      ) : routes.length === 0 ? (
        <p className="hub-clientes__muted" style={{ fontSize: '0.8125rem', padding: '0.5rem 0' }}>
          Nenhuma rota montada para este dia.
        </p>
      ) : (
        <div className="hub-pickup-route-panel__list">
          {routes.map((r) => (
            <button
              key={r.id}
              type="button"
              className="hub-pickup-route-card"
              onClick={() => onSelectRoute(r)}
            >
              <div className="hub-pickup-route-card__row">
                <span className={STATUS_CLASS[r.status]}>{STATUS_LABELS[r.status]}</span>
                <span className="hub-pickup-route-card__stops">
                  <MapPin size={12} aria-hidden />
                  {r.stops_count ?? 0} parada{r.stops_count !== 1 ? 's' : ''}
                </span>
              </div>
              {r.driver ? (
                <div className="hub-pickup-route-card__driver">
                  <User size={12} aria-hidden />
                  {r.driver.full_name}
                  {r.vehicle_label ? ` · ${r.vehicle_label}` : ''}
                </div>
              ) : (
                <div className="hub-pickup-route-card__driver hub-clientes__muted">
                  Sem motorista atribuído
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default PickupRoutePanel;
