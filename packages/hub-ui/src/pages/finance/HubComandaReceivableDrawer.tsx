import React, { useCallback, useState } from 'react';
import { HubSidePanel } from '../../components/HubSidePanel';
import HubComandaReceivablePanel, { type ReceivablePaymentControls } from './HubComandaReceivablePanel';
import '../clientes/clientes.css';
import './hub-finance-page.css';
import '../orcamentos/orcamentos-page.css';

export type HubComandaReceivableDrawerProps = {
  open: boolean;
  onClose: () => void;
  comandaId: string;
  receivableIds: string[];
  selectedReceivableId: string;
  onSelectReceivable: (id: string) => void;
  onRefreshComanda?: () => void;
  highlightPayment?: boolean;
};

export function HubComandaReceivableDrawer({
  open,
  onClose,
  comandaId,
  receivableIds,
  selectedReceivableId,
  onSelectReceivable,
  onRefreshComanda,
  highlightPayment = false,
}: HubComandaReceivableDrawerProps) {
  const [paymentControls, setPaymentControls] = useState<ReceivablePaymentControls | null>(null);

  const handleRefresh = useCallback(() => {
    onRefreshComanda?.();
  }, [onRefreshComanda]);

  const handlePaymentControlsChange = useCallback((controls: ReceivablePaymentControls | null) => {
    setPaymentControls(controls);
  }, []);

  const handleClose = useCallback(() => {
    setPaymentControls(null);
    onClose();
  }, [onClose]);

  return (
    <HubSidePanel
      open={open}
      title="Cobrança — Comanda"
      subtitle="Recebível da comanda"
      onClose={handleClose}
      footer={
        <div className="hub-finance-page__drawer-footer">
          <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={handleClose}>
            Fechar
          </button>
          {paymentControls?.canSubmit ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              disabled={paymentControls.loading}
              onClick={paymentControls.submit}
            >
              {paymentControls.loading ? 'Processando…' : 'Confirmar'}
            </button>
          ) : null}
        </div>
      }
    >
      <HubComandaReceivablePanel
          comandaId={comandaId}
          receivableIds={receivableIds}
          selectedReceivableId={selectedReceivableId}
          onSelectReceivable={onSelectReceivable}
          onRefreshComanda={handleRefresh}
          onCancelSuccess={handleClose}
          highlightPayment={highlightPayment}
          hideHeader
          onPaymentControlsChange={handlePaymentControlsChange}
        />
    </HubSidePanel>
  );
}

export default HubComandaReceivableDrawer;
