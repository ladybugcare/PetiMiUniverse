import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, Loader, MapPin, Phone } from 'lucide-react';
import { getStoredClinicId } from '@petimi/web-core';
import { hubPickupApi, type PickupRouteDetailResponse, type PickupStop, type PickupStopStatus } from '../../api/hubPickupApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { buildWhatsappLink } from '../../utils/whatsappLink';
import './pickup-page.css';

const ADVANCE_MAP: Partial<Record<PickupStopStatus, PickupStopStatus>> = {
  pending: 'en_route',
  en_route: 'arrived',
  arrived: 'completed',
};

const ADVANCE_LABELS: Partial<Record<PickupStopStatus, string>> = {
  pending: 'A caminho',
  en_route: 'Chegou',
  arrived: 'Concluído',
};

const DONE_STATUSES: PickupStopStatus[] = ['completed', 'failed'];

function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

type Props = {
  routeId: string;
};

const PickupDriverView: React.FC<Props> = ({ routeId }) => {
  const clinicId = getStoredClinicId();
  const { showError, showSuccess } = useAlert();
  const [data, setData] = useState<PickupRouteDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showFailForm, setShowFailForm] = useState(false);
  const [failureReason, setFailureReason] = useState('');

  const load = useCallback(async () => {
    if (!clinicId) return;
    try {
      const res = await hubPickupApi.getRoute(routeId, clinicId);
      setData(res);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar rota');
    } finally {
      setLoading(false);
    }
  }, [clinicId, routeId, showError]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const nextStop = useMemo<PickupStop | null>(() => {
    if (!data) return null;
    return (
      data.stops
        .filter((s) => !DONE_STATUSES.includes(s.status))
        .sort((a, b) => a.sequence - b.sequence)[0] ?? null
    );
  }, [data]);

  const completedCount = useMemo(
    () => (data?.stops.filter((s) => s.status === 'completed') ?? []).length,
    [data],
  );

  const handleAdvance = async () => {
    if (!nextStop || !clinicId) return;
    const nextStatus = ADVANCE_MAP[nextStop.status];
    if (!nextStatus) return;
    setBusy(true);
    try {
      await hubPickupApi.patchStop(nextStop.id, { clinic_id: clinicId, status: nextStatus });
      showSuccess(ADVANCE_LABELS[nextStop.status] ?? 'Status atualizado');
      setShowFailForm(false);
      await load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao atualizar');
    } finally {
      setBusy(false);
    }
  };

  const handleFail = async () => {
    if (!nextStop || !clinicId || !failureReason.trim()) {
      showError('Informe o motivo da falha.');
      return;
    }
    setBusy(true);
    try {
      await hubPickupApi.patchStop(nextStop.id, {
        clinic_id: clinicId,
        status: 'failed',
        failure_reason: failureReason.trim(),
      });
      showSuccess('Parada marcada como falhou.');
      setShowFailForm(false);
      setFailureReason('');
      await load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registrar falha');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="hub-pickup-driver-view">
        <HubLoading variant="block" label="Carregando rota…" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="hub-pickup-driver-view">
        <p className="hub-clientes__muted">Rota não encontrada.</p>
      </div>
    );
  }

  const { route, stops } = data;
  const total = stops.length;
  const allDone = total > 0 && stops.every((s) => DONE_STATUSES.includes(s.status));

  const phone = nextStop?.guardian
    ? (nextStop.guardian as { phone?: string | null }).phone ?? null
    : null;
  const guardianName = nextStop?.guardian
    ? (nextStop.guardian as { full_name?: string }).full_name ?? ''
    : '';
  const petName = nextStop?.pet
    ? (nextStop.pet as { name?: string }).name ?? '—'
    : '—';

  const address = nextStop?.address_snapshot
    ? [
        (nextStop.address_snapshot as Record<string, string | null>).address_street,
        (nextStop.address_snapshot as Record<string, string | null>).address_neighborhood,
        (nextStop.address_snapshot as Record<string, string | null>).address_city,
      ]
        .filter(Boolean)
        .join(', ')
    : null;

  const waMessage =
    nextStop?.direction === 'pickup'
      ? `Olá, ${guardianName}! Estamos a caminho para buscar ${petName}.`
      : `Olá, ${guardianName}! Estamos a caminho para entregar ${petName}.`;
  const whatsappLink = phone ? buildWhatsappLink(phone, waMessage) : null;

  const canAdvance = !!nextStop && !!ADVANCE_MAP[nextStop.status];

  return (
    <div className="hub-pickup-driver-view">
      <div className="hub-pickup-driver-view__header">
        <span className="hub-pickup-driver-view__title">
          {route.vehicle_label ? `🚗 ${route.vehicle_label}` : 'Rota do motorista'}
        </span>
        <span className="hub-pickup-driver-view__progress">
          {completedCount}/{total} concluídas
        </span>
      </div>

      {/* Card da próxima parada */}
      {allDone ? (
        <div className={`hub-pickup-driver-view__card hub-pickup-driver-view__card--empty`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#16a34a' }}>
            <CheckCircle size={20} />
            <span style={{ fontWeight: 700 }}>Todas as paradas concluídas!</span>
          </div>
        </div>
      ) : nextStop ? (
        <div className="hub-pickup-driver-view__card">
          <span className="hub-pickup-driver-view__stop-label">
            {nextStop.direction === 'pickup' ? '↓ Coleta' : '↑ Entrega'} · Parada{' '}
            {nextStop.sequence + 1}
          </span>
          <span className="hub-pickup-driver-view__stop-pet">{petName}</span>
          <span className="hub-pickup-driver-view__stop-meta">
            Tutor: {guardianName}
          </span>

          {address ? (
            <div className="hub-pickup-driver-view__stop-address">
              <MapPin size={16} style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden />
              <span>{address}</span>
            </div>
          ) : null}

          <span className="hub-pickup-driver-view__stop-time">
            Previsto: {formatTime(nextStop.planned_at)}
          </span>

          {/* Ações */}
          {!showFailForm ? (
            <div className="hub-pickup-driver-view__actions">
              {phone ? (
                <a
                  href={`tel:${phone}`}
                  className="hub-pickup-driver-view__action-btn hub-pickup-driver-view__action-btn--call"
                >
                  <Phone size={18} aria-hidden />
                  Ligar
                </a>
              ) : null}
              {whatsappLink ? (
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hub-pickup-driver-view__action-btn hub-pickup-driver-view__action-btn--whatsapp"
                >
                  WhatsApp
                </a>
              ) : null}
              {canAdvance ? (
                <button
                  type="button"
                  className="hub-pickup-driver-view__action-btn hub-pickup-driver-view__action-btn--advance"
                  onClick={() => void handleAdvance()}
                  disabled={busy}
                >
                  {busy ? <Loader size={16} className="spin" aria-hidden /> : null}
                  {ADVANCE_LABELS[nextStop.status]}
                </button>
              ) : null}
              {['pending', 'en_route', 'arrived'].includes(nextStop.status) ? (
                <button
                  type="button"
                  className="hub-pickup-driver-view__action-btn"
                  style={{ background: '#fee2e2', color: '#dc2626', gridColumn: 'span 2' }}
                  onClick={() => setShowFailForm(true)}
                  disabled={busy}
                >
                  Registrar falha
                </button>
              ) : null}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <textarea
                className="hub-clientes__input"
                placeholder="Motivo da falha (obrigatório)…"
                value={failureReason}
                onChange={(e) => setFailureReason(e.target.value)}
                rows={2}
                maxLength={1000}
                style={{ fontSize: '1rem' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="hub-pickup-driver-view__action-btn"
                  style={{ flex: 1, background: '#dc2626', color: '#fff' }}
                  onClick={() => void handleFail()}
                  disabled={busy || !failureReason.trim()}
                >
                  {busy ? <Loader size={16} className="spin" /> : null}
                  Confirmar falha
                </button>
                <button
                  type="button"
                  className="hub-pickup-driver-view__action-btn"
                  style={{ flex: 1, background: '#f1f5f9', color: '#334155' }}
                  onClick={() => setShowFailForm(false)}
                  disabled={busy}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className={`hub-pickup-driver-view__card hub-pickup-driver-view__card--empty`}>
          <p className="hub-clientes__muted" style={{ fontSize: '0.9375rem' }}>
            Nenhuma parada pendente.
          </p>
        </div>
      )}

      {/* Fila das demais paradas */}
      {stops.length > 1 ? (
        <div className="hub-pickup-driver-view__queue">
          <p className="hub-pickup-driver-view__queue-title">Todas as paradas</p>
          {stops
            .slice()
            .sort((a, b) => a.sequence - b.sequence)
            .map((stop) => {
              const isDone = DONE_STATUSES.includes(stop.status);
              const isCurrent = nextStop?.id === stop.id;
              const stopPet = (stop.pet as { name?: string } | null)?.name ?? '—';
              const stopGuardian = (stop.guardian as { full_name?: string } | null)?.full_name ?? '';
              return (
                <div
                  key={stop.id}
                  className={`hub-pickup-driver-view__queue-item${isDone ? ' hub-pickup-driver-view__queue-item--done' : ''}`}
                  style={isCurrent ? { borderColor: 'var(--hub-primary, #4f46e5)', fontWeight: 600 } : {}}
                >
                  <span style={{ minWidth: '1.25rem', textAlign: 'center', fontWeight: 700 }}>
                    {stop.sequence + 1}
                  </span>
                  <span style={{ fontSize: '0.75rem' }}>
                    {stop.direction === 'pickup' ? '↓' : '↑'}
                  </span>
                  <span style={{ flex: 1 }}>{stopPet}</span>
                  <span className="hub-clientes__muted" style={{ fontSize: '0.75rem' }}>{stopGuardian}</span>
                  {isDone ? <CheckCircle size={14} color="#16a34a" aria-hidden /> : null}
                </div>
              );
            })}
        </div>
      ) : null}
    </div>
  );
};

export default PickupDriverView;
