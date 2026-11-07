import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubCancelButton } from '../../components/HubCancelButton';
import { HubLoading } from '../../components/HubLoading';
import { useAlert } from '../../components/AlertProvider';
import { hubBoardingApi, type BoardingDrawerResponse } from '../../api/hubBoardingApi';
import { hubComandaApi } from '../../api/hubComandaApi';
import BoardingBelongingsSection from './BoardingBelongingsSection';
import BoardingTutorReportSection from './BoardingTutorReportSection';
import { todayYmd } from '../../utils/hubCalendar';
import { boardingModeLabel, formatBRL } from './boardingCareUi';

type Props = {
  open: boolean;
  clinicId: string;
  reservationId: string | null;
  unitId?: string | null;
  canManageFinance?: boolean;
  onClose: () => void;
  onDone: () => void;
};

const BoardingCheckOutPanel: React.FC<Props> = ({
  open,
  clinicId,
  reservationId,
  unitId,
  canManageFinance,
  onClose,
  onDone,
}) => {
  const { showError, showSuccess } = useAlert();
  const navigate = useNavigate();
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
  const pricing = drawer?.pricing;

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

  const billing = async () => {
    setBusy(true);
    try {
      const detail = await hubComandaApi.openComanda({
        clinic_id: clinicId,
        origin_type: 'boarding_reservation',
        origin_id: reservationId,
        unit_id: unitId ?? undefined,
      });
      const comandaId = (detail.comanda as Record<string, unknown>)?.id as string | undefined;
      showSuccess('Comanda aberta.');
      if (comandaId) navigate(`/hub/caixa/comanda/${comandaId}`);
      onClose();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao gerar cobrança');
    } finally {
      setBusy(false);
    }
  };

  const footer = finished ? (
    <div className="hub-clientes__panel-footer">
      <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={onClose}>
        Fechar
      </button>
      {canManageFinance ? (
        <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" disabled={busy} onClick={() => void billing()}>
          {busy ? 'Abrindo…' : 'Gerar cobrança'}
        </button>
      ) : null}
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
                Saída registrada. {canManageFinance ? 'Gere a cobrança para fechar a estadia no caixa.' : 'A recepção fecha a cobrança no caixa.'}
              </div>
            ) : null}

            <BoardingBelongingsSection
              clinicId={clinicId}
              reservationId={reservationId}
              belongings={belongings}
              variant="checkout"
              onChanged={load}
            />

            {pricing ? (
              <section className="hub-grooming-drawer__section">
                <h4 className="hub-grooming-drawer__heading">Resumo</h4>
                <ul className="hub-grooming-drawer__lines">
                  <li className="hub-grooming-drawer__line">
                    <span className="hub-grooming-drawer__line-name">
                      {drawer.service_type?.name ?? boardingModeLabel(drawer.reservation.mode)}
                      <span className="hub-grooming-drawer__line-state">
                        {' '}
                        · {pricing.quantity} {drawer.reservation.mode === 'hotel' ? (pricing.quantity === 1 ? 'diária' : 'diárias') : pricing.quantity === 1 ? 'dia' : 'dias'}
                      </span>
                    </span>
                    <span className="hub-grooming-drawer__line-price">{formatBRL(pricing.base)}</span>
                  </li>
                  {pricing.extras > 0 ? (
                    <li className="hub-grooming-drawer__line">
                      <span className="hub-grooming-drawer__line-name">Adicionais ({(drawer.extras ?? []).length})</span>
                      <span className="hub-grooming-drawer__line-price">{formatBRL(pricing.extras)}</span>
                    </li>
                  ) : null}
                  <li className="hub-grooming-drawer__line hub-grooming-drawer__line--done">
                    <span className="hub-grooming-drawer__line-name">
                      <strong>Total estimado</strong>
                    </span>
                    <strong>{formatBRL(pricing.total)}</strong>
                  </li>
                </ul>
                {!finished && drawer.reservation.mode === 'hotel' && pricing.cutoff_time ? (
                  <p className="hub-grooming-drawer__subtotal">
                    Saída depois das {pricing.cutoff_time.slice(0, 5)} conta mais uma diária. O valor final sai na comanda.
                  </p>
                ) : null}
              </section>
            ) : null}

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
