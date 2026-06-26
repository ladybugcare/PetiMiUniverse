import React, { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Loader, MapPin, Phone } from 'lucide-react';
import { getStoredClinicId } from '@petimi/web-core';
import { HubSidePanel } from '../../components/HubSidePanel';
import { hubPickupApi, type PickupDayBoardItem, type PickupStopStatus } from '../../api/hubPickupApi';
import { hubAgendaApi } from '../../api/hubAgendaApi';
import { useAlert } from '../../components/AlertProvider';
import { buildWhatsappLink } from '../../utils/whatsappLink';

// ─── Mapa de transições válidas (espelha o backend) ───────────────────────

const VALID_STOP_TRANSITIONS: Record<PickupStopStatus, PickupStopStatus[]> = {
  pending: ['en_route', 'failed'],
  en_route: ['arrived', 'failed'],
  arrived: ['completed', 'failed'],
  completed: [],
  failed: [],
};

const STOP_STATUS_LABELS: Record<PickupStopStatus, string> = {
  pending: 'Pendente',
  en_route: 'A caminho',
  arrived: 'Chegou',
  completed: 'Concluído',
  failed: 'Falhou',
};

const ACTION_LABELS: Record<PickupStopStatus, string> = {
  pending: 'A caminho',
  en_route: 'Chegou',
  arrived: 'Concluído',
  completed: '',
  failed: '',
};

// Statuses que precisam de action primária (avançar), ignora failed
const ADVANCE_MAP: Partial<Record<PickupStopStatus, PickupStopStatus>> = {
  pending: 'en_route',
  en_route: 'arrived',
  arrived: 'completed',
};

function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Componente ───────────────────────────────────────────────────────────

export type PickupStopDrawerProps = {
  item: PickupDayBoardItem | null;
  open: boolean;
  canUpdate: boolean;
  onClose: () => void;
  onUpdated: () => void;
};

const PickupStopDrawer: React.FC<PickupStopDrawerProps> = ({
  item,
  open,
  canUpdate,
  onClose,
  onUpdated,
}) => {
  const clinicId = getStoredClinicId();
  const { showError, showSuccess } = useAlert();
  const [busy, setBusy] = useState(false);
  const [showFailForm, setShowFailForm] = useState(false);
  const [failureReason, setFailureReason] = useState('');

  if (!item) return null;

  const stopStatus = (item.stop_status ?? item.status) as PickupStopStatus;
  const nextStatus = ADVANCE_MAP[stopStatus];
  const canAdvance = !!nextStatus && canUpdate;
  const canFail =
    canUpdate &&
    VALID_STOP_TRANSITIONS[stopStatus]?.includes('failed') &&
    stopStatus !== 'failed';

  const handleAdvance = async () => {
    if (!clinicId || !nextStatus) return;
    setBusy(true);
    try {
      if (item.stop_id) {
        await hubPickupApi.patchStop(item.stop_id, {
          clinic_id: clinicId,
          status: nextStatus,
        });
      } else {
        // Perna solta: atualiza appointment diretamente
        const apptStatus =
          nextStatus === 'en_route' ? 'in_progress'
          : nextStatus === 'completed' ? 'done'
          : undefined;
        if (apptStatus) {
          await hubAgendaApi.patch(item.appointment_id, {
            clinic_id: clinicId,
            status: apptStatus as 'in_progress' | 'done',
          });
        }
      }
      showSuccess(`Status atualizado: ${STOP_STATUS_LABELS[nextStatus]}`);
      setShowFailForm(false);
      onUpdated();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao atualizar parada');
    } finally {
      setBusy(false);
    }
  };

  const handleFail = async () => {
    if (!clinicId || !failureReason.trim()) {
      showError('Informe o motivo da falha.');
      return;
    }
    setBusy(true);
    try {
      if (item.stop_id) {
        await hubPickupApi.patchStop(item.stop_id, {
          clinic_id: clinicId,
          status: 'failed',
          failure_reason: failureReason.trim(),
        });
      } else {
        await hubAgendaApi.patch(item.appointment_id, { clinic_id: clinicId, status: 'cancelled' });
      }
      showSuccess('Parada marcada como falhou.');
      setShowFailForm(false);
      setFailureReason('');
      onUpdated();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registrar falha');
    } finally {
      setBusy(false);
    }
  };

  const phone = item.guardian?.phone ?? null;
  const whatsappLink = phone ? buildWhatsappLink(phone, `Olá, ${item.guardian?.full_name ?? ''}! Estamos a caminho para buscar ${item.pet?.name ?? 'o pet'}.`) : null;

  const titleIcon =
    item.direction === 'pickup' ? (
      <ArrowDownToLine size={16} aria-hidden />
    ) : item.direction === 'delivery' ? (
      <ArrowUpFromLine size={16} aria-hidden />
    ) : null;

  const dirLabel =
    item.direction === 'pickup' ? 'Coleta' : item.direction === 'delivery' ? 'Entrega' : 'L&T';

  const footer = (
    <div className="hub-pickup-stop-drawer__actions">
      {canAdvance && !showFailForm ? (
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--primary"
          onClick={() => void handleAdvance()}
          disabled={busy}
        >
          {busy ? <Loader size={14} className="spin" aria-hidden /> : null}
          {ACTION_LABELS[stopStatus]}
        </button>
      ) : null}
      {canFail && !showFailForm ? (
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--ghost"
          onClick={() => setShowFailForm(true)}
          disabled={busy}
        >
          Registrar falha
        </button>
      ) : null}
      {showFailForm ? (
        <div className="hub-pickup-stop-drawer__fail-form">
          <textarea
            className="hub-clientes__input"
            placeholder="Motivo da falha (obrigatório)…"
            value={failureReason}
            onChange={(e) => setFailureReason(e.target.value)}
            rows={2}
            maxLength={1000}
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              style={{ background: 'var(--hub-danger, #dc2626)' }}
              onClick={() => void handleFail()}
              disabled={busy || !failureReason.trim()}
            >
              {busy ? <Loader size={14} className="spin" aria-hidden /> : null}
              Confirmar falha
            </button>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost"
              onClick={() => setShowFailForm(false)}
              disabled={busy}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title={`${dirLabel} — ${item.pet?.name ?? '—'}`}
      titleIcon={titleIcon}
      subtitle={item.guardian?.full_name}
      footer={footer}
    >
      <div className="hub-pickup-stop-drawer">
        {/* Status atual */}
        <div className="hub-pickup-stop-drawer__section">
          <span className="hub-pickup-stop-drawer__label">Status</span>
          <span className={`hub-clientes__pill${stopStatus === 'completed' ? ' hub-clinic-queue__pill--done' : stopStatus === 'en_route' || stopStatus === 'arrived' ? ' hub-clinic-queue__pill--progress' : ''}`}>
            {STOP_STATUS_LABELS[stopStatus]}
          </span>
          {item.failure_reason ? (
            <p className="hub-pickup-stop-drawer__failure-reason">
              Motivo: {item.failure_reason}
            </p>
          ) : null}
        </div>

        {/* Pet */}
        {item.pet ? (
          <div className="hub-pickup-stop-drawer__section">
            <span className="hub-pickup-stop-drawer__label">Pet</span>
            <p className="hub-pickup-stop-drawer__value">
              {item.pet.name}
              {item.pet.species ? ` · ${item.pet.species}` : ''}
              {item.pet.breed ? ` · ${item.pet.breed}` : ''}
            </p>
          </div>
        ) : null}

        {/* Tutor e contato */}
        {item.guardian ? (
          <div className="hub-pickup-stop-drawer__section">
            <span className="hub-pickup-stop-drawer__label">Tutor</span>
            <p className="hub-pickup-stop-drawer__value">{item.guardian.full_name}</p>
            {phone ? (
              <div className="hub-pickup-stop-drawer__contact">
                <a href={`tel:${phone}`} className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm">
                  <Phone size={13} aria-hidden />
                  Ligar
                </a>
                {whatsappLink ? (
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                  >
                    WhatsApp
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Endereço */}
        {item.address ? (
          <div className="hub-pickup-stop-drawer__section">
            <span className="hub-pickup-stop-drawer__label">
              <MapPin size={13} aria-hidden />
              Endereço
            </span>
            <p className="hub-pickup-stop-drawer__value">{item.address}</p>
          </div>
        ) : null}

        {/* Serviço de origem */}
        {item.service_type ? (
          <div className="hub-pickup-stop-drawer__section">
            <span className="hub-pickup-stop-drawer__label">Serviço de origem</span>
            <p className="hub-pickup-stop-drawer__value">{item.service_type.name}</p>
          </div>
        ) : null}

        {/* Horários */}
        <div className="hub-pickup-stop-drawer__section">
          <span className="hub-pickup-stop-drawer__label">Horário previsto</span>
          <p className="hub-pickup-stop-drawer__value">
            {formatTime(item.planned_at ?? item.starts_at)} – {formatTime(item.ends_at)}
          </p>
        </div>

        {item.completed_at ? (
          <div className="hub-pickup-stop-drawer__section">
            <span className="hub-pickup-stop-drawer__label">Concluído em</span>
            <p className="hub-pickup-stop-drawer__value">{formatDateTime(item.completed_at)}</p>
          </div>
        ) : null}

        {/* Notas */}
        {item.notes ? (
          <div className="hub-pickup-stop-drawer__section">
            <span className="hub-pickup-stop-drawer__label">Notas</span>
            <p className="hub-pickup-stop-drawer__value">{item.notes}</p>
          </div>
        ) : null}

        {/* Link Ver na agenda */}
        <div className="hub-pickup-stop-drawer__section">
          <a
            href={`/hub/appointments?highlight=${item.appointment_id}`}
            className="hub-pickup-card__agenda-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            Ver na agenda →
          </a>
        </div>
      </div>
    </HubSidePanel>
  );
};

export default PickupStopDrawer;
