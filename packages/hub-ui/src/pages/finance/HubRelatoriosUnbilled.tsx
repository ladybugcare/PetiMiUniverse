import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePermissions } from '@petimi/web-core';
import {
  hubFinancialApi,
  type HubFinanceUnbilledItem,
  type HubFinanceUnbilledSourceType,
} from '../../api/hubFinancialApi';
import { hubComandaApi, type HubComandaOriginType } from '../../api/hubComandaApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { downloadCsv, reportCsvFilename } from './hubRelatoriosCsv';
import { caixaSemComandaHref, guardianDrillHref } from './hubRelatoriosLinks';
import { defaultRangeForPreset, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatBrl, formatDateBr } from './hubRelatoriosUtils';

const SOURCE_LABELS: Record<string, string> = {
  quote: 'Orçamento',
  appointment: 'Agendamento',
  encounter: 'Atendimento',
  grooming_session: 'Banho e tosa',
  boarding_reservation: 'Hotel & Creche',
};

const OPENABLE_ORIGINS = new Set<HubFinanceUnbilledSourceType>([
  'appointment',
  'grooming_session',
  'encounter',
  'boarding_reservation',
  'quote',
]);

type Props = {
  clinicId: string;
  unitId: string;
  period: HubReportPeriod;
};

function periodBounds(period: HubReportPeriod): { from: string; to: string } {
  if (period.mode === 'range') return { from: period.from, to: period.to };
  return defaultRangeForPreset(period.days);
}

export const HubRelatoriosUnbilled: React.FC<Props> = ({ clinicId, unitId, period }) => {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const { showError, showSuccess } = useAlert();
  const [loading, setLoading] = useState(false);
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const [items, setItems] = useState<HubFinanceUnbilledItem[]>([]);

  const canOpenComanda = hasPermission('hub.receivables.create');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await hubFinancialApi.listUnbilledCompleted(clinicId, unitId));
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar cobranças não geradas');
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const bounds = useMemo(() => periodBounds(period), [period]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      const at = it.completed_at?.slice(0, 10);
      if (!at) return true;
      return at >= bounds.from && at <= bounds.to;
    });
  }, [items, bounds]);

  const totalEst = useMemo(
    () => filtered.reduce((acc, it) => acc + Number(it.estimated_amount || 0), 0),
    [filtered],
  );

  const openComandaForRow = useCallback(
    async (row: HubFinanceUnbilledItem) => {
      if (!OPENABLE_ORIGINS.has(row.source_type)) {
        navigate(caixaSemComandaHref(row.completed_at));
        return;
      }
      if (!canOpenComanda) {
        showError('Sem permissão para abrir comanda. Use o Caixa com o filtro “Sem comanda”.');
        navigate(caixaSemComandaHref(row.completed_at));
        return;
      }

      const key = `${row.source_type}:${row.source_id}`;
      setOpeningKey(key);
      try {
        const detail = await hubComandaApi.openComanda({
          clinic_id: clinicId,
          origin_type: row.source_type as HubComandaOriginType,
          origin_id: row.source_id,
          unit_id: unitId,
        });
        const comandaId = (detail.comanda as Record<string, unknown>)?.id as string | undefined;
        showSuccess('Comanda aberta.');
        if (comandaId) {
          navigate(`/hub/caixa/comanda/${comandaId}`);
        } else {
          navigate(caixaSemComandaHref(row.completed_at));
        }
      } catch (e: unknown) {
        const msg = (e as Error)?.message ?? '';
        if (msg.includes('Já existe comanda aberta')) {
          try {
            const existing = await hubComandaApi.getComandaByOrigin({
              clinic_id: clinicId,
              origin_type: row.source_type as HubComandaOriginType,
              origin_id: row.source_id,
            });
            const comandaId = (existing.comanda as Record<string, unknown> | undefined)?.id as string | undefined;
            if (comandaId) {
              navigate(`/hub/caixa/comanda/${comandaId}`);
              return;
            }
          } catch {
            /* fall through */
          }
          showError('Já existe uma comanda aberta. Abrindo o Caixa filtrado.');
          navigate(caixaSemComandaHref(row.completed_at));
        } else {
          showError(msg || 'Erro ao abrir comanda');
        }
      } finally {
        setOpeningKey(null);
      }
    },
    [canOpenComanda, clinicId, navigate, showError, showSuccess, unitId],
  );

  if (loading) return <HubLoading variant="block" label="Carregando cobranças não geradas…" />;

  const onExport = () => {
    downloadCsv(
      reportCsvFilename('cobranca-nao-gerada'),
      ['Conclusão', 'Origem', 'Cliente', 'Pet', 'Status', 'Estimativa'],
      filtered.map((row) => [
        row.completed_at,
        SOURCE_LABELS[row.source_type] ?? row.source_type,
        row.guardian?.full_name ?? null,
        row.pet?.name ?? null,
        row.operational_status,
        row.estimated_amount,
      ]),
    );
  };

  return (
    <>
      <div className="hub-relatorios__actions">
        <HubRelatoriosExportButton onClick={onExport} disabled={!filtered.length} />
        <Link to={caixaSemComandaHref()} className="hub-finance-page__dash-link">
          Abrir no Caixa (sem comanda)
        </Link>
      </div>

      <div className="hub-servicos__metrics" style={{ marginBottom: 20 }}>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Itens sem cobrança</div>
            <div className="hub-servicos__metric-value">{filtered.length}</div>
            <div className="hub-servicos__metric-sub">
              {bounds.from} a {bounds.to}
            </div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Estimativa</div>
            <div className="hub-servicos__metric-value">{formatBrl(totalEst)}</div>
            <div className="hub-servicos__metric-sub">Soma dos valores estimados</div>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <HubRelatoriosEmpty
          title="Nada pendente de cobrança"
          description="Não há serviços concluídos sem recebível no período filtrado."
        />
      ) : (
        <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
          <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table hub-relatorios__table--clickable">
            <thead>
              <tr>
                <th>Conclusão</th>
                <th>Origem</th>
                <th>Cliente</th>
                <th>Pet</th>
                <th>Status</th>
                <th className="hub-finance-page__th-num">Estimativa</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const rowKey = `${row.source_type}:${row.source_id}`;
                const busy = openingKey === rowKey;
                return (
                  <tr
                    key={rowKey}
                    tabIndex={0}
                    className="hub-relatorios__row-link"
                    aria-label={`Abrir comanda de ${row.guardian?.full_name ?? row.origin_label}`}
                    onClick={() => {
                      if (!openingKey) void openComandaForRow(row);
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && !openingKey) {
                        e.preventDefault();
                        void openComandaForRow(row);
                      }
                    }}
                  >
                    <td>{formatDateBr(row.completed_at)}</td>
                    <td>
                      <div>{SOURCE_LABELS[row.source_type] ?? row.source_type}</div>
                      <div className="hub-clientes__muted" style={{ fontSize: 12 }}>
                        {row.origin_label}
                      </div>
                    </td>
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
                    <td>{row.pet?.name ?? '—'}</td>
                    <td>{row.operational_status || '—'}</td>
                    <td className="hub-finance-page__td-num">{formatBrl(row.estimated_amount)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="hub-clientes__btn hub-clientes__btn--ghost"
                        disabled={!!openingKey}
                        onClick={() => void openComandaForRow(row)}
                      >
                        {busy ? 'Abrindo…' : 'Abrir comanda'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

export default HubRelatoriosUnbilled;
