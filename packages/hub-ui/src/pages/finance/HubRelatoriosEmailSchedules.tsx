import React, { useCallback, useEffect, useState } from 'react';
import { Mail, Play, Trash2 } from 'lucide-react';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import {
  hubReportSchedulesApi,
  type HubReportEmailSchedule,
} from './hubRelatoriosPdf';
import { HUB_REPORTS } from './hubRelatoriosConfig';

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

type Props = {
  clinicId: string;
  unitId: string | null;
};

export const HubRelatoriosEmailSchedules: React.FC<Props> = ({ clinicId, unitId }) => {
  const { showError, showSuccess } = useAlert();
  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState<HubReportEmailSchedule[]>([]);
  const [reportId, setReportId] = useState('cash-flow');
  const [email, setEmail] = useState('');
  const [periodDays, setPeriodDays] = useState(30);
  const [saving, setSaving] = useState(false);

  const options = HUB_REPORTS.filter((r) => SCHEDULABLE.has(r.id));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hubReportSchedulesApi.list(clinicId);
      setSchedules(res.schedules ?? []);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar agendamentos');
    } finally {
      setLoading(false);
    }
  }, [clinicId, showError]);

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
        <Mail size={18} aria-hidden />
        <div>
          <h2 id="relatorios-email-title" className="hub-relatorios__section-title" style={{ margin: 0 }}>
            Envio semanal por e-mail
          </h2>
          <p className="hub-clientes__muted" style={{ margin: '4px 0 0' }}>
            Agende o resumo de um relatório. O disparo fica em fila até o provedor de e-mail do Hub
            estar configurado.
          </p>
        </div>
      </div>

      <div className="hub-clientes__toolbar hub-relatorios__email-form">
        <div className="hub-servicos__filter-field">
          <span className="hub-clientes__label">Relatório</span>
          <select
            className="hub-clientes__select-input"
            value={reportId}
            onChange={(e) => setReportId(e.target.value)}
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </select>
        </div>
        <div className="hub-servicos__filter-field">
          <span className="hub-clientes__label">E-mail</span>
          <input
            className="hub-clientes__select-input"
            type="email"
            placeholder="gestao@clinica.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="hub-servicos__filter-field">
          <span className="hub-clientes__label">Período (dias)</span>
          <select
            className="hub-clientes__select-input"
            value={periodDays}
            onChange={(e) => setPeriodDays(Number(e.target.value))}
          >
            <option value={7}>7</option>
            <option value={30}>30</option>
            <option value={90}>90</option>
          </select>
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

      {loading ? (
        <HubLoading variant="block" label="Carregando agendamentos…" />
      ) : schedules.length === 0 ? (
        <p className="hub-clientes__muted">Nenhum agendamento ainda.</p>
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
                  <td>{s.last_status || (s.active ? 'ativo' : 'inativo')}</td>
                  <td>
                    <div className="hub-relatorios__export-group">
                      <button
                        type="button"
                        className="hub-clientes__btn hub-clientes__btn--ghost"
                        title="Disparar agora"
                        onClick={() => void onRun(s.id)}
                      >
                        <Play size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="hub-clientes__btn hub-clientes__btn--ghost"
                        title="Remover"
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
