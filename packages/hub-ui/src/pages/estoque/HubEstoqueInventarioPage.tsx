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

function kindLabel(k: string | undefined): string {
  if (k === 'medication') return 'Medicamento';
  if (k === 'vaccine') return 'Vacina';
  return 'Produto';
}

const HubEstoqueInventarioPage: React.FC = () => {
  const { showError, showSuccess, showConfirm } = useAlert();
  const { user, role: authRole } = useAuth();
  const { loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const accessAllowed = hasPermission('hub.inventory.read');
  const canWrite = hasPermission('hub.inventory.write');
  const [loading, setLoading] = useState(true);
  const [lots, setLots] = useState<HubInventoryLotRow[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const res = await hubInventoryApi.lots.list(clinicId);
      const rows = res.lots || [];
      setLots(rows);
      const next: Record<string, string> = {};
      for (const l of rows) {
        next[l.id] = String(l.qty_on_hand);
      }
      setCounts(next);
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

  const applyCount = (lot: HubInventoryLotRow) => {
    if (!clinicId || !canWrite) return;
    const raw = counts[lot.id] ?? '';
    const counted = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(counted) || counted < 0) {
      showError('Informe uma quantidade válida (≥ 0)');
      return;
    }
    const systemQty = Number(lot.qty_on_hand);
    const delta = Math.round((counted - systemQty) * 10000) / 10000;
    if (delta === 0) {
      showSuccess('Sem diferença para este lote');
      return;
    }

    const label = lot.item?.name || 'item';
    const lotCode = lot.lot_code || 'sem código';
    showConfirm(
      `Ajustar "${label}" (lote ${lotCode}) de ${systemQty} para ${counted}?`,
      async () => {
        setSavingId(lot.id);
        try {
          if (delta > 0) {
            await hubInventoryApi.movements.create({
              clinic_id: clinicId,
              item_id: lot.item_id,
              lot_id: lot.id,
              movement_type: 'adjustment_in',
              qty: delta,
              notes: 'Contagem física de inventário',
              reference_type: 'inventory_count',
              reference_id: lot.id,
            });
          } else {
            await hubInventoryApi.movements.create({
              clinic_id: clinicId,
              item_id: lot.item_id,
              lot_id: lot.id,
              movement_type: 'adjustment_out',
              qty: Math.abs(delta),
              notes: 'Contagem física de inventário',
              reference_type: 'inventory_count',
              reference_id: lot.id,
            });
          }
          showSuccess('Inventário ajustado');
          await load();
        } catch (e: unknown) {
          showError((e as Error)?.message || 'Erro ao ajustar inventário');
        } finally {
          setSavingId(null);
        }
      },
      'Confirmar ajuste',
    );
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
    <div className="hub-clientes hub-servicos-page hub-estoque-page hub-pets-page hub-clientes-page--full-width">
      <div className="hub-clientes__main">
        <p className="hub-clientes__muted" style={{ marginBottom: 16 }}>
          Conferência física: informe a quantidade contada por lote e confirme o ajuste. O sistema gera um movimento
          de ajuste com referência de inventário.
        </p>
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
                  <th>Sistema</th>
                  {canWrite ? <th>Contagem</th> : null}
                  {canWrite ? <th>Ação</th> : null}
                </tr>
              </thead>
              <tbody>
                {lots.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canWrite ? 8 : 6}
                      className="hub-clientes__muted"
                      style={{ textAlign: 'center', padding: 24 }}
                    >
                      Sem lotes com estoque.
                    </td>
                  </tr>
                ) : (
                  lots.map((l) => {
                    const counted = Number(String(counts[l.id] ?? '').replace(',', '.'));
                    const delta =
                      Number.isFinite(counted) ? Math.round((counted - Number(l.qty_on_hand)) * 10000) / 10000 : 0;
                    return (
                      <tr key={l.id}>
                        <td>
                          <strong>{l.item?.name}</strong>
                        </td>
                        <td>{kindLabel(l.item?.item_kind)}</td>
                        <td>{l.lot_code || '—'}</td>
                        <td>
                          {l.received_at
                            ? new Date(l.received_at + 'T12:00:00').toLocaleDateString('pt-BR')
                            : '—'}
                        </td>
                        <td>
                          {l.expiry_date
                            ? new Date(l.expiry_date + 'T12:00:00').toLocaleDateString('pt-BR')
                            : '—'}
                        </td>
                        <td>{l.qty_on_hand}</td>
                        {canWrite ? (
                          <td>
                            <input
                              className="hub-clientes__input hub-estoque__count-input"
                              value={counts[l.id] ?? ''}
                              onChange={(e) =>
                                setCounts((prev) => ({ ...prev, [l.id]: e.target.value }))
                              }
                              aria-label={`Contagem de ${l.item?.name || 'lote'}`}
                            />
                            {delta !== 0 && Number.isFinite(counted) ? (
                              <span className="hub-clientes__muted" style={{ marginLeft: 8, fontSize: 12 }}>
                                {delta > 0 ? `+${delta}` : String(delta)}
                              </span>
                            ) : null}
                          </td>
                        ) : null}
                        {canWrite ? (
                          <td>
                            <button
                              type="button"
                              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                              disabled={savingId === l.id || delta === 0 || !Number.isFinite(counted)}
                              onClick={() => applyCount(l)}
                            >
                              {savingId === l.id ? '…' : 'Ajustar'}
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
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
