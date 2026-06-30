import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { hubFinancialApi, type HubFinanceDayBoardItem } from '../../api/hubFinancialApi';
import { HubViewDateToolbar, type HubViewMode } from '../../components/HubViewDateToolbar';
import { formatYmd, parseIsoYmd, todayYmd } from '../../utils/hubCalendar';
import { addDays, startOfWeekMonday } from '../agenda/agendaModel';
import { ComandaCheckoutDrawer } from './ComandaCheckoutDrawer';
import { FinanceDayBoardTable } from './FinanceDayBoardTable';
import { HubLoading } from '../../components/HubLoading';

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function datesForView(cursorIso: string, view: HubViewMode): string[] {
  const cursor = parseIsoYmd(cursorIso) ?? new Date();
  if (view === 'day') return [formatYmd(cursor)];
  if (view === 'week') {
    const start = startOfWeekMonday(cursor);
    return Array.from({ length: 7 }, (_, i) => formatYmd(addDays(start, i)));
  }
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  return Array.from({ length: lastDay }, (_, i) => formatYmd(new Date(y, m, i + 1)));
}

function mergeDayBoardItems(itemsArrays: HubFinanceDayBoardItem[][]): HubFinanceDayBoardItem[] {
  const seen = new Set<string>();
  const out: HubFinanceDayBoardItem[] = [];
  for (const items of itemsArrays) {
    for (const item of items) {
      const key = `${item.origin_type}:${item.origin_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out.sort((a, b) => {
    const ta = a.starts_at ? new Date(a.starts_at).getTime() : 0;
    const tb = b.starts_at ? new Date(b.starts_at).getTime() : 0;
    return ta - tb;
  });
}

function shiftCursorDate(cursorIso: string, view: HubViewMode, delta: number): string {
  const d = parseIsoYmd(cursorIso) ?? new Date();
  if (view === 'day') return formatYmd(addDays(d, delta));
  if (view === 'week') return formatYmd(addDays(d, delta * 7));
  const next = new Date(d);
  next.setMonth(next.getMonth() + delta);
  return formatYmd(next);
}

type StatusFilter = 'all' | 'pendente' | 'parcial' | 'enviado_caixa';

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'enviado_caixa', label: 'Enviado pelo caixa' },
  { id: 'pendente', label: 'Pendente' },
  { id: 'parcial', label: 'Parcialmente pago' },
];

export type FinanceDayBoardSectionProps = {
  clinicId: string;
  unitId: string;
  canCreateReceivable: boolean;
  canFinancialWrite: boolean;
  onLoaded?: () => void;
};

export function FinanceDayBoardSection({
  clinicId,
  unitId,
  canCreateReceivable,
  canFinancialWrite,
  onLoaded,
}: FinanceDayBoardSectionProps) {
  const navigate = useNavigate();
  const [dayBoardItems, setDayBoardItems] = useState<HubFinanceDayBoardItem[]>([]);
  const [dayBoardDate, setDayBoardDate] = useState(() => todayYmd());
  const [view, setView] = useState<HubViewMode>('day');
  const [dayBoardBusy, setDayBoardBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dayBoardSearch, setDayBoardSearch] = useState('');
  const [checkoutComandaId, setCheckoutComandaId] = useState<string | null>(null);

  const loadDayBoard = useCallback(
    async (dateOverride?: string, viewOverride?: HubViewMode) => {
      const date = dateOverride ?? dayBoardDate;
      const activeView = viewOverride ?? view;
      setDayBoardBusy(true);
      try {
        const dates = datesForView(date, activeView);
        const results = await Promise.all(
          dates.map((d) => hubFinancialApi.getDayBoard(clinicId, unitId, d, { billing_scope: 'financeiro' })),
        );
        setDayBoardItems(mergeDayBoardItems(results));
        onLoaded?.();
      } catch {
        setDayBoardItems([]);
      } finally {
        setDayBoardBusy(false);
      }
    },
    [clinicId, unitId, dayBoardDate, view, onLoaded],
  );

  useEffect(() => {
    void loadDayBoard();
  }, [loadDayBoard]);

  const dayBoardFiltered = useMemo(() => {
    const searchTerm = normalizeText(dayBoardSearch.trim());
    let result = searchTerm
      ? dayBoardItems.filter((item) => {
          const guardian = normalizeText(item.guardian?.full_name ?? '');
          const pet = normalizeText(item.pet?.name ?? '');
          const svcNames = normalizeText((item.services ?? []).map((s) => s.name).join(' '));
          const label = normalizeText(item.origin_label ?? '');
          return guardian.includes(searchTerm) || pet.includes(searchTerm) || svcNames.includes(searchTerm) || label.includes(searchTerm);
        })
      : dayBoardItems;

    if (statusFilter !== 'all') {
      result = result.filter((it) => {
        if (statusFilter === 'enviado_caixa') return !!it.billing.finance_handoff_at;
        if (statusFilter === 'pendente') return it.billing.receivable_status === 'pending';
        if (statusFilter === 'parcial') return it.billing.receivable_status === 'partially_paid';
        return true;
      });
    }

    return result;
  }, [dayBoardItems, dayBoardSearch, statusFilter]);

  const onEditComanda = (item: HubFinanceDayBoardItem) => {
    if (!item.billing.comanda_id) return;
    navigate(`/hub/financeiro/comanda/${item.billing.comanda_id}`);
  };

  const onViewComanda = (item: HubFinanceDayBoardItem) => {
    if (!item.billing.comanda_id) return;
    navigate(`/hub/financeiro/comanda/${item.billing.comanda_id}`);
  };

  const onCheckout = (item: HubFinanceDayBoardItem) => {
    if (!item.billing.comanda_id) return;
    const { billing } = item;
    if (billing.has_receivable && (billing.receivable_status === 'pending' || billing.receivable_status === 'partially_paid')) {
      const rid = billing.active_receivable_id;
      const q = rid ? `?receivable_id=${encodeURIComponent(rid)}` : '';
      navigate(`/hub/financeiro/comanda/${billing.comanda_id}${q}`);
      return;
    }
    setCheckoutComandaId(billing.comanda_id);
  };

  const onShareComanda = (item: HubFinanceDayBoardItem) => {
    if (item.billing.comanda_id) {
      navigate(`/hub/financeiro/comanda/${item.billing.comanda_id}/pronto-para-envio`);
    }
  };

  const handleDateChange = (iso: string) => {
    setDayBoardDate(iso);
    if (iso === todayYmd()) setView('day');
    void loadDayBoard(iso);
  };

  const handleViewChange = (next: HubViewMode) => {
    setView(next);
    void loadDayBoard(dayBoardDate, next);
  };

  const emptyMessage =
    view === 'day'
      ? 'Nenhum atendimento com cobrança relevante para esta data nesta unidade.'
      : view === 'week'
        ? 'Nenhum atendimento com cobrança relevante nesta semana nesta unidade.'
        : 'Nenhum atendimento com cobrança relevante neste mês nesta unidade.';

  return (
    <>
      <HubViewDateToolbar
        view={view}
        onViewChange={handleViewChange}
        dateIso={dayBoardDate}
        onDateChange={handleDateChange}
        onNavigatePrev={() => {
          const prev = shiftCursorDate(dayBoardDate, view, -1);
          setDayBoardDate(prev);
          void loadDayBoard(prev);
        }}
        onNavigateNext={() => {
          const next = shiftCursorDate(dayBoardDate, view, 1);
          setDayBoardDate(next);
          void loadDayBoard(next);
        }}
        dateFieldId="finance-dayboard-date"
        disabled={dayBoardBusy}
        searchValue={dayBoardSearch}
        onSearchChange={setDayBoardSearch}
        searchPlaceholder="Buscar pet, tutor ou serviço…"
      />

      <div className="hub-dayboard__status-filters" role="group" aria-label="Filtrar por status">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`hub-dayboard__toggle-btn${statusFilter === f.id ? ' hub-dayboard__toggle-btn--active' : ''}`}
            onClick={() => setStatusFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {dayBoardBusy ? (
        <HubLoading variant="block" label="Carregando atendimentos…" />
      ) : dayBoardFiltered.length === 0 ? (
        <div className="hub-dayboard__empty">{emptyMessage}</div>
      ) : (
        <FinanceDayBoardTable
          mode="financeiro"
          items={dayBoardFiltered}
          canCreateReceivable={canCreateReceivable}
          canFinancialWrite={canFinancialWrite}
          onEditComanda={onEditComanda}
          onViewComanda={onViewComanda}
          onCheckout={onCheckout}
          onShareComanda={onShareComanda}
          busy={dayBoardBusy}
        />
      )}

      {checkoutComandaId && (
        <ComandaCheckoutDrawer
          mode="financeiro"
          open={!!checkoutComandaId}
          onClose={() => setCheckoutComandaId(null)}
          clinicId={clinicId}
          unitId={unitId}
          comandaId={checkoutComandaId}
          onSuccess={({ comandaId, receivableIds }) => {
            setCheckoutComandaId(null);
            void loadDayBoard();
            const rid = receivableIds[0];
            navigate(
              rid
                ? `/hub/financeiro/comanda/${comandaId}?receivable_id=${rid}`
                : `/hub/financeiro/comanda/${comandaId}`,
            );
          }}
        />
      )}
    </>
  );
}
