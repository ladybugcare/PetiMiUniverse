import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Coins, ExternalLink, Send } from 'lucide-react';
import { getStoredClinicId } from '@petimi/web-core';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { hubFinancialApi, type HubChargeBundle, type HubChargeBundleStatus } from '../../api/hubFinancialApi';
import { batchChargeItemsFromBundleItems } from './batchChargeItems';
import { BatchChargeDrawer } from './BatchChargeDrawer';

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function statusLabel(status: HubChargeBundleStatus): string {
  const map: Record<HubChargeBundleStatus, string> = {
    open: 'Em aberto',
    partially_paid: 'Parcialmente pago',
    paid: 'Quitado',
    cancelled: 'Cancelado',
  };
  return map[status] ?? status;
}

function formatDatePt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export type ChargeBundleHistorySectionProps = {
  guardianId: string;
  guardianName?: string;
  /** Se informado, mostra só lotes com recebíveis deste pet. */
  petId?: string;
  onChanged?: () => void;
};

export const ChargeBundleHistorySection: React.FC<ChargeBundleHistorySectionProps> = ({
  guardianId,
  guardianName,
  petId,
  onChanged,
}) => {
  const clinicId = getStoredClinicId();
  const navigate = useNavigate();
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(
    clinicId ? `${clinicId}:${guardianId}` : null,
  );
  const [bundles, setBundles] = useState<HubChargeBundle[]>([]);
  const [settleBundle, setSettleBundle] = useState<HubChargeBundle | null>(null);
  const [showSettleDrawer, setShowSettleDrawer] = useState(false);

  const load = useCallback(async () => {
    if (!clinicId) return;
    begin();
    try {
      const { bundles: rows } = await hubFinancialApi.listChargeBundles(clinicId, {
        guardian_id: guardianId,
        limit: 30,
      });
      setBundles(rows);
      succeed();
    } catch {
      setBundles([]);
    } finally {
      finish();
    }
  }, [clinicId, guardianId, begin, succeed, finish]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleBundles = useMemo(() => {
    if (!petId) return bundles;
    return bundles
      .map((b) => ({
        ...b,
        items: (b.items ?? []).filter((it) => (it.pet_ids ?? []).includes(petId)),
      }))
      .filter((b) => (b.items?.length ?? 0) > 0);
  }, [bundles, petId]);

  const openSettle = (bundle: HubChargeBundle) => {
    setSettleBundle(bundle);
    setShowSettleDrawer(true);
  };

  const settleItems = useMemo(() => {
    if (!settleBundle?.items?.length) return [];
    return batchChargeItemsFromBundleItems(settleBundle.items);
  }, [settleBundle]);

  if (!clinicId) return null;

  return (
    <>
      <section className="hub-clientes__fin-section">
        <h4 className="hub-clientes__fin-section-title">
          Cobranças enviadas
          {bundles.length > 0 || !loading ? (
            <span className="hub-clientes__fin-section-count">{visibleBundles.length}</span>
          ) : null}
        </h4>

        <HubRefreshingBanner show={refreshing} label="Atualizando cobranças…" />
        {loading && bundles.length === 0 ? (
          <HubLoading variant="inline" label="Carregando lotes…" size="sm" />
        ) : visibleBundles.length === 0 ? (
          <p className="hub-clientes__muted">Nenhuma cobrança agrupada enviada ainda.</p>
        ) : (
          <ul className="hub-clientes__fin-list">
            {visibleBundles.map((b) => {
              const balance = Number(b.balance_due ?? b.total_amount ?? 0);
              const canSettle = b.status !== 'paid' && b.status !== 'cancelled' && balance > 0.009;
              return (
                <li key={b.id} className="hub-clientes__fin-row">
                  <div className="hub-clientes__fin-row-main">
                    <span className="hub-clientes__fin-row-title">
                      Lote {formatDatePt(b.created_at)}
                      <span className="hub-clientes__fin-row-origin"> · {statusLabel(b.status)}</span>
                    </span>
                    <span className="hub-clientes__fin-row-meta">
                      {b.items?.length ?? 0} item(ns)
                      {b.due_date ? ` · venc. ${formatDatePt(b.due_date)}` : ''}
                      {b.sent_at ? ` · enviado ${formatDatePt(b.sent_at)}` : ''}
                    </span>
                  </div>
                  <div className="hub-clientes__fin-row-side">
                    <strong>{formatBrl(balance)}</strong>
                    <div className="hub-clientes__fin-row-actions">
                      <Link
                        to={`/hub/financeiro/cobranca-lote/${b.id}/pronto-para-envio`}
                        className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                      >
                        <Send size={14} aria-hidden />
                        Ver / reenviar
                      </Link>
                      {canSettle ? (
                        <button
                          type="button"
                          className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                          onClick={() => openSettle(b)}
                        >
                          <Coins size={14} aria-hidden />
                          Dar baixa
                        </button>
                      ) : (
                        <a
                          className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                          href={hubFinancialApi.chargeBundlePublicLink(b.public_token)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink size={14} aria-hidden />
                          Link
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <BatchChargeDrawer
        open={showSettleDrawer}
        items={settleItems}
        guardianName={guardianName}
        initialAction="receive_now"
        onClose={() => {
          setShowSettleDrawer(false);
          setSettleBundle(null);
        }}
        onDone={() => {
          void load();
          onChanged?.();
        }}
        onBundleCreated={(id) => navigate(`/hub/financeiro/cobranca-lote/${id}/pronto-para-envio`)}
      />
    </>
  );
};

export default ChargeBundleHistorySection;
