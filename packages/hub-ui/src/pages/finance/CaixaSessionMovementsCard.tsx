import React, { useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  CreditCard,
  Link2,
  QrCode,
  Repeat,
  User,
  Wallet,
} from 'lucide-react';
import type { HubPaymentMethod } from '../../api/hubFinancialApi';
import { HubLoading } from '../../components/HubLoading';
import {
  CARD_FEE_PARTIAL_COVERAGE_HINT,
  cardFeeTotalCentsPositive,
} from '../../utils/hubCardMachineFees';
import { HUB_PAYMENT_METHOD_LABELS } from '../../utils/hubPaymentMethods';

const INITIAL_VISIBLE = 4;

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function formatSignedBrl(n: number): string {
  if (n < -0.009) {
    return `- ${formatBrl(Math.abs(n))}`;
  }
  return formatBrl(n);
}

type IconTone = 'green' | 'blue' | 'purple' | 'teal' | 'orange' | 'amber' | 'red';

const PAYMENT_METHOD_ICONS: Record<
  HubPaymentMethod,
  { icon: React.ReactNode; tone: IconTone }
> = {
  cash: { icon: <Wallet size={14} strokeWidth={2} />, tone: 'green' },
  pix: { icon: <QrCode size={14} strokeWidth={2} />, tone: 'green' },
  credit_card: { icon: <CreditCard size={14} strokeWidth={2} />, tone: 'blue' },
  debit_card: { icon: <CreditCard size={14} strokeWidth={2} />, tone: 'purple' },
  transfer: { icon: <Repeat size={14} strokeWidth={2} />, tone: 'teal' },
  payment_link: { icon: <Link2 size={14} strokeWidth={2} />, tone: 'orange' },
  customer_credit: { icon: <User size={14} strokeWidth={2} />, tone: 'amber' },
};

type MovementRowProps = {
  label: string;
  amount: number;
  icon: React.ReactNode;
  tone: IconTone;
  signed?: boolean;
};

function MovementRow({ label, amount, icon, tone, signed = false }: MovementRowProps) {
  return (
    <li className="hub-caixa-page__movements-row">
      <span className={`hub-caixa-page__movements-icon hub-caixa-page__movements-icon--${tone}`}>
        {icon}
      </span>
      <span className="hub-caixa-page__movements-label">{label}</span>
      <strong className="hub-caixa-page__movements-value">
        {signed ? formatSignedBrl(amount) : formatBrl(amount)}
      </strong>
    </li>
  );
}

type MovementsSectionProps = {
  title: string;
  total: number;
  variant: 'in' | 'out';
  children: React.ReactNode;
};

function MovementsSection({ title, total, variant, children }: MovementsSectionProps) {
  return (
    <section className="hub-caixa-page__movements-section">
      <div className={`hub-caixa-page__movements-section-header hub-caixa-page__movements-section-header--${variant}`}>
        <span>{title}</span>
        <strong>{variant === 'out' ? formatSignedBrl(total) : formatBrl(total)}</strong>
      </div>
      <ul className="hub-caixa-page__movements-list">{children}</ul>
    </section>
  );
}

type MovementLine =
  | {
      key: string;
      kind: 'method';
      method: HubPaymentMethod;
      amount: number;
    }
  | {
      key: string;
      kind: 'fee' | 'card_net' | 'withdrawal' | 'deposit';
      amount: number;
    };

export type CaixaSessionMovementsCardProps = {
  cashOpen: boolean;
  loadingMethods: boolean;
  methodsEntries: ReadonlyArray<readonly [HubPaymentMethod, number]>;
  methodsTotal: number;
  depositsTotal: number;
  withdrawalsTotal: number;
  dayPendingTotal: number;
  cardFeeTotal?: number;
  cardNetTotal?: number;
  cardWithoutFeeGrossTotal?: number;
};

function isNonZeroAmount(n: number): boolean {
  return Math.abs(Number(n)) > 0.009;
}

export const CaixaSessionMovementsCard: React.FC<CaixaSessionMovementsCardProps> = ({
  cashOpen,
  loadingMethods,
  methodsEntries,
  methodsTotal,
  depositsTotal,
  withdrawalsTotal,
  dayPendingTotal,
  cardFeeTotal = 0,
  cardNetTotal = 0,
  cardWithoutFeeGrossTotal = 0,
}) => {
  const [expanded, setExpanded] = useState(false);
  const outflowsNet = round2(depositsTotal - withdrawalsTotal);
  const showCardFees = cardFeeTotalCentsPositive(cardFeeTotal);

  const lines = useMemo((): MovementLine[] => {
    const next: MovementLine[] = [];
    for (const [method, total] of methodsEntries) {
      if (!isNonZeroAmount(total)) continue;
      next.push({ key: `method-${method}`, kind: 'method', method, amount: Number(total) });
    }
    if (showCardFees) {
      next.push({ key: 'card-fee', kind: 'fee', amount: cardFeeTotal });
      next.push({ key: 'card-net', kind: 'card_net', amount: cardNetTotal });
    }
    if (isNonZeroAmount(withdrawalsTotal)) {
      next.push({ key: 'withdrawal', kind: 'withdrawal', amount: -withdrawalsTotal });
    }
    if (isNonZeroAmount(depositsTotal)) {
      next.push({ key: 'deposit', kind: 'deposit', amount: depositsTotal });
    }
    return next;
  }, [
    methodsEntries,
    showCardFees,
    cardFeeTotal,
    cardNetTotal,
    withdrawalsTotal,
    depositsTotal,
  ]);

  const hasMore = lines.length > INITIAL_VISIBLE;
  const visibleLines = expanded ? lines : lines.slice(0, INITIAL_VISIBLE);

  const methodLines = visibleLines.filter(
    (line): line is Extract<MovementLine, { kind: 'method' }> => line.kind === 'method',
  );
  const feeVisible = visibleLines.some((line) => line.kind === 'fee');
  const cardNetVisible = visibleLines.some((line) => line.kind === 'card_net');
  const withdrawalVisible = visibleLines.some((line) => line.kind === 'withdrawal');
  const depositVisible = visibleLines.some((line) => line.kind === 'deposit');
  const showEntradas = methodLines.length > 0;
  const showOutflows = withdrawalVisible || depositVisible;

  return (
    <div className="hub-caixa-page__card hub-caixa-page__card--ops">
      <h3 className="hub-caixa-page__card-title">Movimentações da sessão</h3>
      {!cashOpen ? (
        <p className="hub-caixa-page__empty">Inicie o turno para ver as movimentações da sessão.</p>
      ) : loadingMethods ? (
        <HubLoading variant="block" label="Carregando formas de pagamento…" />
      ) : (
        <div className="hub-caixa-page__card-body">
          {showEntradas ? (
            <MovementsSection title="Entradas" total={methodsTotal} variant="in">
              {methodLines.map((line) => {
                const meta = PAYMENT_METHOD_ICONS[line.method];
                return (
                  <MovementRow
                    key={line.key}
                    label={HUB_PAYMENT_METHOD_LABELS[line.method]}
                    amount={line.amount}
                    icon={meta.icon}
                    tone={meta.tone}
                  />
                );
              })}
            </MovementsSection>
          ) : null}

          {feeVisible || cardNetVisible ? (
            <div className="hub-caixa-page__card-fees" aria-label="Taxas da maquininha">
              {feeVisible ? (
                <div className="hub-caixa-page__movements-footer-row">
                  <span className="hub-caixa-page__movements-footer-icon hub-caixa-page__movements-icon hub-caixa-page__movements-icon--blue">
                    <CreditCard size={14} strokeWidth={2} />
                  </span>
                  <span className="hub-caixa-page__movements-label">Taxa da maquininha</span>
                  <strong className="hub-caixa-page__movements-value">{formatBrl(cardFeeTotal)}</strong>
                </div>
              ) : null}
              {cardNetVisible ? (
                <div className="hub-caixa-page__movements-footer-row">
                  <span className="hub-caixa-page__movements-footer-icon hub-caixa-page__movements-icon hub-caixa-page__movements-icon--teal">
                    <CreditCard size={14} strokeWidth={2} />
                  </span>
                  <span className="hub-caixa-page__movements-label">Líquido estimado do cartão</span>
                  <strong className="hub-caixa-page__movements-value">{formatBrl(cardNetTotal)}</strong>
                </div>
              ) : null}
              {feeVisible && cardWithoutFeeGrossTotal > 0.009 ? (
                <p className="hub-caixa-page__card-fees-hint">{CARD_FEE_PARTIAL_COVERAGE_HINT}</p>
              ) : null}
            </div>
          ) : null}

          {showOutflows ? (
            <MovementsSection title="Saídas" total={outflowsNet} variant="out">
              {withdrawalVisible ? (
                <MovementRow
                  label="Sangria"
                  amount={-withdrawalsTotal}
                  icon={<ArrowDownToLine size={14} strokeWidth={2} />}
                  tone="red"
                  signed
                />
              ) : null}
              {depositVisible ? (
                <MovementRow
                  label="Suprimento"
                  amount={depositsTotal}
                  icon={<ArrowUpFromLine size={14} strokeWidth={2} />}
                  tone="purple"
                />
              ) : null}
            </MovementsSection>
          ) : null}

          <div className="hub-caixa-page__movements-footer">
            <div className="hub-caixa-page__movements-footer-row">
              <span className="hub-caixa-page__movements-footer-icon hub-caixa-page__movements-icon hub-caixa-page__movements-icon--amber">
                <Banknote size={14} strokeWidth={2} />
              </span>
              <span className="hub-caixa-page__movements-label">A receber no dia</span>
              <strong className="hub-caixa-page__movements-value hub-caixa-page__movements-value--muted">
                {formatBrl(dayPendingTotal)}
              </strong>
            </div>
          </div>

          {hasMore ? (
            <button
              type="button"
              className="hub-caixa-timeline__more"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Ver menos movimentações' : 'Ver mais movimentações →'}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
};

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
