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

const HubEstoqueValidadePage: React.FC = () => {
  const { showError } = useAlert();
  const { user, role: authRole } = useAuth();
  const { role: clinicRole, loading: permLoading } = usePermissions();
  const clinicId = getStoredClinicId();
  const accessAllowed =
    clinicRole && allowedClinicRoles.includes(clinicRole as (typeof allowedClinicRoles)[number]);
  const [within, setWithin] = useState(60);
  const [loading, setLoading] = useState(true);
  const [lots, setLots] = useState<HubInventoryLotRow[]>([]);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const res = await hubInventoryApi.lots.expiring(clinicId, within);
      setLots(res.lots || []);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [clinicId, within, showError]);

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
        <div className="hub-servicos__toolbar-row" style={{ marginBottom: 16 }}>
          <div className="hub-servicos__filter-field">
            <span className="hub-clientes__label">Dias à frente</span>
            <select
              className="hub-clientes__select-input"
              value={within}
              onChange={(e) => setWithin(Number(e.target.value))}
            >
              {[30, 60, 90, 180, 365].map((d) => (
                <option key={d} value={d}>
                  {d} dias
                </option>
              ))}
            </select>
          </div>
        </div>
        {loading ? (
          <HubLoading variant="block" label="Carregando validade…" />
        ) : (
          <div className="hub-servicos__table-wrap">
            <table className="hub-clientes__table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Lote</th>
                  <th>Validade</th>
                  <th>Qtd</th>
                </tr>
              </thead>
              <tbody>
                {lots.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="hub-clientes__muted" style={{ textAlign: 'center', padding: 24 }}>
                      Nenhum lote a vencer neste período com stock positivo.
                    </td>
                  </tr>
                ) : (
                  lots.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <strong>{l.item?.name}</strong>
                        <span className="hub-clientes__muted" style={{ marginLeft: 8, fontSize: 12 }}>
                          {l.item?.item_kind}
                        </span>
                      </td>
                      <td>{l.lot_code || '—'}</td>
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

export default HubEstoqueValidadePage;
