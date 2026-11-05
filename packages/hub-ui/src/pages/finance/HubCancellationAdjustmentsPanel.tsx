import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RefreshCw, Search, Undo2, X } from 'lucide-react';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import { hubComandaApi } from '../../api/hubComandaApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { ComandaCancellationResolveDrawer } from './ComandaCancellationResolveDrawer';
import { formatComandaOriginLabel } from './comandaListPreview';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const ORIGIN_FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'appointment', label: 'Agenda' },
  { id: 'grooming_session', label: 'Banho e tosa' },
  { id: 'encounter', label: 'Clínica' },
  { id: 'boarding_reservation', label: 'Hotel' },
  { id: 'other', label: 'Outras' },
] as const;

type OriginFilter = (typeof ORIGIN_FILTERS)[number]['id'];

const KNOWN_ORIGINS = new Set(['appointment', 'grooming_session', 'encounter', 'boarding_reservation']);

export type HubCancellationAdjustmentsPanelProps = {
  onCountChange?: (count: number) => void;
};

export const HubCancellationAdjustmentsPanel: React.FC<HubCancellationAdjustmentsPanelProps> = ({
  onCountChange,
}) => {
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();
  const { hasPermission } = usePermissions();
  const { showError } = useAlert();

  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(
    clinicId && unitId ? `${clinicId}:${unitId}` : null,
  );
  const [queue, setQueue] = useState<Array<Record<string, unknown>>>([]);
  const [resolveComanda, setResolveComanda] = useState<Record<string, unknown> | null>(null);
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all');
  const [search, setSearch] = useState('');

  const canFinancialWrite = hasPermission('hub.financial.write');

  const onCountChangeRef = React.useRef(onCountChange);
  onCountChangeRef.current = onCountChange;

  const load = useCallback(async () => {
    if (!clinicId || !unitId) {
      setQueue([]);
      onCountChangeRef.current?.(0);
      finish();
      return;
    }
    begin();
    try {
      const [countRes, queueRes] = await Promise.all([
        hubComandaApi.getCancellationPendingCount(clinicId, unitId).catch(() => ({ count: 0 })),
        hubComandaApi.listCancellationPending({ clinic_id: clinicId, unit_id: unitId }).catch(() => ({ comandas: [] })),
      ]);
      const items = queueRes.comandas ?? [];
      setQueue(items);
      onCountChangeRef.current?.(countRes.count ?? items.length);
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar cancelamentos pendentes');
      setQueue([]);
      onCountChangeRef.current?.(0);
    } finally {
      finish();
    }
  }, [clinicId, unitId, showError, begin, succeed, finish]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const term = normalizeText(search.trim());
    return queue.filter((c) => {
      const origin = String(c.cancellation_operational_type ?? c.origin_type ?? '');
      if (originFilter === 'other' && KNOWN_ORIGINS.has(origin)) return false;
      if (originFilter !== 'all' && originFilter !== 'other' && origin !== originFilter) return false;
      if (!term) return true;
      const gu = c.guardian as { full_name?: string } | null | undefined;
      const pet = c.pet as { name?: string } | null | undefined;
      const haystack = normalizeText(
        [gu?.full_name, pet?.name, formatComandaOriginLabel(origin)].filter(Boolean).join(' '),
      );
      return haystack.includes(term);
    });
  }, [queue, originFilter, search]);

  const visiblePaid = useMemo(
    () => visible.reduce((acc, c) => acc + Number(c.paid_total ?? 0), 0),
    [visible],
  );

  const filtersNarrowed = originFilter !== 'all' || search.trim().length > 0;

  if (!clinicId || !unitId) {
    return <p className="hub-clientes__muted">Selecione a unidade para continuar.</p>;
  }

  return (
    <>
      <section className="hub-finance-page__section hub-payables hub-expenses hub-adjustments">
        <div className="hub-payables__head">
          <div className="hub-payables__head-copy">
            <h2 className="hub-clientes__form-title">Cancelamentos</h2>
            <p className="hub-clientes__subtitle">
              Serviço cancelado na agenda ou no atendimento, com pagamento já registrado. Escolha reembolso,
              crédito para o tutor ou manter a cobrança.
            </p>
          </div>
          {!loading ? (
            <div className="hub-payables__stat">
              <span className="hub-payables__stat-label">Pendentes</span>
              <span className="hub-payables__stat-value">{visible.length}</span>
              <span className="hub-expenses__stat-meta">{formatBrl(visiblePaid)} já pago</span>
            </div>
          ) : null}
        </div>

        <HubRefreshingBanner show={refreshing} label="Atualizando cancelamentos…" />

        <div className="hub-expenses__toolbar">
          <div className="hub-payables__filters hub-expenses__filters" role="group" aria-label="Filtrar por origem">
            {ORIGIN_FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`hub-dayboard__toggle-btn${originFilter === item.id ? ' hub-dayboard__toggle-btn--active' : ''}`}
                onClick={() => setOriginFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="hub-expenses__toolbar-row">
            <div className="hub-dayboard__search-wrap hub-expenses__search">
              <Search size={14} className="hub-dayboard__search-icon" aria-hidden />
              <input
                type="text"
                className="hub-dayboard__search"
                placeholder="Buscar tutor ou pet…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Buscar cancelamento"
              />
              {search ? (
                <button
                  type="button"
                  className="hub-dayboard__search-clear"
                  aria-label="Limpar busca"
                  onClick={() => setSearch('')}
                >
                  <X size={12} />
                </button>
              ) : null}
            </div>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm hub-payables__refresh"
              onClick={() => void load()}
              aria-label="Atualizar lista"
            >
              <RefreshCw size={14} strokeWidth={2} aria-hidden />
              Atualizar
            </button>
          </div>
        </div>

        {loading && queue.length === 0 ? (
          <HubLoading variant="block" label="Carregando cancelamentos…" />
        ) : visible.length === 0 ? (
          <div className="hub-finance-page__empty" role="status">
            <span className="hub-finance-page__empty-icon" aria-hidden>
              <Undo2 size={24} strokeWidth={1.75} />
            </span>
            <p className="hub-finance-page__empty-title">
              {filtersNarrowed ? 'Nenhum cancelamento com esses filtros' : 'Nenhuma pendência nesta unidade'}
            </p>
            <p className="hub-finance-page__empty-desc">
              {filtersNarrowed
                ? 'Limpe a busca ou escolha outra origem para ver a fila.'
                : 'Quando um atendimento pago for cancelado, ele aparece aqui para você definir o ajuste.'}
            </p>
          </div>
        ) : (
          <div className="hub-clientes__table-wrap">
            <table className="hub-clientes__table hub-dayboard__table hub-payables__table">
              <thead>
                <tr>
                  <th>Tutor / pet</th>
                  <th>Origem</th>
                  <th>Cancelado em</th>
                  <th className="hub-finance-page__th-num">Pago</th>
                  <th className="hub-clientes__th-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => {
                  const gu = c.guardian as { full_name?: string } | null | undefined;
                  const pet = c.pet as { name?: string } | null | undefined;
                  const origin = String(c.cancellation_operational_type ?? c.origin_type ?? '');
                  const cancelledAt = c.cancellation_operational_at
                    ? new Date(String(c.cancellation_operational_at)).toLocaleString('pt-BR')
                    : '—';
                  const active = resolveComanda?.id === c.id;
                  return (
                    <tr key={String(c.id)} className={active ? 'hub-payables__row--active' : undefined}>
                      <td>
                        <span className="hub-payables__payee">{gu?.full_name ?? '—'}</span>
                        {pet?.name ? <span className="hub-expenses__notes">{pet.name}</span> : null}
                      </td>
                      <td>
                        <span className="hub-payables__chip">{formatComandaOriginLabel(origin)}</span>
                      </td>
                      <td>
                        <span className="hub-expenses__date">{cancelledAt}</span>
                      </td>
                      <td className="hub-finance-page__td-num">
                        <span className="hub-payables__amount">{formatBrl(Number(c.paid_total ?? 0))}</span>
                      </td>
                      <td className="hub-clientes__td-actions">
                        {canFinancialWrite ? (
                          <div className="hub-clientes__td-actions-inner hub-dayboard__actions">
                            <button
                              type="button"
                              className="hub-dayboard__action-btn hub-dayboard__action-btn--primary"
                              title="Resolver"
                              aria-label={`Resolver cancelamento de ${gu?.full_name ?? 'comanda'}`}
                              onClick={() => setResolveComanda(c)}
                            >
                              <CheckCircle2 size={15} strokeWidth={2} />
                            </button>
                          </div>
                        ) : (
                          <span className="hub-clientes__muted">Sem permissão</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ComandaCancellationResolveDrawer
        open={!!resolveComanda}
        onClose={() => setResolveComanda(null)}
        clinicId={clinicId}
        unitId={unitId}
        comanda={resolveComanda}
        onResolved={() => void load()}
      />
    </>
  );
};

export default HubCancellationAdjustmentsPanel;
