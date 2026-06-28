import React from 'react';
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
import { HUB_PAYMENT_METHOD_LABELS } from '../../utils/hubPaymentMethods';

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
};

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

export type CaixaSessionMovementsCardProps = {
  cashOpen: boolean;
  loadingMethods: boolean;
  methodsEntries: ReadonlyArray<readonly [HubPaymentMethod, number]>;
  methodsTotal: number;
  depositsTotal: number;
  withdrawalsTotal: number;
  dayPendingTotal: number;
};

export const CaixaSessionMovementsCard: React.FC<CaixaSessionMovementsCardProps> = ({
  cashOpen,
  loadingMethods,
  methodsEntries,
  methodsTotal,
  depositsTotal,
  withdrawalsTotal,
  dayPendingTotal,
}) => {
  const outflowsNet = round2(depositsTotal - withdrawalsTotal);

  return (
    <div className="hub-caixa-page__card hub-caixa-page__card--ops">
      <h3 className="hub-caixa-page__card-title">Movimentações da sessão</h3>
      {!cashOpen ? (
        <p className="hub-caixa-page__empty">Abra o caixa para ver as movimentações da sessão.</p>
      ) : loadingMethods ? (
        <p className="hub-caixa-page__empty">Carregando formas de pagamento…</p>
      ) : (
        <div className="hub-caixa-page__card-scroll">
          <MovementsSection title="Entradas" total={methodsTotal} variant="in">
            {methodsEntries.map(([method, total]) => {
              const meta = PAYMENT_METHOD_ICONS[method];
              return (
                <MovementRow
                  key={method}
                  label={HUB_PAYMENT_METHOD_LABELS[method]}
                  amount={Number(total)}
                  icon={meta.icon}
                  tone={meta.tone}
                />
              );
            })}
          </MovementsSection>

          <MovementsSection title="Saídas" total={outflowsNet} variant="out">
            <MovementRow
              label="Sangria"
              amount={-withdrawalsTotal}
              icon={<ArrowDownToLine size={14} strokeWidth={2} />}
              tone="red"
              signed
            />
            <MovementRow
              label="Suprimento"
              amount={depositsTotal}
              icon={<ArrowUpFromLine size={14} strokeWidth={2} />}
              tone="purple"
            />
          </MovementsSection>

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
        </div>
      )}
    </div>
  );
};

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
