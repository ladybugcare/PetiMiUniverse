import React, { useEffect, useMemo, useState } from 'react';
import { getStoredClinicId } from '@petimi/web-core';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubCheckbox } from '../../components/HubCheckbox';
import { HubDateField } from '../../components/HubDateField';
import { HubLoading } from '../../components/HubLoading';
import { HubSearchableCombobox, type HubComboboxOption } from '../../components/HubSearchableCombobox';
import { useAlert } from '../../components/AlertProvider';
import { hubComandaApi } from '../../api/hubComandaApi';
import { hubFinancialApi, type HubPaymentMethod } from '../../api/hubFinancialApi';
import {
  defaultPaymentMethod,
  filterEnabledPaymentMethods,
  HUB_PAYMENT_METHOD_LABELS,
} from '../../utils/hubPaymentMethods';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';
import {
  assertSameGuardian,
  sumBatchChargeAmount,
  type BatchChargeItem,
} from './batchChargeItems';
import { formatDueDateShort } from './dueDateTone';
import {
  CheckoutDrawerActionTabs,
  CheckoutDrawerBillingShell,
  CheckoutDrawerSection,
  CheckoutDrawerSummaryCell,
  CheckoutDrawerSummaryGrid,
  type CheckoutDrawerBillingAction,
} from './checkoutDrawerParts';
import '../clientes/clientes.css';
import './hub-finance-page.css';

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

export type BatchChargeDrawerProps = {
  open: boolean;
  items: BatchChargeItem[];
  /** Pré-seleciona estes ids ao abrir. Default: todos. */
  initialSelectedIds?: string[];
  guardianName?: string;
  /** Ação inicial ao abrir (ex.: dar baixa a partir do histórico). */
  initialAction?: BatchAction;
  onClose: () => void;
  onDone: () => void;
  /** Após criar lote «Enviar cobrança», navega para pronto-para-envio. */
  onBundleCreated?: (bundleId: string) => void;
};

type BatchAction = 'receive_now' | 'leave_pending' | 'send_charge';

export const BatchChargeDrawer: React.FC<BatchChargeDrawerProps> = ({
  open,
  items,
  initialSelectedIds,
  guardianName,
  initialAction,
  onClose,
  onDone,
  onBundleCreated,
}) => {
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();
  const { showError, showSuccess } = useAlert();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [action, setAction] = useState<BatchAction>('receive_now');
  const [paymentMethod, setPaymentMethod] = useState<HubPaymentMethod>('pix');
  const [acceptedPaymentMethods, setAcceptedPaymentMethods] = useState<HubPaymentMethod[]>([]);
  const [cashSessionId, setCashSessionId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const initial =
      initialSelectedIds && initialSelectedIds.length > 0
        ? initialSelectedIds
        : items.map((i) => i.id);
    setSelectedIds(new Set(initial.filter((id) => items.some((i) => i.id === id))));
    setAction(initialAction ?? 'receive_now');
  }, [open, items, initialSelectedIds, initialAction]);

  useEffect(() => {
    if (!open || !clinicId || !unitId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { cash_session } = await hubFinancialApi.getCashSessionOpen(clinicId, unitId);
        if (!cancelled) setCashSessionId(cash_session?.id ?? null);
      } catch {
        if (!cancelled) setCashSessionId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, clinicId, unitId]);

  useEffect(() => {
    if (!open || !clinicId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await hubFinancialApi.getPaymentMethodSettings(clinicId);
        const methods = filterEnabledPaymentMethods(res.accepted_payment_methods ?? []);
        if (!cancelled) {
          setAcceptedPaymentMethods(methods);
          setPaymentMethod((current) => (methods.includes(current) ? current : defaultPaymentMethod(methods)));
        }
      } catch {
        if (!cancelled) setAcceptedPaymentMethods(filterEnabledPaymentMethods([]));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, clinicId]);

  const paymentMethodOptions = useMemo((): HubComboboxOption[] => {
    return acceptedPaymentMethods.map((value) => ({
      value,
      label: HUB_PAYMENT_METHOD_LABELS[value],
    }));
  }, [acceptedPaymentMethods]);

  const selectedItems = useMemo(
    () => items.filter((i) => selectedIds.has(i.id)),
    [items, selectedIds],
  );
  const selectedTotal = sumBatchChargeAmount(selectedItems);
  const selectedComandas = selectedItems.filter((i) => i.kind === 'comanda');
  const selectedReceivables = selectedItems.filter((i) => i.kind === 'receivable');
  const canLeavePending = selectedComandas.length > 0 && selectedReceivables.length === 0;

  useEffect(() => {
    if (action === 'leave_pending' && !canLeavePending) {
      setAction('receive_now');
    }
  }, [action, canLeavePending]);

  const overdueCount = selectedItems.filter((i) => i.tone === 'overdue').length;
  const soonCount = selectedItems.filter((i) => i.tone === 'soon').length;

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(items.map((i) => i.id)));
  const selectOverdue = () =>
    setSelectedIds(new Set(items.filter((i) => i.tone === 'overdue').map((i) => i.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const onSubmit = async () => {
    if (!clinicId || !unitId) {
      showError('Selecione uma unidade no cabeçalho.');
      return;
    }
    if (selectedItems.length === 0) {
      showError('Selecione ao menos uma cobrança.');
      return;
    }
    try {
      assertSameGuardian(selectedItems);
    } catch (e) {
      showError((e as Error).message);
      return;
    }

    if (action === 'leave_pending') {
      if (!canLeavePending) {
        showError('«Enviar ao financeiro» só vale para comandas abertas (sem recebível). Desmarque os recebíveis ou escolha «Receber agora».');
        return;
      }
      if (!dueDate) {
        showError('Informe o vencimento.');
        return;
      }
    }

    if (action === 'send_charge') {
      if (!dueDate) {
        showError('Informe o vencimento do lote.');
        return;
      }
    }

    if (action === 'receive_now') {
      if (!paymentMethod) {
        showError('Selecione a forma de pagamento.');
        return;
      }
      if (paymentMethod === 'cash' && !cashSessionId) {
        showError('Não há caixa aberto para receber em dinheiro.');
        return;
      }
    }

    setSubmitting(true);
    const errors: string[] = [];
    let okCount = 0;

    try {
      if (action === 'send_charge') {
        const guardianId = assertSameGuardian(selectedItems);
        if (!guardianId) {
          showError('Não foi possível identificar o tutor deste lote.');
          return;
        }

        const receivableIdSet = new Set<string>();
        for (const it of selectedReceivables) {
          if (it.receivableId) receivableIdSet.add(it.receivableId);
        }

        if (selectedComandas.length > 0) {
          const comandaIds = selectedComandas.map((i) => i.comandaId!).filter(Boolean);
          const res = await hubComandaApi.checkoutBulk({
            clinic_id: clinicId,
            unit_id: unitId,
            comanda_ids: comandaIds,
            action: 'leave_pending',
            due_date: dueDate,
          });
          for (const r of res.results) {
            if (r.error) errors.push(r.error);
            else for (const rid of r.receivable_ids ?? []) receivableIdSet.add(rid);
          }
        }

        if (receivableIdSet.size === 0) {
          showError(errors[0] || 'Nenhum recebível disponível para agrupar.');
          return;
        }
        if (errors.length > 0 && receivableIdSet.size === 0) {
          showError(errors[0] || 'Erro ao preparar comandas para o lote.');
          return;
        }

        const { bundle } = await hubFinancialApi.createChargeBundle({
          clinic_id: clinicId,
          guardian_id: guardianId,
          unit_id: unitId,
          receivable_ids: [...receivableIdSet],
          due_date: dueDate,
        });

        if (errors.length > 0) {
          showSuccess('Lote criado com avisos — confira os itens enviados.');
          showError(errors.slice(0, 2).join('\n'));
        } else {
          showSuccess('Cobrança agrupada pronta para envio.');
        }

        onDone();
        onClose();
        onBundleCreated?.(bundle.id);
        return;
      }

      if (action === 'leave_pending') {
        const comandaIds = selectedComandas.map((i) => i.comandaId!).filter(Boolean);
        const res = await hubComandaApi.checkoutBulk({
          clinic_id: clinicId,
          unit_id: unitId,
          comanda_ids: comandaIds,
          action: 'leave_pending',
          due_date: dueDate,
        });
        for (const r of res.results) {
          if (r.error) errors.push(r.error);
          else okCount += 1;
        }
      } else {
        if (selectedComandas.length > 0) {
          const comandaIds = selectedComandas.map((i) => i.comandaId!).filter(Boolean);
          const res = await hubComandaApi.checkoutBulk({
            clinic_id: clinicId,
            unit_id: unitId,
            comanda_ids: comandaIds,
            action: 'receive_now',
            payment_method: paymentMethod,
            cash_session_id: cashSessionId,
          });
          for (const r of res.results) {
            if (r.error) errors.push(`${r.comanda_id.slice(0, 8)}…: ${r.error}`);
            else if (!r.receivable_ids?.length && action === 'receive_now') {
              errors.push(`${r.comanda_id.slice(0, 8)}…: nenhum pagamento registrado nesta comanda`);
            } else okCount += 1;
          }
        }
        for (const it of selectedReceivables) {
          if (!it.receivableId) {
            errors.push(`${it.title}: recebível sem id — não foi possível cobrar.`);
            continue;
          }
          if (it.amount <= 0) {
            errors.push(`${it.title}: valor inválido.`);
            continue;
          }
          try {
            await hubFinancialApi.createReceivablePayment(it.receivableId, {
              clinic_id: clinicId,
              amount: it.amount,
              payment_method: paymentMethod,
              cash_session_id: cashSessionId,
            });
            okCount += 1;
          } catch (e) {
            errors.push(`${it.title}: ${(e as Error).message}`);
          }
        }
      }

      if (okCount > 0 && errors.length === 0) {
        showSuccess(
          action === 'leave_pending'
            ? `${okCount} comanda(s) enviada(s) ao financeiro.`
            : `${okCount} cobrança(s) recebida(s).`,
        );
        onDone();
        onClose();
      } else if (okCount > 0) {
        showSuccess(`${okCount} ok · ${errors.length} com erro.`);
        showError(errors.slice(0, 3).join('\n'));
        onDone();
      } else {
        showError(errors[0] || 'Não foi possível processar o lote.');
      }
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao processar cobrança em conjunto');
    } finally {
      setSubmitting(false);
    }
  };

  const actionTabs: Array<{ value: BatchAction; label: string }> = [
    { value: 'receive_now', label: 'Receber agora' },
    { value: 'send_charge', label: 'Enviar cobrança' },
    ...(canLeavePending || action === 'leave_pending'
      ? [{ value: 'leave_pending' as const, label: 'Enviar ao financeiro' }]
      : []),
  ];

  const footer = (
    <div className="hub-batch-charge__footer">
      <div className="hub-batch-charge__footer-total">
        <span className="hub-clientes__muted">{selectedItems.length} selecionada(s)</span>
        <strong>{formatBrl(selectedTotal)}</strong>
      </div>
      <div className="hub-batch-charge__footer-actions">
        <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={onClose} disabled={submitting}>
          Cancelar
        </button>
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--primary"
          onClick={() => void onSubmit()}
          disabled={submitting || selectedItems.length === 0}
        >
          {submitting
            ? 'Processando…'
            : action === 'leave_pending'
              ? 'Enviar selecionadas'
              : action === 'send_charge'
                ? 'Gerar cobrança agrupada'
                : 'Cobrar selecionadas'}
        </button>
      </div>
    </div>
  );

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title="Cobrar em conjunto"
      subtitle={guardianName ? `Tutor: ${guardianName}` : 'Selecione o que deseja quitar neste lote'}
      footer={footer}
      size="wide"
      contentKey={`${items.length}-${open}`}
    >
      {!clinicId || !unitId ? (
        <p className="hub-clientes__muted">Selecione uma unidade no cabeçalho.</p>
      ) : items.length === 0 ? (
        <p className="hub-clientes__muted">Nenhuma cobrança em aberto para este lote.</p>
      ) : (
        <div className="hub-batch-charge">
          <CheckoutDrawerSummaryGrid columns={3}>
            <CheckoutDrawerSummaryCell label="Itens" value={String(items.length)} />
            <CheckoutDrawerSummaryCell label="Selecionado" value={formatBrl(selectedTotal)} highlight />
            <CheckoutDrawerSummaryCell
              label="Vencidos / próximos"
              value={`${overdueCount} / ${soonCount}`}
            />
          </CheckoutDrawerSummaryGrid>

          <div className="hub-batch-charge__quick">
            <button type="button" className="hub-clientes__link-btn" onClick={selectAll}>
              Todos
            </button>
            <button type="button" className="hub-clientes__link-btn" onClick={selectOverdue}>
              Só vencidos
            </button>
            <button type="button" className="hub-clientes__link-btn" onClick={clearSelection}>
              Limpar
            </button>
          </div>

          <CheckoutDrawerSection title="Cobranças" hint="Marque o que entra neste pagamento.">
            <ul className="hub-batch-charge__list">
              {items.map((it) => {
                const checked = selectedIds.has(it.id);
                const toneClass =
                  it.tone === 'overdue' || it.tone === 'soon' || it.tone === 'ok'
                    ? `hub-due-tone hub-due-tone--${it.tone}`
                    : 'hub-dayboard__badge hub-dayboard__badge--none';
                return (
                  <li key={it.id} className={`hub-batch-charge__row${checked ? ' hub-batch-charge__row--on' : ''}`}>
                    <HubCheckbox
                      checked={checked}
                      onChange={() => toggleId(it.id)}
                      ariaLabel={`Selecionar ${it.title}`}
                    />
                    <button type="button" className="hub-batch-charge__row-main" onClick={() => toggleId(it.id)}>
                      <span className="hub-batch-charge__row-title">{it.title}</span>
                      <span className="hub-batch-charge__row-meta">
                        <span className="hub-clientes__fin-row-origin">
                          {it.kind === 'comanda' ? 'Comanda aberta' : 'Recebível'}
                        </span>
                        <span aria-hidden> · </span>
                        <span>{it.petLabel}</span>
                        {it.dueDate ? (
                          <>
                            <span aria-hidden> · </span>
                            <span className={toneClass}>{formatDueDateShort(it.dueDate)}</span>
                          </>
                        ) : null}
                      </span>
                    </button>
                    <span className="hub-batch-charge__row-amount">{formatBrl(it.amount)}</span>
                  </li>
                );
              })}
            </ul>
          </CheckoutDrawerSection>

          <CheckoutDrawerBillingShell>
            <CheckoutDrawerActionTabs
              action={action}
              onActionChange={(a) => {
                if (a === 'receive_now' || a === 'leave_pending' || a === 'send_charge') setAction(a);
              }}
              tabs={actionTabs}
            />

            {action === 'receive_now' ? (
              <div className="hub-clientes__field" style={{ marginTop: 12 }}>
                <label className="hub-clientes__label" htmlFor="batch-pay-method">
                  Forma de pagamento
                </label>
                <HubSearchableCombobox
                  id="batch-pay-method"
                  className="hub-combobox--clientes"
                  options={paymentMethodOptions}
                  value={paymentMethod}
                  onChange={(v) => {
                    if (v) setPaymentMethod(v as HubPaymentMethod);
                  }}
                  placeholder="Selecionar forma de pagamento"
                  searchPlaceholder="Buscar…"
                  clearable={false}
                  ariaLabel="Forma de pagamento"
                />
                {paymentMethod === 'cash' && (
                  <p className="hub-clientes__muted">
                    {cashSessionId
                      ? `Caixa aberto (sessão ${cashSessionId.slice(0, 8)}…)`
                      : 'Não há caixa aberto — abra no módulo Caixa.'}
                  </p>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 12 }}>
                <HubDateField id="batch-due-date" label="Vencimento" valueIso={dueDate} onChangeIso={setDueDate} />
                {action === 'send_charge' ? (
                  <p className="hub-clientes__muted" style={{ marginTop: 8 }}>
                    Gera um PDF e link únicos com todas as cobranças selecionadas. Comandas abertas viram recebíveis antes de entrar no lote.
                  </p>
                ) : selectedReceivables.length > 0 ? (
                  <p className="hub-clientes__muted" style={{ marginTop: 8 }}>
                    Remova os recebíveis da seleção para enviar só comandas abertas ao financeiro.
                  </p>
                ) : null}
              </div>
            )}
          </CheckoutDrawerBillingShell>

          {submitting ? <HubLoading variant="inline" label="Processando lote…" size="sm" /> : null}
        </div>
      )}
    </HubSidePanel>
  );
};

export default BatchChargeDrawer;
