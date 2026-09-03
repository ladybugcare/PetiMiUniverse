import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { hubFinancialApi, type HubFinanceReceivable } from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
import { guardianDrillHref, receivableDrillHref } from './hubRelatoriosLinks';
import { daysOverdue, formatBrl, formatDateBr } from './hubRelatoriosUtils';

const SOURCE_TYPE_LABELS: Record<string, string> = {
  quote: 'Orçamento',
  appointment: 'Agendamento',
  encounter: 'Atendimento',
  grooming_session: 'Banho e tosa',
  boarding_reservation: 'Hotel & Creche',
  manual: 'Manual',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  partially_paid: 'Parcial',
};

type PendingRow = HubFinanceReceivable & { overdue_days: number | null };

type HubRelatoriosPendingPaymentsProps = {
  clinicId: string;
  unitId: string;
};

export const HubRelatoriosPendingPayments: React.FC<HubRelatoriosPendingPaymentsProps> = ({ clinicId, unitId }) => {
  const { showError } = useAlert();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PendingRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pending, partial] = await Promise.all([
        hubFinancialApi.listReceivables(clinicId, { unit_id: unitId, status: 'pending' }),
        hubFinancialApi.listReceivables(clinicId, { unit_id: unitId, status: 'partially_paid' }),
      ]);
      const merged = [...pending, ...partial].map((r) => ({
        ...r,
        overdue_days: daysOverdue(r.due_date),
      }));
      merged.sort((a, b) => {
        const aOver = a.overdue_days ?? -1;
        const bOver = b.overdue_days ?? -1;
        if (aOver !== bOver) return bOver - aOver;
        return Number(b.final_amount) - Number(a.final_amount);
      });
      setRows(merged);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar pagamentos pendentes');
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const total = rows.reduce((sum, r) => sum + Number(r.final_amount ?? 0), 0);
    const overdue = rows.filter((r) => r.overdue_days != null).length;
    return { count: rows.length, total, overdue };
  }, [rows]);

  if (loading) return <HubLoading variant="block" label="Carregando pagamentos pendentes…" />;

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    title: 'Pagamentos pendentes',
    slug: 'pagamentos-pendentes',
    headers: ['Cliente', 'Origem', 'Status', 'Vencimento', 'Dias atraso', 'Valor'],
    rows: rows.map((r) => [
      r.guardian?.full_name,
      SOURCE_TYPE_LABELS[r.source_type] ?? r.source_type,
      STATUS_LABELS[r.status] ?? r.status,
      r.due_date,
      r.overdue_days,
      Number(r.final_amount ?? 0),
    ]),
    showError,
  });

  return (
    <>
      <div className="hub-relatorios__actions">
        <HubRelatoriosExportButton onClick={onExport} onPdf={onPdf} disabled={rows.length === 0} />
      </div>

      <div className="hub-servicos__metrics" style={{ marginBottom: 20 }}>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Recebíveis em aberto</div>
            <div className="hub-servicos__metric-value">{totals.count}</div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Valor total em aberto</div>
            <div className="hub-servicos__metric-value">{formatBrl(totals.total)}</div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Com vencimento ultrapassado</div>
            <div className="hub-servicos__metric-value">{totals.overdue}</div>
          </div>
        </div>
      </div>

      <p className="hub-clientes__muted" style={{ marginBottom: 12 }}>
        Lista limitada aos 200 recebíveis mais recentes por status. Para receber pagamentos, use o{' '}
        <Link to="/hub/caixa" className="hub-finance-page__dash-link">
          Caixa
        </Link>{' '}
        ou o{' '}
        <Link to="/hub/financeiro" className="hub-finance-page__dash-link">
          Financeiro
        </Link>
        .
      </p>

      {rows.length === 0 ? (
        <HubRelatoriosEmpty
          title="Nenhum pagamento pendente"
          description="Não há recebíveis pendentes ou parciais nesta unidade."
        />
      ) : (
        <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
          <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table hub-relatorios__table--clickable">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Origem</th>
                <th>Status</th>
                <th>Vencimento</th>
                <th className="hub-finance-page__th-num">Valor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={0}
                  className="hub-relatorios__row-link"
                  onClick={() => navigate(receivableDrillHref(row.id))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(receivableDrillHref(row.id));
                    }
                  }}
                >
                  <td>
                    {row.guardian?.id ? (
                      <Link
                        to={guardianDrillHref(row.guardian.id)}
                        className="hub-finance-page__dash-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.guardian.full_name}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{SOURCE_TYPE_LABELS[row.source_type] ?? row.source_type}</td>
                  <td>
                    <span
                      className={`hub-clientes__pill${
                        row.overdue_days != null ? ' hub-finance-page__pill--warning' : ''
                      }`}
                    >
                      {STATUS_LABELS[row.status] ?? row.status}
                      {row.overdue_days != null ? ` · ${row.overdue_days}d` : ''}
                    </span>
                  </td>
                  <td>{formatDateBr(row.due_date)}</td>
                  <td className="hub-finance-page__td-num">{formatBrl(Number(row.final_amount ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

export default HubRelatoriosPendingPayments;
