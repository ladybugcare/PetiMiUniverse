import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Map, MapPin, RefreshCw, Truck } from 'lucide-react';
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

function routeTitle(route: PickupRoute, index: number): string {
  return route.label?.trim() || `Rota ${index + 1}`;
}

function routeMeta(route: PickupRoute): string {
  const parts = [STATUS_LABELS[route.status] ?? route.status];
  if (route.vehicle_label?.trim()) parts.push(route.vehicle_label.trim());
  return parts.join(' · ');
}

type AvailableRoutesProps = {
  routes: PickupRoute[];
  claimingId: string | null;
  onClaim: (routeId: string) => void;
  compact?: boolean;
};

const AvailableRoutesList: React.FC<AvailableRoutesProps> = ({
  routes,
  claimingId,
  onClaim,
  compact = false,
}) => {
  if (routes.length === 0) return null;

  return (
    <section
      className={
        compact
          ? 'hub-pickup-available-routes hub-pickup-available-routes--compact'
          : 'hub-pickup-available-routes'
      }
      aria-label="Rotas disponíveis para assumir"
    >
      {compact ? (
        <div className="hub-pickup-available-routes__header">
          <h2 className="hub-pickup-available-routes__title">Outras rotas disponíveis</h2>
          <p className="hub-pickup-available-routes__hint">
            Sem motorista — você também pode assumir.
          </p>
        </div>
      ) : null}
      <ul className="hub-pickup-available-routes__list">
        {routes.map((r, idx) => {
          const busy = claimingId === r.id;
          const stops = typeof r.stops_count === 'number' ? r.stops_count : null;
          return (
            <li key={r.id} className="hub-pickup-available-routes__item">
              <div className="hub-pickup-available-routes__icon" aria-hidden>
                <Map size={18} strokeWidth={2} />
              </div>
              <div className="hub-pickup-available-routes__info">
                <span className="hub-pickup-available-routes__label">{routeTitle(r, idx)}</span>
                <span className="hub-pickup-available-routes__meta">
                  {routeMeta(r)}
                  {stops != null ? (
                    <>
                      {' · '}
                      <span className="hub-pickup-available-routes__stops">
                        <MapPin size={11} aria-hidden />
                        {stops} {stops === 1 ? 'parada' : 'paradas'}
                      </span>
                    </>
                  ) : null}
                </span>
              </div>
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm hub-pickup-available-routes__claim"
                disabled={claimingId != null}
                onClick={() => onClaim(r.id)}
              >
                <Truck size={14} aria-hidden />
                {busy ? 'Assumindo…' : 'Assumir'}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/**
 * Tela "Minhas rotas de hoje" — fila do dia do motorista autenticado.
 * Acessível em /hub/leva-e-traz/minha-rota.
 */
const PickupMyRoutePage: React.FC = () => {
  const clinicId = getStoredClinicId();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError, showSuccess } = useAlert();
  const [routes, setRoutes] = useState<PickupRoute[]>([]);
  const [availableRoutes, setAvailableRoutes] = useState<PickupRoute[]>([]);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const canManage = hasPermission('pickup.routes.manage');
  const dateYmd = dayRangeIsoLocal(new Date()).dateYmd;

  const load = useCallback(async () => {
    if (!clinicId) return;
    try {
      const res = await hubPickupApi.myRoutes(clinicId, dateYmd);
      const list = res.routes ?? [];
      const available = res.available_routes ?? [];
      setRoutes(list);
      setAvailableRoutes(available);
      setActiveRouteId(res.active_route_id);
      setSelectedRouteId((prev) => {
        if (prev && list.some((r) => r.id === prev)) return prev;
        return res.active_route_id ?? list[0]?.id ?? null;
      });
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar minhas rotas');
      setRoutes([]);
      setAvailableRoutes([]);
      setActiveRouteId(null);
      setSelectedRouteId(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clinicId, dateYmd, showError]);

  useEffect(() => {
    if (permLoading || !clinicId) return;
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [permLoading, clinicId, load]);

  const claimRoute = useCallback(
    async (routeId: string) => {
      if (!clinicId || claimingId) return;
      setClaimingId(routeId);
      try {
        const res = await hubPickupApi.claimRoute(routeId, clinicId);
        showSuccess(
          res.already_claimed
            ? 'Esta rota já estava com você.'
            : 'Rota assumida. Boa viagem!',
        );
        setSelectedRouteId(routeId);
        await load();
      } catch (e: unknown) {
        showError((e as Error)?.message || 'Não foi possível assumir a rota');
        await load();
      } finally {
        setClaimingId(null);
      }
    },
    [clinicId, claimingId, load, showError, showSuccess],
  );

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

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
    const hasAvailable = availableRoutes.length > 0;

    return (
      <div className="hub-pickup-driver-view">
        <div className="hub-pickup-driver-view__header">
          <span className="hub-pickup-driver-view__title">Minhas rotas de hoje</span>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
            onClick={refresh}
            disabled={refreshing || claimingId != null}
            aria-label="Atualizar lista de rotas"
          >
            <RefreshCw
              size={14}
              aria-hidden
              className={refreshing ? 'hub-pickup-my-routes__spin' : undefined}
            />
            Atualizar
          </button>
        </div>

        {hasAvailable ? (
          <>
            <div className="hub-pickup-my-routes-empty hub-pickup-my-routes-empty--has-available">
              <div className="hub-pickup-my-routes-empty__icon" aria-hidden>
                <Truck size={22} strokeWidth={2} />
              </div>
              <div className="hub-pickup-my-routes-empty__copy">
                <p className="hub-pickup-my-routes-empty__title">Escolha uma rota para começar</p>
                <p className="hub-pickup-my-routes-empty__text">
                  {availableRoutes.length === 1
                    ? 'Há 1 rota sem motorista hoje. Assuma para ver as paradas e sair a campo.'
                    : `Há ${availableRoutes.length} rotas sem motorista hoje. Assuma uma para ver as paradas e sair a campo.`}
                </p>
              </div>
            </div>

            <AvailableRoutesList
              routes={availableRoutes}
              claimingId={claimingId}
              onClaim={(id) => void claimRoute(id)}
            />
          </>
        ) : (
          <div className="hub-pickup-my-routes-empty" role="status">
            <div className="hub-pickup-my-routes-empty__icon" aria-hidden>
              <Map size={22} strokeWidth={2} />
            </div>
            <p className="hub-pickup-my-routes-empty__title">Nenhuma rota para você hoje</p>
            <p className="hub-pickup-my-routes-empty__text">
              Quando a recepção montar uma rota e deixar sem motorista, ela aparece aqui para você
              assumir. Também pode pedir que atribuam direto a você.
            </p>
            <div className="hub-pickup-my-routes-empty__actions">
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                onClick={refresh}
                disabled={refreshing}
              >
                <RefreshCw
                  size={14}
                  aria-hidden
                  className={refreshing ? 'hub-pickup-my-routes__spin' : undefined}
                />
                Verificar de novo
              </button>
              {canManage ? (
                <Link
                  to="/hub/leva-e-traz"
                  className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                >
                  <ArrowLeft size={14} aria-hidden />
                  Ir ao painel
                </Link>
              ) : null}
            </div>
          </div>
        )}

        {hasAvailable && canManage ? (
          <div className="hub-pickup-my-routes-empty__footer">
            <Link
              to="/hub/leva-e-traz"
              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
            >
              <ArrowLeft size={14} aria-hidden />
              Voltar ao painel
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
            return (
              <button
                key={r.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`hub-pickup-my-routes-queue__item${isSelected ? ' is-selected' : ''}${isActive ? ' is-active' : ''}`}
                onClick={() => setSelectedRouteId(r.id)}
              >
                <span className="hub-pickup-my-routes-queue__label">{routeTitle(r, idx)}</span>
                <span className="hub-pickup-my-routes-queue__meta">{routeMeta(r)}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {selectedRouteId ? <PickupDriverView routeId={selectedRouteId} /> : null}

      {availableRoutes.length > 0 ? (
        <div className="hub-pickup-driver-view hub-pickup-driver-view--available-only">
          <AvailableRoutesList
            routes={availableRoutes}
            claimingId={claimingId}
            onClaim={(id) => void claimRoute(id)}
            compact
          />
        </div>
      ) : null}
    </div>
  );
};

export default PickupMyRoutePage;
