import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { getStoredClinicId, useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import {
  hubInventoryApi,
  type HubInventoryItem,
  type HubStockMovement,
} from '../../api/hubInventoryApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubDateField } from '../../components/HubDateField';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import HubEstoqueMovementDrawer from './HubEstoqueMovementDrawer';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import './estoque.css';

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

function formatMoneyCurrencyBrl(n: number | null): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function daysAgoYmd(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

const HubEstoqueMovementsPage: React.FC = () => {
  const location = useLocation();
  const direction = location.pathname.includes('saidas') ? 'out' : 'in';
  const { showError } = useAlert();
  const { user, role: authRole } = useAuth();
  const { loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const canWrite = hasPermission('hub.inventory.write');
  const accessAllowed = hasPermission('hub.inventory.read');

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<HubStockMovement[]>([]);
  const [items, setItems] = useState<HubInventoryItem[]>([]);
  const [fromDate, setFromDate] = useState(() => daysAgoYmd(30));
  const [toDate, setToDate] = useState(() => todayYmd());
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const opts = fromDate && toDate ? { from: fromDate, to: toDate } : undefined;
      const [mRes, iRes] = await Promise.all([
        hubInventoryApi.movements.list(clinicId, direction, undefined, opts),
        hubInventoryApi.items.list(clinicId, true),
      ]);
      setRows(mRes.movements || []);
      setItems(iRes.items || []);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar movimentos');
    } finally {
      setLoading(false);
    }
  }, [clinicId, direction, fromDate, toDate, showError]);

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

  const lotLabel = (r: HubStockMovement) => {
    if (r.lot?.lot_code) return r.lot.lot_code;
    if (r.lot_id) return r.lot_id.slice(0, 8);
    return '—';
  };

  if (!user) return <Navigate to="/login" replace />;
  if (!permLoading && !clinicId) {
    return (
      <div className="hub-clientes hub-estoque-page" style={{ padding: 24 }}>
        <p className="hub-clientes__muted">Selecione uma clínica.</p>
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
    <>
      <div className="hub-clientes hub-servicos-page hub-estoque-page hub-pets-page hub-clientes-page--full-width">
        <div className="hub-clientes__main">
          <div className="hub-servicos__toolbar" style={{ marginBottom: 16 }}>
            <div className="hub-servicos__toolbar-row">
              <div className="hub-servicos__filter-field">
                <HubDateField
                  id="mov-from"
                  label="De"
                  valueIso={fromDate}
                  onChangeIso={(iso) => setFromDate(iso || daysAgoYmd(30))}
                />
              </div>
              <div className="hub-servicos__filter-field">
                <HubDateField
                  id="mov-to"
                  label="Até"
                  valueIso={toDate}
                  onChangeIso={(iso) => setToDate(iso || todayYmd())}
                />
              </div>
              {canWrite && (
                <button
                  type="button"
                  className="hub-servicos__btn-primary-icon"
                  onClick={() => setDrawerOpen(true)}
                >
                  <Plus size={18} strokeWidth={2.25} aria-hidden />
                  {direction === 'out' ? 'Registrar ajuste' : 'Nova entrada'}
                </button>
              )}
            </div>
          </div>

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
                    <th>Lote</th>
                    <th>Quantidade</th>
                    <th>Custo un.</th>
                    <th>Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="hub-clientes__muted" style={{ textAlign: 'center', padding: 24 }}>
                        Nenhum movimento no período.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.id}>
                        <td>{new Date(r.created_at).toLocaleString('pt-BR')}</td>
                        <td>{movementLabel(r.movement_type)}</td>
                        <td>{itemName(r.item_id)}</td>
                        <td className="hub-clientes__muted">{lotLabel(r)}</td>
                        <td>{r.qty}</td>
                        <td>{formatMoneyCurrencyBrl(r.unit_cost)}</td>
                        <td className="hub-clientes__muted">{r.notes || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {clinicId && (
        <HubEstoqueMovementDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          clinicId={clinicId}
          direction={direction}
          canWrite={canWrite}
          onSuccess={() => void load()}
        />
      )}
    </>
  );
};

export default HubEstoqueMovementsPage;
