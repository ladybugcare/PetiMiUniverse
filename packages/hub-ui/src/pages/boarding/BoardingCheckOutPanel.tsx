import React, { useCallback, useEffect, useState } from 'react';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubCancelButton } from '../../components/HubCancelButton';
import { HubLoading } from '../../components/HubLoading';
import { useAlert } from '../../components/AlertProvider';
import { usePermissions } from '@petimi/web-core';
import { hubBoardingApi, type BoardingDrawerResponse } from '../../api/hubBoardingApi';
import { hubReceptionApi } from '../../api/hubReceptionApi';
import BoardingBelongingsSection from './BoardingBelongingsSection';
import BoardingTutorReportSection from './BoardingTutorReportSection';
import { todayYmd } from '../../utils/hubCalendar';
import { boardingModeLabel } from './boardingCareUi';
import { BOARDING_STAGE_LABELS, type BoardingStage } from './boardingStages';

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
  const { hasPermission } = usePermissions();
  const canDeliverAtCounter = hasPermission('reception.ops.manage');
  const [drawer, setDrawer] = useState<BoardingDrawerResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [forceReason, setForceReason] = useState('');

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
      setForceReason('');
      return;
    }
    void load();
  }, [open, load]);

  if (!open || !reservationId) return null;

  const petName = drawer?.pet?.name ?? 'Pet';
  const status = (drawer?.reservation.status ?? 'checked_in') as BoardingStage;
  const belongings = drawer?.belongings ?? [];
  const unchecked = belongings.filter((b) => b.checkout_status === 'pending').length;
  const openIncidents = (drawer?.incidents ?? []).filter((i) => i.status === 'open');
  const today = todayYmd();
  const todayPending = (drawer?.tasks ?? []).filter((t) => t.status === 'pending' && t.task_date <= today);
  const statusLabel = BOARDING_STAGE_LABELS[status] ?? status;

  const startPrep = async () => {
    setBusy(true);
    try {
      await hubBoardingApi.startCheckoutPrep(reservationId, clinicId);
      showSuccess('Preparação de saída iniciada');
      await load();
      onDone();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao iniciar preparação');
    } finally {
      setBusy(false);
    }
  };

  const release = async (force: boolean) => {
    setBusy(true);
    try {
      await hubBoardingApi.releaseForHandoff(reservationId, {
        clinic_id: clinicId,
        force_belongings: force || undefined,
        force_belongings_reason: force ? forceReason.trim() || null : null,
      });
      showSuccess(`${petName} liberado para a recepção`);
      await load();
      onDone();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao liberar para a recepção');
    } finally {
      setBusy(false);
    }
  };

  const revert = async () => {
    setBusy(true);
    try {
      await hubBoardingApi.revertHandoffReady(reservationId, clinicId);
      showSuccess('Voltou para preparação de saída');
      await load();
      onDone();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao voltar preparação');
    } finally {
      setBusy(false);
    }
  };

  const deliverAtCounter = async () => {
    if (!canDeliverAtCounter) return;
    setBusy(true);
    try {
      // Garante liberação antes de procurar o handoff.
      if (status !== 'ready_for_handoff') {
        await hubBoardingApi.releaseForHandoff(reservationId, {
          clinic_id: clinicId,
          force_belongings: unchecked > 0,
          force_belongings_reason: unchecked > 0 ? forceReason.trim() || 'Entrega no balcão pelo hotel' : null,
        });
      }
      const unitId = drawer?.reservation.unit_id;
      if (!unitId) throw new Error('Estadia sem unidade');
      const board = await hubReceptionApi.board(clinicId, unitId, today);
      const handoff = board.items.find(
        (i) =>
          i.status === 'open' &&
          i.source_type === 'boarding_reservation' &&
          i.source_id === reservationId &&
          (i.kind === 'retirada_balcao' || i.kind === 'embarque'),
      );
      if (!handoff) throw new Error('Tarefa da recepção ainda não apareceu. Atualize a Operação da Recepção.');
      const action = handoff.kind === 'embarque' ? 'embarquei' : 'entreguei';
      await hubReceptionApi.resolve(handoff.id, clinicId, action);
      showSuccess(`Saída de ${petName} confirmada`);
      setFinished(true);
      await load();
      onDone();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registrar entrega no balcão');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const footer = finished || status === 'checked_out' ? (
    <div className="hub-clientes__panel-footer">
      <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={onClose}>
        Fechar
      </button>
    </div>
  ) : (
    <div className="hub-clientes__panel-footer hub-clientes__panel-footer--stack">
      <HubCancelButton onClick={onClose} />
      {status === 'checked_in' ? (
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--primary"
          disabled={busy || !drawer}
          onClick={() => void startPrep()}
        >
          {busy ? 'Salvando…' : 'Iniciar preparação'}
        </button>
      ) : null}
      {status === 'checkout_preparing' || status === 'checked_in' ? (
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--primary"
          disabled={busy || !drawer || (unchecked > 0 && !forceReason.trim())}
          onClick={() => void release(unchecked > 0)}
        >
          {busy
            ? 'Liberando…'
            : unchecked
              ? `Liberar com ${unchecked} pertence(s) pendente(s)`
              : 'Liberar para recepção'}
        </button>
      ) : null}
      {status === 'ready_for_handoff' ? (
        <>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost"
            disabled={busy}
            onClick={() => void revert()}
          >
            Voltar preparação
          </button>
          {canDeliverAtCounter ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              disabled={busy}
              onClick={() => void deliverAtCounter()}
            >
              {busy ? 'Registrando…' : 'Entregar no balcão agora'}
            </button>
          ) : (
            <p className="hub-clientes__muted" style={{ margin: 0 }}>
              Aguardando a Operação da Recepção confirmar a entrega.
            </p>
          )}
        </>
      ) : null}
      {(status === 'checked_in' || status === 'checkout_preparing') && canDeliverAtCounter ? (
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--ghost"
          disabled={busy || !drawer || (unchecked > 0 && !forceReason.trim())}
          onClick={() => void deliverAtCounter()}
        >
          Liberar e entregar no balcão
        </button>
      ) : null}
    </div>
  );

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title={finished || status === 'checked_out' ? `${petName} saiu` : `Saída · ${petName}`}
      subtitle={drawer ? `${boardingModeLabel(drawer.reservation.mode)} · ${drawer.guardian?.full_name ?? ''}` : undefined}
      footer={footer}
    >
      <div className="hub-grooming-drawer">
        {!drawer ? (
          <HubLoading variant="block" label="Carregando estadia…" />
        ) : (
          <>
            <div className="hub-grooming-drawer__ready-banner" role="status">
              Status: {statusLabel}
              {status === 'ready_for_handoff'
                ? ' — pet na fila da recepção'
                : status === 'checkout_preparing'
                  ? ' — confira pertences e pendências'
                  : status === 'checked_out'
                    ? ' — saída concluída'
                    : ' — inicie a preparação ou liberação'}
            </div>

            {!finished && status !== 'checked_out' && (openIncidents.length || todayPending.length) ? (
              <section className="hub-grooming-drawer__callout hub-grooming-drawer__callout--request">
                <h4 className="hub-grooming-drawer__heading">Antes de liberar</h4>
                <ul className="hub-grooming-drawer__request-list">
                  {openIncidents.length ? (
                    <li>
                      <span className="hub-grooming-drawer__request-dot" aria-hidden />
                      {openIncidents.length === 1
                        ? 'Uma intercorrência em aberto'
                        : `${openIncidents.length} intercorrências em aberto`}
                      {' — conte ao tutor na entrega'}
                    </li>
                  ) : null}
                  {todayPending.length ? (
                    <li>
                      <span className="hub-grooming-drawer__request-dot" aria-hidden />
                      {todayPending.length === 1 ? 'Uma tarefa sem registro' : `${todayPending.length} tarefas sem registro`}
                    </li>
                  ) : null}
                </ul>
              </section>
            ) : null}

            {unchecked > 0 && status !== 'checked_out' && status !== 'ready_for_handoff' ? (
              <label className="hub-clientes__field">
                <span className="hub-clientes__label">Motivo para liberar com pertences pendentes</span>
                <input
                  className="hub-clientes__input"
                  value={forceReason}
                  onChange={(e) => setForceReason(e.target.value)}
                  placeholder="Ex.: tutor leva o restante amanhã"
                />
              </label>
            ) : null}

            {finished || status === 'checked_out' ? (
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
              kinds={finished || status === 'checked_out' ? ['stay_summary'] : ['pickup', 'stay_summary']}
              history={drawer.tutor_reports ?? []}
            />
          </>
        )}
      </div>
    </HubSidePanel>
  );
};

export default BoardingCheckOutPanel;
