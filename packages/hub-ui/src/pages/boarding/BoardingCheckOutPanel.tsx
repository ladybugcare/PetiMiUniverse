import React, { useCallback, useEffect, useState } from 'react';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubCancelButton } from '../../components/HubCancelButton';
import { HubLoading } from '../../components/HubLoading';
import { useAlert } from '../../components/AlertProvider';
import { hubBoardingApi, type BoardingDrawerResponse } from '../../api/hubBoardingApi';
import BoardingBelongingsSection from './BoardingBelongingsSection';
import BoardingTutorReportSection from './BoardingTutorReportSection';
import { todayYmd } from '../../utils/hubCalendar';
import { boardingModeLabel } from './boardingCareUi';

type Props = {
  open: boolean;
  clinicId: string;
  reservationId: string | null;
  onClose: () => void;
  onDone: () => void;
};

const BoardingCheckOutPanel: React.FC<Props> = ({
  open,
  clinicId,
  reservationId,
  onClose,
  onDone,
}) => {
  const { showError, showSuccess } = useAlert();
  const [drawer, setDrawer] = useState<BoardingDrawerResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);

  const load = useCallback(async () => {
    if (!reservationId) return;
    try {
      setDrawer(await hubBoardingApi.reservationDrawer(reservationId, clinicId));
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar a estadia');
    }
  }, [reservationId, clinicId, showError]);

  useEffect(() => {
    if (!open) {
      setDrawer(null);
      setFinished(false);
      return;
    }
    void load();
  }, [open, load]);

  if (!open || !reservationId) return null;

  const petName = drawer?.pet?.name ?? 'Pet';
  const belongings = drawer?.belongings ?? [];
  const unchecked = belongings.filter((b) => b.checkout_status === 'pending').length;
  const openIncidents = (drawer?.incidents ?? []).filter((i) => i.status === 'open');
  const today = todayYmd();
  const todayPending = (drawer?.tasks ?? []).filter((t) => t.status === 'pending' && t.task_date <= today);

  const checkout = async () => {
    setBusy(true);
    try {
      await hubBoardingApi.patchReservation(reservationId, {
        clinic_id: clinicId,
        status: 'checked_out',
        checked_out_at: new Date().toISOString(),
      });
      showSuccess(`Check-out de ${petName} feito`);
      setFinished(true);
      await load();
      onDone();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao fazer check-out');
    } finally {
      setBusy(false);
    }
  };

  const footer = finished ? (
    <div className="hub-clientes__panel-footer">
      <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={onClose}>
        Fechar
      </button>
    </div>
  ) : (
    <div className="hub-clientes__panel-footer">
      <HubCancelButton onClick={onClose} />
      <button
        type="button"
        className="hub-clientes__btn hub-clientes__btn--primary"
        disabled={busy || !drawer}
        onClick={() => void checkout()}
      >
        {busy ? 'Registrando…' : unchecked ? `Confirmar saída (${unchecked} pertence(s) sem conferir)` : 'Confirmar saída'}
      </button>
    </div>
  );

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title={finished ? `${petName} saiu` : `Check-out · ${petName}`}
      subtitle={drawer ? `${boardingModeLabel(drawer.reservation.mode)} · ${drawer.guardian?.full_name ?? ''}` : undefined}
      footer={footer}
    >
      <div className="hub-grooming-drawer">
        {!drawer ? (
          <HubLoading variant="block" label="Carregando estadia…" />
        ) : (
          <>
            {!finished && (openIncidents.length || todayPending.length) ? (
              <section className="hub-grooming-drawer__callout hub-grooming-drawer__callout--request">
                <h4 className="hub-grooming-drawer__heading">Antes de liberar</h4>
                <ul className="hub-grooming-drawer__request-list">
                  {openIncidents.length ? (
                    <li>
                      <span className="hub-grooming-drawer__request-dot" aria-hidden />
                      {openIncidents.length === 1 ? 'Uma intercorrência em aberto' : `${openIncidents.length} intercorrências em aberto`}
                      {' — conte ao tutor na entrega'}
                    </li>
                  ) : null}
                  {todayPending.length ? (
                    <li>
                      <span className="hub-grooming-drawer__request-dot" aria-hidden />
                      {todayPending.length === 1 ? 'Uma tarefa sem registro' : `${todayPending.length} tarefas sem registro`}
                      {' — serão encerradas na saída'}
                    </li>
                  ) : null}
                </ul>
              </section>
            ) : null}

            {finished ? (
              <div className="hub-grooming-drawer__ready-banner" role="status">
                Saída registrada. Cobrança fica no Caixa.
              </div>
            ) : null}

            <BoardingBelongingsSection
              clinicId={clinicId}
              reservationId={reservationId}
              belongings={belongings}
              variant="checkout"
              onChanged={load}
            />

            <BoardingTutorReportSection
              clinicId={clinicId}
              reservationId={reservationId}
              guardianId={drawer.guardian?.id}
              petId={drawer.pet?.id}
              kinds={finished ? ['stay_summary'] : ['pickup', 'stay_summary']}
              history={drawer.tutor_reports ?? []}
            />
          </>
        )}
      </div>
    </HubSidePanel>
  );
};

export default BoardingCheckOutPanel;
