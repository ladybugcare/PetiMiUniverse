import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleDollarSign, Receipt, Scale, Tags } from 'lucide-react';
import {
  hubFinancialApi,
  type HubFinanceSalesAdjustmentsReport,
} from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
import { receivableDrillHref } from './hubRelatoriosLinks';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatBrl, formatDateBr } from './hubRelatoriosUtils';

const ADJUSTMENT_LABELS: Record<string, string> = {
  discount: 'Desconto',
  credit: 'Crédito',
  write_off: 'Baixa',
  refund: 'Estorno',
  manual_adjustment: 'Ajuste manual',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  partially_paid: 'Parcial',
  paid: 'Pago',
  cancelled: 'Cancelado',
  refunded: 'Estornado',
};

const STATUS_TONE: Record<string, string> = {
  paid: 'ok',
  partially_paid: 'warn',
  pending: 'muted',
  cancelled: 'muted',
  refunded: 'risk',
};

const ADJUSTMENT_TONE: Record<string, string> = {
  discount: 'warn',
  credit: 'ok',
  write_off: 'muted',
  refund: 'critical',
  manual_adjustment: 'risk',
};

type BreakdownRow = {
  key: string;
  label: string;
  tone: string;
  count: number;
  total: number;
  widthPct: number;
};

type HubRelatoriosSalesAdjustmentsProps = {
  clinicId: string;
  unitId: string;
  period: HubReportPeriod;
};

function toBreakdown(
  entries: Array<[string, { count: number; total: number }]>,
  labels: Record<string, string>,
  tones: Record<string, string>,
): BreakdownRow[] {
  const maxTotal = Math.max(0, ...entries.map(([, value]) => value.total));
  return entries
    .map(([key, value]) => ({
      key,
      label: labels[key] ?? key,
      tone: tones[key] ?? 'muted',
      count: value.count,
      total: value.total,
      widthPct: maxTotal > 0 ? (value.total / maxTotal) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export const HubRelatoriosSalesAdjustments: React.FC<HubRelatoriosSalesAdjustmentsProps> = ({
  clinicId,
  unitId,
  period,
}) => {
  const { showError } = useAlert();
  const navigate = useNavigate();
  const resourceKey = `${clinicId}:${unitId}:${period.mode === 'range' ? `${period.from}-${period.to}` : period.days}:sales-adjustments`;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(resourceKey);
  const [data, setData] = useState<HubFinanceSalesAdjustmentsReport | null>(null);

  const load = useCallback(async () => {
    begin();
    try {
      const res = await hubFinancialApi.getSalesAdjustmentsReport(
        clinicId,
        unitId,
        periodToApiOpts(period),
      );
      setData(res);
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar vendas e acertos');
    } finally {
      finish();
    }
  }, [clinicId, unitId, period, showError, begin, succeed, finish]);

  useEffect(() => {
    void load();
  }, [load]);

  const periodLabel = data
    ? `${formatDateBr(data.period.from)} a ${formatDateBr(data.period.to)}`
    : '—';

  const statusRows = useMemo(
    () => toBreakdown(Object.entries(data?.sales.by_status ?? {}), STATUS_LABELS, STATUS_TONE),
    [data],
  );

  const adjustmentTypeRows = useMemo(
    () =>
      toBreakdown(
        Object.entries(data?.adjustments.by_type ?? {}),
        ADJUSTMENT_LABELS,
        ADJUSTMENT_TONE,
      ),
    [data],
  );

  const adjustmentItems = data?.adjustments.items ?? [];

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    title: 'Vendas e acertos',
    subtitle: periodLabel !== '—' ? periodLabel : null,
    slug: 'vendas-acertos',
    headers: ['Data', 'Cliente', 'Tipo', 'Motivo', 'Valor'],
    rows: adjustmentItems.map((row) => [
      row.created_at,
      row.guardian_name,
      ADJUSTMENT_LABELS[row.adjustment_type] ?? row.adjustment_type,
      row.reason,
      row.amount,
    ]),
    showError,
  });

  if (loading && !data) {
    return <HubLoading variant="block" label="Carregando vendas e acertos…" />;
  }

  return (
    <div className="hub-relatorios__overview">
      <div className="hub-relatorios__overview-toolbar">
        <p className="hub-relatorios__overview-period">
          Período analisado: <strong>{periodLabel}</strong>
        </p>
        <HubRelatoriosExportButton
          onClick={onExport}
          onPdf={onPdf}
          disabled={adjustmentItems.length === 0}
        />
      </div>

      <HubRefreshingBanner show={refreshing} label="Atualizando vendas e acertos…" />

      <div className="hub-servicos__metrics hub-relatorios__kpi-row" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Vendas (recebíveis)</div>
            <div className="hub-servicos__metric-value">
              {(data?.sales.receivables_count ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">{periodLabel}</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Receipt size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Valor das vendas</div>
            <div className="hub-servicos__metric-value">{formatBrl(data?.sales.total ?? 0)}</div>
            <div className="hub-servicos__metric-sub">Recebíveis criados no período</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <CircleDollarSign size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Acertos</div>
            <div className="hub-servicos__metric-value">
              {(data?.adjustments.count ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">Descontos, estornos e baixas</div>
          </div>
          <div
            className={`hub-servicos__metric-icon${(data?.adjustments.count ?? 0) > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <Tags size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Valor dos acertos</div>
            <div className="hub-servicos__metric-value">
              {formatBrl(data?.adjustments.total ?? 0)}
            </div>
            <div className="hub-servicos__metric-sub">Impacto no período</div>
          </div>
          <div
            className={`hub-servicos__metric-icon${(data?.adjustments.total ?? 0) > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <Scale size={20} strokeWidth={2} />
          </div>
        </div>
      </div>

      <div className="hub-relatorios__charts-row">
        <section className="hub-relatorios__panel" aria-labelledby="relatorios-sales-status-title">
          <div className="hub-relatorios__panel-head">
            <div>
              <h2 id="relatorios-sales-status-title" className="hub-relatorios__section-title">
                Vendas por status
              </h2>
              <p className="hub-relatorios__panel-sub">Recebíveis criados no período</p>
            </div>
            <div className="hub-relatorios__panel-stat">
              <span className="hub-relatorios__panel-stat-label">Total</span>
              <span className="hub-relatorios__panel-stat-value">
                {formatBrl(data?.sales.total ?? 0)}
              </span>
            </div>
          </div>
          {statusRows.length === 0 ? (
            <HubRelatoriosEmpty
              title="Sem vendas"
              description="Não há recebíveis criados no período."
            />
          ) : (
            <ul className="hub-relatorios__aging-list">
              {statusRows.map((row) => (
                <li key={row.key} className="hub-relatorios__aging-row">
                  <div className="hub-relatorios__aging-meta">
                    <span className="hub-relatorios__aging-label">{row.label}</span>
                    <span className="hub-relatorios__aging-count">
                      {row.count.toLocaleString('pt-BR')}{' '}
                      {row.count === 1 ? 'título' : 'títulos'}
                    </span>
                    <strong className="hub-relatorios__aging-value">{formatBrl(row.total)}</strong>
                  </div>
                  <div className="hub-relatorios__aging-track" aria-hidden>
                    <span
                      className={`hub-relatorios__aging-fill hub-relatorios__aging-fill--${row.tone}`}
                      style={{ width: `${Math.max(row.widthPct, row.total > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="hub-relatorios__panel" aria-labelledby="relatorios-adj-types-title">
          <div className="hub-relatorios__panel-head">
            <div>
              <h2 id="relatorios-adj-types-title" className="hub-relatorios__section-title">
                Acertos por tipo
              </h2>
              <p className="hub-relatorios__panel-sub">Descontos, estornos, baixas e créditos</p>
            </div>
            <div className="hub-relatorios__panel-stat">
              <span className="hub-relatorios__panel-stat-label">Total</span>
              <span className="hub-relatorios__panel-stat-value">
                {formatBrl(data?.adjustments.total ?? 0)}
              </span>
            </div>
          </div>
          {adjustmentTypeRows.length === 0 ? (
            <HubRelatoriosEmpty
              title="Sem acertos"
              description="Não há descontos, estornos ou baixas no período."
            />
          ) : (
            <ul className="hub-relatorios__aging-list">
              {adjustmentTypeRows.map((row) => (
                <li key={row.key} className="hub-relatorios__aging-row">
                  <div className="hub-relatorios__aging-meta">
                    <span className="hub-relatorios__aging-label">{row.label}</span>
                    <span className="hub-relatorios__aging-count">
                      {row.count.toLocaleString('pt-BR')}{' '}
                      {row.count === 1 ? 'lançamento' : 'lançamentos'}
                    </span>
                    <strong className="hub-relatorios__aging-value">{formatBrl(row.total)}</strong>
                  </div>
                  <div className="hub-relatorios__aging-track" aria-hidden>
                    <span
                      className={`hub-relatorios__aging-fill hub-relatorios__aging-fill--${row.tone}`}
                      style={{ width: `${Math.max(row.widthPct, row.total > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-adj-detail-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-adj-detail-title" className="hub-relatorios__section-title">
              Detalhe dos acertos
            </h2>
            <p className="hub-relatorios__panel-sub">
              Clique na linha para abrir o recebível relacionado.
            </p>
          </div>
          <div className="hub-relatorios__panel-stat">
            <span className="hub-relatorios__panel-stat-label">Lançamentos</span>
            <span className="hub-relatorios__panel-stat-value">
              {adjustmentItems.length.toLocaleString('pt-BR')}
            </span>
          </div>
        </div>

        {adjustmentItems.length === 0 ? (
          <HubRelatoriosEmpty
            title="Nenhum acerto listado"
            description="Ajuste o período ou registre acertos no financeiro."
          />
        ) : (
          <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
            <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table hub-relatorios__table--clickable">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>Tipo</th>
                  <th>Motivo</th>
                  <th className="hub-finance-page__th-num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {adjustmentItems.map((row) => (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    className="hub-relatorios__row-link"
                    onClick={() => navigate(receivableDrillHref(row.receivable_id))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(receivableDrillHref(row.receivable_id));
                      }
                    }}
                  >
                    <td>{formatDateBr(row.created_at)}</td>
                    <td>{row.guardian_name ?? '—'}</td>
                    <td>
                      <span className="hub-relatorios__type-pill">
                        {ADJUSTMENT_LABELS[row.adjustment_type] ?? row.adjustment_type}
                      </span>
                    </td>
                    <td>
                      <div className="hub-relatorios__cell-primary">
                        {row.reason?.trim() || '—'}
                      </div>
                    </td>
                    <td className="hub-finance-page__td-num">{formatBrl(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default HubRelatoriosSalesAdjustments;
