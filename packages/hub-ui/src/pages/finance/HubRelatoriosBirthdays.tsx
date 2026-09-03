import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  hubFinancialApi,
  type HubBirthdaysReport,
} from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
import { guardianDrillHref } from './hubRelatoriosLinks';
import { formatDateBr } from './hubRelatoriosUtils';

type Props = { clinicId: string; days: number };

export const HubRelatoriosBirthdays: React.FC<Props> = ({ clinicId, days }) => {
  const { showError } = useAlert();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HubBirthdaysReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await hubFinancialApi.getBirthdaysReport(clinicId, { days }));
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar aniversariantes');
    } finally {
      setLoading(false);
    }
  }, [clinicId, days, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <HubLoading variant="block" label="Carregando aniversariantes…" />;

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    title: 'Aniversariantes',
    subtitle: `Próximos ${days} dias`,
    slug: 'aniversariantes',
    headers: ['Tipo', 'Nome', 'Nascimento', 'Próximo', 'Em (dias)', 'Tutor', 'Telefone', 'Espécie'],
    rows: (data?.items ?? []).map((row) => [
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

  return (
    <>
      <div className="hub-relatorios__actions">
        <HubRelatoriosExportButton onClick={onExport} onPdf={onPdf} disabled={!data?.items.length} />
      </div>

      <div className="hub-servicos__metrics" style={{ marginBottom: 20 }}>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Total</div>
            <div className="hub-servicos__metric-value">{data?.summary.total ?? 0}</div>
            <div className="hub-servicos__metric-sub">Próximos {days} dias</div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Tutores</div>
            <div className="hub-servicos__metric-value">{data?.summary.guardians ?? 0}</div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Pets</div>
            <div className="hub-servicos__metric-value">{data?.summary.pets ?? 0}</div>
          </div>
        </div>
      </div>

      {(data?.items.length ?? 0) === 0 ? (
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
              {data!.items.map((row) => (
                <tr key={`${row.kind}:${row.id}`}>
                  <td>{row.kind === 'pet' ? 'Pet' : 'Tutor'}</td>
                  <td>
                    {row.kind === 'guardian' && row.guardian_id ? (
                      <Link to={guardianDrillHref(row.guardian_id)} className="hub-finance-page__dash-link">
                        {row.name}
                      </Link>
                    ) : (
                      row.name
                    )}
                    {row.species ? (
                      <div className="hub-clientes__muted" style={{ fontSize: 12 }}>
                        {row.species}
                      </div>
                    ) : null}
                  </td>
                  <td>{formatDateBr(row.next_birthday)}</td>
                  <td className="hub-finance-page__td-num">
                    {row.days_until === 0 ? 'Hoje' : `${row.days_until}d`}
                  </td>
                  <td>
                    {row.kind === 'pet' && row.guardian_id ? (
                      <Link to={guardianDrillHref(row.guardian_id)} className="hub-finance-page__dash-link">
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
    </>
  );
};

export default HubRelatoriosBirthdays;
