import React from 'react';
import { Building2, PlusCircle, User, Users } from 'lucide-react';
import type { HubGuardianStats } from '../../api/hubGuardiansApi';

type ClientesMainTab = 'tutores' | 'empresas';

interface ClientesMetricsRowProps {
  mainTab: ClientesMainTab;
  stats: HubGuardianStats | null;
  loading: boolean;
}

export const ClientesMetricsRow: React.FC<ClientesMetricsRowProps> = ({ mainTab, stats, loading }) => {
  const isCompanyTab = mainTab === 'empresas';

  if (loading || !stats) {
    return (
      <div className="hub-clientes__metrics">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="hub-clientes__metric-card">
            <div className="hub-clientes-metric-card__top">
              <div className="hub-clientes__metric-label">…</div>
              <div className="hub-clientes-metric-card__icon hub-clientes-metric-card__icon--brand" />
            </div>
            <div className="hub-clientes__metric-value">—</div>
          </div>
        ))}
      </div>
    );
  }

  const totalLabel = isCompanyTab ? 'Total de empresas' : 'Total de tutores';
  const activeLabel = isCompanyTab ? 'Empresas ativas' : 'Tutores ativos';
  const withPetsLabel = isCompanyTab ? 'Com pets vinculados' : 'Com pets';
  const totalSub = isCompanyTab ? 'Empresas registadas na clínica' : 'Clientes registados na clínica';

  return (
    <div className="hub-clientes__metrics">
      <div className="hub-clientes__metric-card">
        <div className="hub-clientes-metric-card__top">
          <div>
            <div className="hub-clientes__metric-label">{totalLabel}</div>
            <div className="hub-clientes__metric-value">{stats.total.toLocaleString('pt-BR')}</div>
          </div>
          <div className="hub-clientes-metric-card__icon hub-clientes-metric-card__icon--brand" aria-hidden>
            {isCompanyTab ? <Building2 size={20} strokeWidth={1.75} /> : <User size={20} strokeWidth={1.75} />}
          </div>
        </div>
        {stats.new_this_month > 0 ? (
          <div className="hub-clientes-metric-trend">+{stats.new_this_month.toLocaleString('pt-BR')} este mês</div>
        ) : (
          <div className="hub-clientes__metric-sub">{totalSub}</div>
        )}
      </div>
      <div className="hub-clientes__metric-card">
        <div className="hub-clientes-metric-card__top">
          <div>
            <div className="hub-clientes__metric-label">{activeLabel}</div>
            <div className="hub-clientes__metric-value">{stats.active_operational.toLocaleString('pt-BR')}</div>
          </div>
          <div className="hub-clientes-metric-card__icon hub-clientes-metric-card__icon--green" aria-hidden>
            <Users size={20} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-clientes__metric-sub">{stats.pct_active}% do total (status ativo)</div>
      </div>
      <div className="hub-clientes__metric-card">
        <div className="hub-clientes-metric-card__top">
          <div>
            <div className="hub-clientes__metric-label">Novos este mês</div>
            <div className="hub-clientes__metric-value">{stats.new_this_month.toLocaleString('pt-BR')}</div>
          </div>
          <div className="hub-clientes-metric-card__icon hub-clientes-metric-card__icon--brand" aria-hidden>
            <PlusCircle size={20} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-clientes__metric-sub">Criados desde o dia 1 (UTC)</div>
      </div>
      <div className="hub-clientes__metric-card">
        <div className="hub-clientes-metric-card__top">
          <div>
            <div className="hub-clientes__metric-label">{withPetsLabel}</div>
            <div className="hub-clientes__metric-value">{stats.with_pets.toLocaleString('pt-BR')}</div>
          </div>
          <div className="hub-clientes-metric-card__icon hub-clientes-metric-card__icon--green" aria-hidden>
            <Users size={20} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-clientes__metric-sub">{stats.pct_with_pets}% com pelo menos um pet</div>
      </div>
    </div>
  );
};
