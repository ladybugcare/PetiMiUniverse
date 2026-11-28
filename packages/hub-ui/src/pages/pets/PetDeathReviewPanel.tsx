import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '@petimi/web-core';
import { HubSidePanel } from '../../components/HubSidePanel';
import { useAlert } from '../../components/AlertProvider';
import { hubAgendaApi } from '../../api/hubAgendaApi';
import { hubBoardingApi } from '../../api/hubBoardingApi';
import { hubClinicalApi } from '../../api/hubClinicalApi';
import type {
  HubPetDeathCancelledAppointment,
  HubPetDeathPending,
  HubPetDeathPendingReviewItem,
} from '../../api/hubPetsApi';
import '../clientes/clientes.css';
import './pet-death-review-panel.css';

export type PetDeathReviewPanelProps = {
  open: boolean;
  onClose: () => void;
  petName: string;
  pending: HubPetDeathPending | null;
  clinicId: string;
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending_confirm: 'Aguardando confirmação',
    confirmed: 'Confirmado',
    checked_in: 'Check-in',
    in_progress: 'Em andamento',
    cancelled: 'Cancelado',
    reserved: 'Reservado',
    checkout_preparing: 'Preparando saída',
    ready_for_handoff: 'Pronto para entrega',
    scheduled: 'Agendada',
    queued: 'Na fila',
    in_service: 'Em serviço',
    finishing: 'Finalização',
    ready: 'Pronto',
  };
  return map[status] || status;
}

function reviewKindLabel(item: HubPetDeathPendingReviewItem): string {
  if (item.kind === 'boarding_reservation') return item.label || 'Hotel / creche';
  if (item.kind === 'grooming_session') return item.label || 'Banho & tosa';
  if (item.kind === 'surgery_scheduled') return item.label || 'Cirurgia agendada';
  return item.service_name || item.label || 'Agendamento em andamento';
}

function itemMeta(item: HubPetDeathPendingReviewItem): string {
  if (item.kind === 'boarding_reservation') {
    return `${formatWhen(item.expected_check_in)} → ${formatWhen(item.expected_check_out)} · ${statusLabel(item.status)}`;
  }
  return `${formatWhen(item.starts_at)} · ${statusLabel(item.status)}`;
}

function agendaHref(appointmentId: string, startsAt?: string | null): string {
  const params = new URLSearchParams({ appointment_id: appointmentId });
  if (startsAt) {
    const d = new Date(startsAt);
    if (!Number.isNaN(d.getTime())) {
      params.set('date', d.toISOString().slice(0, 10));
    }
  }
  return `/hub/agenda?${params.toString()}`;
}

export const PetDeathReviewPanel: React.FC<PetDeathReviewPanelProps> = ({
  open,
  onClose,
  petName,
  pending,
  clinicId,
}) => {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const { showError, showSuccess, showConfirm } = useAlert();

  const canCancelBoarding = hasPermission('boarding.reservations.manage');
  const canCancelAppointment = hasPermission('hub.appointments.write');
  const canOpenGrooming = hasPermission('grooming.queue.read');
  const canCancelSurgery = hasPermission('hub.clinic.write');
  const canOpenHotel = hasPermission('boarding.reservations.manage') || hasPermission('hub.appointments.write');
  const canOpenAgenda = hasPermission('hub.appointments.write') || hasPermission('hub.appointments.read');

  const cancelled = useMemo<HubPetDeathCancelledAppointment[]>(
    () => pending?.cancelled_appointments_list ?? [],
    [pending],
  );

  const [review, setReview] = useState<HubPetDeathPendingReviewItem[]>(
    () => pending?.pending_review ?? [],
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReview(pending?.pending_review ?? []);
    setBusyKey(null);
  }, [open, pending]);

  const removeItem = (kind: string, id: string) => {
    setReview((prev) => prev.filter((i) => !(i.kind === kind && i.id === id)));
  };

  const cancelBoardingReserved = (item: HubPetDeathPendingReviewItem) => {
    if (!clinicId || item.status !== 'reserved') return;
    showConfirm(
      'Cancelar esta reserva de hotel/creche? Cobrança sem pagamento será anulada.',
      () => {
        void (async () => {
          const key = `${item.kind}-${item.id}`;
          setBusyKey(key);
          try {
            await hubBoardingApi.patchReservation(item.id, {
              clinic_id: clinicId,
              status: 'cancelled',
            });
            removeItem(item.kind, item.id);
            showSuccess('Reserva cancelada');
          } catch (e: unknown) {
            showError((e as Error)?.message || 'Erro ao cancelar reserva');
          } finally {
            setBusyKey(null);
          }
        })();
      },
      'Cancelar reserva',
    );
  };

  const cancelAppointmentInProgress = (item: HubPetDeathPendingReviewItem) => {
    if (!clinicId) return;
    showConfirm(
      'Cancelar este agendamento em andamento? Cobrança sem pagamento será anulada; com pagamento fica pendência no caixa.',
      () => {
        void (async () => {
          const key = `${item.kind}-${item.id}`;
          setBusyKey(key);
          try {
            await hubAgendaApi.patch(item.id, { clinic_id: clinicId, status: 'cancelled' });
            removeItem(item.kind, item.id);
            showSuccess('Agendamento cancelado');
          } catch (e: unknown) {
            showError((e as Error)?.message || 'Erro ao cancelar agendamento');
          } finally {
            setBusyKey(null);
          }
        })();
      },
      'Cancelar agendamento',
    );
  };

  const cancelSurgeryScheduled = (item: HubPetDeathPendingReviewItem) => {
    if (!clinicId) return;
    showConfirm(
      'Cancelar esta ficha de cirurgia agendada?',
      () => {
        void (async () => {
          const key = `${item.kind}-${item.id}`;
          setBusyKey(key);
          try {
            await hubClinicalApi.patchSurgery(item.id, {
              clinic_id: clinicId,
              status: 'cancelled',
            });
            removeItem(item.kind, item.id);
            showSuccess('Cirurgia cancelada');
          } catch (e: unknown) {
            showError((e as Error)?.message || 'Erro ao cancelar cirurgia');
          } finally {
            setBusyKey(null);
          }
        })();
      },
      'Cancelar cirurgia',
    );
  };

  const openAndClose = (href: string) => {
    onClose();
    navigate(href);
  };

  const renderActions = (item: HubPetDeathPendingReviewItem) => {
    const key = `${item.kind}-${item.id}`;
    const busy = busyKey === key;
    const actions: React.ReactNode[] = [];

    if (item.kind === 'boarding_reservation') {
      if (item.status === 'reserved' && canCancelBoarding) {
        actions.push(
          <button
            key="cancel-board"
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-pet-death-review__cta"
            disabled={busy}
            onClick={() => cancelBoardingReserved(item)}
          >
            {busy ? 'Cancelando…' : 'Cancelar reserva'}
          </button>,
        );
      }
      if (item.status !== 'reserved' && canOpenHotel) {
        actions.push(
          <button
            key="open-hotel"
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-pet-death-review__cta"
            disabled={busy}
            onClick={() =>
              openAndClose(`/hub/hotel-creche?reservation=${encodeURIComponent(item.id)}`)
            }
          >
            Abrir Hotel
          </button>,
        );
      }
    }

    if (item.kind === 'appointment_in_progress') {
      if (canOpenAgenda) {
        actions.push(
          <button
            key="open-agenda"
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-pet-death-review__cta"
            disabled={busy}
            onClick={() => openAndClose(agendaHref(item.id, item.starts_at))}
          >
            Abrir Agenda
          </button>,
        );
      }
      if (canCancelAppointment) {
        actions.push(
          <button
            key="cancel-appt"
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-pet-death-review__cta"
            disabled={busy}
            onClick={() => cancelAppointmentInProgress(item)}
          >
            {busy ? 'Cancelando…' : 'Cancelar'}
          </button>,
        );
      }
    }

    if (item.kind === 'grooming_session' && canOpenGrooming) {
      actions.push(
        <button
          key="open-groom"
          type="button"
          className="hub-clientes__btn hub-clientes__btn--ghost hub-pet-death-review__cta"
          disabled={busy}
          onClick={() =>
            openAndClose(`/hub/banho-tosa?session=${encodeURIComponent(item.id)}`)
          }
        >
          Abrir Banho & Tosa
        </button>,
      );
    }

    if (item.kind === 'surgery_scheduled' && canCancelSurgery) {
      actions.push(
        <button
          key="cancel-surg"
          type="button"
          className="hub-clientes__btn hub-clientes__btn--ghost hub-pet-death-review__cta"
          disabled={busy}
          onClick={() => cancelSurgeryScheduled(item)}
        >
          {busy ? 'Cancelando…' : 'Cancelar ficha'}
        </button>,
      );
      actions.push(
        <button
          key="open-surg"
          type="button"
          className="hub-clientes__btn hub-clientes__btn--ghost hub-pet-death-review__cta"
          disabled={busy}
          onClick={() => openAndClose(`/hub/clinica/cirurgias/${encodeURIComponent(item.id)}`)}
        >
          Abrir cirurgia
        </button>,
      );
    }

    if (actions.length === 0) {
      return (
        <span className="hub-pet-death-review__badge hub-pet-death-review__badge--warn">
          Revisar
        </span>
      );
    }

    return <div className="hub-pet-death-review__actions">{actions}</div>;
  };

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title="Revisão após óbito"
      subtitle={petName}
      footer={
        <div className="hub-clientes__panel-footer">
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            onClick={onClose}
          >
            Concluir
          </button>
        </div>
      }
    >
      <div className="hub-pet-death-review">
        <p className="hub-pet-death-review__intro">
          Agendamentos futuros ainda não iniciados foram cancelados automaticamente. Itens abaixo
          pedem revisão — use as ações quando for seguro cancelar, ou abra o módulo operacional.
        </p>

        <section className="hub-pet-death-review__section" aria-labelledby="pet-death-cancelled">
          <h3 id="pet-death-cancelled" className="hub-pet-death-review__heading">
            Cancelados automaticamente
            <span className="hub-pet-death-review__count">{cancelled.length}</span>
          </h3>
          {cancelled.length === 0 ? (
            <p className="hub-pet-death-review__empty">Nenhum agendamento futuro cancelado.</p>
          ) : (
            <ul className="hub-pet-death-review__list">
              {cancelled.map((item) => (
                <li key={item.id} className="hub-pet-death-review__item">
                  <div className="hub-pet-death-review__item-main">
                    <span className="hub-pet-death-review__item-title">
                      {item.service_name || 'Agendamento'}
                    </span>
                    <span className="hub-pet-death-review__item-meta">
                      {formatWhen(item.starts_at)}
                    </span>
                  </div>
                  <span className="hub-pet-death-review__badge hub-pet-death-review__badge--ok">
                    Cancelado
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="hub-pet-death-review__section" aria-labelledby="pet-death-pending">
          <h3 id="pet-death-pending" className="hub-pet-death-review__heading">
            Precisa de revisão
            <span className="hub-pet-death-review__count">{review.length}</span>
          </h3>
          {review.length === 0 ? (
            <p className="hub-pet-death-review__empty">Nada pendente para revisar agora.</p>
          ) : (
            <>
              <p className="hub-pet-death-review__hint">
                Hotel em custódia e serviços já iniciados não foram alterados automaticamente.
                Checkout de hotel segue o fluxo operacional normal.
              </p>
              <ul className="hub-pet-death-review__list">
                {review.map((item) => (
                  <li key={`${item.kind}-${item.id}`} className="hub-pet-death-review__item">
                    <div className="hub-pet-death-review__item-main">
                      <span className="hub-pet-death-review__item-title">
                        {reviewKindLabel(item)}
                      </span>
                      <span className="hub-pet-death-review__item-meta">{itemMeta(item)}</span>
                    </div>
                    {renderActions(item)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </HubSidePanel>
  );
};

export default PetDeathReviewPanel;
