import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, ExternalLink, Loader, MapPin, Navigation, Phone } from 'lucide-react';
import { getStoredClinicId } from '@petimi/web-core';
import {
  hubPickupApi,
  type PickupDayBoardPet,
  type PickupRoute,
  type PickupRouteDetailResponse,
  type PickupStop,
  type PickupStopStatus,
} from '../../api/hubPickupApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import {
  PORTE_LABELS,
  type PetBodyPorteValue,
} from '../../utils/hubServiceTypesPricingMatrix';
import {
  buildExternalMapsLinks,
  buildGoogleMapsRouteOrStopUrl,
  isValidMapPoint,
  openGoogleMapsUrl,
  stopToMapPoint,
  type MapPoint,
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

function directionServiceLabel(direction: string | undefined): string {
  if (direction === 'pickup') return 'Coleta no tutor';
  if (direction === 'delivery') return 'Entrega ao tutor';
  if (direction === 'clinic_return') return 'Retorno à unidade';
  return 'Parada da rota';
}

const STOP_STATUS_CARD_LABELS: Record<PickupStopStatus, string> = {
  pending: 'A fazer',
  en_route: 'A caminho',
  arrived: 'No endereço',
  in_transit: 'Pet a bordo',
  completed: 'Concluída',
  failed: 'Falhou',
};

const DONE_STATUSES: PickupStopStatus[] = ['completed', 'failed'];

function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function porteLabel(tier?: string | null): string | null {
  if (!tier) return null;
  return PORTE_LABELS[tier as PetBodyPorteValue] ?? tier;
}

/** Horário e perfil do pet — mesma hierarquia da Minha fila do Banho & Tosa. */
function scheduleAndPetLabel(
  pet: PickupDayBoardPet | null | undefined,
  plannedAt?: string | null,
): string | null {
  const time = plannedAt ? formatTime(plannedAt) : null;
  const parts = [
    time && time !== '—' ? time : null,
    pet?.breed?.trim() || pet?.species?.trim() || null,
    porteLabel(pet?.size_tier),
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(' · ') : null;
}

function routeStartPoint(route: PickupRoute): MapPoint {
  return {
    lat: route.start_lat ?? null,
    lng: route.start_lng ?? null,
    address: route.start_address ?? null,
  };
}

/** Ponto navegável da parada; retorno à clínica usa a saída da rota. */
function stopNavPoint(stop: PickupStop, route: PickupRoute): MapPoint {
  const p = stopToMapPoint(stop);
  if (isValidMapPoint(p)) return p;
  if (stop.direction === 'clinic_return') return routeStartPoint(route);
  return p;
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
    return buildGoogleMapsRouteOrStopUrl([
      routeStartPoint(data.route),
      ...ordered.map((s) => stopNavPoint(s, data.route)),
    ]);
  }, [data]);

  /** Rota restante do lote: saída/última concluída → paradas ainda abertas. */
  const remainingRouteMaps = useMemo(() => {
    if (!data || !nextStop) return null;
    const ordered = data.stops.slice().sort((a, b) => a.sequence - b.sequence);
    const remaining = ordered.filter((s) => !DONE_STATUSES.includes(s.status));
    if (remaining.length === 0) return null;

    const completedBefore = ordered.filter(
      (s) => DONE_STATUSES.includes(s.status) && s.sequence < nextStop.sequence,
    );
    const lastDone = completedBefore[completedBefore.length - 1];
    const origin = lastDone
      ? stopNavPoint(lastDone, data.route)
      : routeStartPoint(data.route);

    return buildGoogleMapsRouteOrStopUrl([
      origin,
      ...remaining.map((s) => stopNavPoint(s, data.route)),
    ]);
  }, [data, nextStop]);

  const nextStopMaps = useMemo(() => {
    if (!data || !nextStop) return null;
    const links = buildExternalMapsLinks(stopNavPoint(nextStop, data.route));
    if (!links.google && !links.waze && !links.apple) return null;
    return links;
  }, [data, nextStop]);

  const batchMaps = remainingRouteMaps ?? fullRouteMaps;

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
    ? nextStop.guardian.phone ?? null
    : null;
  const guardianName = !isClinicReturn && nextStop?.guardian
    ? nextStop.guardian.full_name ?? ''
    : '';
  const pet = isClinicReturn ? null : nextStop?.pet ?? null;
  const petName = isClinicReturn
    ? 'Retorno à clínica'
    : pet?.name?.trim() || 'Sem pet';
  const petAvatar = pet?.avatar_url?.trim() || null;

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
  const statusLabel = nextStop
    ? STOP_STATUS_CARD_LABELS[nextStop.status] ?? nextStop.status
    : null;
  const schedulePetLine = nextStop
    ? scheduleAndPetLabel(pet, nextStop.planned_at)
    : null;

  return (
    <div className="hub-pickup-driver-view">
      <div className="hub-pickup-driver-view__header">
        <span className="hub-pickup-driver-view__title">{routeTitle}</span>
        <span className="hub-pickup-driver-view__progress">
          {completedCount}/{total} concluídas
        </span>
      </div>

      {batchMaps || nextStopMaps ? (
        <div className="hub-pickup-driver-view__nav-panel" aria-label="Navegação no mapa">
          <p className="hub-pickup-driver-view__nav-title">Como chegar</p>
          <div className="hub-pickup-driver-view__nav-grid">
            {batchMaps ? (
              <button
                type="button"
                className="hub-pickup-driver-view__action-btn hub-pickup-driver-view__action-btn--maps hub-pickup-driver-view__action-btn--nav-batch"
                onClick={() => {
                  openGoogleMapsUrl(batchMaps.url);
                  if (batchMaps.truncated) {
                    showError(
                      'A rota tem muitas paradas: o Google Maps abre as primeiras + a última.',
                    );
                  }
                }}
              >
                <ExternalLink size={16} aria-hidden />
                {remainingRouteMaps ? 'Rota restante no Google Maps' : 'Rota do lote no Google Maps'}
              </button>
            ) : null}
            {nextStopMaps?.google ? (
              <button
                type="button"
                className="hub-pickup-driver-view__action-btn hub-pickup-driver-view__action-btn--maps"
                onClick={() => openGoogleMapsUrl(nextStopMaps.google!)}
              >
                <Navigation size={16} aria-hidden />
                Google Maps · parada
              </button>
            ) : null}
            {nextStopMaps?.waze ? (
              <button
                type="button"
                className="hub-pickup-driver-view__action-btn hub-pickup-driver-view__action-btn--waze"
                onClick={() => openGoogleMapsUrl(nextStopMaps.waze!)}
              >
                <Navigation size={16} aria-hidden />
                Waze · parada
              </button>
            ) : null}
            {nextStopMaps?.apple ? (
              <button
                type="button"
                className="hub-pickup-driver-view__action-btn hub-pickup-driver-view__action-btn--apple"
                onClick={() => openGoogleMapsUrl(nextStopMaps.apple!)}
              >
                <MapPin size={16} aria-hidden />
                Apple Maps · parada
              </button>
            ) : null}
          </div>
          <p className="hub-pickup-driver-view__nav-hint">
            Abre no app ou no navegador. A rota do lote mostra o caminho completo; Waze, Google e Apple
            Maps levam só até a próxima coleta ou entrega.
          </p>
        </div>
      ) : nextStop && !allDone ? (
        <p className="hub-pickup-driver-view__nav-missing" role="status">
          Sem endereço cadastrado para abrir no mapa. Peça à recepção para completar o endereço do tutor.
        </p>
      ) : null}

      {/* Card da próxima parada — hierarquia alinhada à Minha fila do Banho & Tosa */}
      {allDone ? (
        <div className="hub-pickup-driver-view__card hub-pickup-driver-view__card--empty">
          <div className="hub-pickup-driver-view__all-done">
            <CheckCircle size={20} aria-hidden />
            <span>Todas as paradas concluídas!</span>
          </div>
        </div>
      ) : nextStop ? (
        <div className="hub-pickup-driver-view__card">
          <span className="hub-pickup-driver-view__stop-label">
            {directionLabel(nextStop.direction)} · Parada {nextStop.sequence + 1}
            {statusLabel ? ` · ${statusLabel}` : ''}
          </span>

          <div className="hub-pickup-driver-view__pet-row">
            {petAvatar ? (
              <img src={petAvatar} alt="" className="hub-pickup-driver-view__avatar" />
            ) : null}
            <span className="hub-pickup-driver-view__stop-pet">{petName}</span>
          </div>

          <p className="hub-pickup-driver-view__stop-meta">
            {directionServiceLabel(nextStop.direction)}
          </p>
          {schedulePetLine ? (
            <p className="hub-pickup-driver-view__stop-meta">{schedulePetLine}</p>
          ) : null}
          {!isClinicReturn && guardianName ? (
            <p className="hub-pickup-driver-view__stop-meta">Tutor: {guardianName}</p>
          ) : isClinicReturn ? (
            <p className="hub-pickup-driver-view__stop-meta">Desembarque na unidade</p>
          ) : null}

          {address ? (
            <div className="hub-pickup-driver-view__stop-address">
              <MapPin size={16} aria-hidden />
              <span>{address}</span>
            </div>
          ) : null}

          {(nextStop.cage_id || nextStop.notes?.trim()) ? (
            <div className="hub-pickup-driver-view__badges">
              {nextStop.cage_id ? (
                <span className="hub-pickup-driver-view__badge">Com gaiola</span>
              ) : null}
              {nextStop.notes?.trim() ? (
                <span className="hub-pickup-driver-view__badge">Com observação</span>
              ) : null}
            </div>
          ) : null}

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
              {nextStopMaps?.google ? (
                <button
                  type="button"
                  className="hub-pickup-driver-view__action-btn hub-pickup-driver-view__action-btn--maps"
                  onClick={() => openGoogleMapsUrl(nextStopMaps.google!)}
                >
                  <Navigation size={18} aria-hidden />
                  Navegar
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
                  className="hub-pickup-driver-view__action-btn hub-pickup-driver-view__action-btn--fail"
                  onClick={() => setShowFailForm(true)}
                  disabled={busy}
                >
                  Registrar falha
                </button>
              ) : null}
            </div>
          ) : (
            <div className="hub-pickup-driver-view__fail-form">
              <textarea
                className="hub-clientes__input hub-pickup-driver-view__fail-input"
                placeholder="Motivo da falha (obrigatório)…"
                value={failureReason}
                onChange={(e) => setFailureReason(e.target.value)}
                rows={2}
                maxLength={1000}
              />
              <div className="hub-pickup-driver-view__fail-actions">
                <button
                  type="button"
                  className="hub-pickup-driver-view__action-btn hub-pickup-driver-view__action-btn--fail-confirm"
                  onClick={() => void handleFail()}
                  disabled={busy || !failureReason.trim()}
                >
                  {busy ? <Loader size={16} className="spin" aria-hidden /> : null}
                  Confirmar falha
                </button>
                <button
                  type="button"
                  className="hub-pickup-driver-view__action-btn hub-pickup-driver-view__action-btn--ghost"
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
        <div className="hub-pickup-driver-view__card hub-pickup-driver-view__card--empty">
          <p className="hub-pickup-driver-view__empty-copy">
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
                : stop.pet?.name?.trim() || '—';
              const stopGuardian = isReturn
                ? ''
                : stop.guardian?.full_name?.trim() || '';
              const dirIcon =
                stop.direction === 'pickup' ? '↓' : stop.direction === 'delivery' ? '↑' : '↩';
              const stopMaps = !isDone
                ? buildExternalMapsLinks(stopNavPoint(stop, route))
                : null;
              return (
                <div
                  key={stop.id}
                  className={`hub-pickup-driver-view__queue-item${isDone ? ' hub-pickup-driver-view__queue-item--done' : ''}${isCurrent ? ' hub-pickup-driver-view__queue-item--current' : ''}`}
                >
                  <span className="hub-pickup-driver-view__queue-seq">
                    {stop.sequence + 1}
                  </span>
                  <span className="hub-pickup-driver-view__queue-dir" aria-hidden>
                    {dirIcon}
                  </span>
                  <span className="hub-pickup-driver-view__queue-pet">{stopPet}</span>
                  {stopGuardian ? (
                    <span className="hub-pickup-driver-view__queue-guardian">{stopGuardian}</span>
                  ) : null}
                  {isDone ? <CheckCircle size={14} color="#16a34a" aria-hidden /> : null}
                  {stopMaps?.google ? (
                    <button
                      type="button"
                      className="hub-pickup-driver-view__queue-nav"
                      aria-label={`Abrir ${stopPet} no Google Maps`}
                      onClick={() => openGoogleMapsUrl(stopMaps.google!)}
                    >
                      <Navigation size={14} aria-hidden />
                    </button>
                  ) : null}
                </div>
              );
            })}
        </div>
      ) : null}
    </div>
  );
};

export default PickupDriverView;
