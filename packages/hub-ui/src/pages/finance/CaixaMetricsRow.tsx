import React from 'react';
import { AlertCircle, Banknote, ClipboardList, Receipt, TrendingUp } from 'lucide-react';

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

type MetricCardProps = {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  iconTone?: 'brand' | 'green';
};

function MetricCard({ label, value, sub, icon, iconTone = 'brand' }: MetricCardProps) {
  return (
    <div className="hub-clientes__metric-card">
      <div className="hub-pets-metric-card__top">
        <div>
          <div className="hub-clientes__metric-label">{label}</div>
          <div className="hub-clientes__metric-value">{value}</div>
        </div>
        <div
          className={`hub-pets-metric-card__icon hub-pets-metric-card__icon--${iconTone}`}
          aria-hidden
        >
          {icon}
        </div>
      </div>
      <div className="hub-clientes__metric-sub">{sub}</div>
    </div>
  );
}

export type CaixaMetricsRowProps = {
  loading: boolean;
  pending: number;
  cashOpen: boolean;
  cashOpenedAt: string | null | undefined;
  cashPaymentsTotal: number;
  expectedBalance: number;
  cancellationPendingCount: number;
  dayBoardCount: number;
};

export const CaixaMetricsRow: React.FC<CaixaMetricsRowProps> = ({
  loading,
  pending,
  cashOpen,
  cashOpenedAt,
  cashPaymentsTotal,
  expectedBalance,
  cancellationPendingCount,
  dayBoardCount,
}) => {
  const dash = '—';

  if (loading) {
    return (
      <div className="hub-clientes__metrics hub-caixa-page__metrics" aria-live="polite">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="hub-clientes__metric-card">
            <div className="hub-pets-metric-card__top">
              <div>
                <div className="hub-clientes__metric-label">…</div>
                <div className="hub-clientes__metric-value">{dash}</div>
              </div>
              <div className="hub-pets-metric-card__icon hub-pets-metric-card__icon--brand" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const cashStatusSub = cashOpen && cashOpenedAt
    ? `Aberto em ${new Date(cashOpenedAt).toLocaleString('pt-BR')}`
    : 'Sem sessão aberta';

  return (
    <div className="hub-clientes__metrics hub-caixa-page__metrics" aria-live="polite">
      <MetricCard
        label="Sem cobrança"
        value={String(pending)}
        sub="Pendentes de gerar cobrança"
        icon={<AlertCircle size={20} strokeWidth={1.75} />}
        iconTone="brand"
      />
      <MetricCard
        label="Status do caixa"
        value={cashOpen ? 'Aberto' : 'Fechado'}
        sub={cashStatusSub}
        icon={<Banknote size={20} strokeWidth={1.75} />}
        iconTone={cashOpen ? 'green' : 'brand'}
      />
      <MetricCard
        label="Dinheiro recebido"
        value={formatBrl(cashPaymentsTotal)}
        sub="Entradas em dinheiro na sessão"
        icon={<TrendingUp size={20} strokeWidth={1.75} />}
        iconTone="green"
      />
      <MetricCard
        label="Saldo esperado"
        value={formatBrl(expectedBalance)}
        sub="Inicial + dinheiro ± movimentos"
        icon={<ClipboardList size={20} strokeWidth={1.75} />}
        iconTone="brand"
      />
      <MetricCard
        label="Cancelamentos"
        value={String(cancellationPendingCount)}
        sub="Pagamento antecipado cancelado"
        icon={<AlertCircle size={20} strokeWidth={1.75} />}
        iconTone="brand"
      />
      <MetricCard
        label="Atendimentos hoje"
        value={String(dayBoardCount)}
        sub="Listados no painel do dia"
        icon={<Receipt size={20} strokeWidth={1.75} />}
        iconTone="green"
      />
    </div>
  );
};
