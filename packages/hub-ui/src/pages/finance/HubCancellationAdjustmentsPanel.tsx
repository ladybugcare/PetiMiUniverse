import React, { useCallback, useEffect, useState } from 'react';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import { hubComandaApi } from '../../api/hubComandaApi';
import { useAlert } from '../../components/AlertProvider';
import { ComandaCancellationResolveDrawer } from './ComandaCancellationResolveDrawer';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

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

  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<Array<Record<string, unknown>>>([]);
  const [resolveComanda, setResolveComanda] = useState<Record<string, unknown> | null>(null);

  const canFinancialWrite = hasPermission('hub.financial.write');

  const onCountChangeRef = React.useRef(onCountChange);
  onCountChangeRef.current = onCountChange;

  const load = useCallback(async () => {
    if (!clinicId || !unitId) {
      setQueue([]);
      onCountChangeRef.current?.(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [countRes, queueRes] = await Promise.all([
        hubComandaApi.getCancellationPendingCount(clinicId, unitId).catch(() => ({ count: 0 })),
        hubComandaApi.listCancellationPending({ clinic_id: clinicId, unit_id: unitId }).catch(() => ({ comandas: [] })),
      ]);
      const items = queueRes.comandas ?? [];
      setQueue(items);
      onCountChangeRef.current?.(countRes.count ?? items.length);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar cancelamentos pendentes');
      setQueue([]);
      onCountChangeRef.current?.(0);
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!clinicId || !unitId) {
    return <p className="hub-clientes__muted">Selecione a unidade para continuar.</p>;
  }

  return (
    <>
      <section className="hub-finance-page__section">
        <h2 className="hub-clientes__form-title">Ajustes por cancelamento</h2>
        <p className="hub-clientes__muted" style={{ marginTop: 0 }}>
          Operação cancelada na agenda ou no atendimento, com pagamento já registrado na comanda. Resolva aqui
          (reembolso, crédito ou manter cobrança).
        </p>
        {loading ? (
          <p className="hub-clientes__muted">Carregando…</p>
        ) : queue.length === 0 ? (
          <p className="hub-clientes__muted">Nenhuma pendência de cancelamento nesta unidade.</p>
        ) : (
          <div className="hub-clientes__table-wrap">
            <table className="hub-clientes__table hub-finance-page__table">
              <thead>
                <tr>
                  <th>Tutor / Pet</th>
                  <th>Origem</th>
                  <th className="hub-finance-page__th-num">Pago</th>
                  <th>Cancelamento</th>
                  <th className="hub-clientes__th-actions">Ação</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((c) => {
                  const gu = c.guardian as { full_name?: string } | null | undefined;
                  const pet = c.pet as { name?: string } | null | undefined;
                  const cancelledAt = c.cancellation_operational_at
                    ? new Date(String(c.cancellation_operational_at)).toLocaleString('pt-BR')
                    : '—';
                  return (
                    <tr key={String(c.id)}>
                      <td>
                        {gu?.full_name ?? '—'}
                        {pet?.name ? ` · ${pet.name}` : ''}
                      </td>
                      <td>
                        <span className="hub-clientes__muted">
                          {String(c.cancellation_operational_type ?? c.origin_type ?? '—')}
                        </span>
                      </td>
                      <td className="hub-finance-page__td-num">{formatBrl(Number(c.paid_total ?? 0))}</td>
                      <td>{cancelledAt}</td>
                      <td className="hub-clientes__td-actions">
                        {canFinancialWrite ? (
                          <button
                            type="button"
                            className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                            onClick={() => setResolveComanda(c)}
                          >
                            Resolver
                          </button>
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
