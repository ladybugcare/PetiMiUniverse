import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { hubEncountersApi, type DayBoardItem } from '../../api/hubClinicalApi';
import { HubLoading } from '../../components/HubLoading';
import { HubPrintLayout } from '../../components/print/HubPrintLayout';
import {
  HubPrintFilters,
  describeActivePrintFilters,
  matchesPrintMultiFilter,
  usePrintQueryMultiFilter,
  usePrintServiceTypeFilter,
} from '../../components/print/HubPrintFilters';
import {
  formatDateLongPt,
  formatTimeHm,
  parseYmdLocal,
  toYmdLocal,
} from '../../components/print/printUtils';
import { useAlert } from '../../components/AlertProvider';
import { dayRangeIsoLocal } from '../agenda/agendaFilters';
import { OPERATIONAL_CLINICAL_SERVICE_GROUPS } from '../../utils/serviceTypeSlug';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';
import '../clientes/clientes.css';

const STATUS_OPTIONS = [
  { value: 'waiting', label: 'Aguardando' },
  { value: 'in_progress', label: 'Em atendimento' },
  { value: 'done', label: 'Finalizados' },
];

const STATUS_LABEL: Record<string, string> = {
  waiting: 'Aguardando',
  checked_in: 'Aguardando',
  confirmed: 'Confirmado',
  pending_confirm: 'A confirmar',
  in_progress: 'Em atendimento',
  awaiting_exams: 'Em exames',
  exams_returned: 'Retornou dos exames',
  completed: 'Finalizado',
  done: 'Finalizado',
  cancelled: 'Cancelado',
};

function effectiveStatus(item: DayBoardItem): string {
  const stRaw = (item.status as string) || item.appointment_status || 'waiting';
  const phase = item.operational_phase;
  if (stRaw === 'in_progress' && phase === 'awaiting_exams') return 'awaiting_exams';
  if (stRaw === 'in_progress' && phase === 'exams_returned') return 'exams_returned';
  return stRaw;
}

function statusBucket(st: string): 'waiting' | 'in_progress' | 'done' | 'other' {
  if (['waiting', 'checked_in', 'confirmed', 'pending_confirm'].includes(st)) return 'waiting';
  if (['in_progress', 'awaiting_exams', 'exams_returned'].includes(st)) return 'in_progress';
  if (['completed', 'done'].includes(st)) return 'done';
  return 'other';
}

const HubImpressoesClinicaPage: React.FC = () => {
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError } = useAlert();
  const [searchParams] = useSearchParams();
  const dateYmd = toYmdLocal(parseYmdLocal(searchParams.get('date')));
  const [statusFilter, setStatusFilter] = usePrintQueryMultiFilter('status');
  const { serviceIds, setServiceIds, options: serviceOptions } = usePrintServiceTypeFilter(
    OPERATIONAL_CLINICAL_SERVICE_GROUPS,
  );
  const [rows, setRows] = useState<DayBoardItem[]>([]);
  const [loading, setLoading] = useState(true);

  const canRead = hasPermission('hub.clinic.read');
  const backHref = `/hub/impressoes?date=${encodeURIComponent(dateYmd)}`;

  useEffect(() => {
    if (!clinicId || permLoading || !canRead) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const range = dayRangeIsoLocal(parseYmdLocal(dateYmd));
    (async () => {
      setLoading(true);
      try {
        const res = await hubEncountersApi.dayBoard(clinicId, range, {
          unitId: unitId ?? undefined,
        });
        if (!cancelled) setRows(res.items ?? []);
      } catch (e: unknown) {
        if (!cancelled) {
          showError((e as Error)?.message || 'Erro ao carregar fila da clínica');
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId, unitId, dateYmd, canRead, permLoading, showError]);

  const filtered = useMemo(() => {
    return rows
      .filter((item) => {
        const st = effectiveStatus(item);
        if (st === 'cancelled') return false;
        if (!matchesPrintMultiFilter(statusFilter, statusBucket(st))) return false;
        if (!matchesPrintMultiFilter(serviceIds, item.service_type?.id)) return false;
        return true;
      })
      .sort((a, b) => {
        const ta = a.starts_at || a.started_at || '';
        const tb = b.starts_at || b.started_at || '';
        return String(ta).localeCompare(String(tb));
      });
  }, [rows, statusFilter, serviceIds]);

  const filterDefs = [
    {
      id: 'status',
      label: 'Status',
      value: statusFilter,
      options: STATUS_OPTIONS,
      onChange: setStatusFilter,
      placeholder: 'Todos os status',
    },
    {
      id: 'servico',
      label: 'Serviço',
      value: serviceIds,
      options: serviceOptions,
      onChange: setServiceIds,
      placeholder: 'Todos os serviços',
    },
  ];

  const filterSummary = describeActivePrintFilters(filterDefs);

  if (!permLoading && !canRead) {
    return <Navigate to="/hub/impressoes" replace />;
  }

  return (
    <HubPrintLayout
      title="Clínica — fila do dia"
      subtitle={formatDateLongPt(dateYmd)}
      backTo={backHref}
      backLabel="Impressões"
      filters={<HubPrintFilters filters={filterDefs} />}
      filterSummary={filterSummary}
    >
      {loading ? (
        <HubLoading variant="inline" size="sm" label="Carregando fila…" />
      ) : filtered.length === 0 ? (
        <p className="hub-print-sheet__empty">Nenhum atendimento com os filtros selecionados.</p>
      ) : (
        <div className="hub-print-table-wrap">
          <table className="hub-print-table">
            <thead>
              <tr>
                <th>Horário</th>
                <th>Pet</th>
                <th>Tutor</th>
                <th>Serviço</th>
                <th>Profissional</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const st = effectiveStatus(item);
                const key = item.encounter_id || item.appointment_id || `${item.pet?.name}-${item.starts_at}`;
                const time = formatTimeHm(
                  item.starts_at || item.started_at || undefined,
                );
                return (
                  <tr key={key}>
                    <td>{time}</td>
                    <td>{item.pet?.name || (item.kind === 'appointment_slot' && !item.pet_id ? 'A identificar' : '—')}</td>
                    <td>{item.guardian?.full_name || '—'}</td>
                    <td>{item.service_type?.name || item.title || 'Consulta'}</td>
                    <td>{item.staff_member?.full_name || '—'}</td>
                    <td>{STATUS_LABEL[st] ?? st}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </HubPrintLayout>
  );
};

export default HubImpressoesClinicaPage;
