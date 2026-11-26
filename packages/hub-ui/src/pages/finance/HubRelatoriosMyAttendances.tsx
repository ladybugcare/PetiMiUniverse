import React, { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, Stethoscope, ListChecks } from 'lucide-react';
import { hubFinancialApi, type HubMyAttendancesReport } from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatDateBr } from './hubRelatoriosUtils';

type Props = { clinicId: string; unitId: string | null; period: HubReportPeriod };

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Confirmado',
  pending_confirm: 'Pendente',
  checked_in: 'Check-in',
  in_progress: 'Em andamento',
  done: 'Concluído',
  paid: 'Pago',
  cancelled: 'Cancelado',
  no_show: 'Falta',
  open: 'Aberto',
  closed: 'Fechado',
  waiting: 'Aguardando',
  completed: 'Concluído',
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export const HubRelatoriosMyAttendances: React.FC<Props> = ({ clinicId, unitId, period }) => {
  const { showError } = useAlert();
  const resourceKey = `${clinicId}:${unitId ?? 'all'}:${period.mode === 'range' ? `${period.from}-${period.to}` : period.days}:my-attendances`;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(resourceKey);
  const [data, setData] = useState<HubMyAttendancesReport | null>(null);

  const load = useCallback(async () => {
    begin();
    try {
      setData(
        await hubFinancialApi.getMyAttendancesReport(clinicId, {
          ...periodToApiOpts(period),
          unit_id: unitId,
        }),
      );
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar seus atendimentos');
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

  const items = data?.items ?? [];
  const byService = data?.by_service ?? [];
  const byApptStatus = data?.by_appointment_status ?? [];

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    reportId: 'my-attendances' as const,
    unitId,
    title: 'Meus atendimentos',
    subtitle: periodLabel !== '—' ? periodLabel : null,
    slug: 'meus-atendimentos',
    headers: ['Quando', 'Tipo', 'Título', 'Serviço', 'Pet', 'Tutor', 'Status'],
    rows: items.map((i) => [
      i.when_at,
      i.kind === 'appointment' ? 'Agendamento' : 'Atendimento clínico',
      i.title,
      i.service_name,
      i.pet_name,
      i.guardian_name,
      i.status,
    ]),
    showError,
  });

  if (loading && !data) {
    return <HubLoading variant="block" label="Carregando seus atendimentos…" />;
  }

  return (
    <div className="hub-relatorios__overview">
      <div className="hub-relatorios__overview-toolbar">
        <p className="hub-relatorios__overview-period">
          Período analisado: <strong>{periodLabel}</strong>
          <span className="hub-clientes__muted"> — somente os seus</span>
        </p>
        <HubRelatoriosExportButton
          onClick={onExport}
          onPdf={onPdf}
          disabled={items.length === 0}
        />
      </div>

      <HubRefreshingBanner show={refreshing} label="Atualizando seus atendimentos…" />

      <div className="hub-servicos__metrics hub-relatorios__kpi-row" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Total</div>
            <div className="hub-servicos__metric-value">
              {(data?.summary.total_count ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">Agendamentos + clínicos</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <ListChecks size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Agendamentos</div>
            <div className="hub-servicos__metric-value">
              {(data?.summary.appointments_count ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">Na sua agenda</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <CalendarCheck size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Atendimentos clínicos</div>
            <div className="hub-servicos__metric-value">
              {(data?.summary.encounters_count ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">Encontros com você</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Stethoscope size={20} strokeWidth={2} />
          </div>
        </div>
      </div>

      <div className="hub-relatorios__charts-row">
        <section className="hub-relatorios__panel" aria-labelledby="relatorios-my-att-status-title">
          <div className="hub-relatorios__panel-head">
            <div>
              <h2 id="relatorios-my-att-status-title" className="hub-relatorios__section-title">
                Agendamentos por status
              </h2>
            </div>
          </div>
          {byApptStatus.length === 0 ? (
            <HubRelatoriosEmpty title="Sem agendamentos" description="Nenhum agendamento seu neste período." />
          ) : (
            <ul className="hub-relatorios__aging-list">
              {byApptStatus.map((row) => (
                <li key={row.status} className="hub-relatorios__aging-row">
                  <div className="hub-relatorios__aging-meta">
                    <span className="hub-relatorios__aging-label">{statusLabel(row.status)}</span>
                    <strong className="hub-relatorios__aging-value">
                      {row.count.toLocaleString('pt-BR')}
                    </strong>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="hub-relatorios__panel" aria-labelledby="relatorios-my-att-svc-title">
          <div className="hub-relatorios__panel-head">
            <div>
              <h2 id="relatorios-my-att-svc-title" className="hub-relatorios__section-title">
                Por serviço
              </h2>
            </div>
          </div>
          {byService.length === 0 ? (
            <HubRelatoriosEmpty
              title="Sem serviços"
              description="Agendamentos com tipo de serviço aparecem aqui."
            />
          ) : (
            <ul className="hub-relatorios__aging-list">
              {byService.map((row) => (
                <li key={row.service_id} className="hub-relatorios__aging-row">
                  <div className="hub-relatorios__aging-meta">
                    <span className="hub-relatorios__aging-label">{row.name}</span>
                    <strong className="hub-relatorios__aging-value">
                      {row.count.toLocaleString('pt-BR')}
                    </strong>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-my-att-items-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-my-att-items-title" className="hub-relatorios__section-title">
              Detalhe
            </h2>
            <p className="hub-relatorios__panel-sub">Lista dos seus agendamentos e atendimentos</p>
          </div>
        </div>
        {items.length === 0 ? (
          <HubRelatoriosEmpty title="Nenhum atendimento" description="Não há registros seus neste período." />
        ) : (
          <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
            <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Tipo</th>
                  <th>Título</th>
                  <th>Pet</th>
                  <th>Tutor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={`${i.kind}:${i.id}`}>
                    <td>{formatDateBr(i.when_at)}</td>
                    <td>{i.kind === 'appointment' ? 'Agenda' : 'Clínico'}</td>
                    <td>{i.title}</td>
                    <td>{i.pet_name ?? '—'}</td>
                    <td>{i.guardian_name ?? '—'}</td>
                    <td>{statusLabel(i.status)}</td>
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
