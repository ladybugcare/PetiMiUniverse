import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { hubPickupApi, type PickupRoute } from '../../api/hubPickupApi';
import { HubLoading } from '../../components/HubLoading';
import { useAlert } from '../../components/AlertProvider';
import PickupDriverView from './PickupDriverView';
import { dayRangeIsoLocal } from '../agenda/agendaFilters';
import './pickup-page.css';

const POLL_MS = 30_000;

const STATUS_LABELS: Record<string, string> = {
  planned: 'Planejada',
  in_progress: 'Em rota',
  done: 'Concluída',
  cancelled: 'Cancelada',
};

/**
 * Tela "Minhas rotas de hoje" — fila do dia do motorista autenticado.
 * Acessível em /hub/leva-e-traz/minha-rota.
 */
const PickupMyRoutePage: React.FC = () => {
  const clinicId = getStoredClinicId();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError } = useAlert();
  const [routes, setRoutes] = useState<PickupRoute[]>([]);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const canManage = hasPermission('pickup.routes.manage');
  const dateYmd = dayRangeIsoLocal(new Date()).dateYmd;

  const load = useCallback(async () => {
    if (!clinicId) return;
    try {
      const res = await hubPickupApi.myRoutes(clinicId, dateYmd);
      const list = res.routes ?? [];
      setRoutes(list);
      setActiveRouteId(res.active_route_id);
      setSelectedRouteId((prev) => {
        if (prev && list.some((r) => r.id === prev)) return prev;
        return res.active_route_id ?? list[0]?.id ?? null;
      });
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar minhas rotas');
      setRoutes([]);
      setActiveRouteId(null);
      setSelectedRouteId(null);
    } finally {
      setLoading(false);
    }
  }, [clinicId, dateYmd, showError]);

  useEffect(() => {
    if (permLoading || !clinicId) return;
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [permLoading, clinicId, load]);

  if (!clinicId) {
    return (
      <p className="hub-clientes__muted hub-clinic-page__pad">
        Selecione uma clínica para acessar sua rota.
      </p>
    );
  }

  if (loading || permLoading) {
    return (
      <div className="hub-pickup-driver-view">
        <HubLoading variant="block" label="Carregando suas rotas…" />
      </div>
    );
  }

  if (routes.length === 0) {
    return (
      <div className="hub-pickup-driver-view">
        <div className="hub-pickup-driver-view__header">
          <span className="hub-pickup-driver-view__title">Minhas rotas de hoje</span>
        </div>
        <div className="hub-pickup-driver-view__card hub-pickup-driver-view__card--empty">
          <p className="hub-clientes__muted">Nenhuma rota atribuída a você hoje.</p>
          <p className="hub-clientes__muted" style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Peça à recepção para montar e atribuir uma rota.
          </p>
        </div>
        {canManage ? (
          <div style={{ padding: '0 1rem 1rem' }}>
            <Link to="/hub/leva-e-traz" className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm">
              ← Voltar ao painel
            </Link>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      {canManage ? (
        <div style={{ padding: '0.75rem 1rem 0', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Link to="/hub/leva-e-traz" className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm">
            ← Painel
          </Link>
        </div>
      ) : null}

      {routes.length > 1 ? (
        <div className="hub-pickup-my-routes-queue" role="tablist" aria-label="Fila de rotas do dia">
          {routes.map((r, idx) => {
            const isSelected = r.id === selectedRouteId;
            const isActive = r.id === activeRouteId;
            const title = r.label?.trim() || `Rota ${idx + 1}`;
            return (
              <button
                key={r.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`hub-pickup-my-routes-queue__item${isSelected ? ' is-selected' : ''}${isActive ? ' is-active' : ''}`}
                onClick={() => setSelectedRouteId(r.id)}
              >
                <span className="hub-pickup-my-routes-queue__label">{title}</span>
                <span className="hub-pickup-my-routes-queue__meta">
                  {STATUS_LABELS[r.status] ?? r.status}
                  {typeof r.stops_count === 'number' ? ` · ${r.stops_count} paradas` : ''}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {selectedRouteId ? <PickupDriverView routeId={selectedRouteId} /> : null}
    </div>
  );
};

export default PickupMyRoutePage;
