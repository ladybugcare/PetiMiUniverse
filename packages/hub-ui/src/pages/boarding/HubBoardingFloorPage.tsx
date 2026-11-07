import React, { useEffect, useMemo, useState } from 'react';
import { getStoredClinicId, useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useAlert } from '../../components/AlertProvider';
import { hubBoardingApi, type BoardingTask } from '../../api/hubBoardingApi';
import { dayRangeIsoLocal, isUuid, loadAgendaPersistedFilters } from '../agenda/agendaFilters';
import { useBoardingOpsBoard } from './useBoardingOpsBoard';
import { useBoardingTaskRunner } from './useBoardingTaskRunner';
import BoardingFloorView from './BoardingFloorView';
import BoardingStayPanel, { type BoardingStayTarget } from './BoardingStayPanel';
import BoardingCheckInPanel, { type CheckInRequest } from './BoardingCheckInPanel';
import BoardingCheckOutPanel from './BoardingCheckOutPanel';
import BoardingHandoffPanel from './BoardingHandoffPanel';
import BoardingGroupActivityPanel from './BoardingGroupActivityPanel';
import '../clinica/clinica-page.css';
import '../clientes/clientes.css';
import '../grooming/grooming-page.css';
import './boarding-page.css';

/**
 * Minha fila — visão de chão (celular) para Hotel & Creche, em /hub/hotel-creche/minha-fila.
 * Check-in e check-out usam `boarding.reservations.manage`
 * (CSTAFF hotel_creche opera sem `hub.appointments.write`).
 */
const HubBoardingFloorPage: React.FC = () => {
  const { role: authRole } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError, showSuccess } = useAlert();
  const clinicId = getStoredClinicId();
  const accessAllowed = hasPermission('boarding.reservations.read');
  const canWrite = hasPermission('boarding.reservations.manage');
  const canDailyReport = hasPermission('boarding.daily_report.write');
  const canManageFinance = hasPermission('hub.receivables.create');
  const canWriteInventory = hasPermission('hub.inventory.write');

  const [unitFilter] = useState(() => loadAgendaPersistedFilters().unit ?? 'all');
  const unitIdParam = unitFilter !== 'all' && isUuid(unitFilter) ? unitFilter : undefined;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const today = useMemo(() => new Date(nowMs), [nowMs]);
  const dateYmd = dayRangeIsoLocal(today).dateYmd;

  const [stayTarget, setStayTarget] = useState<BoardingStayTarget | null>(null);
  const [checkInRequest, setCheckInRequest] = useState<CheckInRequest | null>(null);
  const [checkOutId, setCheckOutId] = useState<string | null>(null);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);

  const { board, loading, refreshing, reload } = useBoardingOpsBoard({
    clinicId,
    unitId: unitIdParam,
    dateYmd,
    enabled: Boolean(clinicId) && accessAllowed && !permLoading,
    channelKey: 'hub_boarding_floor',
  });
  const refresh = () => void reload({ soft: true });
  const { busyTaskId, run } = useBoardingTaskRunner(clinicId, () => reload({ soft: true }));

  const attachTaskPhoto = async (task: BoardingTask, file: File) => {
    if (!clinicId) return;
    try {
      await hubBoardingApi.uploadMedia({
        clinicId,
        reservationId: task.hub_boarding_reservation_id,
        file,
        taskId: task.id,
        caption: task.title,
      });
      showSuccess('Foto anexada à tarefa');
      refresh();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao enviar a foto');
    }
  };

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) redirectAwayFromHub(authRole as AppRole);
  }, [permLoading, accessAllowed, authRole]);

  // "Atrasada" e "Agora" dependem do relógio.
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (!permLoading && !clinicId) {
    return <p className="hub-clientes__muted hub-clinic-page__pad">Selecione uma clínica para acessar Hotel & Creche.</p>;
  }

  if (permLoading || !accessAllowed) {
    return (
      <div className="hub-clinic-page__pad">
        <HubLoading variant="block" />
      </div>
    );
  }

  const lastHandoff = board?.last_handoff;
  const handoffPending =
    Boolean(lastHandoff && !lastHandoff.acknowledged_at) &&
    nowMs - new Date(lastHandoff!.created_at).getTime() < 12 * 3600_000;

  return (
    <div className="hub-boarding-page--floor">
      <HubRefreshingBanner show={refreshing && !loading} label="Atualizando…" />
      <BoardingFloorView
        board={board}
        dateLabel={today.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        loading={loading}
        canWrite={canWrite}
        canDailyReport={canDailyReport}
        busyTaskId={busyTaskId}
        handoffPending={handoffPending}
        nowMs={nowMs}
        onRefresh={() => void reload()}
        onTaskAction={(task, action) => void run(task, action)}
        onAttachPhoto={(task, file) => void attachTaskPhoto(task, file)}
        onOpenStay={(stay, reservationId, tab) =>
          setStayTarget({ reservationId: reservationId || null, stay, initialTab: tab })
        }
        onCheckIn={(stay) =>
          setCheckInRequest({ reservationId: stay.reservation_id, appointmentId: stay.appointment_id ?? null, stay })
        }
        onCheckOut={(stay) => stay.reservation_id && setCheckOutId(stay.reservation_id)}
        onOpenHandoff={() => setHandoffOpen(true)}
        onOpenGroupActivity={() => setGroupOpen(true)}
      />

      <BoardingStayPanel
        open={!!stayTarget}
        target={stayTarget}
        canManage={canWrite}
        canDailyReport={canDailyReport}
        canManageFinance={canManageFinance}
        canWriteInventory={canWriteInventory}
        unitId={unitIdParam}
        onClose={() => setStayTarget(null)}
        onUpdated={refresh}
        onRequestCheckIn={(req) => setCheckInRequest(req)}
        onRequestCheckOut={(rid) => setCheckOutId(rid)}
      />

      {canWrite ? (
        <>
          <BoardingCheckInPanel
            open={!!checkInRequest}
            clinicId={clinicId ?? ''}
            unitId={unitIdParam}
            request={checkInRequest}
            onClose={() => setCheckInRequest(null)}
            onDone={() => {
              setCheckInRequest(null);
              refresh();
            }}
            onReviewCare={(rid) => {
              setCheckInRequest(null);
              setStayTarget({ reservationId: rid, initialTab: 'care' });
            }}
          />
          <BoardingCheckOutPanel
            open={!!checkOutId}
            clinicId={clinicId ?? ''}
            reservationId={checkOutId}
            unitId={unitIdParam}
            canManageFinance={canManageFinance}
            onClose={() => setCheckOutId(null)}
            onDone={refresh}
          />
        </>
      ) : null}

      <BoardingHandoffPanel
        open={handoffOpen}
        clinicId={clinicId ?? ''}
        unitId={unitIdParam}
        board={board}
        canWrite={canDailyReport || canWrite}
        onClose={() => setHandoffOpen(false)}
        onChanged={refresh}
      />

      {canDailyReport ? (
        <BoardingGroupActivityPanel
          open={groupOpen}
          clinicId={clinicId ?? ''}
          stays={board?.stays ?? []}
          onClose={() => setGroupOpen(false)}
          onDone={() => {
            setGroupOpen(false);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
};

export default HubBoardingFloorPage;
