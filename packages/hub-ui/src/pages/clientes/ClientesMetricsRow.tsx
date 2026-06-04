import React from 'react';
import type { HubGuardianStats } from '../../api/hubGuardiansApi';

interface ClientesMetricsRowProps {
  stats: HubGuardianStats | null;
  loading: boolean;
}

export const ClientesMetricsRow: React.FC<ClientesMetricsRowProps> = ({ stats, loading }) => {
  if (loading || !stats) {
    return (
      <div className="hub-clientes__metrics">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="hub-clientes__metric-card">
            <div className="hub-clientes__metric-label">…</div>
            <div className="hub-clientes__metric-value">—</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="hub-clientes__metrics">
      <div className="hub-clientes__metric-card">
        <div className="hub-clientes__metric-label">Total de tutores</div>
        <div className="hub-clientes__metric-value">{stats.total.toLocaleString('pt-BR')}</div>
        <div className="hub-clientes__metric-sub">Clientes registados na clínica</div>
      </div>
      <div className="hub-clientes__metric-card">
        <div className="hub-clientes__metric-label">Tutores ativos</div>
        <div className="hub-clientes__metric-value">{stats.active_operational.toLocaleString('pt-BR')}</div>
        <div className="hub-clientes__metric-sub">{stats.pct_active}% do total (status ativo)</div>
      </div>
      <div className="hub-clientes__metric-card">
        <div className="hub-clientes__metric-label">Novos este mês</div>
        <div className="hub-clientes__metric-value">{stats.new_this_month.toLocaleString('pt-BR')}</div>
        <div className="hub-clientes__metric-sub">Criados desde o dia 1 (UTC)</div>
      </div>
      <div className="hub-clientes__metric-card">
        <div className="hub-clientes__metric-label">Com pets</div>
        <div className="hub-clientes__metric-value">{stats.with_pets.toLocaleString('pt-BR')}</div>
        <div className="hub-clientes__metric-sub">{stats.pct_with_pets}% com pelo menos um pet</div>
      </div>
    </div>
  );
};
