import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, ExternalLink, Loader, MapPin, Navigation, Phone } from 'lucide-react';
import { getStoredClinicId } from '@petimi/web-core';
import { hubPickupApi, type PickupRouteDetailResponse, type PickupStop, type PickupStopStatus } from '../../api/hubPickupApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import {
  buildGoogleMapsDirectionsUrl,
  buildGoogleMapsSingleStopUrl,
  openGoogleMapsUrl,
  stopToMapPoint,
} from './pickupMapsLinks';
import './pickup-page.css';

/** Retorna o próximo status e o label do botão, considerando o sentido da parada. */
function getAdvanceInfo(
  status: PickupStopStatus,
  direction: 'pickup' | 'delivery' | 'clinic_return' | undefined,
): { next: PickupStopStatus; label: string } | null {
  switch (status) {
    case 'pending':    return { next: 'en_route', label: 'A caminho' };
    case 'en_route':   return { next: 'arrived',  label: 'No endereço' };
    case 'arrived':
      if (direction === 'pickup') return { next: 'in_transit', label: 'Pet a bordo' };
      if (direction === 'clinic_return') return { next: 'completed', label: 'Descarregado' };
      return { next: 'completed', label: 'Entregue' };
    case 'in_transit': return { next: 'completed', label: 'Na clínica' };
    default: return null;
  }
}

function formatStopAddress(snap: Record<string, unknown> | null | undefined): string | null {
  if (!snap) return null;
  const parts = [
    snap.address,
    snap.address_street,
    snap.street,
    snap.address_neighborhood,
    snap.district,
    snap.address_city,
    snap.city,
  ]
    .map((x) => (x == null ? '' : String(x).trim()))
    .filter(Boolean);
  const unique = [...new Set(parts)];
  return unique.length ? unique.join(', ') : null;
}

function directionLabel(direction: string | undefined): string {
  if (direction === 'pickup') return '↓ Coleta';
  if (direction === 'delivery') return '↑ Entrega';
  if (direction === 'clinic_return') return '↩ Retorno à clínica';
  return 'Parada';
}

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
  const loadSeqRef = useRef(0);

  const load = useCallback(async () => {
    if (!clinicId) return;
    const seq = ++loadSeqRef.current;
    try {
      const res = await hubPickupApi.getRoute(routeId, clinicId);
      if (seq !== loadSeqRef.current) return;
      setData(res);
    } catch (e: unknown) {
      if (seq !== loadSeqRef.current) return;
      showError((e as Error)?.message || 'Erro ao carregar rota');
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
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

  const fullRouteMaps = useMemo(() => {
    if (!data) return null;
    const ordered = data.stops.slice().sort((a, b) => a.sequence - b.sequence);
    return buildGoogleMapsDirectionsUrl([
      {
        lat: data.route.start_lat ?? null,
        lng: data.route.start_lng ?? null,
        address: data.route.start_address ?? null,
      },
      ...ordered.map(stopToMapPoint),
    ]);
  }, [data]);

  const nextStopMapsUrl = useMemo(() => {
    if (!nextStop) return null;
    return buildGoogleMapsSingleStopUrl(stopToMapPoint(nextStop));
  }, [nextStop]);

  const handleAdvance = async () => {
    if (!nextStop || !clinicId) return;
    const info = getAdvanceInfo(
      nextStop.status,
      nextStop.direction as 'pickup' | 'delivery' | 'clinic_return' | undefined,
    );
    if (!info) return;
    setBusy(true);
    try {
      await hubPickupApi.patchStop(nextStop.id, { clinic_id: clinicId, status: info.next });
      showSuccess(info.label);
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
  const isClinicReturn = nextStop?.direction === 'clinic_return';

  const phone = !isClinicReturn && nextStop?.guardian
    ? (nextStop.guardian as { phone?: string | null }).phone ?? null
    : null;
  const guardianName = !isClinicReturn && nextStop?.guardian
    ? (nextStop.guardian as { full_name?: string }).full_name ?? ''
    : '';
  const petName = isClinicReturn
    ? 'Retorno à clínica'
    : nextStop?.pet
      ? (nextStop.pet as { name?: string }).name ?? '—'
      : '—';

  const address = formatStopAddress(nextStop?.address_snapshot as Record<string, unknown> | null);

  const advanceInfo = nextStop
    ? getAdvanceInfo(
        nextStop.status,
        nextStop.direction as 'pickup' | 'delivery' | 'clinic_return' | undefined,
      )
    : null;
  const canAdvance = !!advanceInfo;
  const routeTitle =
    route.label?.trim() ||
    (route.vehicle_label ? route.vehicle_label : 'Rota do motorista');

  return (
    <div className="hub-pickup-driver-view">
      <div className="hub-pickup-driver-view__header">
        <span className="hub-pickup-driver-view__title">{routeTitle}</span>
        <span className="hub-pickup-driver-view__progress">
          {completedCount}/{total} concluídas
        </span>
      </div>

      {fullRouteMaps ? (
        <div className="hub-pickup-driver-view__maps-bar">
          <button
            type="button"
            className="hub-pickup-driver-view__action-btn hub-pickup-driver-view__action-btn--maps"
            onClick={() => {
              openGoogleMapsUrl(fullRouteMaps.url);
              if (fullRouteMaps.truncated) {
                showError(
                  'A rota tem muitas paradas: o Google Maps abre as primeiras + a última.',
                );
              }
            }}
          >
            <ExternalLink size={16} aria-hidden />
            Abrir rota no Maps
          </button>
        </div>
      ) : null}

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
            {directionLabel(nextStop.direction)} · Parada {nextStop.sequence + 1}
          </span>
          <span className="hub-pickup-driver-view__stop-pet">{petName}</span>
          {!isClinicReturn ? (
            <span className="hub-pickup-driver-view__stop-meta">
              Tutor: {guardianName}
            </span>
          ) : (
            <span className="hub-pickup-driver-view__stop-meta">
              Desembarque na unidade
            </span>
          )}

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
              {nextStopMapsUrl ? (
                <button
                  type="button"
                  className="hub-pickup-driver-view__action-btn hub-pickup-driver-view__action-btn--maps"
                  onClick={() => openGoogleMapsUrl(nextStopMapsUrl)}
                >
                  <Navigation size={18} aria-hidden />
                  Navegar até aqui
                </button>
              ) : null}
              {canAdvance ? (
                <button
                  type="button"
                  className="hub-pickup-driver-view__action-btn hub-pickup-driver-view__action-btn--advance"
                  onClick={() => void handleAdvance()}
                  disabled={busy}
                >
                  {busy ? <Loader size={16} className="spin" aria-hidden /> : null}
                  {advanceInfo!.label}
                </button>
              ) : null}
              {['pending', 'en_route', 'arrived', 'in_transit'].includes(nextStop.status) ? (
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
              const isReturn = stop.direction === 'clinic_return';
              const stopPet = isReturn
                ? 'Retorno à clínica'
                : (stop.pet as { name?: string } | null)?.name ?? '—';
              const stopGuardian = isReturn
                ? ''
                : (stop.guardian as { full_name?: string } | null)?.full_name ?? '';
              const dirIcon =
                stop.direction === 'pickup' ? '↓' : stop.direction === 'delivery' ? '↑' : '↩';
              return (
                <div
                  key={stop.id}
                  className={`hub-pickup-driver-view__queue-item${isDone ? ' hub-pickup-driver-view__queue-item--done' : ''}`}
                  style={isCurrent ? { borderColor: 'var(--hub-primary, #4f46e5)', fontWeight: 600 } : {}}
                >
                  <span style={{ minWidth: '1.25rem', textAlign: 'center', fontWeight: 700 }}>
                    {stop.sequence + 1}
                  </span>
                  <span style={{ fontSize: '0.75rem' }}>{dirIcon}</span>
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
