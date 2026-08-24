import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { User } from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { hubPickupApi, type PickupDriverDayResponse, type PickupRouteStatus } from '../../api/hubPickupApi';
import { HubLoading } from '../../components/HubLoading';

const STATUS_LABELS: Record<PickupRouteStatus, string> = {
  planned: 'Planejada',
  in_progress: 'Em rota',
  done: 'Concluída',
  cancelled: 'Cancelada',
};

type Props = {
  dateYmd: string;
  unitId?: string;
  refreshTrigger?: number;
};

/**
 * Timeline gerencial do dia agrupada por motorista (lotes em sequência).
 */
const PickupDriverDayTimeline: React.FC<Props> = ({ dateYmd, unitId, refreshTrigger }) => {
  const clinicId = getStoredClinicId();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('pickup.routes.manage');
  const [data, setData] = useState<PickupDriverDayResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const res = await hubPickupApi.driverDay(clinicId, dateYmd, { unitId });
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [clinicId, dateYmd, unitId]);

  useEffect(() => {
    void load();
  }, [load, refreshTrigger]);

  if (loading && !data) {
    return <HubLoading variant="inline" size="sm" label="Carregando dia dos motoristas…" />;
  }

  if (!data || data.drivers.length === 0) return null;

  return (
    <div className="hub-pickup-driver-day">
      <p className="hub-pickup-driver-day__title">Dia dos motoristas</p>
      <div className="hub-pickup-driver-day__list">
        {data.drivers.map((bucket, idx) => (
          <div key={bucket.driver?.id ?? `unassigned-${idx}`} className="hub-pickup-driver-day__card">
            <div className="hub-pickup-driver-day__driver">
              <User size={14} aria-hidden />
              {bucket.driver?.full_name ?? 'Sem motorista'}
            </div>
            <ol className="hub-pickup-driver-day__routes">
              {bucket.routes.map((r) => (
                <li key={r.id}>
                  <div className="hub-pickup-driver-day__route-row">
                    <span className="hub-pickup-driver-day__route-label">
                      {r.label?.trim() || 'Rota'}
                    </span>
                    <span className="hub-clientes__muted">
                      {STATUS_LABELS[r.status]} · {r.stops_count ?? 0} paradas
                      {(r.onboard_count ?? 0) > 0 ? ` · ${r.onboard_count} a bordo` : ''}
                    </span>
                    {canManage ? (
                      <Link
                        to={`/hub/leva-e-traz/monitoramento/${r.id}`}
                        className="hub-pickup-driver-day__monitor-link"
                      >
                        Monitorar
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PickupDriverDayTimeline;
