import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  CreditCard,
  Landmark,
  Link2,
  Percent,
  Plus,
  QrCode,
  Trash2,
  Wallet,
  WalletCards,
} from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { hubFinancialApi, type HubPaymentMethod } from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubCheckbox } from '../../components/HubCheckbox';
import {
  emptyCardMachineFees,
  formatInstallmentRange,
  normalizeCardMachineFees,
  previewCardFee,
  type CardMachineFeeTier,
  type CardMachineFees,
} from '../../utils/hubCardMachineFees';
import {
  ALL_HUB_PAYMENT_METHODS,
  HUB_PAYMENT_METHOD_LABELS,
} from '../../utils/hubPaymentMethods';
import '../clientes/clientes.css';
import './hub-payment-methods.css';

const EXAMPLE_SALE = 100;

const METHOD_META: Record<
  HubPaymentMethod,
  { icon: React.ReactNode; hint: string }
> = {
  pix: {
    icon: <QrCode size={18} strokeWidth={1.75} />,
    hint: 'Pagamento instantâneo via QR Code ou chave',
  },
  cash: {
    icon: <Banknote size={18} strokeWidth={1.75} />,
    hint: 'Recebimento em espécie no caixa',
  },
  credit_card: {
    icon: <CreditCard size={18} strokeWidth={1.75} />,
    hint: 'Máquina ou digitação — crédito',
  },
  debit_card: {
    icon: <WalletCards size={18} strokeWidth={1.75} />,
    hint: 'Máquina ou digitação — débito',
  },
  transfer: {
    icon: <Landmark size={18} strokeWidth={1.75} />,
    hint: 'TED, DOC ou transferência bancária',
  },
  payment_link: {
    icon: <Link2 size={18} strokeWidth={1.75} />,
    hint: 'Baixa manual de pagamento feito por link externo (sem gateway no Hub)',
  },
  customer_credit: {
    icon: <Wallet size={18} strokeWidth={1.75} />,
    hint: 'Saldo ou crédito já existente do tutor',
  },
};

const CREDIT_PRESETS: Array<{ label: string; tiers: CardMachineFeeTier[] }> = [
  {
    label: 'Simples (1x / 2–6x / 7–12x)',
    tiers: [
      { min_installments: 1, max_installments: 1, rate_percent: 2.5 },
      { min_installments: 2, max_installments: 6, rate_percent: 3.5 },
      { min_installments: 7, max_installments: 12, rate_percent: 4.2 },
    ],
  },
];

function tiersEqual(a: CardMachineFeeTier[], b: CardMachineFeeTier[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (t, i) =>
      t.min_installments === b[i].min_installments &&
      t.max_installments === b[i].max_installments &&
      t.rate_percent === b[i].rate_percent,
  );
}

function feesEqual(a: CardMachineFees, b: CardMachineFees): boolean {
  return tiersEqual(a.debit_card, b.debit_card) && tiersEqual(a.credit_card, b.credit_card);
}

function parseRateInput(raw: string): number | null {
  const n = Number(String(raw).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 10000) / 10000;
}

function formatBrl(n: number): string {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatRate(n: number): string {
  return String(n).replace('.', ',');
}

type FeeRowDraft = {
  id: string;
  minStr: string;
  maxStr: string;
  rateStr: string;
};

function newRowId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `fee-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function tiersToDrafts(tiers: CardMachineFeeTier[]): FeeRowDraft[] {
  return tiers.map((t) => ({
    id: newRowId(),
    minStr: String(t.min_installments),
    maxStr: String(t.max_installments),
    rateStr: formatRate(t.rate_percent),
  }));
}

function draftsToTiers(
  drafts: FeeRowDraft[],
): { ok: true; tiers: CardMachineFeeTier[] } | { ok: false; error: string } {
  const tiers: CardMachineFeeTier[] = [];
  for (const d of drafts) {
    const min = Math.floor(Number(d.minStr));
    const max = Math.floor(Number(d.maxStr));
    const rate = parseRateInput(d.rateStr);
    if (!(min >= 1 && max >= min && max <= 99)) {
      return { ok: false, error: 'Parcelas inválidas: use de 1 a 99, com máximo ≥ mínimo.' };
    }
    if (rate == null) {
      return { ok: false, error: 'Informe uma taxa entre 0 e 100%.' };
    }
    tiers.push({ min_installments: min, max_installments: max, rate_percent: rate });
  }
  const sorted = [...tiers].sort(
    (a, b) => a.min_installments - b.min_installments || a.max_installments - b.max_installments,
  );
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].min_installments <= sorted[i - 1].max_installments) {
      return {
        ok: false,
        error: `Faixas sobrepostas: ${formatInstallmentRange(sorted[i - 1])} e ${formatInstallmentRange(sorted[i])}.`,
      };
    }
  }
  return { ok: true, tiers: sorted };
}

const HubPaymentMethodsPage: React.FC = () => {
  const { hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const { showSuccess, showError } = useAlert();

  const canRead = hasPermission('hub.financial.read');
  const canWrite = hasPermission('hub.financial.write');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState<Set<HubPaymentMethod>>(new Set(ALL_HUB_PAYMENT_METHODS));
  const [savedMethods, setSavedMethods] = useState<Set<HubPaymentMethod>>(
    new Set(ALL_HUB_PAYMENT_METHODS),
  );
  const [debitRateStr, setDebitRateStr] = useState('');
  const [creditRows, setCreditRows] = useState<FeeRowDraft[]>([]);
  const [savedFees, setSavedFees] = useState<CardMachineFees>(emptyCardMachineFees());

  const applyFeesToForm = useCallback((fees: CardMachineFees) => {
    const debit = fees.debit_card[0];
    setDebitRateStr(debit ? formatRate(debit.rate_percent) : '');
    setCreditRows(tiersToDrafts(fees.credit_card));
    setSavedFees(fees);
  }, []);

  const load = useCallback(
    async (signal?: { cancelled: boolean }) => {
      if (!clinicId || !canRead) return;
      setLoading(true);
      try {
        const res = await hubFinancialApi.getPaymentMethodSettings(clinicId);
        if (signal?.cancelled) return;
        const methods = res.accepted_payment_methods?.length
          ? res.accepted_payment_methods
          : [...ALL_HUB_PAYMENT_METHODS];
        const set = new Set(methods);
        setEnabled(set);
        setSavedMethods(set);
        applyFeesToForm(normalizeCardMachineFees(res.card_machine_fees));
      } catch (e: unknown) {
        if (signal?.cancelled) return;
        showError((e as Error)?.message || 'Erro ao carregar formas de pagamento');
      } finally {
        if (!signal?.cancelled) setLoading(false);
      }
    },
    [clinicId, canRead, showError, applyFeesToForm],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const toggleMethod = (method: HubPaymentMethod) => {
    if (!canWrite || saving) return;
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(method)) {
        if (next.size <= 1) return prev;
        next.delete(method);
      } else {
        next.add(method);
      }
      return next;
    });
  };

  const buildFeesPayload = ():
    | { ok: true; fees: CardMachineFees }
    | { ok: false; error: string } => {
    let debit_card: CardMachineFeeTier[] = [];
    if (debitRateStr.trim()) {
      const rate = parseRateInput(debitRateStr);
      if (rate == null) return { ok: false, error: 'Taxa de débito inválida (0 a 100%).' };
      debit_card = [{ min_installments: 1, max_installments: 1, rate_percent: rate }];
    }
    const credit = draftsToTiers(creditRows);
    if (!credit.ok) return credit;
    return { ok: true, fees: { debit_card, credit_card: credit.tiers } };
  };

  const methodsDirty = ALL_HUB_PAYMENT_METHODS.some(
    (m) => enabled.has(m) !== savedMethods.has(m),
  );
  const feesDraft = buildFeesPayload();
  const feesDirty = !feesDraft.ok || !feesEqual(feesDraft.fees, savedFees);
  const hasChanges = methodsDirty || feesDirty;

  const liveFees = useMemo((): CardMachineFees => {
    let debit_card: CardMachineFeeTier[] = [];
    if (debitRateStr.trim()) {
      const rate = parseRateInput(debitRateStr);
      if (rate == null) return savedFees;
      debit_card = [{ min_installments: 1, max_installments: 1, rate_percent: rate }];
    }
    const credit = draftsToTiers(creditRows);
    if (!credit.ok) return savedFees;
    return { debit_card, credit_card: credit.tiers };
  }, [debitRateStr, creditRows, savedFees]);

  const debitPreview = useMemo(
    () => previewCardFee(liveFees, 'debit_card', EXAMPLE_SALE, 1),
    [liveFees],
  );

  const creditPreviews = useMemo(
    () =>
      [1, 3, 6, 12]
        .map((n) => {
          const p = previewCardFee(liveFees, 'credit_card', EXAMPLE_SALE, n);
          return p ? { installments: n, ...p } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x != null),
    [liveFees],
  );

  const handleSave = async () => {
    if (!clinicId || !canWrite) return;
    if (enabled.size === 0) {
      showError('Selecione pelo menos uma forma de pagamento.');
      return;
    }
    const fees = buildFeesPayload();
    if (!fees.ok) {
      showError(fees.error);
      return;
    }
    setSaving(true);
    try {
      const methods = ALL_HUB_PAYMENT_METHODS.filter((m) => enabled.has(m));
      const res = await hubFinancialApi.patchPaymentMethodSettings(clinicId, {
        accepted_payment_methods: methods,
        card_machine_fees: fees.fees,
      });
      const set = new Set(res.accepted_payment_methods);
      setEnabled(set);
      setSavedMethods(set);
      applyFeesToForm(normalizeCardMachineFees(res.card_machine_fees));
      showSuccess('Formas de pagamento e taxas salvas com sucesso.');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar formas de pagamento');
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setEnabled(new Set(savedMethods));
    applyFeesToForm(savedFees);
  };

  const updateCreditRow = (id: string, patch: Partial<FeeRowDraft>) => {
    setCreditRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const addCreditRow = () => {
    const lastMax = creditRows.reduce((m, r) => Math.max(m, Math.floor(Number(r.maxStr)) || 0), 0);
    const nextMin = Math.min(99, Math.max(1, lastMax + 1));
    setCreditRows((rows) => [
      ...rows,
      {
        id: newRowId(),
        minStr: String(nextMin),
        maxStr: String(Math.min(99, nextMin)),
        rateStr: '',
      },
    ]);
  };

  const applyCreditPreset = (tiers: CardMachineFeeTier[]) => {
    if (!canWrite || saving) return;
    setCreditRows(tiersToDrafts(tiers));
  };

  if (!canRead) {
    return (
      <div className="hub-pm__state">
        <p className="hub-clientes__muted">Sem permissão para visualizar configurações financeiras.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="hub-pm__state">
        <p className="hub-clientes__muted">Carregando formas de pagamento…</p>
      </div>
    );
  }

  const enabledCount = enabled.size;
  const hasAnyFee =
    Boolean(debitRateStr.trim()) || creditRows.length > 0 || savedFees.debit_card.length > 0;

  return (
    <div className="hub-pm">
      <header className="hub-pm__intro">
        <h2 className="hub-pm__intro-title">Formas de pagamento</h2>
        <p className="hub-pm__intro-text">
          Define quais opções aparecem no checkout e no registro de pagamentos. Pagamentos já
          registrados continuam visíveis no histórico, mesmo que a forma seja desabilitada depois.
        </p>
      </header>

      <div className={`hub-pm__card${methodsDirty ? ' hub-pm__card--dirty' : ''}`}>
        <div className="hub-pm__card-header">
          <div className="hub-pm__card-icon" aria-hidden>
            <WalletCards size={18} strokeWidth={1.75} />
          </div>
          <div className="hub-pm__card-heading">
            <div className="hub-pm__card-title-row">
              <h3 className="hub-pm__card-title">Formas aceitas</h3>
              {methodsDirty && <span className="hub-pm__badge hub-pm__badge--dirty">Não salvo</span>}
            </div>
            <p className="hub-pm__card-sub">
              {enabledCount} de {ALL_HUB_PAYMENT_METHODS.length}{' '}
              {enabledCount === 1 ? 'habilitada' : 'habilitadas'}
            </p>
          </div>
        </div>

        <ul className="hub-pm__list">
          {ALL_HUB_PAYMENT_METHODS.map((method) => {
            const isOn = enabled.has(method);
            const isLastEnabled = isOn && enabled.size <= 1;
            const meta = METHOD_META[method];
            return (
              <li
                key={method}
                className={`hub-pm__item${isOn ? ' hub-pm__item--on' : ' hub-pm__item--off'}${
                  !canWrite || saving || isLastEnabled ? ' hub-pm__item--locked' : ''
                }`}
                onClick={() => {
                  if (!canWrite || saving || isLastEnabled) return;
                  toggleMethod(method);
                }}
              >
                <span className="hub-pm__item-icon" aria-hidden>
                  {meta.icon}
                </span>
                <div className="hub-pm__item-body">
                  <span className="hub-pm__item-name">{HUB_PAYMENT_METHOD_LABELS[method]}</span>
                  <span className="hub-pm__item-hint">
                    {isLastEnabled
                      ? 'Pelo menos uma forma deve permanecer habilitada'
                      : meta.hint}
                  </span>
                </div>
                <div className="hub-pm__item-toggle" onClick={(e) => e.stopPropagation()}>
                  <HubCheckbox
                    checked={isOn}
                    disabled={!canWrite || saving || isLastEnabled}
                    onChange={() => toggleMethod(method)}
                    ariaLabel={HUB_PAYMENT_METHOD_LABELS[method]}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={`hub-pm__card hub-pm__card--fees${feesDirty ? ' hub-pm__card--dirty' : ''}`}>
        <div className="hub-pm__card-header">
          <div className="hub-pm__card-icon" aria-hidden>
            <Percent size={18} strokeWidth={1.75} />
          </div>
          <div className="hub-pm__card-heading">
            <div className="hub-pm__card-title-row">
              <h3 className="hub-pm__card-title">Taxas da maquininha</h3>
              {feesDirty ? (
                <span className="hub-pm__badge hub-pm__badge--dirty">Não salvo</span>
              ) : hasAnyFee ? (
                <span className="hub-pm__badge hub-pm__badge--ok">Ativo no checkout</span>
              ) : (
                <span className="hub-pm__badge">Opcional</span>
              )}
            </div>
            <p className="hub-pm__card-sub">
              Informe as taxas do contrato da máquina. O tutor paga o valor cheio; no checkout
              aparece quanto a clínica perde e o valor líquido.
            </p>
          </div>
        </div>

        <div className="hub-pm__fees-body">
          <div className="hub-pm__fees-grid">
            <section className="hub-pm__fees-panel">
              <div className="hub-pm__fees-panel-head">
                <span className="hub-pm__fees-panel-icon" aria-hidden>
                  <WalletCards size={16} strokeWidth={1.75} />
                </span>
                <div>
                  <h4 className="hub-pm__fees-panel-title">Débito</h4>
                  <p className="hub-pm__fees-panel-sub">Uma taxa fixa (à vista)</p>
                </div>
              </div>

              <label className="hub-clientes__field">
                <span className="ui-label">Taxa</span>
                <div className="hub-pm__input-affix">
                  <input
                    className="hub-clientes__input"
                    inputMode="decimal"
                    placeholder="1,39"
                    value={debitRateStr}
                    disabled={!canWrite || saving}
                    onChange={(e) => setDebitRateStr(e.target.value)}
                    aria-label="Taxa de débito em porcentagem"
                  />
                  <span className="hub-pm__input-affix-unit" aria-hidden>
                    %
                  </span>
                </div>
              </label>

              {debitPreview ? (
                <div className="hub-pm__fees-example" aria-live="polite">
                  <span className="hub-pm__fees-example-label">Ex.: venda {formatBrl(EXAMPLE_SALE)}</span>
                  <strong className="hub-pm__fees-example-value">
                    perde {formatBrl(debitPreview.fee_amount)} · líquido{' '}
                    {formatBrl(debitPreview.net_amount)}
                  </strong>
                </div>
              ) : (
                <p className="hub-pm__fees-hint">Vazio = não estima débito no checkout.</p>
              )}
            </section>

            <section className="hub-pm__fees-panel">
              <div className="hub-pm__fees-panel-head">
                <span className="hub-pm__fees-panel-icon" aria-hidden>
                  <CreditCard size={16} strokeWidth={1.75} />
                </span>
                <div>
                  <h4 className="hub-pm__fees-panel-title">Crédito</h4>
                  <p className="hub-pm__fees-panel-sub">Taxa por faixa de parcelas</p>
                </div>
              </div>

              {creditRows.length === 0 ? (
                <div className="hub-pm__fees-empty-box">
                  <p className="hub-pm__fees-empty">
                    Nenhuma faixa ainda. Ex.: 1x = 2,5% · 2x–6x = 3,5% · 7x–12x = 4,2%.
                  </p>
                  {canWrite && (
                    <div className="hub-pm__fees-empty-actions">
                      <button
                        type="button"
                        className="hub-clientes__btn hub-clientes__btn--primary"
                        disabled={saving}
                        onClick={addCreditRow}
                      >
                        <Plus size={16} /> Adicionar faixa
                      </button>
                      {CREDIT_PRESETS.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          className="hub-clientes__btn hub-clientes__btn--ghost"
                          disabled={saving}
                          onClick={() => applyCreditPreset(preset.tiers)}
                        >
                          Usar modelo
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="hub-pm__fees-table" role="table" aria-label="Faixas de crédito">
                    <div className="hub-pm__fees-table-head" role="row">
                      <span role="columnheader">De</span>
                      <span role="columnheader">Até</span>
                      <span role="columnheader">Taxa</span>
                      <span role="columnheader" className="hub-pm__fees-table-head-action">
                        {' '}
                      </span>
                    </div>
                    <ul className="hub-pm__fees-rows">
                      {creditRows.map((row) => {
                        const min = Math.floor(Number(row.minStr)) || 0;
                        const max = Math.floor(Number(row.maxStr)) || 0;
                        const rangeLabel =
                          min >= 1 && max >= min
                            ? formatInstallmentRange({
                                min_installments: min,
                                max_installments: max,
                                rate_percent: 0,
                              })
                            : null;
                        return (
                          <li key={row.id} className="hub-pm__fees-row" role="row">
                            <label className="hub-clientes__field" role="cell">
                              <span className="ui-label hub-pm__sr-only">Parcelas de</span>
                              <div className="hub-pm__input-affix">
                                <input
                                  className="hub-clientes__input"
                                  inputMode="numeric"
                                  value={row.minStr}
                                  disabled={!canWrite || saving}
                                  onChange={(e) =>
                                    updateCreditRow(row.id, { minStr: e.target.value })
                                  }
                                />
                                <span className="hub-pm__input-affix-unit" aria-hidden>
                                  x
                                </span>
                              </div>
                            </label>
                            <label className="hub-clientes__field" role="cell">
                              <span className="ui-label hub-pm__sr-only">Parcelas até</span>
                              <div className="hub-pm__input-affix">
                                <input
                                  className="hub-clientes__input"
                                  inputMode="numeric"
                                  value={row.maxStr}
                                  disabled={!canWrite || saving}
                                  onChange={(e) =>
                                    updateCreditRow(row.id, { maxStr: e.target.value })
                                  }
                                />
                                <span className="hub-pm__input-affix-unit" aria-hidden>
                                  x
                                </span>
                              </div>
                            </label>
                            <label className="hub-clientes__field" role="cell">
                              <span className="ui-label hub-pm__sr-only">
                                Taxa {rangeLabel ?? ''}
                              </span>
                              <div className="hub-pm__input-affix">
                                <input
                                  className="hub-clientes__input"
                                  inputMode="decimal"
                                  value={row.rateStr}
                                  disabled={!canWrite || saving}
                                  onChange={(e) =>
                                    updateCreditRow(row.id, { rateStr: e.target.value })
                                  }
                                  placeholder="2,50"
                                />
                                <span className="hub-pm__input-affix-unit" aria-hidden>
                                  %
                                </span>
                              </div>
                            </label>
                            {canWrite ? (
                              <button
                                type="button"
                                className="hub-btn hub-btn--ghost hub-btn--icon"
                                aria-label={`Remover faixa ${rangeLabel ?? ''}`.trim()}
                                disabled={saving}
                                onClick={() =>
                                  setCreditRows((rows) => rows.filter((r) => r.id !== row.id))
                                }
                              >
                                <Trash2 size={16} />
                              </button>
                            ) : (
                              <span className="hub-pm__fees-row-spacer" />
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  {canWrite && (
                    <div className="hub-pm__fees-credit-actions">
                      <button
                        type="button"
                        className="hub-btn hub-btn--ghost"
                        disabled={saving}
                        onClick={addCreditRow}
                      >
                        <Plus size={16} /> Adicionar faixa
                      </button>
                    </div>
                  )}
                </>
              )}

              {creditPreviews.length > 0 ? (
                <div className="hub-pm__fees-example hub-pm__fees-example--stack" aria-live="polite">
                  <span className="hub-pm__fees-example-label">
                    Ex.: venda {formatBrl(EXAMPLE_SALE)} no crédito
                  </span>
                  <ul className="hub-pm__fees-example-list">
                    {creditPreviews.map((p) => (
                      <li key={p.installments}>
                        <span>{p.installments}x</span>
                        <strong>
                          perde {formatBrl(p.fee_amount)} · líquido {formatBrl(p.net_amount)}
                        </strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          </div>

          {!feesDraft.ok && feesDirty ? (
            <p className="hub-pm__fees-error" role="alert">
              {feesDraft.error}
            </p>
          ) : null}
        </div>
      </div>

      {canWrite && (
        <div className={`hub-pm__footer hub-pm__footer--sticky${hasChanges ? ' hub-pm__footer--active' : ''}`}>
          <p className="hub-pm__hint">
            As taxas são estimativas do contrato da maquininha — não alteram o valor cobrado do tutor
            e ainda não entram em relatório consolidado (só no checkout e no histórico do pagamento).
          </p>
          <div className="hub-pm__actions">
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              disabled={saving || !hasChanges || !feesDraft.ok}
              onClick={() => void handleSave()}
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
            {hasChanges && (
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost"
                disabled={saving}
                onClick={discard}
              >
                Descartar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HubPaymentMethodsPage;
