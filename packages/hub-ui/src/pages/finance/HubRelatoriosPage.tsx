import React, { useCallback, useEffect, useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { HubRelatoriosCatalog } from './HubRelatoriosCatalog';
import { HubRelatoriosEmailSchedules } from './HubRelatoriosEmailSchedules';
import { HubRelatoriosFinanceOverview } from './HubRelatoriosFinanceOverview';
import { HubRelatoriosPendingPayments } from './HubRelatoriosPendingPayments';
import { HubRelatoriosSalesAdjustments } from './HubRelatoriosSalesAdjustments';
import { HubRelatoriosCommissions } from './HubRelatoriosCommissions';
import { HubRelatoriosUnbilled } from './HubRelatoriosUnbilled';
import { HubRelatoriosCashFlow } from './HubRelatoriosCashFlow';
import { HubRelatoriosTopClients } from './HubRelatoriosTopClients';
import { HubRelatoriosClientCohorts } from './HubRelatoriosClientCohorts';
import { HubRelatoriosBirthdays } from './HubRelatoriosBirthdays';
import { HubRelatoriosPackages } from './HubRelatoriosPackages';
import { HubRelatoriosStockPosition } from './HubRelatoriosStockPosition';
import { HubRelatoriosStockMovements } from './HubRelatoriosStockMovements';
import { HubRelatoriosStockAbc } from './HubRelatoriosStockAbc';
import { HubRelatoriosStockTurnover } from './HubRelatoriosStockTurnover';
import { HubRelatoriosAbsentClients } from './HubRelatoriosAbsentClients';
import { HubRelatoriosNoShows } from './HubRelatoriosNoShows';
import { HubRelatoriosBoardingOccupancy } from './HubRelatoriosBoardingOccupancy';
import { HubRelatoriosGroomingProductivity } from './HubRelatoriosGroomingProductivity';
import { HubRelatoriosVaccinesDue } from './HubRelatoriosVaccinesDue';
import { HubRelatoriosExams } from './HubRelatoriosExams';
import { HubRelatoriosPeriodToolbar } from './HubRelatoriosPeriodToolbar';
import {
  HUB_REPORTS,
  parseHubReportId,
  reportAllowed,
  type HubReportId,
} from './hubRelatoriosConfig';
import {
  parseReportPeriodFromSearch,
  type HubReportPeriod,
} from './hubRelatoriosPeriod';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import './hub-finance-page.css';

function writePeriodToParams(next: URLSearchParams, period: HubReportPeriod) {
  if (period.mode === 'range') {
    next.set('from', period.from);
    next.set('to', period.to);
    next.delete('days');
  } else {
    next.set('days', String(period.days));
    next.delete('from');
    next.delete('to');
  }
}

const HubRelatoriosPage: React.FC = () => {
  const { hasPermission, loading: permLoading } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();
  const reportId = parseHubReportId(searchParams.get('relatorio'));

  const canReports = hasPermission('hub.reports.read');
  const canFinancial = hasPermission('hub.financial.read');
  const canInventory = hasPermission('hub.inventory.read');
  const canGuardians = hasPermission('hub.guardians.read');
  const canAppointments = hasPermission('hub.appointments.read');
  const canBoarding = hasPermission('boarding.reservations.read');
  const canGrooming = hasPermission('grooming.queue.read');
  const canClinic = hasPermission('hub.clinic.read');
  const canAccess =
    canReports ||
    canFinancial ||
    canInventory ||
    canGuardians ||
    canAppointments ||
    canBoarding ||
    canGrooming ||
    canClinic;

  const activeReport = useMemo(() => {
    if (!reportId) return null;
    const def = HUB_REPORTS.find((r) => r.id === reportId);
    if (!def || !reportAllowed(hasPermission, def.permission)) return null;
    return def;
  }, [reportId, hasPermission]);

  const period = useMemo(() => {
    const absent = activeReport?.periodFilter === 'absent';
    const lookahead = activeReport?.periodFilter === 'lookahead';
    return parseReportPeriodFromSearch(searchParams, { absent, lookahead });
  }, [searchParams, activeReport]);

  const periodInvalid =
    period.mode === 'range' && period.from > period.to;

  const setReport = useCallback(
    (id: HubReportId | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (id) {
          next.set('relatorio', id);
          const def = HUB_REPORTS.find((r) => r.id === id);
          if (def?.periodFilter === 'absent') {
            next.delete('from');
            next.delete('to');
            const d = Number(next.get('days') || '60');
            next.set('days', String([30, 60, 90, 180].includes(d) ? d : 60));
          } else if (def?.periodFilter === 'lookahead') {
            next.delete('from');
            next.delete('to');
            const d = Number(next.get('days') || '30');
            next.set('days', String([7, 14, 30, 60].includes(d) ? d : 30));
          } else if (def?.periodFilter === 'standard') {
            if (!next.get('from') && !next.get('to') && !next.get('days')) {
              next.set('days', '30');
            }
          }
        } else {
          next.delete('relatorio');
        }
        return next;
      });
    },
    [setSearchParams],
  );

  const setPeriod = useCallback(
    (nextPeriod: HubReportPeriod) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        writePeriodToParams(next, nextPeriod);
        return next;
      });
    },
    [setSearchParams],
  );

  useEffect(() => {
    if (permLoading) return;
    if (reportId && !activeReport) {
      setReport(null);
    }
  }, [permLoading, reportId, activeReport, setReport]);

  if (!permLoading && !canAccess) {
    return <Navigate to="/hub/clientes" replace />;
  }

  if (!clinicId) {
    return (
      <div className="hub-clientes hub-servicos-page hub-finance-page">
        <div className="hub-clientes__main">
          <p className="hub-clientes__muted">Selecione uma clínica no cabeçalho.</p>
        </div>
      </div>
    );
  }

  const needsUnit = activeReport?.requiresUnit;
  const periodFilter = activeReport?.periodFilter;

  return (
    <div className="hub-clientes hub-servicos-page hub-finance-page hub-relatorios-page">
      <div className="hub-clientes__main">
        <div className="hub-clientes__title-block">
          {activeReport ? (
            <button type="button" className="hub-relatorios__back" onClick={() => setReport(null)}>
              <ArrowLeft size={18} aria-hidden />
              Voltar ao catálogo
            </button>
          ) : null}
          <h1 className="hub-clientes__title">{activeReport ? activeReport.title : 'Relatórios'}</h1>
          <p className="hub-clientes__subtitle">
            {activeReport
              ? activeReport.description
              : 'Central de relatórios: financeiro, estoque, clientes e operação.'}
          </p>
        </div>

        {!activeReport ? (
          <>
            <HubRelatoriosCatalog hasPermission={hasPermission} onSelectReport={setReport} />
            {canReports || canFinancial ? (
              <HubRelatoriosEmailSchedules clinicId={clinicId} unitId={unitId} />
            ) : null}
          </>
        ) : (
          <>
            {periodFilter ? (
              <HubRelatoriosPeriodToolbar
                variant={periodFilter}
                period={period}
                onChange={setPeriod}
              />
            ) : null}

            {needsUnit && !unitId ? (
              <p className="hub-clientes__muted">Selecione uma unidade no cabeçalho para ver este relatório.</p>
            ) : null}

            {periodInvalid ? (
              <p className="hub-clientes__muted">Ajuste o intervalo de datas para carregar o relatório.</p>
            ) : null}

            {!periodInvalid && activeReport.id === 'finance-overview' && unitId ? (
              <HubRelatoriosFinanceOverview clinicId={clinicId} unitId={unitId} period={period} />
            ) : null}

            {!periodInvalid && activeReport.id === 'pending-payments' && unitId ? (
              <HubRelatoriosPendingPayments clinicId={clinicId} unitId={unitId} />
            ) : null}

            {!periodInvalid && activeReport.id === 'sales-adjustments' && unitId ? (
              <HubRelatoriosSalesAdjustments clinicId={clinicId} unitId={unitId} period={period} />
            ) : null}

            {!periodInvalid && activeReport.id === 'commissions' && unitId ? (
              <HubRelatoriosCommissions clinicId={clinicId} unitId={unitId} period={period} />
            ) : null}

            {!periodInvalid && activeReport.id === 'unbilled' && unitId ? (
              <HubRelatoriosUnbilled clinicId={clinicId} unitId={unitId} period={period} />
            ) : null}

            {!periodInvalid && activeReport.id === 'cash-flow' && unitId ? (
              <HubRelatoriosCashFlow clinicId={clinicId} unitId={unitId} period={period} />
            ) : null}

            {!periodInvalid && activeReport.id === 'top-clients' && unitId ? (
              <HubRelatoriosTopClients clinicId={clinicId} unitId={unitId} period={period} />
            ) : null}

            {!periodInvalid && activeReport.id === 'client-cohorts' ? (
              <HubRelatoriosClientCohorts clinicId={clinicId} unitId={unitId} period={period} />
            ) : null}

            {!periodInvalid && activeReport.id === 'birthdays' && period.mode === 'preset' ? (
              <HubRelatoriosBirthdays clinicId={clinicId} days={period.days} />
            ) : null}

            {!periodInvalid && activeReport.id === 'packages' ? (
              <HubRelatoriosPackages clinicId={clinicId} period={period} />
            ) : null}

            {activeReport.id === 'stock-position' ? <HubRelatoriosStockPosition clinicId={clinicId} /> : null}

            {!periodInvalid && activeReport.id === 'stock-movements' ? (
              <HubRelatoriosStockMovements clinicId={clinicId} period={period} />
            ) : null}

            {!periodInvalid && activeReport.id === 'stock-abc' ? (
              <HubRelatoriosStockAbc clinicId={clinicId} period={period} />
            ) : null}

            {!periodInvalid && activeReport.id === 'stock-turnover' ? (
              <HubRelatoriosStockTurnover clinicId={clinicId} period={period} />
            ) : null}

            {!periodInvalid && activeReport.id === 'absent-clients' && period.mode === 'preset' ? (
              <HubRelatoriosAbsentClients clinicId={clinicId} unitId={unitId} days={period.days} />
            ) : null}

            {!periodInvalid && activeReport.id === 'no-shows' ? (
              <HubRelatoriosNoShows clinicId={clinicId} unitId={unitId} period={period} />
            ) : null}

            {!periodInvalid && activeReport.id === 'boarding-occupancy' ? (
              <HubRelatoriosBoardingOccupancy clinicId={clinicId} unitId={unitId} period={period} />
            ) : null}

            {!periodInvalid && activeReport.id === 'grooming-productivity' ? (
              <HubRelatoriosGroomingProductivity clinicId={clinicId} unitId={unitId} period={period} />
            ) : null}

            {!periodInvalid && activeReport.id === 'vaccines-due' && period.mode === 'preset' ? (
              <HubRelatoriosVaccinesDue clinicId={clinicId} days={period.days} />
            ) : null}

            {!periodInvalid && activeReport.id === 'exams-requested' ? (
              <HubRelatoriosExams clinicId={clinicId} period={period} />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};

export default HubRelatoriosPage;
