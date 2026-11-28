import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Columns, List, Search, UserPlus } from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { HubDayNav } from '../../components/HubDayNav';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { formatYmd } from '../../utils/hubCalendar';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';
import {
  hubReceptionApi,
  type ReceptionBoardItem,
  type ReceptionResolveAction,
  type ReceptionResolvePayload,
} from '../../api/hubReceptionApi';
import { hubFinancialApi, type HubFinanceDayBoardItem, type HubFinanceUnbilledItem } from '../../api/hubFinancialApi';
import { hubComandaApi, type HubComandaOriginType } from '../../api/hubComandaApi';
import ReceptionHandoffPanel from './ReceptionHandoffPanel';
import { ComandaCheckoutDrawer } from '../finance/ComandaCheckoutDrawer';
import BalcaoKpiStrip from './BalcaoKpiStrip';
import BalcaoCustodyRow from './BalcaoCustodyRow';
import BalcaoChargeRow from './BalcaoChargeRow';
import {
  buildBalcaoChargeQueue,
  buildBalcaoCustodySections,
  buildBalcaoDeskColumns,
  filterBalcaoCustodyByChip,
  findOpenExitHandoffForPet,
  groupBalcaoChargesByTutor,
  matchesBalcaoSearch,
  type BalcaoChargeItem,
  type BalcaoFilterChip,
  type BalcaoViewMode,
} from './balcaoBoard';
import { formatBrl, scheduleDestinationPath, walkInPath } from './balcaoUi';
import '../clientes/clientes.css';
import '../clinica/clinica-page.css';
import '../grooming/grooming-page.css';
import './hub-reception.css';

const REFRESH_MS = 30_000;
const VIEW_STORAGE_KEY = 'petimi:hub-balcao-view';

function readViewMode(): BalcaoViewMode {
  if (typeof window === 'undefined') return 'columns';
  try {
    const raw = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return raw === 'list' ? 'list' : 'columns';
  } catch {
    return 'columns';
  }
}

function ymdSaoPaulo(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

type CheckoutTarget =
  | { comandaId: string; petId: string | null }
  | { originType: HubComandaOriginType; originId: string; petId: string | null };

const OPENABLE_ORIGINS = new Set<HubComandaOriginType>([
  'appointment',
  'grooming_session',
  'encounter',
  'boarding_reservation',
  'quote',
]);

const HubReceptionPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission, loading: permLoading } = usePermissions();
  const canRead = hasPermission('reception.ops.read');
  const canManage = hasPermission('reception.ops.manage');
  const canSeeChargeHint = hasPermission('hub.financial.read') || hasPermission('hub.cash.receive');
  const canCreateReceivable =
    hasPermission('hub.receivables.create') || hasPermission('hub.financial.write') || hasPermission('hub.cash.receive');
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();
  const { showError, showSuccess, showConfirm } = useAlert();
  const [day, setDay] = useState(() => ymdSaoPaulo(new Date()));
  const [items, setItems] = useState<ReceptionBoardItem[]>([]);
  const [dayBoardItems, setDayBoardItems] = useState<HubFinanceDayBoardItem[]>([]);
  const [openComandas, setOpenComandas] = useState<Array<Record<string, unknown>>>([]);
  const [unbilledItems, setUnbilledItems] = useState<HubFinanceUnbilledItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReceptionBoardItem | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [filterChip, setFilterChip] = useState<BalcaoFilterChip>('tudo');
  const [viewMode, setViewMode] = useState<BalcaoViewMode>(readViewMode);
  const [checkout, setCheckout] = useState<CheckoutTarget | null>(null);
  const [chargeBusyKey, setChargeBusyKey] = useState<string | null>(null);
  const [pendingReleasePetId, setPendingReleasePetId] = useState<string | null>(null);
  const cobrarColumnRef = useRef<HTMLElement | null>(null);
  const loadKey = clinicId && unitId ? `${clinicId}|${unitId}|${day}` : null;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(loadKey);
  const loadSeqRef = useRef(0);

  const persistViewMode = useCallback((next: BalcaoViewMode) => {
    setViewMode(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* storage indisponível */
    }
  }, []);

  const loadChargeQueue = useCallback(async () => {
    if (!clinicId || !unitId || !canSeeChargeHint) {
      setDayBoardItems([]);
      setOpenComandas([]);
      setUnbilledItems([]);
      return;
    }
    const [board, comandasRes, unbilled] = await Promise.all([
      hubFinancialApi.getDayBoard(clinicId, unitId, day).catch(() => [] as HubFinanceDayBoardItem[]),
      hubComandaApi
        .listComandas({ clinic_id: clinicId, unit_id: unitId, status: 'aberta', enrich: 'light' })
        .catch(() => ({ comandas: [] as Array<Record<string, unknown>> })),
      hubFinancialApi.listUnbilledCompleted(clinicId, unitId).catch(() => [] as HubFinanceUnbilledItem[]),
    ]);
    setDayBoardItems(board);
    setOpenComandas(comandasRes.comandas ?? []);
    setUnbilledItems(unbilled);
  }, [clinicId, unitId, day, canSeeChargeHint]);

  const load = useCallback(async () => {
    if (!clinicId || !unitId || !canRead) {
      setItems([]);
      finish();
      return;
    }
    const seq = ++loadSeqRef.current;
    begin();
    try {
      const [res] = await Promise.all([hubReceptionApi.board(clinicId, unitId, day), loadChargeQueue()]);
      if (seq !== loadSeqRef.current) return;
      setItems(res.items ?? []);
      succeed();
    } catch (e: unknown) {
      if (seq !== loadSeqRef.current) return;
      showError((e as Error)?.message || 'Erro ao carregar o balcão');
    } finally {
      if (seq === loadSeqRef.current) finish();
    }
  }, [clinicId, unitId, day, canRead, showError, begin, succeed, finish, loadChargeQueue]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [load]);

  const custodyAll = useMemo(() => buildBalcaoCustodySections(items), [items]);
  const chargeQueueAll = useMemo(
    () =>
      canSeeChargeHint
        ? buildBalcaoChargeQueue({
            dayBoardItems,
            openComandas,
            unbilledItems,
            todayYmd: day,
          })
        : [],
    [canSeeChargeHint, dayBoardItems, openComandas, unbilledItems, day],
  );

  const q = searchQ.trim();
  const custodyFilteredSearch = useMemo(() => {
    if (!q) return custodyAll;
    const filterRows = (rows: ReceptionBoardItem[]) =>
      rows.filter((i) => matchesBalcaoSearch(i.pet.name, i.guardian?.full_name, q));
    return {
      atencao: filterRows(custodyAll.atencao),
      saidas: filterRows(custodyAll.saidas),
      chegadas: filterRows(custodyAll.chegadas),
      acompanhar: filterRows(custodyAll.acompanhar),
      feitos: filterRows(custodyAll.feitos),
    };
  }, [custodyAll, q]);

  const chargeFilteredSearch = useMemo(() => {
    if (!q) return chargeQueueAll;
    return chargeQueueAll.filter((c) => matchesBalcaoSearch(c.pet_name, c.guardian_name, q));
  }, [chargeQueueAll, q]);

  const custody = useMemo(
    () => filterBalcaoCustodyByChip(custodyFilteredSearch, filterChip),
    [custodyFilteredSearch, filterChip],
  );
  const desk = useMemo(() => buildBalcaoDeskColumns(custody), [custody]);
  const chargeQueue = filterChip === 'cobrar' || filterChip === 'tudo' ? chargeFilteredSearch : [];
  const chargeGroups = useMemo(() => groupBalcaoChargesByTutor(chargeQueue), [chargeQueue]);

  const kpiCounts = useMemo(() => {
    const chegadas =
      custodyFilteredSearch.chegadas.length +
      custodyFilteredSearch.acompanhar.filter((i) => i.kind === 'no_consultorio').length;
    const saidas =
      custodyFilteredSearch.saidas.length +
      custodyFilteredSearch.acompanhar.filter((i) => i.kind === 'saida_prevista').length;
    return {
      chegadas,
      saidas,
      cobrar: chargeFilteredSearch.length,
      atencao: custodyFilteredSearch.atencao.length,
    };
  }, [custodyFilteredSearch, chargeFilteredSearch]);

  const chargeTotal = useMemo(
    () => chargeQueue.reduce((sum, c) => sum + (c.amount && Number.isFinite(c.amount) ? c.amount : 0), 0),
    [chargeQueue],
  );

  const focusCobrar = useCallback(() => {
    setFilterChip('tudo');
    window.requestAnimationFrame(() => {
      cobrarColumnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const run = useCallback(
    async (item: ReceptionBoardItem, action: ReceptionResolveAction, payload?: ReceptionResolvePayload) => {
      if (!clinicId || !canManage) return;
      setBusyId(item.id);
      try {
        await hubReceptionApi.resolve(item.id, clinicId, action, payload);
        showSuccess(
          action === 'novo_lt'
            ? 'Novo Leva e Traz criado. Atribua a uma rota no quadro do Leva e Traz.'
            : action === 'tutor_busca'
              ? 'Combinado: o tutor busca no balcão.'
              : 'Tarefa concluída.',
        );
        setSelected(null);
        await load();
        if (canSeeChargeHint && (action === 'entreguei' || action === 'embarquei')) {
          focusCobrar();
        }
      } catch (e: unknown) {
        showError((e as Error)?.message || 'Não foi possível concluir a tarefa');
      } finally {
        setBusyId(null);
      }
    },
    [clinicId, canManage, showSuccess, showError, load, canSeeChargeHint, focusCobrar],
  );

  const requestRelease = useCallback(
    (item: ReceptionBoardItem, action: ReceptionResolveAction) => {
      showConfirm(
        'Há cobrança pendente para este pet. Liberar mesmo assim? A saída física é independente do financeiro, salvo bloqueio da unidade no hotel.',
        () => {
          void run(item, action);
        },
        'Liberar com pendência',
      );
    },
    [showConfirm, run],
  );

  const openCharge = async (row: BalcaoChargeItem, offerReleaseAfter = false) => {
    if (!clinicId || !unitId) return;
    if (offerReleaseAfter && row.pet_id) setPendingReleasePetId(row.pet_id);
    if (row.comanda_id) {
      setCheckout({ comandaId: row.comanda_id, petId: row.pet_id });
      return;
    }
    const originType = row.open_origin_type as HubComandaOriginType | null;
    if (!originType || !row.open_origin_id || !OPENABLE_ORIGINS.has(originType)) {
      showError('Não foi possível determinar a origem da cobrança.');
      return;
    }
    if (!canCreateReceivable) {
      showError('Sem permissão para abrir cobrança.');
      return;
    }
    setChargeBusyKey(row.key);
    try {
      const detail = await hubComandaApi.openComanda({
        clinic_id: clinicId,
        origin_type: originType,
        origin_id: row.open_origin_id,
        unit_id: unitId,
      });
      const comandaId = (detail.comanda as Record<string, unknown>)?.id as string | undefined;
      if (comandaId) {
        setCheckout({ comandaId, petId: row.pet_id });
      } else {
        setCheckout({ originType, originId: row.open_origin_id, petId: row.pet_id });
      }
      await loadChargeQueue();
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? '';
      if (msg.includes('Já existe comanda aberta')) {
        setCheckout({ originType, originId: row.open_origin_id, petId: row.pet_id });
        await loadChargeQueue();
      } else {
        showError(msg || 'Erro ao abrir cobrança');
      }
    } finally {
      setChargeBusyKey(null);
    }
  };

  const maybeOfferReleaseAfterCheckout = useCallback(
    async (petId: string | null) => {
      const targetPetId = petId || pendingReleasePetId;
      setPendingReleasePetId(null);
      if (!targetPetId || !canManage || !clinicId || !unitId) {
        await load();
        return;
      }
      try {
        const [res] = await Promise.all([
          hubReceptionApi.board(clinicId, unitId, day),
          loadChargeQueue(),
        ]);
        const nextItems = res.items ?? [];
        setItems(nextItems);
        const exit = findOpenExitHandoffForPet(nextItems, targetPetId);
        if (!exit) return;
        const action: ReceptionResolveAction = exit.kind === 'embarque' ? 'embarquei' : 'entreguei';
        showConfirm(
          `Cobrança registrada. Liberar ${exit.pet.name} agora?`,
          () => {
            void run(exit, action);
          },
          'Cobrar e liberar',
        );
      } catch (e: unknown) {
        showError((e as Error)?.message || 'Erro ao atualizar o balcão');
      }
    },
    [
      pendingReleasePetId,
      canManage,
      clinicId,
      unitId,
      day,
      showConfirm,
      showError,
      load,
      loadChargeQueue,
      run,
    ],
  );

  const goWalkIn = () => {
    const dest = walkInPath(day);
    navigate(`${dest.pathname}${dest.search}`, { state: dest.state });
  };

  const goScheduleDestination = (item: ReceptionBoardItem) => {
    const dest = scheduleDestinationPath(item, day);
    navigate(`${dest.pathname}${dest.search}`, { state: dest.state });
  };

  if (permLoading) {
    return (
      <div className="hub-clientes hub-clinic-page hub-reception">
        <HubLoading variant="block" label="Carregando balcão…" />
      </div>
    );
  }
  if (!canRead) {
    return (
      <div className="hub-clientes hub-clinic-page hub-reception">
        <p className="hub-clientes__muted">Você não tem acesso à operação do balcão.</p>
      </div>
    );
  }
  if (!unitId) {
    return (
      <div className="hub-clientes hub-clinic-page hub-reception">
        <p className="hub-clientes__muted">Selecione uma unidade no cabeçalho.</p>
      </div>
    );
  }

  const custodyRowProps = {
    day,
    canManage,
    onSelect: setSelected,
    onAction: (item: ReceptionBoardItem, action: ReceptionResolveAction, payload?: ReceptionResolvePayload) =>
      void run(item, action, payload),
    onScheduleDestination: goScheduleDestination,
    onFocusCobrar: focusCobrar,
    onRequestRelease: requestRelease,
  };

  const renderCustodyRows = (rows: ReceptionBoardItem[], muted = false) =>
    rows.map((item) => (
      <BalcaoCustodyRow
        key={item.id}
        item={item}
        busy={busyId === item.id}
        muted={muted}
        {...custodyRowProps}
      />
    ));

  const renderChargeGroups = () =>
    chargeGroups.map((group) => (
      <div key={group.key} className="hub-balcao-tutor-group">
        {group.items.length > 1 || chargeGroups.length > 1 ? (
          <div className="hub-balcao-tutor-group__head">
            <span className="hub-balcao-tutor-group__name">{group.guardian_name}</span>
            {group.total > 0 ? (
              <span className="hub-balcao-tutor-group__total">{formatBrl(group.total)}</span>
            ) : null}
          </div>
        ) : null}
        <ul className="hub-balcao-rows">
          {group.items.map((row) => (
            <BalcaoChargeRow
              key={row.key}
              row={row}
              busy={chargeBusyKey === row.key}
              canCreateReceivable={canCreateReceivable}
              compactTutor={group.items.length > 1 || chargeGroups.length > 1}
              onOpen={(r) => void openCharge(r, true)}
            />
          ))}
        </ul>
      </div>
    ));

  const showAttention = desk.atencao.length > 0 && filterChip !== 'cobrar';
  const showChegadas = filterChip === 'tudo' || filterChip === 'chegadas';
  const showSaidas = filterChip === 'tudo' || filterChip === 'saidas';
  const showCobrar = canSeeChargeHint && (filterChip === 'tudo' || filterChip === 'cobrar');
  const showFeitos = filterChip === 'tudo' && viewMode === 'list' && desk.feitos.length > 0;

  const searchMiss =
    Boolean(q) &&
    desk.atencao.length === 0 &&
    desk.chegadasPending.length === 0 &&
    desk.chegadasInSector.length === 0 &&
    desk.saidasReady.length === 0 &&
    desk.saidasPreparing.length === 0 &&
    desk.feitos.length === 0 &&
    chargeQueue.length === 0;

  const emptyCol = (msg: string) => <p className="hub-clientes__muted hub-balcao-col__empty">{msg}</p>;

  const chegadasBody = (
    <>
      {desk.chegadasPending.length === 0 && desk.chegadasInSector.length === 0
        ? emptyCol('Nenhuma chegada agora.')
        : null}
      {desk.chegadasPending.length > 0 ? (
        <ul className="hub-balcao-rows">{renderCustodyRows(desk.chegadasPending)}</ul>
      ) : null}
      {desk.chegadasInSector.length > 0 ? (
        <div className="hub-balcao-subgroup">
          <p className="hub-balcao-subgroup__title">Já no setor</p>
          <ul className="hub-balcao-rows">{renderCustodyRows(desk.chegadasInSector, true)}</ul>
        </div>
      ) : null}
    </>
  );

  const saidasBody = (
    <>
      {desk.saidasReady.length === 0 && desk.saidasPreparing.length === 0
        ? emptyCol('Nenhum pet pronto para entregar.')
        : null}
      {desk.saidasReady.length > 0 ? (
        <ul className="hub-balcao-rows">{renderCustodyRows(desk.saidasReady)}</ul>
      ) : null}
      {desk.saidasPreparing.length > 0 ? (
        <div className="hub-balcao-subgroup">
          <p className="hub-balcao-subgroup__title">Em preparação</p>
          <ul className="hub-balcao-rows">{renderCustodyRows(desk.saidasPreparing, true)}</ul>
        </div>
      ) : null}
    </>
  );

  const cobrarBody =
    chargeQueue.length === 0 ? (
      emptyCol('Nada a cobrar no balcão.')
    ) : (
      <>
        {chargeTotal > 0 ? (
          <p className="hub-balcao-col__total">
            Pendente operacional: <strong>{formatBrl(chargeTotal)}</strong>
          </p>
        ) : null}
        {renderChargeGroups()}
      </>
    );

  return (
    <div className="hub-clientes hub-clinic-page hub-reception hub-balcao">
      <div className="hub-reception__toolbar hub-balcao__toolbar">
        <div className="hub-reception__date">
          <HubDayNav
            dateFieldId="hub-reception-date"
            value={day}
            onChange={(next) => setDay(formatYmd(next))}
          />
        </div>
        <label className="hub-balcao__search">
          <Search size={16} aria-hidden />
          <input
            type="search"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Buscar pet ou tutor"
            aria-label="Buscar pet ou tutor"
            autoComplete="off"
          />
        </label>
        <div className="hub-balcao__view-toggle" role="toolbar" aria-label="Visualização">
          <button
            type="button"
            className={`hub-clientes__btn hub-clientes__btn--sm${viewMode === 'columns' ? ' hub-clientes__btn--primary' : ' hub-clientes__btn--ghost'}`}
            aria-pressed={viewMode === 'columns'}
            onClick={() => persistViewMode('columns')}
          >
            <Columns size={14} aria-hidden /> Colunas
          </button>
          <button
            type="button"
            className={`hub-clientes__btn hub-clientes__btn--sm${viewMode === 'list' ? ' hub-clientes__btn--primary' : ' hub-clientes__btn--ghost'}`}
            aria-pressed={viewMode === 'list'}
            onClick={() => persistViewMode('list')}
          >
            <List size={14} aria-hidden /> Lista
          </button>
        </div>
        {canManage ? (
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm hub-balcao__walkin"
            onClick={goWalkIn}
          >
            <UserPlus size={14} aria-hidden /> Chegada sem agenda
          </button>
        ) : null}
      </div>

      <BalcaoKpiStrip
        filter={filterChip}
        counts={kpiCounts}
        showCobrar={canSeeChargeHint}
        onChange={setFilterChip}
      />

      <HubRefreshingBanner show={refreshing} label="Atualizando balcão…" />

      {loading ? (
        <HubLoading variant="block" label="Carregando balcão…" />
      ) : searchMiss ? (
        <div className="hub-grooming-page__empty-filters" role="status">
          <p className="hub-clientes__muted">Nenhum pet ou tutor corresponde à busca.</p>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
            onClick={() => setSearchQ('')}
          >
            Limpar busca
          </button>
        </div>
      ) : (
        <>
          {showAttention ? (
            <section
              className="hub-balcao-attention"
              aria-label="Atenção necessária"
              data-testid="hub-balcao-attention"
            >
              <div className="hub-balcao-attention__head">
                <h2 className="hub-balcao-attention__title">Atenção necessária</h2>
                <span className="hub-balcao-attention__count">{desk.atencao.length}</span>
              </div>
              <ul className="hub-balcao-rows">{renderCustodyRows(desk.atencao)}</ul>
            </section>
          ) : null}

          {viewMode === 'columns' && filterChip !== 'atencao' ? (
            <div
              className={`hub-balcao-board${filterChip !== 'tudo' ? ' hub-balcao-board--focused' : ''}`}
              data-testid="hub-balcao-board"
            >
              {showChegadas ? (
                <section className="hub-balcao-col" aria-label="Chegadas" data-testid="hub-balcao-chegadas">
                  <h3 className="hub-balcao-col__title">
                    Chegadas{' '}
                    <span className="hub-balcao-col__count">
                      {desk.chegadasPending.length + desk.chegadasInSector.length}
                    </span>
                  </h3>
                  {chegadasBody}
                </section>
              ) : null}
              {showSaidas ? (
                <section className="hub-balcao-col" aria-label="Saídas" data-testid="hub-balcao-saidas">
                  <h3 className="hub-balcao-col__title">
                    Saídas{' '}
                    <span className="hub-balcao-col__count">
                      {desk.saidasReady.length + desk.saidasPreparing.length}
                    </span>
                  </h3>
                  {saidasBody}
                </section>
              ) : null}
              {showCobrar ? (
                <section
                  ref={cobrarColumnRef}
                  className="hub-balcao-col hub-balcao-col--charge"
                  aria-label="Cobranças"
                  data-testid="hub-balcao-cobrar"
                >
                  <h3 className="hub-balcao-col__title">
                    Cobranças <span className="hub-balcao-col__count">{chargeQueue.length}</span>
                  </h3>
                  {cobrarBody}
                </section>
              ) : null}
            </div>
          ) : null}

          {(viewMode === 'list' || filterChip === 'atencao') && filterChip !== 'cobrar' ? (
            <div className="hub-balcao-list-view" data-testid="hub-balcao-list">
              {filterChip === 'atencao' && desk.atencao.length === 0 ? (
                <p className="hub-clientes__muted">Nada pedindo o balcão.</p>
              ) : null}
              {showChegadas && filterChip !== 'atencao' ? (
                <section className="hub-balcao-list-section" aria-label="Chegadas">
                  <h3 className="hub-balcao-col__title">
                    Chegadas{' '}
                    <span className="hub-balcao-col__count">
                      {desk.chegadasPending.length + desk.chegadasInSector.length}
                    </span>
                  </h3>
                  {chegadasBody}
                </section>
              ) : null}
              {showSaidas && filterChip !== 'atencao' ? (
                <section className="hub-balcao-list-section" aria-label="Saídas">
                  <h3 className="hub-balcao-col__title">
                    Saídas{' '}
                    <span className="hub-balcao-col__count">
                      {desk.saidasReady.length + desk.saidasPreparing.length}
                    </span>
                  </h3>
                  {saidasBody}
                </section>
              ) : null}
              {showCobrar && filterChip !== 'atencao' ? (
                <section
                  ref={cobrarColumnRef}
                  className="hub-balcao-list-section hub-balcao-col--charge"
                  aria-label="Cobranças"
                >
                  <h3 className="hub-balcao-col__title">
                    Cobranças <span className="hub-balcao-col__count">{chargeQueue.length}</span>
                  </h3>
                  {cobrarBody}
                </section>
              ) : null}
              {showFeitos ? (
                <section className="hub-balcao-list-section hub-balcao-list-section--muted" aria-label="Feitos">
                  <h3 className="hub-balcao-col__title">
                    Feitos <span className="hub-balcao-col__count">{desk.feitos.length}</span>
                  </h3>
                  <ul className="hub-balcao-rows">{renderCustodyRows(desk.feitos, true)}</ul>
                </section>
              ) : null}
            </div>
          ) : null}

          {filterChip === 'cobrar' && showCobrar ? (
            <section
              ref={cobrarColumnRef}
              className="hub-balcao-list-section hub-balcao-col--charge"
              aria-label="Cobranças"
              data-testid="hub-balcao-cobrar"
            >
              <h3 className="hub-balcao-col__title">
                Cobranças <span className="hub-balcao-col__count">{chargeQueue.length}</span>
              </h3>
              {cobrarBody}
            </section>
          ) : null}
        </>
      )}

      {clinicId ? (
        <ReceptionHandoffPanel
          open={Boolean(selected)}
          item={selected}
          clinicId={clinicId}
          canManage={canManage}
          busy={Boolean(selected && busyId === selected.id)}
          onClose={() => setSelected(null)}
          onAction={(item, action, payload) => void run(item, action, payload)}
          onScheduleDestination={goScheduleDestination}
        />
      ) : null}

      {clinicId && unitId && checkout ? (
        <ComandaCheckoutDrawer
          open
          clinicId={clinicId}
          unitId={unitId}
          mode="caixa"
          onClose={() => {
            setCheckout(null);
            setPendingReleasePetId(null);
          }}
          onDataChanged={() => {
            void loadChargeQueue();
          }}
          onSuccess={(payload) => {
            const petId = checkout.petId;
            setCheckout(null);
            if (payload.kind === 'receive_now' || payload.kind === 'leave_pending') {
              void maybeOfferReleaseAfterCheckout(petId);
            } else {
              void load();
            }
          }}
          {...('comandaId' in checkout
            ? { comandaId: checkout.comandaId }
            : { originType: checkout.originType, originId: checkout.originId })}
        />
      ) : null}
    </div>
  );
};

export default HubReceptionPage;
