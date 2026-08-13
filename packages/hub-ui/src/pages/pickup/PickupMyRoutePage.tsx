import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { hubPickupApi, type PickupRouteDetailResponse } from '../../api/hubPickupApi';
import { HubLoading } from '../../components/HubLoading';
import { useAlert } from '../../components/AlertProvider';
import PickupDriverView from './PickupDriverView';
import { dayRangeIsoLocal } from '../agenda/agendaFilters';
import './pickup-page.css';

const POLL_MS = 30_000;

/**
 * Tela "Minha rota de hoje" — exibe a rota atribuída ao motorista autenticado.
 * Acessível em /hub/leva-e-traz/minha-rota.
 * Redireciona motoristas puros (sem routes.manage) para cá ao abrir /hub/leva-e-traz.
 */
const PickupMyRoutePage: React.FC = () => {
  const clinicId = getStoredClinicId();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError } = useAlert();
  const [routeData, setRouteData] = useState<PickupRouteDetailResponse | null | 'not_found'>('not_found');
  const [loading, setLoading] = useState(true);

  const canManage = hasPermission('pickup.routes.manage');
  const dateYmd = dayRangeIsoLocal(new Date()).dateYmd;

  const load = useCallback(async () => {
    if (!clinicId) return;
    try {
      const res = await hubPickupApi.myRoute(clinicId, dateYmd);
      if (res.route) {
        setRouteData({ route: res.route, stops: res.stops ?? [] });
      } else {
        setRouteData('not_found');
      }
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar minha rota');
      setRouteData('not_found');
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
        <HubLoading variant="block" label="Carregando sua rota…" />
      </div>
    );
  }

  if (routeData === 'not_found' || !routeData) {
    return (
      <div className="hub-pickup-driver-view">
        <div className="hub-pickup-driver-view__header">
          <span className="hub-pickup-driver-view__title">Minha rota de hoje</span>
        </div>
        <div className="hub-pickup-driver-view__card hub-pickup-driver-view__card--empty">
          <p className="hub-clientes__muted">
            Nenhuma rota atribuída a você hoje.
          </p>
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
      <PickupDriverView routeId={routeData.route.id} />
    </div>
  );
};

export default PickupMyRoutePage;
