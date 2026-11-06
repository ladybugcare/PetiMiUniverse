import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bone, Cake, CalendarDays, Users } from 'lucide-react';
import {
  hubFinancialApi,
  type HubBirthdaysReport,
} from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
import { guardianDrillHref } from './hubRelatoriosLinks';
import { formatDateBr } from './hubRelatoriosUtils';

type Props = { clinicId: string; days: number };

export const HubRelatoriosBirthdays: React.FC<Props> = ({ clinicId, days }) => {
  const { showError } = useAlert();
  const resourceKey = `${clinicId}:${days}:birthdays`;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(resourceKey);
  const [data, setData] = useState<HubBirthdaysReport | null>(null);

  const load = useCallback(async () => {
    begin();
    try {
      setData(await hubFinancialApi.getBirthdaysReport(clinicId, { days }));
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar aniversariantes');
    } finally {
      finish();
    }
  }, [clinicId, days, showError, begin, succeed, finish]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = data?.items ?? [];
  const todayCount = useMemo(
    () => items.filter((row) => row.days_until === 0).length,
    [items],
  );

  const kindBars = useMemo(() => {
    const rows = [
      { key: 'guardian', label: 'Tutores', count: data?.summary.guardians ?? 0, tone: 'ok' },
      { key: 'pet', label: 'Pets', count: data?.summary.pets ?? 0, tone: 'risk' },
    ].filter((r) => r.count > 0);
    const max = Math.max(0, ...rows.map((r) => r.count));
    return rows.map((r) => ({
      ...r,
      widthPct: max > 0 ? (r.count / max) * 100 : 0,
    }));
  }, [data]);

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    title: 'Aniversariantes',
    subtitle: `Próximos ${days} dias`,
    slug: 'aniversariantes',
    headers: ['Tipo', 'Nome', 'Nascimento', 'Próximo', 'Em (dias)', 'Tutor', 'Telefone', 'Espécie'],
    rows: items.map((row) => [
      row.kind === 'pet' ? 'Pet' : 'Tutor',
      row.name,
      row.birth_date,
      row.next_birthday,
      row.days_until,
      row.guardian_name,
      row.phone,
      row.species,
    ]),
    showError,
  });

  if (loading && !data) {
    return <HubLoading variant="block" label="Carregando aniversariantes…" />;
  }

  return (
    <div className="hub-relatorios__overview">
      <div className="hub-relatorios__overview-toolbar">
        <p className="hub-relatorios__overview-period">
          Janela: <strong>próximos {days} dias</strong>
        </p>
        <HubRelatoriosExportButton
          onClick={onExport}
          onPdf={onPdf}
          disabled={items.length === 0}
        />
      </div>

      <HubRefreshingBanner show={refreshing} label="Atualizando aniversariantes…" />

      <div className="hub-servicos__metrics hub-relatorios__kpi-row" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Total</div>
            <div className="hub-servicos__metric-value">
              {(data?.summary.total ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">Próximos {days} dias</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Cake size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Tutores</div>
            <div className="hub-servicos__metric-value">
              {(data?.summary.guardians ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">Aniversário de cliente</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Users size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Pets</div>
            <div className="hub-servicos__metric-value">
              {(data?.summary.pets ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">Aniversário do animal</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Bone size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Hoje</div>
            <div className="hub-servicos__metric-value">
              {todayCount.toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">Aniversariantes do dia</div>
          </div>
          <div
            className={`hub-servicos__metric-icon${todayCount > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <CalendarDays size={20} strokeWidth={2} />
          </div>
        </div>
      </div>

      {kindBars.length > 0 ? (
        <section className="hub-relatorios__panel" aria-labelledby="relatorios-bday-mix-title">
          <div className="hub-relatorios__panel-head">
            <div>
              <h2 id="relatorios-bday-mix-title" className="hub-relatorios__section-title">
                Mix tutores × pets
              </h2>
              <p className="hub-relatorios__panel-sub">Distribuição dos aniversários na janela</p>
            </div>
          </div>
          <ul className="hub-relatorios__aging-list">
            {kindBars.map((row) => (
              <li key={row.key} className="hub-relatorios__aging-row">
                <div className="hub-relatorios__aging-meta">
                  <span className="hub-relatorios__aging-label">{row.label}</span>
                  <span className="hub-relatorios__aging-count">
                    {row.count.toLocaleString('pt-BR')}
                  </span>
                  <strong className="hub-relatorios__aging-value">
                    {(data?.summary.total ?? 0) > 0
                      ? `${((row.count / (data?.summary.total ?? 1)) * 100).toFixed(0)}%`
                      : '—'}
                  </strong>
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

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-bday-list-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-bday-list-title" className="hub-relatorios__section-title">
              Lista de aniversariantes
            </h2>
            <p className="hub-relatorios__panel-sub">Ordenada pela data do próximo aniversário</p>
          </div>
        </div>
        {items.length === 0 ? (
          <HubRelatoriosEmpty
            title="Nenhum aniversariante"
            description="Não há pets ou tutores com data de nascimento nos próximos dias selecionados."
          />
        ) : (
          <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
            <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Nome</th>
                  <th>Próximo</th>
                  <th className="hub-finance-page__th-num">Em</th>
                  <th>Tutor</th>
                  <th>Telefone</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={`${row.kind}:${row.id}`}>
                    <td>
                      <span className="hub-relatorios__type-pill">
                        {row.kind === 'pet' ? 'Pet' : 'Tutor'}
                      </span>
                    </td>
                    <td>
                      {row.kind === 'guardian' && row.guardian_id ? (
                        <Link
                          to={guardianDrillHref(row.guardian_id)}
                          className="hub-finance-page__dash-link"
                        >
                          <span className="hub-relatorios__cell-primary">{row.name}</span>
                        </Link>
                      ) : (
                        <span className="hub-relatorios__cell-primary">{row.name}</span>
                      )}
                      {row.species ? (
                        <div className="hub-relatorios__cell-meta">{row.species}</div>
                      ) : null}
                    </td>
                    <td>{formatDateBr(row.next_birthday)}</td>
                    <td className="hub-finance-page__td-num">
                      {row.days_until === 0 ? (
                        <span className="hub-clientes__pill hub-finance-page__pill--warning">
                          Hoje
                        </span>
                      ) : (
                        `${row.days_until}d`
                      )}
                    </td>
                    <td>
                      {row.kind === 'pet' && row.guardian_id ? (
                        <Link
                          to={guardianDrillHref(row.guardian_id)}
                          className="hub-finance-page__dash-link"
                        >
                          {row.guardian_name || '—'}
                        </Link>
                      ) : (
                        row.guardian_name || '—'
                      )}
                    </td>
                    <td>{row.phone || '—'}</td>
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

export default HubRelatoriosBirthdays;
