import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getStoredClinicId, useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { hubGroomingApi, type GroomingDayBoardItem } from '../../api/hubGroomingApi';
import { hubAgendaApi } from '../../api/hubAgendaApi';
import { dayRangeIsoLocal, loadAgendaPersistedFilters, isUuid } from '../agenda/agendaFilters';
import { useMyStaffMember } from '../../hooks/useMyStaffMember';
import { groomingOpenSessionStage, itemBoardKey } from './groomingStages';
import GroomingFloorView from './GroomingFloorView';
import GroomingAppointmentDrawer from './GroomingAppointmentDrawer';
import type { GroomingQuickAction } from './GroomingQueueBoard';
import '../clinica/clinica-page.css';
import '../clientes/clientes.css';
import './grooming-page.css';

const POLL_MS = 30_000;

/**
 * Tela "Minha fila" — visão de chão de salão (celular) para Banho & Tosa.
 * Acessível em /hub/banho-tosa/minha-fila.
 *
 * Ações operacionais (check-in, avançar, checklist) usam `grooming.queue.manage`
 * — alinhado ao backend e ao papel CGROOMER / CSTAFF banho_tosa (sem appointments.write).
 */
const HubGroomingFloorPage: React.FC = () => {
  const { showError } = useAlert();
  const { role: authRole } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const clinicId = getStoredClinicId();
  const accessAllowed = hasPermission('grooming.queue.read');
  const canWrite = hasPermission('grooming.queue.manage');
  const canAddExtras = hasPermission('hub.appointments.write');
  const showOperationalPricing = hasPermission('hub.service_types.write');
  const canViewFinancial = hasPermission('hub.financial.read');
  const canPauseQueue = hasPermission('grooming.queue.manage');
  const { myStaffMember, linked } = useMyStaffMember();

  const loadSeqRef = useRef(0);
  const [items, setItems] = useState<GroomingDayBoardItem[]>([]);
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(clinicId);
  const [actionBusy, setActionBusy] = useState(false);
  const [selected, setSelected] = useState<GroomingDayBoardItem | null>(null);
  const [featuredOverride, setFeaturedOverride] = useState<GroomingDayBoardItem | null>(null);
  const [filterMineOnly, setFilterMineOnly] = useState(false);
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

  const load = useCallback(
    async () => {
      if (!clinicId) return;
      const seq = ++loadSeqRef.current;
      begin();
      try {
        const res = await hubGroomingApi.dayBoard(clinicId, dayRange, {
          unitId: unitIdParam,
        });
        if (seq !== loadSeqRef.current) return;
        setItems(res.items ?? []);
        setSelected((prev) => {
          if (!prev) return null;
          const key = itemBoardKey(prev);
          return res.items?.find((i) => itemBoardKey(i) === key) ?? prev;
        });
        setFeaturedOverride((prev) => {
          if (!prev) return null;
          const key = itemBoardKey(prev);
          return res.items?.find((i) => itemBoardKey(i) === key) ?? null;
        });
        succeed();
      } catch (e: unknown) {
        if (seq !== loadSeqRef.current) return;
        showError((e as Error)?.message || 'Erro ao carregar Minha fila');
        setItems([]);
      } finally {
        if (seq === loadSeqRef.current) finish();
      }
    },
    [clinicId, dayRange, unitIdParam, showError, begin, succeed, finish],
  );

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    void load();
  }, [clinicId, accessAllowed, load]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [clinicId, accessAllowed, load]);

  const itemsFiltered = useMemo(() => {
    if (!filterMineOnly || !myStaffMember?.id) return items;
    return items.filter((i) => i.hub_staff_member_id === myStaffMember.id);
  }, [items, filterMineOnly, myStaffMember?.id]);

  const handleQuickAction = async (item: GroomingDayBoardItem, action: GroomingQuickAction) => {
    if (!clinicId || !canWrite) return;
    setActionBusy(true);
    try {
      if (action.type === 'confirm_appointment' && item.appointment_id) {
        await hubAgendaApi.patch(item.appointment_id, { clinic_id: clinicId, status: 'confirmed' });
      } else if (action.type === 'check_in' && item.appointment_id) {
        await hubGroomingApi.openFromAppointment(
          clinicId,
          item.appointment_id,
          groomingOpenSessionStage(item),
        );
      } else if (action.type === 'advance' && item.session_id) {
        await hubGroomingApi.advanceSession(item.session_id, clinicId);
      }
      await load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao atualizar atendimento');
    } finally {
      setActionBusy(false);
    }
  };

  const handlePauseToggle = async (item: GroomingDayBoardItem) => {
    if (!clinicId || !item.session_id || !canPauseQueue) return;
    setActionBusy(true);
    try {
      const nextPaused = !item.paused_at;
      await hubGroomingApi.patchSession(item.session_id, { clinic_id: clinicId, paused: nextPaused });
      await load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao pausar ou retomar atendimento');
    } finally {
      setActionBusy(false);
    }
  };

  if (!permLoading && !clinicId) {
    return (
      <p className="hub-clientes__muted hub-clinic-page__pad">
        Selecione uma clínica para acessar Banho & Tosa.
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

  return (
    <div className="hub-grooming-page--floor">
      <HubRefreshingBanner show={refreshing} label="Atualizando fila…" />
      <GroomingFloorView
        items={itemsFiltered}
        dateLabel={dateLabel}
        loading={loading}
        busy={actionBusy}
        canWrite={canWrite}
        canPauseQueue={canPauseQueue}
        filterMineOnly={filterMineOnly}
        onFilterMineOnlyChange={setFilterMineOnly}
        showMineFilter={linked}
        canRequestServices={canWrite && !canAddExtras}
        onRefresh={() => void load()}
        onSelect={setSelected}
        onQuickAction={(item, action) => void handleQuickAction(item, action)}
        onPauseToggle={(item) => void handlePauseToggle(item)}
        featuredOverride={featuredOverride}
        onFeaturedOverride={setFeaturedOverride}
      />

      <GroomingAppointmentDrawer
        item={selected}
        open={!!selected}
        canWrite={canWrite}
        canPauseQueue={canPauseQueue}
        onPauseToggle={(item) => void handlePauseToggle(item)}
        showOperationalPricing={showOperationalPricing}
        busy={actionBusy}
        onClose={() => setSelected(null)}
        onQuickAction={handleQuickAction}
        onSessionUpdated={() => void load()}
        checkoutEnabled={false}
        canViewFinancial={canViewFinancial}
        canAddExtras={canAddExtras}
        canRequestServices={canWrite && !canAddExtras}
      />
    </div>
  );
};

export default HubGroomingFloorPage;
