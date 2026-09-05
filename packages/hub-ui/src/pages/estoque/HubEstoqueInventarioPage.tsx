import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ClipboardList, Search } from 'lucide-react';
import { getStoredClinicId, useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import { hubInventoryApi } from '../../api/hubInventoryApi';
import type { HubInventoryLotRow } from '../../api/hubInventoryApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import HubEstoqueFilterChips from './HubEstoqueFilterChips';
import { kindLabel, parseKindFilter, type EstoqueKindFilter } from './estoqueShared';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import './estoque.css';

const KIND_FILTERS: { id: EstoqueKindFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'product', label: 'Produtos' },
  { id: 'medication', label: 'Medicamentos' },
  { id: 'vaccine', label: 'Vacinas' },
];

const HubEstoqueInventarioPage: React.FC = () => {
  const { showError, showSuccess, showConfirm } = useAlert();
  const { user, role: authRole } = useAuth();
  const { loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const accessAllowed = hasPermission('hub.inventory.read');
  const canWrite = hasPermission('hub.inventory.write');
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(clinicId);
  const [lots, setLots] = useState<HubInventoryLotRow[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<EstoqueKindFilter>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!clinicId) return;
    begin();
    try {
      const res = await hubInventoryApi.lots.list(clinicId);
      const rows = res.lots || [];
      setLots(rows);
      const next: Record<string, string> = {};
      for (const l of rows) {
        next[l.id] = String(l.qty_on_hand);
      }
      setCounts(next);
      succeed();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar inventário');
    } finally {
      finish();
    }
  }, [clinicId, showError, begin, succeed, finish]);

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) redirectAwayFromHub(authRole as AppRole);
  }, [permLoading, accessAllowed, authRole]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    void load();
  }, [clinicId, accessAllowed, load]);

  const displayedLots = useMemo(() => {
    const parsed = parseKindFilter(kindFilter === 'all' ? null : kindFilter);
    const q = query.trim().toLowerCase();
    return lots.filter((l) => {
      if (parsed !== 'all' && l.item?.item_kind !== parsed) return false;
      if (!q) return true;
      const name = (l.item?.name || '').toLowerCase();
      const lot = (l.lot_code || '').toLowerCase();
      return name.includes(q) || lot.includes(q);
    });
  }, [lots, kindFilter, query]);

  const pendingAdjustments = useMemo(() => {
    return displayedLots.filter((l) => {
      const counted = Number(String(counts[l.id] ?? '').replace(',', '.'));
      if (!Number.isFinite(counted)) return false;
      return Math.round((counted - Number(l.qty_on_hand)) * 10000) / 10000 !== 0;
    }).length;
  }, [displayedLots, counts]);

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
        <div className="hub-servicos-config__header">
          <div>
            <h1 className="hub-servicos-config__title">Inventário</h1>
            <p className="hub-clientes__muted hub-servicos-config__lead">
              Conferência física por lote. A diferença vira um ajuste com referência de inventário.
            </p>
          </div>
        </div>

        <div className="hub-servicos__metrics hub-estoque__metrics" aria-live="polite">
          <div className="hub-servicos__metric-card">
            <div className="hub-servicos__metric-card__text">
              <div className="hub-servicos__metric-label">Lotes</div>
              <div className="hub-servicos__metric-value">
                {loading ? '—' : displayedLots.length.toLocaleString('pt-BR')}
              </div>
              <div className="hub-servicos__metric-sub">Com estoque no sistema</div>
            </div>
            <div className="hub-servicos__metric-icon" aria-hidden>
              <ClipboardList size={22} strokeWidth={1.75} />
            </div>
          </div>
          <div className="hub-servicos__metric-card">
            <div className="hub-servicos__metric-card__text">
              <div className="hub-servicos__metric-label">Diferenças</div>
              <div className="hub-servicos__metric-value">
                {loading ? '—' : pendingAdjustments.toLocaleString('pt-BR')}
              </div>
              <div className="hub-servicos__metric-sub">Contagens diferentes do sistema</div>
            </div>
            <div
              className={`hub-servicos__metric-icon${pendingAdjustments > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
              aria-hidden
            >
              <ClipboardList size={22} strokeWidth={1.75} />
            </div>
          </div>
        </div>

        <div className="hub-servicos__toolbar">
          <div className="hub-servicos__toolbar-row hub-estoque__toolbar-filters">
            <HubEstoqueFilterChips
              ariaLabel="Tipo de item"
              value={kindFilter}
              options={KIND_FILTERS}
              onChange={setKindFilter}
            />
          </div>
          <div className="hub-servicos__toolbar-row">
            <div className="hub-servicos__search-wrap">
              <div className="hub-servicos__search-field">
                <span className="hub-servicos__search-icon">
                  <Search size={18} strokeWidth={2} aria-hidden />
                </span>
                <input
                  type="search"
                  className="hub-servicos__search-input"
                  placeholder="Buscar por item ou lote…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Buscar lotes"
                />
              </div>
            </div>
          </div>
        </div>

        <HubRefreshingBanner show={refreshing} label="Atualizando inventário…" />
        {loading && lots.length === 0 ? (
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
                {displayedLots.length === 0 ? (
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
                  displayedLots.map((l) => {
                    const counted = Number(String(counts[l.id] ?? '').replace(',', '.'));
                    const delta =
                      Number.isFinite(counted) ? Math.round((counted - Number(l.qty_on_hand)) * 10000) / 10000 : 0;
                    return (
                      <tr key={l.id}>
                        <td>
                          <strong>{l.item?.name}</strong>
                        </td>
                        <td>
                          <span className={`hub-estoque__kind hub-estoque__kind--${l.item?.item_kind || 'product'}`}>
                            {kindLabel(l.item?.item_kind)}
                          </span>
                        </td>
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
                              <span className={`hub-estoque__qty hub-estoque__qty--${delta > 0 ? 'in' : 'out'}`}>
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
