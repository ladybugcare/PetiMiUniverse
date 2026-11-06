import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Mail, Play, Trash2 } from 'lucide-react';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import {
  hubReportSchedulesApi,
  type HubReportEmailSchedule,
} from './hubRelatoriosPdf';
import { HUB_REPORTS } from './hubRelatoriosConfig';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';

const SCHEDULABLE = new Set([
  'finance-overview',
  'pending-payments',
  'sales-adjustments',
  'top-clients',
  'cash-flow',
  'absent-clients',
  'packages',
  'stock-abc',
]);

const PERIOD_OPTIONS: HubComboboxOption[] = [
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
  { value: '90', label: '90 dias' },
];

type Props = {
  clinicId: string;
  unitId: string | null;
};

export const HubRelatoriosEmailSchedules: React.FC<Props> = ({ clinicId, unitId }) => {
  const { showError, showSuccess } = useAlert();
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(clinicId);
  const [schedules, setSchedules] = useState<HubReportEmailSchedule[]>([]);
  const [reportId, setReportId] = useState('cash-flow');
  const [email, setEmail] = useState('');
  const [periodDays, setPeriodDays] = useState(30);
  const [saving, setSaving] = useState(false);

  const reportOptions = useMemo<HubComboboxOption[]>(
    () =>
      HUB_REPORTS.filter((r) => SCHEDULABLE.has(r.id)).map((r) => ({
        value: r.id,
        label: r.title,
        searchText: r.description,
      })),
    [],
  );

  const load = useCallback(async () => {
    begin();
    try {
      const res = await hubReportSchedulesApi.list(clinicId);
      setSchedules(res.schedules ?? []);
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar agendamentos');
    } finally {
      finish();
    }
  }, [clinicId, showError, begin, succeed, finish]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async () => {
    if (!email.trim()) {
      showError('Informe o e-mail do destinatário.');
      return;
    }
    setSaving(true);
    try {
      await hubReportSchedulesApi.create({
        clinic_id: clinicId,
        unit_id: unitId,
        report_id: reportId,
        recipient_email: email.trim(),
        period_days: periodDays,
      });
      setEmail('');
      showSuccess('Agendamento semanal criado.');
      await load();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao criar agendamento');
    } finally {
      setSaving(false);
    }
  };

  const onRun = async (id: string) => {
    try {
      const res = await hubReportSchedulesApi.run(clinicId, id);
      showSuccess(res.preview?.note || 'Disparo registrado na fila.');
      await load();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao disparar');
    }
  };

  const onDelete = async (id: string) => {
    try {
      await hubReportSchedulesApi.remove(clinicId, id);
      showSuccess('Agendamento removido.');
      await load();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao remover');
    }
  };

  const titleOf = (id: string) => HUB_REPORTS.find((r) => r.id === id)?.title ?? id;

  return (
    <section className="hub-relatorios__email-schedules" aria-labelledby="relatorios-email-title">
      <div className="hub-relatorios__email-schedules-head">
        <span className="hub-relatorios__email-schedules-icon" aria-hidden>
          <Mail size={18} />
        </span>
        <div>
          <h2 id="relatorios-email-title" className="hub-relatorios__section-title">
            Envio semanal por e-mail
          </h2>
          <p className="hub-relatorios__email-schedules-sub">
            Agende o resumo de um relatório. O disparo fica em fila até o provedor de e-mail do Hub
            estar configurado.
          </p>
        </div>
      </div>

      <div className="hub-clientes__toolbar hub-relatorios__email-form">
        <div className="hub-servicos__filter-field hub-relatorios__email-field--report">
          <span className="hub-clientes__label">Relatório</span>
          <HubSearchableCombobox
            id="relatorios-email-report"
            className="hub-combobox--clientes"
            options={reportOptions}
            value={reportId}
            onChange={setReportId}
            placeholder="Selecionar relatório…"
            searchPlaceholder="Buscar relatório…"
            ariaLabel="Relatório"
            clearable={false}
            allowCreate={false}
          />
        </div>
        <div className="hub-servicos__filter-field hub-relatorios__email-field--email">
          <span className="hub-clientes__label">E-mail</span>
          <input
            className="hub-clientes__select-input"
            type="email"
            placeholder="gestao@clinica.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="hub-servicos__filter-field hub-relatorios__email-field--period">
          <span className="hub-clientes__label">Período</span>
          <HubSearchableCombobox
            id="relatorios-email-period"
            className="hub-combobox--clientes"
            options={PERIOD_OPTIONS}
            value={String(periodDays)}
            onChange={(v) => setPeriodDays(Number(v))}
            placeholder="Selecionar período…"
            searchPlaceholder="Buscar…"
            ariaLabel="Período em dias"
            clearable={false}
            allowCreate={false}
          />
        </div>
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--primary"
          disabled={saving}
          onClick={() => void onCreate()}
        >
          Agendar
        </button>
      </div>

      <HubRefreshingBanner show={refreshing} label="Atualizando agendamentos…" />
      {loading && schedules.length === 0 ? (
        <HubLoading variant="block" label="Carregando agendamentos…" />
      ) : schedules.length === 0 ? (
        <HubRelatoriosEmpty
          title="Nenhum agendamento ainda"
          description="Escolha um relatório, informe o e-mail e clique em Agendar para receber o resumo semanal."
        />
      ) : (
        <div className="hub-finance-page__table-wrap">
          <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table">
            <thead>
              <tr>
                <th>Relatório</th>
                <th>Destinatário</th>
                <th>Período</th>
                <th>Último disparo</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id}>
                  <td>{titleOf(s.report_id)}</td>
                  <td>{s.recipient_email}</td>
                  <td>{s.period_days}d</td>
                  <td>{s.last_sent_at ? new Date(s.last_sent_at).toLocaleString('pt-BR') : '—'}</td>
                  <td>
                    <span
                      className={
                        s.active
                          ? 'hub-relatorios__status hub-relatorios__status--active'
                          : 'hub-relatorios__status'
                      }
                    >
                      {s.last_status || (s.active ? 'ativo' : 'inativo')}
                    </span>
                  </td>
                  <td>
                    <div className="hub-relatorios__export-group">
                      <button
                        type="button"
                        className="hub-clientes__btn hub-clientes__btn--ghost"
                        title="Disparar agora"
                        aria-label={`Disparar ${titleOf(s.report_id)} agora`}
                        onClick={() => void onRun(s.id)}
                      >
                        <Play size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="hub-clientes__btn hub-clientes__btn--ghost"
                        title="Remover"
                        aria-label={`Remover agendamento de ${titleOf(s.report_id)}`}
                        onClick={() => void onDelete(s.id)}
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default HubRelatoriosEmailSchedules;
