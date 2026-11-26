import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  hubFinancialApi,
  type HubFinanceReceivableDetail,
} from '../../api/hubFinancialApi';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubLoading } from '../../components/HubLoading';
import { useAlert } from '../../components/AlertProvider';
import {
  emptyMerchandiseReturnValue,
  HubMerchandiseReturnSection,
  merchandiseReturnApiFields,
  type MerchandiseReturnLine,
  type MerchandiseReturnValue,
} from './HubMerchandiseReturnSection';
import {
  HubReceivableCancelIntentField,
  type ReceivableCancelIntent,
} from './HubReceivableCancelIntentField';
import { ReceivableStockReturnBadge } from './ReceivableStockReturnBadge';

type Props = {
  open: boolean;
  clinicId: string;
  receivableId: string | null;
  onClose: () => void;
  onSuccess: () => void;
};

/**
 * Cancelamento de recebível com intenção (anular vs reemitir) e devolução física opcional.
 */
export function HubReceivableCancelPanel({ open, clinicId, receivableId, onClose, onSuccess }: Props) {
  const { showError, showSuccess } = useAlert();
  const [detail, setDetail] = useState<HubFinanceReceivableDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');
  const [intent, setIntent] = useState<ReceivableCancelIntent>('void_sale');
  const [merchandiseReturn, setMerchandiseReturn] = useState<MerchandiseReturnValue>(() =>
    emptyMerchandiseReturnValue(),
  );

  const load = useCallback(async () => {
    if (!open || !clinicId || !receivableId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    try {
      const d = await hubFinancialApi.getReceivableDetail(receivableId, clinicId);
      setDetail(d);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar recebível');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [open, clinicId, receivableId, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) {
      setReason('');
      setIntent('void_sale');
      setMerchandiseReturn(emptyMerchandiseReturnValue());
    }
  }, [open]);

  const merchandiseLines: MerchandiseReturnLine[] = useMemo(() => {
    const lines = detail?.lines ?? [];
    const returns = detail?.product_returns ?? [];
    const byLine = new Map(returns.map((r) => [r.receivable_line_id, r]));
    return lines
      .filter(
        (l) =>
          String(l.line_kind) === 'product' &&
          l.hub_inventory_item_id &&
          l.hub_inventory_lot_id &&
          Number(l.quantity ?? 0) > 0,
      )
      .map((l) => {
        const prev = byLine.get(l.id);
        return {
          id: l.id,
          description: l.inventory_item?.name || l.description || 'Produto',
          quantity: Number(l.quantity ?? 0),
          alreadyReturned: Boolean(prev),
          returnedCondition: prev?.condition ?? null,
        };
      });
  }, [detail]);

  const onConfirm = async () => {
    if (!clinicId || !receivableId) return;
    if (reason.trim().length < 3) {
      showError('Informe o motivo do cancelamento (mín. 3 caracteres).');
      return;
    }
    const pendingMerchandise = merchandiseLines.some((l) => !l.alreadyReturned);
    if (
      pendingMerchandise &&
      merchandiseReturn.returned &&
      merchandiseReturn.selectedLineIds.length === 0
    ) {
      showError('Selecione ao menos um produto para devolver.');
      return;
    }
    if (pendingMerchandise && merchandiseReturn.returned && !merchandiseReturn.condition) {
      showError('Selecione se a mercadoria está apta ou não para revenda.');
      return;
    }
    setSaving(true);
    try {
      const stockFields = pendingMerchandise ? merchandiseReturnApiFields(merchandiseReturn) : {};
      const res = await hubFinancialApi.cancelReceivable(receivableId, {
        clinic_id: clinicId,
        reason: reason.trim(),
        intent,
        ...stockFields,
      });
      const statusNote =
        res.comanda_status === 'cancelada'
          ? ' Comanda cancelada.'
          : res.comanda_status === 'aberta' && intent === 'reissue_billing'
            ? ' Comanda reaberta para nova cobrança.'
            : '';
      showSuccess((res.warning || 'Recebível cancelado.') + statusNote);
      onSuccess();
      onClose();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao cancelar recebível');
    } finally {
      setSaving(false);
    }
  };

  return (
    <HubSidePanel
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title="Cancelar recebível"
      subtitle={detail ? `Valor ${Number(detail.final_amount ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : undefined}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" disabled={saving} onClick={onClose}>
            Voltar
          </button>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={saving || loading || !detail}
            onClick={() => void onConfirm()}
          >
            {saving ? 'Cancelando…' : 'Confirmar cancelamento'}
          </button>
        </div>
      }
    >
      {loading ? (
        <HubLoading label="Carregando recebível…" />
      ) : !detail ? (
        <p className="hub-clientes__muted">Recebível não encontrado.</p>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <ReceivableStockReturnBadge status={detail.stock_return_status} />
          </div>
          <HubReceivableCancelIntentField
            idPrefix="dayboard-cancel"
            value={intent}
            onChange={setIntent}
            disabled={saving}
          />
          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="dayboard-cancel-reason">
              Motivo
            </label>
            <textarea
              id="dayboard-cancel-reason"
              className="hub-clientes__input"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Descreva o motivo (mín. 3 caracteres)"
              disabled={saving}
            />
          </div>
          {merchandiseLines.length > 0 ? (
            <HubMerchandiseReturnSection
              idPrefix="dayboard-cancel-stock"
              lines={merchandiseLines}
              value={merchandiseReturn}
              onChange={setMerchandiseReturn}
              disabled={saving}
            />
          ) : (
            <p className="hub-clientes__muted" style={{ margin: 0 }}>
              Sem produtos físicos neste recebível — apenas o título financeiro será cancelado.
            </p>
          )}
        </div>
      )}
    </HubSidePanel>
  );
}

export default HubReceivableCancelPanel;
