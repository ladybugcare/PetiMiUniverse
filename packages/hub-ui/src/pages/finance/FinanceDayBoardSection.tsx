import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Coins } from 'lucide-react';
import { hubFinancialApi, type HubFinanceDayBoardItem } from '../../api/hubFinancialApi';
import { HubViewDateToolbar, type HubViewMode } from '../../components/HubViewDateToolbar';
import { formatYmd, parseIsoYmd, todayYmd } from '../../utils/hubCalendar';
import { addDays, startOfWeekMonday } from '../agenda/agendaModel';
import { ComandaCheckoutDrawer } from './ComandaCheckoutDrawer';
import { HubComandaReceivableDrawer } from './HubComandaReceivableDrawer';
import { BatchChargeDrawer } from './BatchChargeDrawer';
import {
  assertSameGuardian,
  dayBoardItemToBatchChargeItem,
  isDayBoardBatchSelectable,
  type BatchChargeItem,
} from './batchChargeItems';
import { FinanceDayBoardTable } from './FinanceDayBoardTable';
import { HubLoading } from '../../components/HubLoading';
import { useAlert } from '../../components/AlertProvider';

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function rangeForView(cursorIso: string, view: HubViewMode): { from: string; to: string } | null {
  if (view === 'all') return null;
  const dates = datesForView(cursorIso, view);
  return { from: dates[0], to: dates[dates.length - 1] };
}

function datesForView(cursorIso: string, view: Exclude<HubViewMode, 'all'>): string[] {
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

function shiftCursorDate(cursorIso: string, view: Exclude<HubViewMode, 'all'>, delta: number): string {
  const d = parseIsoYmd(cursorIso) ?? new Date();
  if (view === 'day') return formatYmd(addDays(d, delta));
  if (view === 'week') return formatYmd(addDays(d, delta * 7));
  const next = new Date(d);
  next.setMonth(next.getMonth() + delta);
  return formatYmd(next);
}

type StatusFilter = 'all' | 'pendente' | 'parcial' | 'enviado_caixa';
type OriginFilter =
  | 'all'
  | 'appointment'
  | 'grooming_session'
  | 'boarding_reservation'
  | 'encounter'
  | 'quote'
  | 'other';

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'pendente', label: 'Cobrança pendente' },
  { id: 'parcial', label: 'Parcialmente pago' },
  { id: 'enviado_caixa', label: 'Enviado pelo caixa' },
  { id: 'all', label: 'Todas as cobranças' },
];

const ORIGIN_FILTERS: { id: OriginFilter; label: string }[] = [
  { id: 'all', label: 'Todas as origens' },
  { id: 'appointment', label: 'Agenda' },
  { id: 'grooming_session', label: 'Banho e tosa' },
  { id: 'boarding_reservation', label: 'Hotel & Creche' },
  { id: 'encounter', label: 'Atendimento clínico' },
  { id: 'quote', label: 'Orçamento' },
  { id: 'other', label: 'Outras' },
];

const KNOWN_ORIGINS = new Set([
  'appointment',
  'grooming_session',
  'boarding_reservation',
  'encounter',
  'quote',
]);

export type FinanceDayBoardSectionProps = {
  clinicId: string;
  unitId: string;
  canCreateReceivable: boolean;
  canFinancialWrite: boolean;
  onLoaded?: () => void;
};

type ReceivableDrawerState = {
  comandaId: string;
  receivableIds: string[];
  selectedReceivableId: string;
};

export function FinanceDayBoardSection({
  clinicId,
  unitId,
  canCreateReceivable,
  canFinancialWrite,
  onLoaded,
}: FinanceDayBoardSectionProps) {
  const navigate = useNavigate();
  const { showError, showSuccess } = useAlert();
  const [dayBoardItems, setDayBoardItems] = useState<HubFinanceDayBoardItem[]>([]);
  const [dayBoardDate, setDayBoardDate] = useState(() => todayYmd());
  const [view, setView] = useState<HubViewMode>('all');
  const [dayBoardBusy, setDayBoardBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pendente');
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all');
  const [dayBoardSearch, setDayBoardSearch] = useState('');
  const [checkoutComandaId, setCheckoutComandaId] = useState<string | null>(null);
  const [receivableDrawer, setReceivableDrawer] = useState<ReceivableDrawerState | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [showBatchCharge, setShowBatchCharge] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchChargeItem[]>([]);

  const itemKey = (item: HubFinanceDayBoardItem) => `${item.origin_type}:${item.origin_id}`;

  const loadDayBoard = useCallback(
    async (dateOverride?: string, viewOverride?: HubViewMode) => {
      const date = dateOverride ?? dayBoardDate;
      const activeView = viewOverride ?? view;
      setDayBoardBusy(true);
      try {
        if (activeView === 'all') {
          const items = await hubFinancialApi.getDayBoard(clinicId, unitId, null, {
            billing_scope: 'financeiro',
            open: true,
          });
          setDayBoardItems(mergeDayBoardItems([items]));
        } else {
          const range = rangeForView(date, activeView);
          const items = await hubFinancialApi.getDayBoard(clinicId, unitId, date, {
            billing_scope: 'financeiro',
            from: range?.from,
            to: range?.to,
          });
          setDayBoardItems(mergeDayBoardItems([items]));
        }
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

  useEffect(() => {
    setSelectedKeys(new Set());
  }, [dayBoardDate, view, statusFilter, originFilter, dayBoardSearch]);

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

    if (originFilter !== 'all') {
      result = result.filter((it) => {
        if (originFilter === 'other') return !KNOWN_ORIGINS.has(it.origin_type);
        return it.origin_type === originFilter;
      });
    }

    return result;
  }, [dayBoardItems, dayBoardSearch, statusFilter, originFilter]);

  const onEditComanda = (item: HubFinanceDayBoardItem) => {
    if (!item.billing.comanda_id) return;
    navigate(`/hub/financeiro/comanda/${item.billing.comanda_id}`);
  };

  const onViewComanda = (item: HubFinanceDayBoardItem) => {
    if (!item.billing.comanda_id) return;
    navigate(`/hub/financeiro/comanda/${item.billing.comanda_id}`);
  };

  const onCheckout = (item: HubFinanceDayBoardItem) => {
    const comandaId = item.billing.comanda_id;
    if (!comandaId) return;
    const { billing } = item;
    if (billing.has_receivable && (billing.receivable_status === 'pending' || billing.receivable_status === 'partially_paid')) {
      const rid = billing.active_receivable_id;
      if (!rid) return;
      setReceivableDrawer({
        comandaId,
        receivableIds: [rid],
        selectedReceivableId: rid,
      });
      return;
    }
    setCheckoutComandaId(comandaId);
  };

  const onShareComanda = (item: HubFinanceDayBoardItem) => {
    if (item.billing.comanda_id) {
      navigate(`/hub/financeiro/comanda/${item.billing.comanda_id}/pronto-para-envio`);
    }
  };

  const onCancelReceivableFromBoard = async (item: HubFinanceDayBoardItem) => {
    if (!canFinancialWrite) {
      showError('Sem permissão para cancelar recebíveis.');
      return;
    }
    const receivableId = item.billing.active_receivable_id;
    if (!receivableId) return;
    const reason = window.prompt('Motivo do cancelamento do recebível:');
    if (!reason?.trim()) return;
    setDayBoardBusy(true);
    try {
      await hubFinancialApi.cancelReceivable(receivableId, { clinic_id: clinicId, reason: reason.trim() });
      showSuccess('Recebível cancelado.');
      setReceivableDrawer((prev) =>
        prev?.selectedReceivableId === receivableId || prev?.comandaId === item.billing.comanda_id ? null : prev,
      );
      await loadDayBoard();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao cancelar recebível');
    } finally {
      setDayBoardBusy(false);
    }
  };

  const handleDateChange = (iso: string) => {
    setDayBoardDate(iso);
    const nextView: HubViewMode = view === 'all' || iso === todayYmd() ? 'day' : view;
    if (nextView !== view) setView(nextView);
    void loadDayBoard(iso, nextView);
  };

  const handleViewChange = (next: HubViewMode) => {
    setView(next);
    void loadDayBoard(dayBoardDate, next);
  };

  const emptyMessage =
    view === 'all'
      ? 'Nenhuma conta a receber em aberto nesta unidade.'
      : view === 'day'
        ? 'Nenhuma conta a receber relevante para esta data nesta unidade.'
        : view === 'week'
          ? 'Nenhuma conta a receber nesta semana nesta unidade.'
          : 'Nenhuma conta a receber neste mês nesta unidade.';

  const selectedItems = useMemo(
    () => dayBoardFiltered.filter((it) => selectedKeys.has(itemKey(it))),
    [dayBoardFiltered, selectedKeys],
  );

  const toggleSelect = (item: HubFinanceDayBoardItem) => {
    const key = itemKey(item);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAllSelectable = () => {
    const selectable = dayBoardFiltered.filter(isDayBoardBatchSelectable);
    const allOn = selectable.length > 0 && selectable.every((it) => selectedKeys.has(itemKey(it)));
    if (allOn) {
      setSelectedKeys(new Set());
      return;
    }
    setSelectedKeys(new Set(selectable.map(itemKey)));
  };

  const openBatchFromSelection = () => {
    if (!canCreateReceivable) {
      showError('Sem permissão para cobrar.');
      return;
    }
    const items = selectedItems
      .map(dayBoardItemToBatchChargeItem)
      .filter((x): x is BatchChargeItem => Boolean(x));
    if (items.length === 0) {
      showError('Selecione ao menos uma cobrança elegível.');
      return;
    }
    try {
      assertSameGuardian(items);
    } catch (e) {
      showError((e as Error).message);
      return;
    }
    if (items.length === 1) {
      const only = items[0];
      if (only.kind === 'receivable' && only.comandaId && only.receivableId) {
        setReceivableDrawer({
          comandaId: only.comandaId,
          receivableIds: [only.receivableId],
          selectedReceivableId: only.receivableId,
        });
        return;
      }
      if (only.comandaId) {
        setCheckoutComandaId(only.comandaId);
        return;
      }
    }
    setBatchItems(items);
    setShowBatchCharge(true);
  };

  return (
    <>
      <HubViewDateToolbar
        view={view}
        onViewChange={handleViewChange}
        dateIso={dayBoardDate}
        onDateChange={handleDateChange}
        onNavigatePrev={() => {
          if (view === 'all') return;
          const prev = shiftCursorDate(dayBoardDate, view, -1);
          setDayBoardDate(prev);
          void loadDayBoard(prev);
        }}
        onNavigateNext={() => {
          if (view === 'all') return;
          const next = shiftCursorDate(dayBoardDate, view, 1);
          setDayBoardDate(next);
          void loadDayBoard(next);
        }}
        dateFieldId="finance-dayboard-date"
        disabled={dayBoardBusy}
        searchValue={dayBoardSearch}
        onSearchChange={setDayBoardSearch}
        searchPlaceholder="Buscar pet, tutor ou serviço…"
        allowAllView
      />

      <div className="hub-dayboard__filters-row">
        <div className="hub-dayboard__status-filters" role="group" aria-label="Filtrar por situação da cobrança">
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
        <div className="hub-dayboard__status-filters" role="group" aria-label="Filtrar por origem">
          {ORIGIN_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`hub-dayboard__toggle-btn${originFilter === f.id ? ' hub-dayboard__toggle-btn--active' : ''}`}
              onClick={() => setOriginFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {selectedKeys.size > 0 && canCreateReceivable ? (
        <div className="hub-batch-charge__toolbar">
          <span className="hub-clientes__muted">{selectedKeys.size} selecionada(s)</span>
          <div className="hub-batch-charge__footer-actions">
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
              onClick={() => setSelectedKeys(new Set())}
            >
              Limpar
            </button>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
              onClick={openBatchFromSelection}
            >
              <Coins size={14} strokeWidth={2} aria-hidden />
              Cobrar {selectedKeys.size}
            </button>
          </div>
        </div>
      ) : null}

      {dayBoardBusy ? (
        <HubLoading variant="block" label="Carregando contas a receber…" />
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
          onCancelReceivable={onCancelReceivableFromBoard}
          onRowClick={onViewComanda}
          busy={dayBoardBusy}
          selectionEnabled={canCreateReceivable}
          selectedKeys={selectedKeys}
          onToggleSelect={toggleSelect}
          onToggleSelectAllSelectable={toggleSelectAllSelectable}
        />
      )}

      {receivableDrawer ? (
        <HubComandaReceivableDrawer
          open
          onClose={() => setReceivableDrawer(null)}
          comandaId={receivableDrawer.comandaId}
          receivableIds={receivableDrawer.receivableIds}
          selectedReceivableId={receivableDrawer.selectedReceivableId}
          onSelectReceivable={(id) =>
            setReceivableDrawer((prev) => (prev ? { ...prev, selectedReceivableId: id } : null))
          }
          onRefreshComanda={() => void loadDayBoard()}
          highlightPayment
        />
      ) : null}

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

      <BatchChargeDrawer
        open={showBatchCharge}
        items={batchItems}
        guardianName={
          selectedItems.find((it) => it.guardian?.full_name)?.guardian?.full_name ?? undefined
        }
        onClose={() => setShowBatchCharge(false)}
        onDone={() => {
          setShowBatchCharge(false);
          setSelectedKeys(new Set());
          void loadDayBoard();
        }}
        onBundleCreated={(id) => navigate(`/hub/financeiro/cobranca-lote/${id}/pronto-para-envio`)}
      />
    </>
  );
}
