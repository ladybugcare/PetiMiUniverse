import React from 'react';
import { Ban, Coins, FilePlus2, MessageCircle, Pencil, Receipt, SendHorizonal } from 'lucide-react';
import type { HubFinanceDayBoardItem } from '../../api/hubFinancialApi';
import {
  canCaixaCheckoutDayBoardItem,
  canCaixaEditDayBoardItem,
  canFinanceiroCheckoutDayBoardItem,
  canFinanceiroEditDayBoardItem,
  isDayBoardViewOnly,
} from './hubComandaEditUtils';

export const STATUS_OP_LABEL: Record<string, string> = {
  pending_confirm: 'Aguardando confirmação',
  confirmed: 'Confirmado',
  scheduled: 'Agendado',
  checked_in: 'Check-in',
  in_progress: 'Em atendimento',
  done: 'Concluído',
  paid: 'Pago',
  cancelled: 'Cancelado',
  no_show: 'Não compareceu',
  grooming: 'Tosa',
  bath_and_groom: 'Banho e Tosa',
  checked_out: 'Check-out realizado',
  waiting: 'Aguardando',
  completed: 'Concluído',
  reserved: 'Reservado',
  checked_in_boarding: 'Hospedado',
};

export function petInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ComandaStatusBadge({ billing }: { billing: HubFinanceDayBoardItem['billing'] }) {
  if (billing.receivable_status === 'paid') {
    return <span className="hub-clientes__pill hub-dayboard__pill--paid">Pago</span>;
  }
  if (billing.receivable_status === 'pending') {
    return <span className="hub-clientes__pill hub-dayboard__pill--pending">Pendente</span>;
  }
  if (billing.receivable_status === 'partially_paid') {
    return <span className="hub-clientes__pill hub-dayboard__pill--partial">Parcialmente pago</span>;
  }
  if (billing.comanda_id && billing.comanda_status === 'aberta') {
    return <span className="hub-clientes__pill hub-dayboard__pill--open">Comanda aberta</span>;
  }
  return <span className="hub-clientes__pill hub-dayboard__pill--none">Sem comanda</span>;
}

export type FinanceDayBoardTableProps = {
  mode: 'caixa' | 'financeiro';
  items: HubFinanceDayBoardItem[];
  canCreateReceivable: boolean;
  canFinancialWrite: boolean;
  onOpenComanda?: (item: HubFinanceDayBoardItem) => void;
  onEditComanda: (item: HubFinanceDayBoardItem) => void;
  onViewComanda: (item: HubFinanceDayBoardItem) => void;
  onCheckout: (item: HubFinanceDayBoardItem) => void;
  onSendToFinanceiro?: (item: HubFinanceDayBoardItem) => void;
  onWaive?: (item: HubFinanceDayBoardItem) => void;
  onShareComanda: (item: HubFinanceDayBoardItem) => void;
  busy: boolean;
};

export function FinanceDayBoardTable({
  mode,
  items,
  canCreateReceivable,
  canFinancialWrite,
  onOpenComanda,
  onEditComanda,
  onViewComanda,
  onCheckout,
  onSendToFinanceiro,
  onWaive,
  onShareComanda,
  busy,
}: FinanceDayBoardTableProps) {
  const isCaixa = mode === 'caixa';
  const checkoutLabel = isCaixa ? 'Receber' : 'Cobrar';

  return (
    <div className="hub-clientes__table-wrap">
      <table className="hub-clientes__table hub-dayboard__table">
        <thead>
          <tr>
            <th>Pet</th>
            <th>Serviços</th>
            <th>Tutor</th>
            <th>Horário</th>
            <th>Status</th>
            <th>Cobrança</th>
            <th className="hub-clientes__th-actions">Ações</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const hasComanda = !!item.billing.comanda_id;
            const hasReceivable = item.billing.has_receivable;
            const canEdit = isCaixa ? canCaixaEditDayBoardItem(item) : canFinanceiroEditDayBoardItem(item);
            const canCheckout = isCaixa ? canCaixaCheckoutDayBoardItem(item) : canFinanceiroCheckoutDayBoardItem(item);
            const isViewOnly = isDayBoardViewOnly(item);
            const opLabel = STATUS_OP_LABEL[item.operational_status] ?? item.operational_status;
            const timeStr = item.starts_at
              ? new Date(item.starts_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              : '—';
            const serviceNames =
              item.services && item.services.length > 0
                ? item.services.map((s) => s.name).join(', ')
                : item.origin_label;

            return (
              <tr key={`${item.origin_type}:${item.origin_id}`}>
                <td>
                  {item.pet?.name ? (
                    <div className="hub-clientes__tutor-cell">
                      <span className="hub-clientes__avatar hub-pets-table-avatar">{petInitials(item.pet.name)}</span>
                      <span className="hub-clientes__tutor-name hub-dayboard__pet-name">{item.pet.name}</span>
                    </div>
                  ) : (
                    <span className="hub-clientes__muted">—</span>
                  )}
                </td>
                <td>
                  <span className="hub-dayboard__services-cell" title={serviceNames}>
                    {serviceNames}
                  </span>
                </td>
                <td>{item.guardian?.full_name ?? <span className="hub-clientes__muted">—</span>}</td>
                <td className="hub-dayboard__time-cell">{timeStr}</td>
                <td>
                  <span className={`hub-dayboard__op-badge hub-dayboard__op-badge--${item.operational_status}`}>
                    {opLabel}
                  </span>
                </td>
                <td><ComandaStatusBadge billing={item.billing} /></td>
                <td className="hub-clientes__td-actions">
                  <div className="hub-clientes__td-actions-inner hub-dayboard__actions">
                    {isCaixa && !hasComanda && canCreateReceivable && onOpenComanda && (
                      <button
                        type="button"
                        className="hub-dayboard__action-btn"
                        title="Abrir comanda"
                        aria-label="Abrir comanda"
                        disabled={busy}
                        onClick={() => onOpenComanda(item)}
                      >
                        <FilePlus2 size={15} strokeWidth={2} />
                      </button>
                    )}
                    {hasComanda && canCreateReceivable && canEdit && (
                      <button
                        type="button"
                        className="hub-dayboard__action-btn"
                        title="Editar comanda"
                        aria-label="Editar comanda"
                        disabled={busy}
                        onClick={() => onEditComanda(item)}
                      >
                        <Pencil size={15} strokeWidth={2} />
                      </button>
                    )}
                    {isCaixa && !hasReceivable && canCreateReceivable && canEdit && onSendToFinanceiro && (
                      <button
                        type="button"
                        className="hub-dayboard__action-btn"
                        title="Enviar ao financeiro"
                        aria-label="Enviar ao financeiro"
                        disabled={busy}
                        onClick={() => onSendToFinanceiro(item)}
                      >
                        <SendHorizonal size={15} strokeWidth={2} />
                      </button>
                    )}
                    {hasComanda && !hasReceivable && canCreateReceivable && canCheckout && (
                      <button
                        type="button"
                        className="hub-dayboard__action-btn"
                        title={checkoutLabel}
                        aria-label={checkoutLabel}
                        disabled={busy}
                        onClick={() => onCheckout(item)}
                      >
                        <Coins size={15} strokeWidth={2} />
                      </button>
                    )}
                    {hasComanda && isViewOnly && (
                      <button
                        type="button"
                        className="hub-dayboard__action-btn"
                        title="Ver comanda"
                        aria-label="Ver comanda"
                        disabled={busy}
                        onClick={() => onViewComanda(item)}
                      >
                        <Receipt size={15} strokeWidth={2} />
                      </button>
                    )}
                    {hasComanda && hasReceivable && !isViewOnly && canCheckout && (
                      <button
                        type="button"
                        className="hub-dayboard__action-btn"
                        title={checkoutLabel}
                        aria-label={checkoutLabel}
                        disabled={busy}
                        onClick={() => onCheckout(item)}
                      >
                        <Coins size={15} strokeWidth={2} />
                      </button>
                    )}
                    {hasComanda && item.billing.comanda_id && !isViewOnly && (
                      <button
                        type="button"
                        className="hub-dayboard__action-btn"
                        title="Enviar cobrança por WhatsApp"
                        aria-label="Enviar cobrança por WhatsApp"
                        disabled={busy}
                        onClick={() => onShareComanda(item)}
                      >
                        <MessageCircle size={15} strokeWidth={2} />
                      </button>
                    )}
                    {isCaixa && !hasReceivable && canFinancialWrite && canEdit && onWaive && (
                      <button
                        type="button"
                        className="hub-dayboard__action-btn"
                        title="Marcar sem cobrança"
                        aria-label="Marcar sem cobrança"
                        disabled={busy}
                        onClick={() => onWaive(item)}
                      >
                        <Ban size={15} strokeWidth={2} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
