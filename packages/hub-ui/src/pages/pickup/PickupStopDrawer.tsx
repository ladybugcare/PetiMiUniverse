import React, { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Calendar, Clock, ExternalLink, Loader, MapPin, Phone, Tag } from 'lucide-react';
import { getStoredClinicId } from '@petimi/web-core';
import { HubSidePanel } from '../../components/HubSidePanel';
import { hubPickupApi, type PickupDayBoardItem, type PickupDirection, type PickupStopStatus } from '../../api/hubPickupApi';
import { hubAgendaApi } from '../../api/hubAgendaApi';
import { useAlert } from '../../components/AlertProvider';

// ─── Labels de status por sentido ─────────────────────────────────────────

const STOP_STATUS_LABELS_PICKUP: Record<PickupStopStatus, string> = {
  pending:    'Pendente',
  en_route:   'A caminho do tutor',
  arrived:    'No endereço',
  in_transit: 'Pet a bordo',
  completed:  'Na clínica',
  failed:     'Falhou',
};

const STOP_STATUS_LABELS_DELIVERY: Record<PickupStopStatus, string> = {
  pending:    'Pendente',
  en_route:   'A caminho do tutor',
  arrived:    'No endereço',
  in_transit: 'A bordo',
  completed:  'Entregue',
  failed:     'Falhou',
};

function getStatusLabel(status: PickupStopStatus, direction: PickupDirection): string {
  if (direction === 'delivery') return STOP_STATUS_LABELS_DELIVERY[status] ?? status;
  return STOP_STATUS_LABELS_PICKUP[status] ?? status;
}

function getStatusVariant(status: PickupStopStatus): 'neutral' | 'progress' | 'done' | 'danger' {
  if (status === 'completed') return 'done';
  if (status === 'failed') return 'danger';
  if (['en_route', 'arrived', 'in_transit'].includes(status)) return 'progress';
  return 'neutral';
}

/** Próximo status e label do botão, considerando o sentido. */
function getAdvanceInfo(
  status: PickupStopStatus,
  direction: PickupDirection,
): { next: PickupStopStatus; label: string } | null {
  switch (status) {
    case 'pending':    return { next: 'en_route',   label: 'A caminho' };
    case 'en_route':   return { next: 'arrived',    label: 'No endereço' };
    case 'arrived':
      if (direction === 'pickup') return { next: 'in_transit', label: 'Pet a bordo' };
      return { next: 'completed', label: 'Entregue' };
    case 'in_transit': return { next: 'completed',  label: 'Na clínica' };
    default: return null;
  }
}

function canFail(status: PickupStopStatus): boolean {
  return ['pending', 'en_route', 'arrived', 'in_transit'].includes(status);
}

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

  const stopStatus = (item.stop_status ?? 'pending') as PickupStopStatus;
  const direction: PickupDirection = item.direction ?? 'pickup';
  const advanceInfo = getAdvanceInfo(stopStatus, direction);
  const canAdvance = !!advanceInfo && canUpdate;
  const canFailStop = canUpdate && canFail(stopStatus);
  const statusVariant = getStatusVariant(stopStatus);

  const handleAdvance = async () => {
    if (!clinicId || !advanceInfo) return;
    setBusy(true);
    try {
      if (item.stop_id) {
        await hubPickupApi.patchStop(item.stop_id, {
          clinic_id: clinicId,
          status: advanceInfo.next,
        });
      } else {
        await hubPickupApi.createLooseStop({
          clinic_id: clinicId,
          hub_appointment_id: item.appointment_id,
          direction: direction === 'unknown' ? 'pickup' : direction,
          status: advanceInfo.next,
        });
      }
      showSuccess(advanceInfo.label);
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
        await hubPickupApi.createLooseStop({
          clinic_id: clinicId,
          hub_appointment_id: item.appointment_id,
          direction: direction === 'unknown' ? 'pickup' : direction,
          status: 'failed',
        });
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

  const titleIcon =
    direction === 'pickup' ? (
      <ArrowDownToLine size={16} aria-hidden />
    ) : direction === 'delivery' ? (
      <ArrowUpFromLine size={16} aria-hidden />
    ) : null;

  const dirLabel =
    direction === 'pickup' ? 'Coleta' : direction === 'delivery' ? 'Entrega' : 'L&T';

  const footer = (
    <div className="psd__footer">
      {!showFailForm ? (
        <>
          {canAdvance ? (
            <button
              type="button"
              className="psd__advance-btn"
              onClick={() => void handleAdvance()}
              disabled={busy}
            >
              {busy ? <Loader size={16} className="spin" aria-hidden /> : null}
              {advanceInfo!.label}
            </button>
          ) : null}
          {canFailStop ? (
            <button
              type="button"
              className="psd__fail-trigger"
              onClick={() => setShowFailForm(true)}
              disabled={busy}
            >
              Registrar falha
            </button>
          ) : null}
        </>
      ) : (
        <div className="psd__fail-form">
          <textarea
            className="hub-clientes__input psd__fail-textarea"
            placeholder="Descreva o motivo da falha…"
            value={failureReason}
            onChange={(e) => setFailureReason(e.target.value)}
            rows={3}
            maxLength={1000}
          />
          <div className="psd__fail-actions">
            <button
              type="button"
              className="psd__confirm-fail-btn"
              onClick={() => void handleFail()}
              disabled={busy || !failureReason.trim()}
            >
              {busy ? <Loader size={14} className="spin" aria-hidden /> : null}
              Confirmar falha
            </button>
            <button
              type="button"
              className="psd__cancel-btn"
              onClick={() => setShowFailForm(false)}
              disabled={busy}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
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
      <div className="psd">

        {/* ── Hero: status + pet ──────────────────────────────────────── */}
        <div className="psd__hero">
          <div className="psd__hero-avatar" aria-hidden>🐾</div>
          <div className="psd__hero-info">
            <p className="psd__hero-pet">
              {item.pet?.name ?? '—'}
              {item.pet?.species ? <span className="psd__hero-species"> · {item.pet.species}{item.pet.breed ? ` · ${item.pet.breed}` : ''}</span> : null}
            </p>
            <div className="psd__hero-badges">
              <span className={`psd__status-badge psd__status-badge--${statusVariant}`}>
                {getStatusLabel(stopStatus, direction)}
              </span>
              <span className={`psd__dir-badge psd__dir-badge--${direction}`}>
                {titleIcon}
                {dirLabel}
              </span>
            </div>
          </div>
        </div>

        {item.failure_reason ? (
          <div className="psd__failure-banner">
            <span className="psd__failure-icon">⚠</span>
            {item.failure_reason}
          </div>
        ) : null}

        {/* ── Contato ─────────────────────────────────────────────────── */}
        {phone ? (
          <div className="psd__contact-block">
            <div className="psd__contact-info">
              <p className="psd__contact-name">{item.guardian?.full_name}</p>
              <p className="psd__contact-phone">{phone}</p>
            </div>
            <a
              href={`tel:${phone}`}
              className="psd__call-btn"
              aria-label={`Ligar para ${item.guardian?.full_name ?? 'tutor'}`}
            >
              <Phone size={18} aria-hidden />
              Ligar
            </a>
          </div>
        ) : item.guardian ? (
          <div className="psd__contact-block psd__contact-block--no-phone">
            <p className="psd__contact-name">{item.guardian.full_name}</p>
            <span className="psd__no-phone">Sem telefone</span>
          </div>
        ) : null}

        {/* ── Endereço ─────────────────────────────────────────────────── */}
        {item.address ? (
          <div className="psd__address-block">
            <MapPin size={16} className="psd__address-icon" aria-hidden />
            <p className="psd__address-text">{item.address}</p>
          </div>
        ) : null}

        {/* ── Detalhes ─────────────────────────────────────────────────── */}
        <div className="psd__details">
          <div className="psd__detail-row">
            <Clock size={14} className="psd__detail-icon" aria-hidden />
            <span className="psd__detail-label">Previsto</span>
            <span className="psd__detail-value">
              {formatTime(item.planned_at ?? item.starts_at)}
              {item.ends_at ? ` – ${formatTime(item.ends_at)}` : ''}
            </span>
          </div>

          {item.service_type ? (
            <div className="psd__detail-row">
              <Tag size={14} className="psd__detail-icon" aria-hidden />
              <span className="psd__detail-label">Serviço</span>
              <span className="psd__detail-value">{item.service_type.name}</span>
            </div>
          ) : null}

          {item.completed_at ? (
            <div className="psd__detail-row">
              <Calendar size={14} className="psd__detail-icon" aria-hidden />
              <span className="psd__detail-label">Concluído</span>
              <span className="psd__detail-value">{formatDateTime(item.completed_at)}</span>
            </div>
          ) : null}

          {item.notes ? (
            <div className="psd__detail-row psd__detail-row--notes">
              <span className="psd__detail-label psd__detail-label--notes">Notas</span>
              <span className="psd__detail-value psd__detail-value--notes">{item.notes}</span>
            </div>
          ) : null}
        </div>

        {/* ── Link agenda ──────────────────────────────────────────────── */}
        <a
          href={`/hub/appointments?highlight=${item.appointment_id}`}
          className="psd__agenda-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={13} aria-hidden />
          Ver na agenda
        </a>

      </div>
    </HubSidePanel>
  );
};

export default PickupStopDrawer;
