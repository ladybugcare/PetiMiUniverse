import React, { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Clock, Plus } from 'lucide-react';
import { getStoredClinicId, useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import { hubInventoryApi } from '../../api/hubInventoryApi';
import type { HubInventoryItem, HubInventoryLotRow } from '../../api/hubInventoryApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import HubEstoqueMovementDrawer from './HubEstoqueMovementDrawer';
import HubEstoqueFilterChips from './HubEstoqueFilterChips';
import {
  kindLabel,
  parseAlertasView,
  stockItemCatalogHref,
  type EstoqueAlertasView,
} from './estoqueShared';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import './estoque.css';

const VIEW_FILTERS: { id: EstoqueAlertasView; label: string }[] = [
  { id: 'operacional', label: 'Operacionais' },
  { id: 'validade', label: 'Consulta de validade' },
];

function formatExpiry(date: string | null | undefined): string {
  return date ? new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR') : '—';
}

const HubEstoqueAlertasPage: React.FC = () => {
  const { showError } = useAlert();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseAlertasView(searchParams.get('view'));
  const { user, role: authRole } = useAuth();
  const { loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const accessAllowed = hasPermission('hub.inventory.read');
  const canWrite = hasPermission('hub.inventory.write');
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(
    clinicId ? `${clinicId}:${view}` : null,
  );
  const [low, setLow] = useState<HubInventoryItem[]>([]);
  const [expiringPolicy, setExpiringPolicy] = useState<HubInventoryLotRow[]>([]);
  const [expiringPeriod, setExpiringPeriod] = useState<HubInventoryLotRow[]>([]);
  const [within, setWithin] = useState(60);
  const [movementOpen, setMovementOpen] = useState(false);
  const [movementItemId, setMovementItemId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clinicId) return;
    begin();
    try {
      if (view === 'validade') {
        const res = await hubInventoryApi.lots.expiring(clinicId, within);
        setExpiringPeriod(res.lots || []);
      } else {
        const [a, b] = await Promise.all([
          hubInventoryApi.reports.lowStock(clinicId),
          hubInventoryApi.lots.expiring(clinicId, 90, { byPolicy: true }),
        ]);
        setLow(a.items || []);
        setExpiringPolicy(b.lots || []);
      }
      succeed();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar alertas');
    } finally {
      finish();
    }
  }, [clinicId, view, within, showError, begin, succeed, finish]);

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) redirectAwayFromHub(authRole as AppRole);
  }, [permLoading, accessAllowed, authRole]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    void load();
  }, [clinicId, accessAllowed, load]);

  const setView = (next: EstoqueAlertasView) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'operacional') p.delete('view');
        else p.set('view', next);
        return p;
      },
      { replace: true },
    );
  };

  const openEntry = (itemId: string) => {
    setMovementItemId(itemId);
    setMovementOpen(true);
  };

  const openItemCatalog = (item: HubInventoryItem) => {
    navigate(stockItemCatalogHref(item.item_kind, item.name));
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

  const operacionalEmpty = low.length === 0 && expiringPolicy.length === 0;
  const validadeEmpty = expiringPeriod.length === 0;

  return (
    <>
      <div className="hub-clientes hub-servicos-page hub-estoque-page hub-pets-page hub-clientes-page--full-width">
        <div className="hub-clientes__main">
          <div className="hub-servicos-config__header">
            <div>
              <h1 className="hub-servicos-config__title">Alertas</h1>
              <p className="hub-clientes__muted hub-servicos-config__lead">
                {view === 'validade'
                  ? 'Consulta livre de lotes a vencer no período escolhido, independente da política do item.'
                  : 'Estoque abaixo do mínimo e lotes dentro da política de validade de cada item.'}
              </p>
            </div>
          </div>

          <div className="hub-servicos__toolbar">
            <div className="hub-servicos__toolbar-row hub-estoque__toolbar-filters">
              <HubEstoqueFilterChips
                ariaLabel="Tipo de alerta"
                value={view}
                options={VIEW_FILTERS}
                onChange={setView}
              />
              {view === 'validade' ? (
                <HubEstoqueFilterChips
                  ariaLabel="Dias à frente"
                  value={String(within)}
                  options={[30, 60, 90, 180, 365].map((d) => ({ id: String(d), label: `${d} dias` }))}
                  onChange={(id) => setWithin(Number(id))}
                />
              ) : null}
            </div>
          </div>

          {view === 'operacional' ? (
            <div className="hub-servicos__metrics hub-estoque__metrics" aria-live="polite">
              <div className="hub-servicos__metric-card">
                <div className="hub-servicos__metric-card__text">
                  <div className="hub-servicos__metric-label">Abaixo do mínimo</div>
                  <div className="hub-servicos__metric-value">
                    {loading ? '—' : low.length.toLocaleString('pt-BR')}
                  </div>
                  <div className="hub-servicos__metric-sub">Itens para repor</div>
                </div>
                <div className={`hub-servicos__metric-icon${low.length > 0 ? '' : ' hub-servicos__metric-icon--muted'}`} aria-hidden>
                  <AlertTriangle size={22} strokeWidth={1.75} />
                </div>
              </div>
              <div className="hub-servicos__metric-card">
                <div className="hub-servicos__metric-card__text">
                  <div className="hub-servicos__metric-label">Validade na política</div>
                  <div className="hub-servicos__metric-value">
                    {loading ? '—' : expiringPolicy.length.toLocaleString('pt-BR')}
                  </div>
                  <div className="hub-servicos__metric-sub">Lotes no prazo do item</div>
                </div>
                <div
                  className={`hub-servicos__metric-icon${expiringPolicy.length > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
                  aria-hidden
                >
                  <Clock size={22} strokeWidth={1.75} />
                </div>
              </div>
            </div>
          ) : (
            <div className="hub-servicos__metrics hub-estoque__metrics" aria-live="polite">
              <div className="hub-servicos__metric-card">
                <div className="hub-servicos__metric-card__text">
                  <div className="hub-servicos__metric-label">Lotes a vencer</div>
                  <div className="hub-servicos__metric-value">
                    {loading ? '—' : expiringPeriod.length.toLocaleString('pt-BR')}
                  </div>
                  <div className="hub-servicos__metric-sub">Nos próximos {within} dias</div>
                </div>
                <div
                  className={`hub-servicos__metric-icon${expiringPeriod.length > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
                  aria-hidden
                >
                  <Clock size={22} strokeWidth={1.75} />
                </div>
              </div>
            </div>
          )}

          <HubRefreshingBanner show={refreshing} label="Atualizando alertas…" />
          {loading && (view === 'operacional' ? operacionalEmpty : validadeEmpty) ? (
            <HubLoading variant="block" label="Carregando alertas…" />
          ) : view === 'validade' ? (
            <>
              <div className="hub-servicos__table-wrap hub-clientes__table-wrap--desktop">
                <table className="hub-clientes__table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Tipo</th>
                      <th>Lote</th>
                      <th>Validade</th>
                      <th>Qtd</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validadeEmpty ? (
                      <tr>
                        <td colSpan={5} className="hub-clientes__muted" style={{ textAlign: 'center', padding: 24 }}>
                          Nenhum lote a vencer neste período com estoque positivo.
                        </td>
                      </tr>
                    ) : (
                      expiringPeriod.map((l) => (
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
                          <td>{formatExpiry(l.expiry_date)}</td>
                          <td>{l.qty_on_hand}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="hub-clientes__mobile-list" aria-label="Lotes a vencer">
                {validadeEmpty ? (
                  <p className="hub-clientes__muted" style={{ textAlign: 'center', padding: 16 }}>
                    Nenhum lote a vencer neste período com estoque positivo.
                  </p>
                ) : (
                  expiringPeriod.map((l) => (
                    <div key={l.id} className="hub-clientes__mobile-card hub-estoque__mobile-static">
                      <div className="hub-clientes__mobile-card-top">
                        <div className="hub-clientes__mobile-card-main">
                          <span className="hub-clientes__mobile-card-name">{l.item?.name}</span>
                          <span className="hub-clientes__muted hub-clientes__mobile-card-contact">
                            Lote {l.lot_code || 'sem código'}
                          </span>
                        </div>
                        <span className="hub-clientes__pill hub-clientes__pill--inactive">{l.qty_on_hand} un.</span>
                      </div>
                      <div className="hub-clientes__mobile-card-foot">
                        <span className={`hub-estoque__kind hub-estoque__kind--${l.item?.item_kind || 'product'}`}>
                          {kindLabel(l.item?.item_kind)}
                        </span>
                        <span className="hub-clientes__muted">Validade {formatExpiry(l.expiry_date)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="hub-estoque__alert-grid">
              <section className="hub-estoque__alert-panel">
                <h2 className="hub-estoque__alert-title">Estoque abaixo do mínimo</h2>
                <div className="hub-servicos__table-wrap hub-clientes__table-wrap--desktop">
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
                            Nenhum item abaixo do mínimo.
                          </td>
                        </tr>
                      ) : (
                        low.map((i) => (
                          <tr key={i.id}>
                            <td>
                              <button type="button" className="hub-estoque__link" onClick={() => openItemCatalog(i)}>
                                {i.name}
                              </button>
                              <div>
                                <span className={`hub-estoque__kind hub-estoque__kind--${i.item_kind}`}>
                                  {kindLabel(i.item_kind)}
                                </span>
                              </div>
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
                <div className="hub-clientes__mobile-list" aria-label="Itens abaixo do mínimo">
                  {low.length === 0 ? (
                    <p className="hub-clientes__muted" style={{ textAlign: 'center', padding: 12 }}>
                      Nenhum item abaixo do mínimo.
                    </p>
                  ) : (
                    low.map((i) => (
                      <div key={i.id} className="hub-clientes__mobile-card hub-estoque__mobile-static">
                        <div className="hub-clientes__mobile-card-top">
                          <div className="hub-clientes__mobile-card-main">
                            <button type="button" className="hub-estoque__link" onClick={() => openItemCatalog(i)}>
                              {i.name}
                            </button>
                            <span className="hub-clientes__muted hub-clientes__mobile-card-contact">
                              {kindLabel(i.item_kind)} · mín. {i.min_stock_qty}
                            </span>
                          </div>
                          <span className="hub-clientes__pill hub-clientes__pill--inactive">
                            {i.qty_on_hand ?? 0} un.
                          </span>
                        </div>
                        {canWrite ? (
                          <div className="hub-clientes__mobile-card-foot">
                            <button
                              type="button"
                              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                              onClick={() => openEntry(i.id)}
                            >
                              <Plus size={14} strokeWidth={2} aria-hidden /> Registrar entrada
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="hub-estoque__alert-panel">
                <h2 className="hub-estoque__alert-title">Validade na política do item</h2>
                <div className="hub-servicos__table-wrap hub-clientes__table-wrap--desktop">
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
                      {expiringPolicy.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="hub-clientes__muted" style={{ textAlign: 'center', padding: 16 }}>
                            Nenhum lote na janela da política.
                          </td>
                        </tr>
                      ) : (
                        expiringPolicy.map((l) => (
                          <tr key={l.id}>
                            <td>
                              {l.item?.name}
                              <div>
                                <span className={`hub-estoque__kind hub-estoque__kind--${l.item?.item_kind || 'product'}`}>
                                  {kindLabel(l.item?.item_kind)}
                                </span>
                              </div>
                            </td>
                            <td className="hub-clientes__muted">{l.lot_code || '—'}</td>
                            <td>{formatExpiry(l.expiry_date)}</td>
                            <td>{l.qty_on_hand}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="hub-clientes__mobile-list" aria-label="Validade na política">
                  {expiringPolicy.length === 0 ? (
                    <p className="hub-clientes__muted" style={{ textAlign: 'center', padding: 12 }}>
                      Nenhum lote na janela da política.
                    </p>
                  ) : (
                    expiringPolicy.map((l) => (
                      <div key={l.id} className="hub-clientes__mobile-card hub-estoque__mobile-static">
                        <div className="hub-clientes__mobile-card-top">
                          <div className="hub-clientes__mobile-card-main">
                            <span className="hub-clientes__mobile-card-name">{l.item?.name}</span>
                            <span className="hub-clientes__muted hub-clientes__mobile-card-contact">
                              Lote {l.lot_code || 'sem código'}
                            </span>
                          </div>
                          <span className="hub-clientes__pill hub-clientes__pill--inactive">{l.qty_on_hand} un.</span>
                        </div>
                        <div className="hub-clientes__mobile-card-foot">
                          <span className={`hub-estoque__kind hub-estoque__kind--${l.item?.item_kind || 'product'}`}>
                            {kindLabel(l.item?.item_kind)}
                          </span>
                          <span className="hub-clientes__muted">Validade {formatExpiry(l.expiry_date)}</span>
                        </div>
                      </div>
                    ))
                  )}
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
