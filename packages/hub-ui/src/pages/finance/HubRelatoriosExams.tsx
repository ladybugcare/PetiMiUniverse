import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ClipboardList, FlaskConical, Hourglass } from 'lucide-react';
import { hubClinicalExamsApi, type HubClinicalExam } from '../../api/hubClinicalApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { formatHubClinicalExamStatus } from '../clinica/clinicalDisplay';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
import { defaultRangeForPreset, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatDateBr } from './hubRelatoriosUtils';

type Props = { clinicId: string; period: HubReportPeriod };

function periodRange(period: HubReportPeriod): { from: string; to: string; labelFrom: string; labelTo: string } {
  const range =
    period.mode === 'range' ? { from: period.from, to: period.to } : defaultRangeForPreset(period.days);
  return {
    from: range.from,
    to: `${range.to}T23:59:59`,
    labelFrom: range.from,
    labelTo: range.to,
  };
}

function labLabel(exam: HubClinicalExam): string {
  if (exam.lab_kind === 'external') return exam.external_lab_name || 'Laboratório externo';
  return exam.lab_name || 'Laboratório interno';
}

export const HubRelatoriosExams: React.FC<Props> = ({ clinicId, period }) => {
  const { showError, showSuccess } = useAlert();
  const range = useMemo(() => periodRange(period), [period]);
  const resourceKey = `${clinicId}:${range.labelFrom}-${range.labelTo}:exams`;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(resourceKey);
  const [exams, setExams] = useState<HubClinicalExam[]>([]);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    begin();
    try {
      const r = await hubClinicalExamsApi.list(clinicId, { from: range.from, to: range.to });
      setExams(r.exams ?? []);
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar exames');
    } finally {
      finish();
    }
  }, [clinicId, range.from, range.to, showError, begin, succeed, finish]);

  useEffect(() => {
    void load();
  }, [load]);

  const periodLabel = `${formatDateBr(range.labelFrom)} a ${formatDateBr(range.labelTo)}`;
  const pending = exams.filter(
    (e) => e.status === 'requested' || e.status === 'collected' || e.status === 'sent',
  ).length;
  const done = exams.filter(
    (e) => e.status === 'result_received' || e.status === 'completed',
  ).length;
  const other = Math.max(0, exams.length - pending - done);

  const statusBars = useMemo(() => {
    const rows = [
      { key: 'pending', label: 'Pendentes', count: pending, tone: 'risk' as const },
      { key: 'done', label: 'Concluídos', count: done, tone: 'ok' as const },
      { key: 'other', label: 'Outros', count: other, tone: 'warn' as const },
    ].filter((r) => r.count > 0);
    const max = Math.max(0, ...rows.map((r) => r.count));
    return rows.map((r) => ({
      ...r,
      widthPct: max > 0 ? (r.count / max) * 100 : 0,
    }));
  }, [pending, done, other]);

  const { onPdf } = makeReportExporters({
    clinicId,
    title: 'Exames solicitados',
    subtitle: periodLabel,
    slug: 'exames-solicitados',
    headers: ['Solicitado', 'Exame', 'Status', 'Laboratório', 'Pet'],
    rows: exams.map((ex) => [
      ex.requested_at,
      ex.exam_type,
      formatHubClinicalExamStatus(ex.status),
      labLabel(ex),
      ex.pet_id,
    ]),
    showError,
  });

  const onExport = () => {
    if (exporting) return;
    setExporting(true);
    void hubClinicalExamsApi
      .downloadExportCsv(clinicId, { from: range.from, to: range.to })
      .then(() => showSuccess('CSV de exames baixado'))
      .catch((e: unknown) => showError((e as Error)?.message || 'Erro ao exportar'))
      .finally(() => setExporting(false));
  };

  if (loading && exams.length === 0) {
    return <HubLoading variant="block" label="Carregando exames…" />;
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
          disabled={exporting || exams.length === 0}
        />
      </div>

      <HubRefreshingBanner show={refreshing} label="Atualizando exames…" />

      <div className="hub-servicos__metrics hub-relatorios__kpi-row" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Total</div>
            <div className="hub-servicos__metric-value">{exams.length.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">Pedidos no período</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <FlaskConical size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Pendentes</div>
            <div className="hub-servicos__metric-value">{pending.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">Solicitados, coletados ou enviados</div>
          </div>
          <div
            className={`hub-servicos__metric-icon${pending > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <Hourglass size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Concluídos</div>
            <div className="hub-servicos__metric-value">{done.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">Com resultado ou finalizados</div>
          </div>
          <div
            className={`hub-servicos__metric-icon${done > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <CheckCircle2 size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Taxa concluída</div>
            <div className="hub-servicos__metric-value">
              {exams.length > 0
                ? `${Math.round((done / exams.length) * 100).toLocaleString('pt-BR')}%`
                : '—'}
            </div>
            <div className="hub-servicos__metric-sub">Sobre o total do período</div>
          </div>
          <div className="hub-servicos__metric-icon hub-servicos__metric-icon--muted" aria-hidden>
            <ClipboardList size={20} strokeWidth={2} />
          </div>
        </div>
      </div>

      {statusBars.length > 0 ? (
        <section className="hub-relatorios__panel" aria-labelledby="relatorios-exams-status-title">
          <div className="hub-relatorios__panel-head">
            <div>
              <h2 id="relatorios-exams-status-title" className="hub-relatorios__section-title">
                Situação dos pedidos
              </h2>
              <p className="hub-relatorios__panel-sub">
                Distribuição entre pendentes, concluídos e demais status
              </p>
            </div>
          </div>
          <ul className="hub-relatorios__aging-list">
            {statusBars.map((row) => (
              <li key={row.key} className="hub-relatorios__aging-row">
                <div className="hub-relatorios__aging-meta">
                  <span className="hub-relatorios__aging-label">{row.label}</span>
                  <span className="hub-relatorios__aging-count">
                    {row.count.toLocaleString('pt-BR')}
                  </span>
                </div>
                <div className="hub-relatorios__aging-track" aria-hidden>
                  <span
                    className={`hub-relatorios__aging-fill hub-relatorios__aging-fill--${row.tone}`}
                    style={{ width: `${Math.max(row.widthPct, row.count > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-exams-list-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-exams-list-title" className="hub-relatorios__section-title">
              Pedidos no período
            </h2>
            <p className="hub-relatorios__panel-sub">
              Exames solicitados com status, laboratório e acesso ao atendimento
            </p>
          </div>
          <div className="hub-relatorios__panel-stat">
            <span className="hub-relatorios__panel-stat-label">Pedidos</span>
            <span className="hub-relatorios__panel-stat-value">
              {exams.length.toLocaleString('pt-BR')}
            </span>
          </div>
        </div>
        {exams.length === 0 ? (
          <HubRelatoriosEmpty
            title="Nenhum exame no período"
            description="Não há pedidos de exame solicitados neste intervalo."
          />
        ) : (
          <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
            <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table">
              <thead>
                <tr>
                  <th>Solicitado</th>
                  <th>Exame</th>
                  <th>Status</th>
                  <th>Laboratório</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {exams.map((ex) => (
                  <tr key={ex.id}>
                    <td>
                      <div className="hub-relatorios__cell-primary">
                        {formatDateBr(ex.requested_at)}
                      </div>
                    </td>
                    <td>{ex.exam_type}</td>
                    <td>{formatHubClinicalExamStatus(ex.status)}</td>
                    <td>{labLabel(ex)}</td>
                    <td>
                      {ex.hub_encounter_id ? (
                        <Link
                          to={`/hub/clinica/atendimentos/${ex.hub_encounter_id}`}
                          className="hub-finance-page__dash-link"
                        >
                          Ver atendimento
                        </Link>
                      ) : (
                        <Link
                          to={`/hub/clinica/prontuarios?petId=${encodeURIComponent(ex.pet_id)}&tab=exames`}
                          className="hub-finance-page__dash-link"
                        >
                          Ver prontuário
                        </Link>
                      )}
                    </td>
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

export default HubRelatoriosExams;
