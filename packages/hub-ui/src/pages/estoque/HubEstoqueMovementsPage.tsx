import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getStoredClinicId, useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import { hubInventoryApi, type HubStockMovement } from '../../api/hubInventoryApi';
import type { HubInventoryItem } from '../../api/hubInventoryApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import './estoque.css';

const allowedClinicRoles = ['CADMIN', 'CMANAGER', 'CASSISTANT', 'CVET_INTERNAL'] as const;

function movementLabel(t: string): string {
  const map: Record<string, string> = {
    initial_in: 'Entrada inicial',
    purchase_in: 'Compra',
    adjustment_in: 'Ajuste +',
    adjustment_out: 'Ajuste −',
    sale_out: 'Venda',
    encounter_out: 'Atendimento',
  };
  return map[t] || t;
}

const HubEstoqueMovementsPage: React.FC = () => {
  const location = useLocation();
  const direction = location.pathname.includes('saidas') ? 'out' : 'in';
  const { showError } = useAlert();
  const { user, role: authRole } = useAuth();
  const { role: clinicRole, loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const canWrite = hasPermission('hub.inventory.write');
  const accessAllowed =
    clinicRole && allowedClinicRoles.includes(clinicRole as (typeof allowedClinicRoles)[number]);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<HubStockMovement[]>([]);
  const [items, setItems] = useState<HubInventoryItem[]>([]);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const [mRes, iRes] = await Promise.all([
        hubInventoryApi.movements.list(clinicId, direction),
        hubInventoryApi.items.list(clinicId, true),
      ]);
      setRows(mRes.movements || []);
      setItems(iRes.items || []);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar movimentos');
    } finally {
      setLoading(false);
    }
  }, [clinicId, direction, showError]);

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) redirectAwayFromHub(authRole as AppRole);
  }, [permLoading, accessAllowed, authRole]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    void load();
  }, [clinicId, accessAllowed, load]);

  const itemName = useMemo(() => {
    const m = new Map(items.map((i) => [i.id, i.name]));
    return (id: string) => m.get(id) || id;
  }, [items]);

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
          <HubLoading variant="block" label="Carregando movimentações…" />
        ) : (
          <div className="hub-servicos__table-wrap">
            <table className="hub-clientes__table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Item</th>
                  <th>Quantidade</th>
                  <th>Notas</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="hub-clientes__muted" style={{ textAlign: 'center', padding: 24 }}>
                      Nenhum movimento.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td>{new Date(r.created_at).toLocaleString('pt-BR')}</td>
                      <td>{movementLabel(r.movement_type)}</td>
                      <td>{itemName(r.item_id)}</td>
                      <td>{r.qty}</td>
                      <td className="hub-clientes__muted">{r.notes || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        {canWrite && (
          <p className="hub-estoque__encounter-note" style={{ marginTop: 16 }}>
            Para registrar novas entradas ou saídas manualmente, use a ficha do produto (em breve: ação rápida nesta
            tela) ou a API <code>POST /api/hub/inventory/movements</code> com <code>purchase_in</code>,{' '}
            <code>adjustment_in/out</code>, <code>sale_out</code>.
          </p>
        )}
      </div>
    </div>
  );
};

export default HubEstoqueMovementsPage;
