import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, Layers, Package, PauseCircle, Pencil, PlayCircle, Plus, Search } from 'lucide-react';
import { getStoredClinicId } from '@petimi/web-core';
import { hubPackagesApi, type HubPackage, type HubPackageItem } from '../../api/hubPackagesApi';
import { HubCheckbox } from '../../components/HubCheckbox';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import '../clientes/clientes.css';
import './servicos-page.css';

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function truncateText(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function packageItemChipLabel(it: HubPackageItem): string {
  const name = it.service_name ?? 'item';
  const suffix = it.is_addon ? ' (adicional)' : '';
  return `${it.quantity}× ${name}${suffix}`;
}

const HubPackagesPage: React.FC = () => {
  const clinicId = getStoredClinicId();
  const navigate = useNavigate();
  const { showError, showSuccess, showConfirm } = useAlert();
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(clinicId);
  const [packages, setPackages] = useState<HubPackage[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(async () => {
    if (!clinicId) return;
    begin();
    try {
      const res = await hubPackagesApi.list(clinicId, showInactive);
      setPackages(res.packages ?? []);
      succeed();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar pacotes');
    } finally {
      finish();
    }
  }, [clinicId, showInactive, showError, begin, succeed, finish]);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo(() => {
    const total = packages.length;
    const active = packages.filter((p) => p.active).length;
    const sessions = packages.reduce((sum, p) => sum + Number(p.sessions_total ?? 0), 0);
    const combos = packages.filter((p) => p.package_kind === 'combo').length;
    return { total, active, sessions, combos };
  }, [packages]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return packages;
    return packages.filter((pkg) => {
      const haystack = [
        pkg.name,
        pkg.description ?? '',
        ...(pkg.items ?? []).map((it) => packageItemChipLabel(it)),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [packages, searchQuery]);

  const openEdit = (pkgId: string) => navigate(`/hub/servicos/pacotes/${pkgId}/editar`);

  const toggleActive = (pkg: HubPackage) => {
    if (!clinicId) return;
    const nextActive = !pkg.active;
    const doUpdate = () => {
      void (async () => {
        try {
          await hubPackagesApi.update(pkg.id, { clinic_id: clinicId, active: nextActive });
          showSuccess(nextActive ? 'Pacote reativado' : 'Pacote inativado');
          await load();
        } catch (e: unknown) {
          showError((e as Error)?.message || 'Erro ao atualizar pacote');
        }
      })();
    };
    if (nextActive) {
      doUpdate();
    } else {
      showConfirm(
        `Inativar o pacote "${pkg.name}"? Ele deixará de aparecer para venda no caixa.`,
        doUpdate,
        'Inativar pacote'
      );
    }
  };

  if (!clinicId) {
    return <p className="hub-clientes__muted">Selecione uma clínica.</p>;
  }

  return (
    <div className="hub-clientes hub-servicos-page hub-pets-page">
      <div className="hub-clientes__main">
        <div className="hub-servicos-config__header">
          <div>
            <h1 className="hub-servicos-config__title">Pacotes</h1>
            <p className="hub-clientes__muted hub-servicos-config__lead">
              Pacotes pré-pagos compostos por serviços e adicionais do catálogo.
            </p>
          </div>
        </div>

        <div className="hub-servicos__metrics" aria-live="polite">
          <div className="hub-servicos__metric-card">
            <div className="hub-servicos__metric-card__text">
              <div className="hub-servicos__metric-label">Total de pacotes</div>
              <div className="hub-servicos__metric-value">
                {loading ? '—' : metrics.total.toLocaleString('pt-BR')}
              </div>
              <div className="hub-servicos__metric-sub">Cadastrados nesta clínica</div>
            </div>
            <div className="hub-servicos__metric-icon" aria-hidden>
              <Package size={22} strokeWidth={1.75} />
            </div>
          </div>
          <div className="hub-servicos__metric-card">
            <div className="hub-servicos__metric-card__text">
              <div className="hub-servicos__metric-label">Pacotes ativos</div>
              <div className="hub-servicos__metric-value">
                {loading ? '—' : metrics.active.toLocaleString('pt-BR')}
              </div>
              <div className="hub-servicos__metric-sub">Disponíveis para venda</div>
            </div>
            <div className="hub-servicos__metric-icon" aria-hidden>
              <Layers size={22} strokeWidth={1.75} />
            </div>
          </div>
          <div className="hub-servicos__metric-card">
            <div className="hub-servicos__metric-card__text">
              <div className="hub-servicos__metric-label">Sessões no catálogo</div>
              <div className="hub-servicos__metric-value">
                {loading ? '—' : metrics.sessions.toLocaleString('pt-BR')}
              </div>
              <div className="hub-servicos__metric-sub">
                {metrics.combos > 0
                  ? `${metrics.combos} combo${metrics.combos === 1 ? '' : 's'} no catálogo`
                  : 'Soma das sessões de todos os pacotes'}
              </div>
            </div>
            <div className="hub-servicos__metric-icon hub-servicos__metric-icon--muted" aria-hidden>
              <Calendar size={22} strokeWidth={1.75} />
            </div>
          </div>
        </div>

        <div className="hub-servicos__toolbar">
          <div className="hub-servicos__toolbar-row">
            <div className="hub-servicos__search-wrap">
              <div className="hub-servicos__search-field">
                <span className="hub-servicos__search-icon">
                  <Search size={18} strokeWidth={2} aria-hidden />
                </span>
                <input
                  type="search"
                  className="hub-servicos__search-input"
                  placeholder="Buscar por nome, descrição ou composição…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Buscar pacotes"
                />
              </div>
            </div>
            <HubCheckbox checked={showInactive} onChange={setShowInactive}>
              Incluir inativos
            </HubCheckbox>
            <Link to="/hub/servicos/pacotes/novo" className="hub-servicos__btn-primary-icon">
              <Plus size={18} strokeWidth={2.25} aria-hidden />
              Novo pacote
            </Link>
          </div>
        </div>

        <HubRefreshingBanner show={refreshing} label="Atualizando pacotes…" />
        {loading && packages.length === 0 ? (
          <HubLoading variant="block" label="Carregando pacotes…" />
        ) : packages.length === 0 ? (
          <div className="hub-packages__empty">
            <div className="hub-packages__empty-icon" aria-hidden>
              <Package size={36} strokeWidth={1.5} />
            </div>
            <h2 className="hub-packages__empty-title">Nenhum pacote cadastrado</h2>
            <p className="hub-packages__empty-text">
              Monte pacotes pré-pagos com serviços e adicionais do catálogo para vender no caixa e consumir nos
              atendimentos.
            </p>
            <Link to="/hub/servicos/pacotes/novo" className="hub-servicos__btn-primary-icon">
              <Plus size={18} strokeWidth={2.25} aria-hidden />
              Criar primeiro pacote
            </Link>
          </div>
        ) : (
          <div className="hub-servicos__table-wrap">
            <table className="hub-clientes__table">
              <thead>
                <tr>
                  <th>Pacote</th>
                  <th>Tipo</th>
                  <th>Composição</th>
                  <th className="hub-servicos__td-money">Preço</th>
                  <th>Validade</th>
                  <th>Status</th>
                  <th className="hub-clientes__th-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="hub-packages__table-empty">
                      Nenhum pacote corresponde à busca.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((pkg) => {
                    const desc = (pkg.description ?? '').trim();
                    const items = pkg.items ?? [];
                    return (
                      <tr key={pkg.id} onClick={() => openEdit(pkg.id)} className="hub-packages__row">
                        <td>
                          <div className="hub-servicos__svc-cell">
                            <div
                              className="hub-servicos__svc-icon-ring hub-packages__icon-ring"
                              aria-hidden
                            >
                              <Package size={22} strokeWidth={1.75} color="var(--hc-brand)" />
                            </div>
                            <div className="hub-servicos__metric-card__text">
                              <div className="hub-servicos__svc-title">{pkg.name}</div>
                              {desc ? (
                                <div className="hub-servicos__svc-desc">{truncateText(desc, 140)}</div>
                              ) : (
                                <div className="hub-packages__meta-line">
                                  {pkg.sessions_total} {pkg.sessions_total === 1 ? 'sessão' : 'sessões'} ·{' '}
                                  {pkg.pricing_mode === 'catalog_sum' ? 'Preço do catálogo' : 'Preço manual'}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`hub-packages__kind-pill ${
                              pkg.package_kind === 'combo' ? 'hub-packages__kind-pill--combo' : ''
                            }`}
                          >
                            {pkg.package_kind === 'combo' ? 'Combo' : 'Simples'}
                          </span>
                        </td>
                        <td>
                          {items.length > 0 ? (
                            <div className="hub-packages__composition">
                              {items.map((it, idx) => (
                                <span
                                  key={`${it.hub_service_type_id}-${idx}`}
                                  className={`hub-packages__chip${it.is_addon ? ' hub-packages__chip--addon' : ''}`}
                                >
                                  {packageItemChipLabel(it)}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="hub-clientes__muted">—</span>
                          )}
                        </td>
                        <td className="hub-servicos__td-money">
                          <span className="hub-packages__price">{formatBrl(Number(pkg.price ?? 0))}</span>
                          {pkg.pricing_mode === 'catalog_sum' && Number(pkg.discount_amount) > 0 ? (
                            <span className="hub-packages__price-hint">
                              Desc. {formatBrl(Number(pkg.discount_amount))}
                            </span>
                          ) : null}
                        </td>
                        <td>
                          <span className="hub-packages__validity">
                            {pkg.validity_days ? `${pkg.validity_days} dias` : 'Sem limite'}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`hub-clientes__pill ${
                              pkg.active ? 'hub-clientes__pill--active' : 'hub-clientes__pill--inactive'
                            }`}
                          >
                            {pkg.active ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="hub-clientes__td-actions" onClick={(e) => e.stopPropagation()}>
                          <div className="hub-servicos__row-actions">
                            <button
                              type="button"
                              className="hub-servicos__icon-btn"
                              title="Editar"
                              aria-label="Editar pacote"
                              onClick={() => openEdit(pkg.id)}
                            >
                              <Pencil size={18} strokeWidth={2} />
                            </button>
                            <button
                              type="button"
                              className="hub-servicos__icon-btn"
                              title={pkg.active ? 'Inativar' : 'Reativar'}
                              aria-label={pkg.active ? 'Inativar pacote' : 'Reativar pacote'}
                              onClick={() => toggleActive(pkg)}
                            >
                              {pkg.active ? (
                                <PauseCircle size={18} strokeWidth={2} />
                              ) : (
                                <PlayCircle size={18} strokeWidth={2} />
                              )}
                            </button>
                          </div>
                        </td>
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

export default HubPackagesPage;
