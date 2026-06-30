import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getStoredClinicId, useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import { hubInventoryApi } from '../../api/hubInventoryApi';
import type { HubInventoryLotRow } from '../../api/hubInventoryApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import './estoque.css';

const allowedClinicRoles = ['CADMIN', 'CMANAGER', 'CASSISTANT', 'CVET_INTERNAL'] as const;

const HubEstoqueInventarioPage: React.FC = () => {
  const { showError } = useAlert();
  const { user, role: authRole } = useAuth();
  const { role: clinicRole, loading: permLoading } = usePermissions();
  const clinicId = getStoredClinicId();
  const accessAllowed =
    clinicRole && allowedClinicRoles.includes(clinicRole as (typeof allowedClinicRoles)[number]);
  const [loading, setLoading] = useState(true);
  const [lots, setLots] = useState<HubInventoryLotRow[]>([]);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const res = await hubInventoryApi.lots.list(clinicId);
      setLots(res.lots || []);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar inventário');
    } finally {
      setLoading(false);
    }
  }, [clinicId, showError]);

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) redirectAwayFromHub(authRole as AppRole);
  }, [permLoading, accessAllowed, authRole]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    void load();
  }, [clinicId, accessAllowed, load]);

  if (!user) return <Navigate to="/login" replace />;
  if (!permLoading && !clinicId) {
    return (
      <div className="hub-clientes hub-estoque-page" style={{ padding: 24 }}>
        <p className="hub-clientes__muted">selecione uma clínica.</p>
      </div>
    );
  }
  if (permLoading || !accessAllowed) {
    return (
      <div className="hub-clientes hub-estoque-page" style={{ padding: 24 }}>
        <HubLoading variant="block" />
      </div>
    );
  }

  return (
    <div className="hub-clientes hub-servicos-page hub-estoque-page hub-pets-page">
      <div className="hub-clientes__main">
        {loading ? (
          <HubLoading variant="block" label="Carregando inventário…" />
        ) : (
          <div className="hub-servicos__table-wrap">
            <table className="hub-clientes__table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Tipo</th>
                  <th>Lote</th>
                  <th>Entrada</th>
                  <th>Validade</th>
                  <th>Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {lots.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="hub-clientes__muted" style={{ textAlign: 'center', padding: 24 }}>
                      Sem lotes com stock.
                    </td>
                  </tr>
                ) : (
                  lots.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <strong>{l.item?.name}</strong>
                      </td>
                      <td>{l.item?.item_kind}</td>
                      <td>{l.lot_code || '—'}</td>
                      <td>{l.received_at ? new Date(l.received_at + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                      <td>{l.expiry_date ? new Date(l.expiry_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                      <td>{l.qty_on_hand}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default HubEstoqueInventarioPage;
