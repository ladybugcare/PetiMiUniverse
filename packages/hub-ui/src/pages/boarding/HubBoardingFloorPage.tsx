import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getStoredClinicId, getSupabase, useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import {
  hubBoardingApi,
  type BoardingDayBoardItem,
  type BoardingOccupancyResponse,
} from '../../api/hubBoardingApi';
import { hubAgendaApi } from '../../api/hubAgendaApi';
import { dayRangeIsoLocal, isUuid, loadAgendaPersistedFilters } from '../agenda/agendaFilters';
import { boardingItemKey, type BoardingMode } from './boardingStages';
import BoardingFloorView from './BoardingFloorView';
import BoardingReservationDrawer from './BoardingReservationDrawer';
import '../clinica/clinica-page.css';
import '../clientes/clientes.css';
import '../grooming/grooming-page.css';
import './boarding-page.css';

const POLL_MS = 30_000;

/**
 * Tela "Minha fila" — visão de chão (celular) para Hotel & Creche.
 * Acessível em /hub/hotel-creche/minha-fila.
 *
 * Check-in e check-out usam `boarding.reservations.manage`
 * (CSTAFF hotel_creche opera sem `hub.appointments.write`).
 */
const HubBoardingFloorPage: React.FC = () => {
  const { showError } = useAlert();
  const { role: authRole } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const clinicId = getStoredClinicId();
  const accessAllowed = hasPermission('boarding.reservations.read');
  const canWrite = hasPermission('boarding.reservations.manage');
  const canDailyReport = hasPermission('boarding.daily_report.write');
  const canManageFinance = hasPermission('hub.receivables.create');
  const canWriteInventory = hasPermission('hub.inventory.write');

  const loadSeqRef = useRef(0);
  const [activeMode, setActiveMode] = useState<BoardingMode>('all');
  const [items, setItems] = useState<BoardingDayBoardItem[]>([]);
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(clinicId);
  const [actionBusy, setActionBusy] = useState(false);
  const [selected, setSelected] = useState<BoardingDayBoardItem | null>(null);
  const [featuredOverride, setFeaturedOverride] = useState<BoardingDayBoardItem | null>(null);
  const [occupancy, setOccupancy] = useState<BoardingOccupancyResponse | null>(null);
  const [unitFilter] = useState(() => loadAgendaPersistedFilters().unit ?? 'all');
  const cursor = useMemo(() => new Date(), []);
  const dayRange = useMemo(() => dayRangeIsoLocal(cursor), [cursor]);

  const unitIdParam = useMemo(() => {
    if (unitFilter === 'all') return undefined;
    if (isUuid(unitFilter)) return unitFilter;
    return undefined;
  }, [unitFilter]);

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) redirectAwayFromHub(authRole as AppRole);
  }, [permLoading, accessAllowed, authRole]);

  const load = useCallback(async () => {
    if (!clinicId) return;
    const seq = ++loadSeqRef.current;
    begin();
    try {
      const res = await hubBoardingApi.dayBoard(clinicId, dayRange, {
        unitId: unitIdParam,
        mode: activeMode === 'all' ? undefined : activeMode,
      });
      if (seq !== loadSeqRef.current) return;
      setItems(res.items ?? []);
      setSelected((prev) => {
        if (!prev) return null;
        const key = boardingItemKey(prev);
        return res.items?.find((i) => boardingItemKey(i) === key) ?? prev;
      });
      setFeaturedOverride((prev) => {
        if (!prev) return null;
        const key = boardingItemKey(prev);
        return res.items?.find((i) => boardingItemKey(i) === key) ?? null;
      });
      succeed();
    } catch (e: unknown) {
      if (seq !== loadSeqRef.current) return;
      showError((e as Error)?.message || 'Erro ao carregar Minha fila');
      setItems([]);
    } finally {
      if (seq === loadSeqRef.current) finish();
    }
  }, [clinicId, dayRange, unitIdParam, activeMode, showError, begin, succeed, finish]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    void load();
  }, [clinicId, accessAllowed, load]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [clinicId, accessAllowed, load]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const channel = supabase
      .channel(`hub_boarding_floor_${clinicId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hub_boarding_reservations',
          filter: `clinic_id=eq.${clinicId}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clinicId, accessAllowed, load]);

  const loadOccupancy = useCallback(async () => {
    if (!clinicId) return;
    try {
      const occ = await hubBoardingApi.getOccupancy(clinicId, {
        unitId: unitIdParam,
        dateYmd: dayRange.dateYmd,
        mode: activeMode === 'all' ? undefined : activeMode,
      });
      setOccupancy(occ);
    } catch {
      // Ocupação é não-crítica
    }
  }, [clinicId, unitIdParam, dayRange.dateYmd, activeMode]);

  useEffect(() => {
    void loadOccupancy();
  }, [loadOccupancy]);

  const handleCheckIn = async (item: BoardingDayBoardItem) => {
    if (!clinicId || !canWrite) return;
    setActionBusy(true);
    try {
      if (item.reservation_id) {
        await hubBoardingApi.patchReservation(item.reservation_id, {
          clinic_id: clinicId,
          status: 'checked_in',
          checked_in_at: new Date().toISOString(),
        });
      } else if (item.appointment_id) {
        await hubBoardingApi.openFromAppointment(clinicId, item.appointment_id);
        await hubAgendaApi.patch(item.appointment_id, { clinic_id: clinicId, status: 'in_progress' });
      }
      await load();
      await loadOccupancy();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao fazer check-in');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCheckOut = async (item: BoardingDayBoardItem) => {
    if (!clinicId || !canWrite) return;
    setActionBusy(true);
    try {
      if (item.reservation_id) {
        await hubBoardingApi.patchReservation(item.reservation_id, {
          clinic_id: clinicId,
          status: 'checked_out',
          checked_out_at: new Date().toISOString(),
        });
      } else if (item.appointment_id) {
        await hubAgendaApi.patch(item.appointment_id, { clinic_id: clinicId, status: 'done' });
      }
      await load();
      await loadOccupancy();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao fazer check-out');
    } finally {
      setActionBusy(false);
    }
  };

  if (!permLoading && !clinicId) {
    return (
      <p className="hub-clientes__muted hub-clinic-page__pad">
        Selecione uma clínica para acessar Hotel & Creche.
      </p>
    );
  }

  if (permLoading || !accessAllowed) {
    return (
      <div className="hub-clinic-page__pad">
        <HubLoading variant="block" />
      </div>
    );
  }

  const dateLabel = cursor.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const overHotel = occupancy?.hotel.over_capacity ?? false;
  const overDaycare = occupancy?.daycare.over_capacity ?? false;
  const occupancyParts: string[] = [];
  if (occupancy?.hotel.max != null) occupancyParts.push(`${occupancy.hotel.current}/${occupancy.hotel.max} hotel`);
  if (occupancy?.daycare.max != null) occupancyParts.push(`${occupancy.daycare.current}/${occupancy.daycare.max} creche`);

  return (
    <div className="hub-boarding-page--floor">
      <HubRefreshingBanner show={refreshing} label="Atualizando fila…" />
      <BoardingFloorView
        items={items}
        dateLabel={dateLabel}
        loading={loading}
        busy={actionBusy}
        canWrite={canWrite}
        activeMode={activeMode}
        onActiveModeChange={setActiveMode}
        occupancyLabel={occupancyParts.length ? occupancyParts.join(' · ') : null}
        occupancyOver={overHotel || overDaycare}
        onRefresh={() => void load()}
        onSelect={setSelected}
        onCheckIn={(item) => void handleCheckIn(item)}
        onCheckOut={(item) => void handleCheckOut(item)}
        featuredOverride={featuredOverride}
        onFeaturedOverride={setFeaturedOverride}
      />

      <BoardingReservationDrawer
        item={selected}
        open={!!selected}
        canWrite={canWrite}
        canDailyReport={canDailyReport}
        canManageFinance={canManageFinance}
        canWriteInventory={canWriteInventory}
        unitId={unitIdParam}
        onClose={() => setSelected(null)}
        onUpdated={() => void load()}
      />
    </div>
  );
};

export default HubBoardingFloorPage;
