import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HubFinanceCashFlowDay } from '../../api/hubFinancialApi';

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function formatDateShort(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}`;
}

function formatDateFull(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

type TodayCashFlowChartProps = {
  days: HubFinanceCashFlowDay[];
  loading?: boolean;
};

export const TodayCashFlowChart: React.FC<TodayCashFlowChartProps> = ({ days, loading }) => {
  const chartData = useMemo(
    () =>
      days.map((d) => ({
        date: formatDateShort(d.date),
        fullDate: formatDateFull(d.date),
        entradas: d.payments_in + d.deposits_in,
        saidas: d.expenses_out + d.withdrawals_out,
      })),
    [days],
  );

  const hasMovement = chartData.some((d) => d.entradas > 0 || d.saidas > 0);

  if (loading) {
    return (
      <div className="hub-today-dash__chart-empty hub-today-dash__chart-empty--loading">
        Carregando fluxo…
      </div>
    );
  }

  if (!hasMovement) {
    return (
      <div className="hub-today-dash__chart-empty">
        <p className="hub-today-dash__chart-empty-title">Sem movimentos nos últimos 7 dias</p>
        <p className="hub-today-dash__chart-empty-sub">
          Quando houver pagamentos ou saídas, o gráfico aparece aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="hub-today-dash__chart">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ede4df" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8a6f64' }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: '#8a6f64' }}
            width={48}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) =>
              Math.abs(v) >= 1000
                ? `${(v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k`
                : String(v)
            }
          />
          <Tooltip
            formatter={(v: number) => formatBrl(v)}
            labelFormatter={(_label, payload) =>
              (payload?.[0]?.payload as { fullDate?: string } | undefined)?.fullDate ?? String(_label)
            }
            contentStyle={{
              borderRadius: 10,
              border: '1px solid #e5dcd6',
              fontSize: 12,
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
            iconType="circle"
            iconSize={8}
          />
          <Bar dataKey="entradas" name="Entradas" fill="#2f9e44" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="saidas" name="Saídas" fill="#e85d4c" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
