import React, { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { getStoredClinicId, useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import { hubInventoryApi } from '../../api/hubInventoryApi';
import type { HubInventoryItem, HubInventoryLotRow, HubItemKind } from '../../api/hubInventoryApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import HubEstoqueMovementDrawer from './HubEstoqueMovementDrawer';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import './estoque.css';

function kindPath(kind: string | undefined): string {
  if (kind === 'medication') return 'medicamentos';
  if (kind === 'vaccine') return 'vacinas';
  return 'produtos';
}

const HubEstoqueAlertasPage: React.FC = () => {
  const { showError } = useAlert();
  const navigate = useNavigate();
  const { user, role: authRole } = useAuth();
  const { loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const accessAllowed = hasPermission('hub.inventory.read');
  const canWrite = hasPermission('hub.inventory.write');
  const [loading, setLoading] = useState(true);
  const [low, setLow] = useState<HubInventoryItem[]>([]);
  const [expiring, setExpiring] = useState<HubInventoryLotRow[]>([]);
  const [movementOpen, setMovementOpen] = useState(false);
  const [movementItemId, setMovementItemId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const [a, b] = await Promise.all([
        hubInventoryApi.reports.lowStock(clinicId),
        hubInventoryApi.lots.expiring(clinicId, 90, { byPolicy: true }),
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

  const openEntry = (itemId: string) => {
    setMovementItemId(itemId);
    setMovementOpen(true);
  };

  const openItemCatalog = (item: HubInventoryItem) => {
    const path = kindPath(item.item_kind as HubItemKind);
    navigate(`/hub/estoque/${path}?q=${encodeURIComponent(item.name)}`);
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
          <p className="hub-clientes__muted" style={{ marginBottom: 16 }}>
            Alertas operacionais: estoque abaixo do mínimo e lotes dentro da política de validade de cada item.
            Para consultar por período livre, use a aba Validade.
          </p>
          {loading ? (
            <HubLoading variant="block" label="Carregando alertas…" />
          ) : (
            <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
              <section>
                <h2 className="hub-clientes__form-title" style={{ fontSize: 16 }}>
                  Estoque abaixo do mínimo ({low.length})
                </h2>
                <div className="hub-servicos__table-wrap" style={{ marginTop: 8 }}>
                  <table className="hub-clientes__table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Qtd</th>
                        <th>Mín.</th>
                        {canWrite ? <th>Ação</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {low.length === 0 ? (
                        <tr>
                          <td
                            colSpan={canWrite ? 4 : 3}
                            className="hub-clientes__muted"
                            style={{ textAlign: 'center', padding: 16 }}
                          >
                            Nenhum.
                          </td>
                        </tr>
                      ) : (
                        low.map((i) => (
                          <tr key={i.id}>
                            <td>
                              <button
                                type="button"
                                className="hub-clientes__link-btn"
                                onClick={() => openItemCatalog(i)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  color: 'var(--hc-brand)',
                                  cursor: 'pointer',
                                  font: 'inherit',
                                  textAlign: 'left',
                                }}
                              >
                                {i.name}
                              </button>
                            </td>
                            <td>{i.qty_on_hand ?? 0}</td>
                            <td>{i.min_stock_qty}</td>
                            {canWrite ? (
                              <td>
                                <button
                                  type="button"
                                  className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                                  onClick={() => openEntry(i.id)}
                                >
                                  <Plus size={14} strokeWidth={2} aria-hidden /> Registrar entrada
                                </button>
                              </td>
                            ) : null}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
              <section>
                <h2 className="hub-clientes__form-title" style={{ fontSize: 16 }}>
                  Validade na política do item ({expiring.length})
                </h2>
                <div className="hub-servicos__table-wrap" style={{ marginTop: 8 }}>
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
                      {expiring.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="hub-clientes__muted" style={{ textAlign: 'center', padding: 16 }}>
                            Nenhum.
                          </td>
                        </tr>
                      ) : (
                        expiring.map((l) => (
                          <tr key={l.id}>
                            <td>{l.item?.name}</td>
                            <td className="hub-clientes__muted">{l.lot_code || '—'}</td>
                            <td>
                              {l.expiry_date
                                ? new Date(l.expiry_date + 'T12:00:00').toLocaleDateString('pt-BR')
                                : '—'}
                            </td>
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

      {clinicId && (
        <HubEstoqueMovementDrawer
          open={movementOpen}
          onClose={() => {
            setMovementOpen(false);
            setMovementItemId(null);
          }}
          clinicId={clinicId}
          direction="in"
          preselectedItemId={movementItemId}
          canWrite={canWrite}
          onSuccess={() => void load()}
        />
      )}
    </>
  );
};

export default HubEstoqueAlertasPage;
