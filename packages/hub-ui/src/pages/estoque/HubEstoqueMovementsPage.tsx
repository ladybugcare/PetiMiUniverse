import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, TrendingDown, TrendingUp } from 'lucide-react';
import { getStoredClinicId, useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import {
  hubInventoryApi,
  type HubInventoryItem,
  type HubStockMovement,
} from '../../api/hubInventoryApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { HubDateField } from '../../components/HubDateField';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import HubEstoqueMovementDrawer from './HubEstoqueMovementDrawer';
import HubEstoqueFilterChips from './HubEstoqueFilterChips';
import { movementDirection, parseDirectionFilter, type EstoqueDirectionFilter } from './estoqueShared';
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

const DIRECTION_FILTERS: { id: EstoqueDirectionFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'in', label: 'Entradas' },
  { id: 'out', label: 'Saídas' },
];

const HubEstoqueMovementsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const direction = parseDirectionFilter(searchParams.get('direction'));
  const { showError } = useAlert();
  const { user, role: authRole } = useAuth();
  const { loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const canWrite = hasPermission('hub.inventory.write');
  const accessAllowed = hasPermission('hub.inventory.read');

  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(
    clinicId ? `${clinicId}:${direction}` : null,
  );
  const [rows, setRows] = useState<HubStockMovement[]>([]);
  const [items, setItems] = useState<HubInventoryItem[]>([]);
  const [fromDate, setFromDate] = useState(() => daysAgoYmd(30));
  const [toDate, setToDate] = useState(() => todayYmd());
  const [query, setQuery] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerDirection, setDrawerDirection] = useState<'in' | 'out'>('in');

  const load = useCallback(async () => {
    if (!clinicId) return;
    begin();
    try {
      const opts = fromDate && toDate ? { from: fromDate, to: toDate } : undefined;
      const [mRes, iRes] = await Promise.all([
        hubInventoryApi.movements.list(clinicId, direction, undefined, opts),
        hubInventoryApi.items.list(clinicId, true),
      ]);
      setRows(mRes.movements || []);
      setItems(iRes.items || []);
      succeed();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar movimentos');
    } finally {
      finish();
    }
  }, [clinicId, direction, fromDate, toDate, showError, begin, succeed, finish]);

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

  const displayedRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = itemName(r.item_id).toLowerCase();
      const type = movementLabel(r.movement_type).toLowerCase();
      const lot = lotLabel(r).toLowerCase();
      return name.includes(q) || type.includes(q) || lot.includes(q);
    });
  }, [rows, query, itemName]);

  const metrics = useMemo(() => {
    let inCount = 0;
    let outCount = 0;
    let qtyIn = 0;
    let qtyOut = 0;
    for (const r of rows) {
      const dir = movementDirection(r.movement_type);
      if (dir === 'in') {
        inCount += 1;
        qtyIn += Number(r.qty) || 0;
      } else if (dir === 'out') {
        outCount += 1;
        qtyOut += Number(r.qty) || 0;
      }
    }
    return { inCount, outCount, qtyIn, qtyOut };
  }, [rows]);

  const setDirection = (next: EstoqueDirectionFilter) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'all') p.delete('direction');
        else p.set('direction', next);
        return p;
      },
      { replace: true },
    );
  };

  const openDrawer = (dir: 'in' | 'out') => {
    setDrawerDirection(dir);
    setDrawerOpen(true);
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
          <div className="hub-servicos-config__header">
            <div>
              <h1 className="hub-servicos-config__title">Movimentos</h1>
              <p className="hub-clientes__muted hub-servicos-config__lead">
                Histórico de entradas e saídas do estoque no período selecionado.
              </p>
            </div>
          </div>

          <div className="hub-servicos__metrics hub-estoque__metrics" aria-live="polite">
            <button
              type="button"
              className={`hub-servicos__metric-card hub-estoque__metric-btn${direction === 'in' ? ' hub-estoque__metric-btn--active' : ''}`}
              onClick={() => setDirection(direction === 'in' ? 'all' : 'in')}
            >
              <div className="hub-servicos__metric-card__text">
                <div className="hub-servicos__metric-label">Entradas</div>
                <div className="hub-servicos__metric-value">
                  {loading ? '—' : metrics.inCount.toLocaleString('pt-BR')}
                </div>
                <div className="hub-servicos__metric-sub">
                  {metrics.qtyIn.toLocaleString('pt-BR')} un. no período
                </div>
              </div>
              <div className="hub-servicos__metric-icon hub-estoque__metric-icon--in" aria-hidden>
                <TrendingDown size={22} strokeWidth={1.75} />
              </div>
            </button>
            <button
              type="button"
              className={`hub-servicos__metric-card hub-estoque__metric-btn${direction === 'out' ? ' hub-estoque__metric-btn--active' : ''}`}
              onClick={() => setDirection(direction === 'out' ? 'all' : 'out')}
            >
              <div className="hub-servicos__metric-card__text">
                <div className="hub-servicos__metric-label">Saídas</div>
                <div className="hub-servicos__metric-value">
                  {loading ? '—' : metrics.outCount.toLocaleString('pt-BR')}
                </div>
                <div className="hub-servicos__metric-sub">
                  {metrics.qtyOut.toLocaleString('pt-BR')} un. no período
                </div>
              </div>
              <div className="hub-servicos__metric-icon hub-estoque__metric-icon--out" aria-hidden>
                <TrendingUp size={22} strokeWidth={1.75} />
              </div>
            </button>
          </div>

          <div className="hub-servicos__toolbar">
            <div className="hub-servicos__toolbar-row hub-estoque__toolbar-filters">
              <HubEstoqueFilterChips
                ariaLabel="Direção do movimento"
                value={direction}
                options={DIRECTION_FILTERS}
                onChange={setDirection}
              />
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
                <div className="hub-estoque__toolbar-actions">
                  <button
                    type="button"
                    className="hub-servicos__btn-primary-icon"
                    onClick={() => openDrawer(direction === 'out' ? 'out' : 'in')}
                  >
                    <Plus size={18} strokeWidth={2.25} aria-hidden />
                    {direction === 'out' ? 'Registrar ajuste' : 'Nova entrada'}
                  </button>
                </div>
              )}
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
                    placeholder="Filtrar por item, tipo ou lote…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Filtrar movimentos"
                  />
                </div>
              </div>
            </div>
          </div>

          <HubRefreshingBanner show={refreshing} label="Atualizando movimentações…" />
          {loading && rows.length === 0 ? (
            <HubLoading variant="block" label="Carregando movimentações…" />
          ) : (
            <>
              <div className="hub-servicos__table-wrap hub-clientes__table-wrap--desktop">
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
                    {displayedRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="hub-clientes__muted" style={{ textAlign: 'center', padding: 24 }}>
                          Nenhum movimento no período.
                        </td>
                      </tr>
                    ) : (
                      displayedRows.map((r) => {
                        const dir = movementDirection(r.movement_type);
                        return (
                          <tr key={r.id}>
                            <td>{new Date(r.created_at).toLocaleString('pt-BR')}</td>
                            <td>
                              <span className={`hub-estoque__dir hub-estoque__dir--${dir}`}>
                                {movementLabel(r.movement_type)}
                              </span>
                            </td>
                            <td>{itemName(r.item_id)}</td>
                            <td className="hub-clientes__muted">{lotLabel(r)}</td>
                            <td className={`hub-estoque__qty hub-estoque__qty--${dir}`}>
                              {dir === 'out' ? '−' : '+'}
                              {r.qty}
                            </td>
                            <td>{formatMoneyCurrencyBrl(r.unit_cost)}</td>
                            <td className="hub-clientes__muted">{r.notes || '—'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="hub-clientes__mobile-list" aria-label="Lista de movimentos">
                {displayedRows.length === 0 ? (
                  <p className="hub-clientes__muted" style={{ textAlign: 'center', padding: 16 }}>
                    Nenhum movimento no período.
                  </p>
                ) : (
                  displayedRows.map((r) => {
                    const dir = movementDirection(r.movement_type);
                    return (
                      <div key={r.id} className="hub-clientes__mobile-card hub-estoque__mobile-static">
                        <div className="hub-clientes__mobile-card-top">
                          <div className="hub-clientes__mobile-card-main">
                            <span className="hub-clientes__mobile-card-name">{itemName(r.item_id)}</span>
                            <span className="hub-clientes__muted hub-clientes__mobile-card-contact">
                              {new Date(r.created_at).toLocaleString('pt-BR')}
                              {lotLabel(r) !== '—' ? ` · Lote ${lotLabel(r)}` : ''}
                            </span>
                          </div>
                          <span className={`hub-estoque__qty hub-estoque__qty--${dir}`}>
                            {dir === 'out' ? '−' : '+'}
                            {r.qty}
                          </span>
                        </div>
                        <div className="hub-clientes__mobile-card-foot">
                          <span className={`hub-estoque__dir hub-estoque__dir--${dir}`}>
                            {movementLabel(r.movement_type)}
                          </span>
                          <span className="hub-clientes__muted">{formatMoneyCurrencyBrl(r.unit_cost)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {clinicId && (
        <HubEstoqueMovementDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          clinicId={clinicId}
          direction={drawerDirection}
          canWrite={canWrite}
          onSuccess={() => void load()}
        />
      )}
    </>
  );
};

export default HubEstoqueMovementsPage;
