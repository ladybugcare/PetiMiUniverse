import React from 'react';
import { Ban, Coins, FilePlus2, MessageCircle, Pencil, Receipt, SendHorizonal } from 'lucide-react';
import type { HubFinanceDayBoardItem } from '../../api/hubFinancialApi';
import { HubCheckbox } from '../../components/HubCheckbox';
import { serviceGroupLabel } from '../../utils/serviceTypeSlug';
import {
  canCaixaCheckoutDayBoardItem,
  canCaixaEditDayBoardItem,
  canFinanceiroCheckoutDayBoardItem,
  canFinanceiroEditDayBoardItem,
  isDayBoardViewOnly,
  resolveDayBoardCheckoutLabel,
} from './hubComandaEditUtils';
import { isDayBoardBatchSelectable } from './batchChargeItems';
import { ReceivableDueBadge } from './ReceivableDueBadge';

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
  if (billing.receivable_status === 'pending' || billing.receivable_status === 'partially_paid') {
    return (
      <ReceivableDueBadge
        dueDate={billing.due_date}
        status={billing.receivable_status}
        showDate
      />
    );
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
  onCancelReceivable?: (item: HubFinanceDayBoardItem) => void;
  onShareComanda: (item: HubFinanceDayBoardItem) => void;
  onRowClick?: (item: HubFinanceDayBoardItem) => void;
  busy: boolean;
  /** Multi-seleção (só Financeiro). Keys: `origin_type:origin_id`. */
  selectionEnabled?: boolean;
  selectedKeys?: Set<string>;
  onToggleSelect?: (item: HubFinanceDayBoardItem) => void;
  onToggleSelectAllSelectable?: () => void;
};

function itemKey(item: HubFinanceDayBoardItem): string {
  return `${item.origin_type}:${item.origin_id}`;
}

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
  onCancelReceivable,
  onShareComanda,
  onRowClick,
  busy,
  selectionEnabled = false,
  selectedKeys,
  onToggleSelect,
  onToggleSelectAllSelectable,
}: FinanceDayBoardTableProps) {
  const isCaixa = mode === 'caixa';
  const selectableItems = selectionEnabled ? items.filter(isDayBoardBatchSelectable) : [];
  const allSelectableSelected =
    selectableItems.length > 0 && selectableItems.every((it) => selectedKeys?.has(itemKey(it)));
  const someSelectableSelected =
    selectableItems.some((it) => selectedKeys?.has(itemKey(it))) && !allSelectableSelected;

  return (
    <div className="hub-clientes__table-wrap">
      <table className="hub-clientes__table hub-dayboard__table">
        <thead>
          <tr>
            {selectionEnabled ? (
              <th className="hub-dayboard__th-check">
                <HubCheckbox
                  checked={allSelectableSelected}
                  indeterminate={someSelectableSelected}
                  onChange={() => onToggleSelectAllSelectable?.()}
                  disabled={busy || selectableItems.length === 0}
                  ariaLabel="Selecionar todas as cobranças elegíveis"
                />
              </th>
            ) : null}
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
            const checkoutLabel = resolveDayBoardCheckoutLabel(mode, item);
            const isViewOnly = isDayBoardViewOnly(item);
            const opLabel = STATUS_OP_LABEL[item.operational_status] ?? item.operational_status;
            const timeStr = item.starts_at
              ? new Date(item.starts_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              : '—';
            const serviceNames =
              item.services && item.services.length > 0
                ? item.services.map((s) => s.name).join(', ')
                : item.origin_label;
            const groupLabel = item.service_group ? serviceGroupLabel(item.service_group) : null;

            const canCancelReceivable =
              !isCaixa &&
              hasReceivable &&
              canFinancialWrite &&
              canEdit &&
              !isViewOnly &&
              Boolean(item.billing.active_receivable_id) &&
              (item.billing.receivable_status === 'pending' ||
                item.billing.receivable_status === 'partially_paid');

            const rowClickable = hasComanda && Boolean(onRowClick);

            return (
              <tr
                key={`${item.origin_type}:${item.origin_id}`}
                className={rowClickable ? 'hub-dayboard__row-click' : undefined}
                onClick={rowClickable ? () => onRowClick!(item) : undefined}
              >
                {selectionEnabled ? (
                  <td
                    className="hub-dayboard__td-check"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isDayBoardBatchSelectable(item) ? (
                      <HubCheckbox
                        checked={Boolean(selectedKeys?.has(itemKey(item)))}
                        onChange={() => onToggleSelect?.(item)}
                        disabled={busy}
                        ariaLabel={`Selecionar ${item.pet?.name ?? item.origin_label}`}
                      />
                    ) : (
                      <span className="hub-clientes__muted">—</span>
                    )}
                  </td>
                ) : null}
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
                  <div className="hub-dayboard__services-wrap">
                    {item.coverage_kind === 'series_invoice' || item.series_invoice_comanda_id ? (
                      <span className="hub-clientes__pill hub-dayboard__pill--open" style={{ marginRight: 6 }}>
                        Fatura
                      </span>
                    ) : item.has_package_balance || item.coverage_kind === 'package' ? (
                      <span className="hub-clientes__pill hub-dayboard__pill--open" style={{ marginRight: 6 }}>
                        Pacote
                      </span>
                    ) : null}
                    {groupLabel ? (
                      <span className="hub-clientes__pill hub-dayboard__group-pill">{groupLabel}</span>
                    ) : null}
                    <span className="hub-dayboard__services-cell" title={serviceNames}>
                      {serviceNames}
                    </span>
                    {(item.has_package_balance || item.coverage_kind === 'package') &&
                    Number(item.estimated_amount ?? 0) <= 0.009 ? (
                      <span className="hub-clientes__muted" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
                        Coberto por pacote
                      </span>
                    ) : null}
                    {item.coverage_kind === 'series_invoice' ? (
                      <span className="hub-clientes__muted" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
                        Coberto por fatura
                      </span>
                    ) : null}
                  </div>
                </td>
                <td>{item.guardian?.full_name ?? <span className="hub-clientes__muted">—</span>}</td>
                <td className="hub-dayboard__time-cell">{timeStr}</td>
                <td>
                  <span className={`hub-dayboard__op-badge hub-dayboard__op-badge--${item.operational_status}`}>
                    {opLabel}
                  </span>
                </td>
                <td><ComandaStatusBadge billing={item.billing} /></td>
                <td className="hub-clientes__td-actions" onClick={(e) => e.stopPropagation()}>
                  <div className="hub-clientes__td-actions-inner hub-dayboard__actions">
                    {isCaixa && !hasComanda && canCreateReceivable && onOpenComanda && (
                      <button
                        type="button"
                        className="hub-dayboard__action-btn"
                        title={
                          item.has_package_balance || item.coverage_kind === 'package'
                            ? 'Abrir comanda com pacote'
                            : 'Abrir comanda'
                        }
                        aria-label={
                          item.has_package_balance || item.coverage_kind === 'package'
                            ? 'Abrir comanda com pacote'
                            : 'Abrir comanda'
                        }
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
                    {hasComanda && !hasReceivable && canCreateReceivable && canCheckout && checkoutLabel && (
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
                    {hasComanda && hasReceivable && !isViewOnly && canCheckout && checkoutLabel && (
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
                    {canCancelReceivable && onCancelReceivable && (
                      <button
                        type="button"
                        className="hub-dayboard__action-btn"
                        title="Cancelar recebível"
                        aria-label="Cancelar recebível"
                        disabled={busy}
                        onClick={() => onCancelReceivable(item)}
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
