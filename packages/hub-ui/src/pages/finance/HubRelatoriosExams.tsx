import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { hubClinicalExamsApi, type HubClinicalExam } from '../../api/hubClinicalApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { formatHubClinicalExamStatus } from '../clinica/clinicalDisplay';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { defaultRangeForPreset, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatDateBr } from './hubRelatoriosUtils';

type Props = { clinicId: string; period: HubReportPeriod };

function periodRange(period: HubReportPeriod): { from: string; to: string } {
  const range = period.mode === 'range' ? { from: period.from, to: period.to } : defaultRangeForPreset(period.days);
  return { from: range.from, to: `${range.to}T23:59:59` };
}

function labLabel(exam: HubClinicalExam): string {
  if (exam.lab_kind === 'external') return exam.external_lab_name || 'Laboratório externo';
  return exam.lab_name || 'Laboratório interno';
}

export const HubRelatoriosExams: React.FC<Props> = ({ clinicId, period }) => {
  const { showError, showSuccess } = useAlert();
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exams, setExams] = useState<HubClinicalExam[]>([]);
  const range = useMemo(() => periodRange(period), [period]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await hubClinicalExamsApi.list(clinicId, { from: range.from, to: range.to });
      setExams(r.exams ?? []);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar exames');
    } finally {
      setLoading(false);
    }
  }, [clinicId, range.from, range.to, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = exams.filter((e) => e.status === 'requested' || e.status === 'collected' || e.status === 'sent').length;
  const done = exams.filter((e) => e.status === 'result_received' || e.status === 'completed').length;

  const onExport = () => {
    if (exporting) return;
    setExporting(true);
    void hubClinicalExamsApi
      .downloadExportCsv(clinicId, { from: range.from, to: range.to })
      .then(() => showSuccess('CSV de exames baixado'))
      .catch((e: unknown) => showError((e as Error)?.message || 'Erro ao exportar'))
      .finally(() => setExporting(false));
  };

  if (loading) return <HubLoading variant="block" label="Carregando exames…" />;

  return (
    <>
      <div className="hub-relatorios__actions">
        <HubRelatoriosExportButton onClick={onExport} disabled={exporting || exams.length === 0} />
      </div>

      <div className="hub-servicos__metrics" style={{ marginBottom: 20 }}>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Total</div>
            <div className="hub-servicos__metric-value">{exams.length}</div>
            <div className="hub-servicos__metric-sub">Pedidos no período</div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Pendentes</div>
            <div className="hub-servicos__metric-value">{pending}</div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Concluídos</div>
            <div className="hub-servicos__metric-value">{done}</div>
          </div>
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
                  <td>{formatDateBr(ex.requested_at)}</td>
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
    </>
  );
};

export default HubRelatoriosExams;
