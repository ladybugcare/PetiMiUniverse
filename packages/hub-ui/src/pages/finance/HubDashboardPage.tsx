import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import { AlertCircle, LayoutDashboard, Receipt, TrendingDown, TrendingUp } from 'lucide-react';
import { hubFinancialApi, type HubFinanceDashboardSummary } from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import './hub-finance-page.css';

const SELECTED_UNIT_KEY = 'selected_unit_id';

function getSelectedUnitId(): string | null {
  try {
    return localStorage.getItem(SELECTED_UNIT_KEY);
  } catch {
    return null;
  }
}

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

const HubDashboardPage: React.FC = () => {
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError } = useAlert();
  const clinicId = getStoredClinicId();
  const unitId = getSelectedUnitId();
  const [days] = useState(30);
  const [summary, setSummary] = useState<HubFinanceDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!clinicId || !unitId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const s = await hubFinancialApi.getDashboardSummary(clinicId, unitId, { days });
      setSummary(s);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar resumo');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId, days, showError]);

  useEffect(() => {
    if (permLoading || !hasPermission('hub.financial.read')) return;
    if (!clinicId || !unitId) return;
    void load();
  }, [permLoading, hasPermission, clinicId, unitId, days, load]);

  const shell = (children: React.ReactNode) => (
    <div className="hub-clientes hub-servicos-page hub-finance-page hub-finance-page--dashboard">
      <div className="hub-clientes__main">{children}</div>
    </div>
  );

  if (!permLoading && !hasPermission('hub.financial.read')) {
    return shell(
      <>
        <div className="hub-clientes__title-block">
          <h1 className="hub-clientes__title">Dashboard</h1>
          <p className="hub-clientes__subtitle">Resumo financeiro da unidade</p>
        </div>
        <p className="hub-clientes__muted">
          O resumo financeiro requer a permissão de leitura financeira. Use as áreas de operação (Agenda, Clientes,
          etc.) ou peça acesso à gestão.
        </p>
      </>,
    );
  }

  if (!clinicId || !unitId) {
    return shell(<p className="hub-clientes__muted">Selecione uma unidade no cabeçalho para ver o dashboard.</p>);
  }

  const net = summary?.net_operational_period ?? 0;

  return shell(
    <>
      <div className="hub-clientes__title-block">
        <h1 className="hub-clientes__title">Dashboard</h1>
        <p className="hub-clientes__subtitle">
          Resumo financeiro da unidade ({days} dias). Período:{' '}
          {summary ? `${summary.period.from} — ${summary.period.to}` : '—'}
        </p>
      </div>

      <div className="hub-servicos__metrics" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Sem cobrança (pendentes)</div>
            <div className="hub-servicos__metric-value">{loading ? '—' : String(summary?.pending_billing_count ?? 0)}</div>
            <Link className="hub-finance-page__dash-link" to="/hub/caixa">
              Abrir Caixa
            </Link>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <AlertCircle size={22} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Recebíveis em aberto</div>
            <div className="hub-servicos__metric-value">{loading ? '—' : String(summary?.receivables_open_count ?? 0)}</div>
            <div className="hub-servicos__metric-sub">
              {loading ? '—' : `${formatBrl(summary?.receivables_outstanding ?? 0)} a receber`}
            </div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Receipt size={22} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Pagamentos (período)</div>
            <div className="hub-servicos__metric-value">{loading ? '—' : formatBrl(summary?.payments_total_period ?? 0)}</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <TrendingUp size={22} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Despesas (período)</div>
            <div className="hub-servicos__metric-value">{loading ? '—' : formatBrl(summary?.expenses_total_period ?? 0)}</div>
          </div>
          <div className="hub-servicos__metric-icon hub-servicos__metric-icon--muted" aria-hidden>
            <TrendingDown size={22} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-servicos__metric-card hub-finance-page__metric-span">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Saldo operacional (pagamentos − despesas)</div>
            <div className="hub-servicos__metric-value" style={{ color: net >= 0 ? '#15803d' : '#b91c1c' }}>
              {loading ? '—' : formatBrl(summary?.net_operational_period ?? 0)}
            </div>
            <Link className="hub-finance-page__dash-link" to="/hub/financeiro">
              Detalhe em Financeiro
            </Link>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <LayoutDashboard size={22} strokeWidth={1.75} />
          </div>
        </div>
      </div>
    </>,
  );
};

export default HubDashboardPage;
