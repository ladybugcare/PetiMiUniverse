import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getStoredClinicId, useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import { hubInventoryApi } from '../../api/hubInventoryApi';
import type { HubInventoryItem, HubInventoryLotRow } from '../../api/hubInventoryApi';
import { useAlert } from '../../components/AlertProvider';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import './estoque.css';

const allowedClinicRoles = ['CADMIN', 'CMANAGER', 'CASSISTANT', 'CVET_INTERNAL'] as const;

const HubEstoqueAlertasPage: React.FC = () => {
  const { showError } = useAlert();
  const { user, role: authRole } = useAuth();
  const { role: clinicRole, loading: permLoading } = usePermissions();
  const clinicId = getStoredClinicId();
  const accessAllowed =
    clinicRole && allowedClinicRoles.includes(clinicRole as (typeof allowedClinicRoles)[number]);
  const [loading, setLoading] = useState(true);
  const [low, setLow] = useState<HubInventoryItem[]>([]);
  const [expiring, setExpiring] = useState<HubInventoryLotRow[]>([]);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const [a, b] = await Promise.all([
        hubInventoryApi.reports.lowStock(clinicId),
        hubInventoryApi.lots.expiring(clinicId, 30),
      ]);
      setLow(a.items || []);
      setExpiring(b.lots || []);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar alertas');
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
        Carregando…
      </div>
    );
  }

  return (
    <div className="hub-clientes hub-servicos-page hub-estoque-page hub-pets-page">
      <div className="hub-clientes__main">
        {loading ? (
          <p className="hub-clientes__muted">Carregando…</p>
        ) : (
          <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            <section>
              <h2 className="hub-clientes__form-title" style={{ fontSize: 16 }}>
                Stock abaixo do mínimo ({low.length})
              </h2>
              <div className="hub-servicos__table-wrap" style={{ marginTop: 8 }}>
                <table className="hub-clientes__table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qtd</th>
                      <th>Mín.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {low.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="hub-clientes__muted" style={{ textAlign: 'center', padding: 16 }}>
                          Nenhum.
                        </td>
                      </tr>
                    ) : (
                      low.map((i) => (
                        <tr key={i.id}>
                          <td>{i.name}</td>
                          <td>{i.qty_on_hand ?? 0}</td>
                          <td>{i.min_stock_qty}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            <section>
              <h2 className="hub-clientes__form-title" style={{ fontSize: 16 }}>
                A vencer em 30 dias ({expiring.length})
              </h2>
              <div className="hub-servicos__table-wrap" style={{ marginTop: 8 }}>
                <table className="hub-clientes__table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Validade</th>
                      <th>Qtd</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiring.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="hub-clientes__muted" style={{ textAlign: 'center', padding: 16 }}>
                          Nenhum.
                        </td>
                      </tr>
                    ) : (
                      expiring.map((l) => (
                        <tr key={l.id}>
                          <td>{l.item?.name}</td>
                          <td>{l.expiry_date ? new Date(l.expiry_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                          <td>{l.qty_on_hand}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default HubEstoqueAlertasPage;
