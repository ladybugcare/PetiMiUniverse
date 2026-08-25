import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, ExternalLink, GripVertical, Loader, Package, Scissors, Sparkles, Truck, X } from 'lucide-react';
import { apiRequest, getStoredClinicId } from '@petimi/web-core';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { hubPickupApi, type PickupDayBoardItem, type PickupRoute, type SuggestBatchesWindowMinutes } from '../../api/hubPickupApi';
import { hubPickupVehiclesApi, type PickupVehicle } from '../../api/hubPickupVehiclesApi';
import { hubStaffApi, type HubStaffMember } from '../../api/hubStaffApi';
import { HubModal } from '../../components/HubModal';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import { HubSidePanel } from '../../components/HubSidePanel';
import { useAlert } from '../../components/AlertProvider';
import PickupRouteMap from './PickupRouteMap';
import type { MapStop, MapAvailableStop } from './PickupRouteMap';
import {
  buildGoogleMapsDirectionsUrl,
  openGoogleMapsUrl,
  type MapPoint,
} from './pickupMapsLinks';

function formatTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ─── Item arrastável ──────────────────────────────────────────────────────

function SortableStopItem({
  item,
  onRemove,
  onSplitAfter,
  canSplit,
}: {
  item: PickupDayBoardItem & { _direction: 'pickup' | 'delivery' };
  onRemove: (id: string) => void;
  onSplitAfter?: (id: string) => void;
  canSplit?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.appointment_id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="hub-pickup-builder__stop">
      <span className="hub-pickup-builder__drag-handle" {...attributes} {...listeners}>
        <GripVertical size={14} aria-hidden />
      </span>
      <span
        className={`hub-pickup-card__direction hub-pickup-card__direction--${item._direction}`}
        style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem' }}
      >
        {item._direction === 'pickup' ? (
          <ArrowDownToLine size={10} aria-hidden />
        ) : (
          <ArrowUpFromLine size={10} aria-hidden />
        )}
        {item._direction === 'pickup' ? 'Coleta' : 'Entrega'}
      </span>
      <div className="hub-pickup-builder__stop-info">
        <span className="hub-pickup-builder__stop-pet">{item.pet?.name ?? '—'}</span>
        <span
          className="hub-pickup-builder__stop-meta"
          title={[item.guardian?.full_name, item.address, formatTime(item.starts_at)]
            .filter(Boolean)
            .join(' · ')}
        >
          {item.guardian?.full_name ?? ''}
          {item.address ? ` · ${item.address}` : ''}
          {' · '}
          {formatTime(item.starts_at)}
        </span>
      </div>
      {canSplit && onSplitAfter ? (
        <button
          type="button"
          className="hub-clientes__icon-btn hub-pickup-builder__stop-split"
          onClick={() => onSplitAfter(item.appointment_id)}
          aria-label="Dividir rota a partir daqui"
          title="Dividir a partir daqui (lote seguinte)"
        >
          <Scissors size={14} />
        </button>
      ) : null}
      <button
        type="button"
        className="hub-clientes__icon-btn hub-pickup-builder__stop-remove"
        onClick={() => onRemove(item.appointment_id)}
        aria-label="Remover parada"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ─── PickupRouteBuilder ───────────────────────────────────────────────────

type Props = {
  open: boolean;
  looseItems: PickupDayBoardItem[];
  dateYmd: string;
  unitId?: string;
  editingRoute?: PickupRoute | null;
  /** Paradas já pertencentes à rota sendo editada (pré-popula o estado selected). */
  editingStops?: (PickupDayBoardItem & { _direction: 'pickup' | 'delivery' })[];
  onClose: () => void;
  onSaved: () => void;
};

const PickupRouteBuilder: React.FC<Props> = ({
  open,
  looseItems,
  dateYmd,
  unitId,
  editingRoute,
  editingStops,
  onClose,
  onSaved,
}) => {
  const clinicId = getStoredClinicId();
  const { showError, showSuccess } = useAlert();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const [staff, setStaff] = useState<HubStaffMember[]>([]);
  const [vehicles, setVehicles] = useState<PickupVehicle[]>([]);
  const [driverStaffId, setDriverStaffId] = useState(editingRoute?.driver_staff_id ?? '');
  const [vehicleId, setVehicleId] = useState(editingRoute?.vehicle_id ?? '');
  const [notes, setNotes] = useState(editingRoute?.notes ?? '');
  const [routeLabel, setRouteLabel] = useState(editingRoute?.label ?? '');
  const [busy, setBusy] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestWindow, setSuggestWindow] = useState<SuggestBatchesWindowMinutes>(15);
  const [suggestCapacity, setSuggestCapacity] = useState('4');
  const [startKind, setStartKind] = useState<'clinic' | 'custom'>(
    editingRoute?.start_kind === 'custom' ? 'custom' : 'clinic',
  );
  const [customStartAddress, setCustomStartAddress] = useState(
    editingRoute?.start_kind === 'custom' ? (editingRoute.start_address ?? '') : '',
  );
  const [clinicStartAddress, setClinicStartAddress] = useState<string | null>(
    editingRoute?.start_kind === 'clinic' ? (editingRoute.start_address ?? null) : null,
  );
  const [startCoords, setStartCoords] = useState<{ lat: number; lng: number } | null>(() => {
    if (
      editingRoute?.start_lat != null &&
      editingRoute?.start_lng != null &&
      Number.isFinite(editingRoute.start_lat) &&
      Number.isFinite(editingRoute.start_lng)
    ) {
      return { lat: editingRoute.start_lat, lng: editingRoute.start_lng };
    }
    return null;
  });

  // cage_id por appointment: mapa de appointmentId → cageId (opcional)
  const [stopCages, setStopCages] = useState<Map<string, string>>(() => {
    const m = new Map<string, string>();
    for (const s of editingStops ?? []) {
      if (s.cage_id) m.set(s.appointment_id, s.cage_id);
    }
    return m;
  });

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === vehicleId) ?? null,
    [vehicles, vehicleId],
  );

  // Paradas selecionadas com direção confirmada
  type StopCandidate = PickupDayBoardItem & { _direction: 'pickup' | 'delivery' };
  const [selected, setSelected] = useState<StopCandidate[]>(() => editingStops ?? []);

  // Cache de coordenadas geocodificadas para o preview do mapa
  const [coordsCache, setCoordsCache] = useState<Map<string, { lat: number; lng: number }>>(new Map());
  const geocodedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!clinicId) return;
    void hubStaffApi.list(clinicId).then((r) => setStaff(r.staff ?? [])).catch(() => setStaff([]));
    void hubPickupVehiclesApi
      .listVehicles(clinicId)
      .then((r) => setVehicles(r.vehicles))
      .catch(() => setVehicles([]));
  }, [clinicId]);

  // Endereço da clínica (preview quando saída = clínica)
  useEffect(() => {
    if (!clinicId || startKind !== 'clinic') return;
    if (editingRoute?.start_kind === 'clinic' && editingRoute.start_address) {
      setClinicStartAddress(editingRoute.start_address);
      return;
    }
    let cancelled = false;
    void (apiRequest(`/clinics/${encodeURIComponent(clinicId)}`) as Promise<{
      clinic?: { address?: string | null; city?: string | null; state?: string | null; name?: string | null };
    }>)
      .then((r) => {
        if (cancelled) return;
        const c = r.clinic;
        if (!c) {
          setClinicStartAddress(null);
          return;
        }
        const line = String(c.address ?? '').trim();
        const cityState = [String(c.city ?? '').trim(), String(c.state ?? '').trim()].filter(Boolean).join(' - ');
        const full = [line, cityState].filter(Boolean).join(', ');
        setClinicStartAddress(full || null);
      })
      .catch(() => {
        if (!cancelled) setClinicStartAddress(null);
      });
    return () => {
      cancelled = true;
    };
  }, [clinicId, startKind, editingRoute?.start_kind, editingRoute?.start_address]);

  const effectiveStartAddress = startKind === 'custom' ? customStartAddress.trim() : (clinicStartAddress ?? '');

  // Geocode do ponto de saída
  useEffect(() => {
    const addr = effectiveStartAddress;
    if (addr.length < 5) {
      setStartCoords(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addr)}`;
          const res = await fetch(url, { headers: { Accept: 'application/json' } });
          if (!res.ok || cancelled) return;
          const data = (await res.json()) as Array<{ lat: string; lon: string }>;
          const hit = data[0];
          if (!hit || cancelled) return;
          setStartCoords({ lat: Number(hit.lat), lng: Number(hit.lon) });
        } catch {
          if (!cancelled) setStartCoords(null);
        }
      })();
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [effectiveStartAddress]);

  // Geocodifica endereços de pernas soltas para o preview do mapa (Nominatim, 1 req/s)
  useEffect(() => {
    const toGeocode = looseItems.filter(
      (i) => i.address && !geocodedIds.current.has(i.appointment_id),
    );
    if (toGeocode.length === 0) return;

    let cancelled = false;
    (async () => {
      for (let idx = 0; idx < toGeocode.length; idx++) {
        if (cancelled) break;
        const item = toGeocode[idx];
        if (!item.address || geocodedIds.current.has(item.appointment_id)) continue;
        geocodedIds.current.add(item.appointment_id);
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(item.address)}`;
          const res = await fetch(url, {
            headers: { 'User-Agent': 'PetiMiHub/1.0 (preview)' },
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) continue;
          const data = (await res.json()) as Array<{ lat: string; lon: string }>;
          if (data[0] && !cancelled) {
            setCoordsCache((prev) => {
              const next = new Map(prev);
              next.set(item.appointment_id, { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
              return next;
            });
          }
        } catch { /* ignora falhas individuais */ }
        if (idx < toGeocode.length - 1) {
          await new Promise<void>((r) => setTimeout(r, 1100));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [looseItems]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pool de itens disponíveis: pernas soltas + paradas da rota em edição que foram removidas de selected
  const availablePool = useMemo(() => {
    const routeItemIds = new Set((editingStops ?? []).map((s) => s.appointment_id));
    const looseNotInRoute = looseItems.filter((i) => !routeItemIds.has(i.appointment_id));
    const routeItemsRemovedFromSelected = (editingStops ?? []).filter(
      (s) => !selected.some((sel) => sel.appointment_id === s.appointment_id),
    );
    return [...looseNotInRoute, ...routeItemsRemovedFromSelected];
  }, [looseItems, editingStops, selected]);

  const available = useMemo(
    () => availablePool.filter((i) => !selected.some((s) => s.appointment_id === i.appointment_id)),
    [availablePool, selected],
  );

  const addItem = (item: PickupDayBoardItem) => {
    const dir = item.direction === 'unknown' ? 'pickup' : (item.direction as 'pickup' | 'delivery');
    setSelected((prev) => [...prev, { ...item, _direction: dir }]);
  };

  const removeItem = (id: string) => {
    setSelected((prev) => prev.filter((s) => s.appointment_id !== id));
  };

  const toggleDirection = (id: string) => {
    setSelected((prev) =>
      prev.map((s) =>
        s.appointment_id === id
          ? { ...s, _direction: s._direction === 'pickup' ? 'delivery' : 'pickup' }
          : s,
      ),
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSelected((items) => {
      const oldIdx = items.findIndex((i) => i.appointment_id === active.id);
      const newIdx = items.findIndex((i) => i.appointment_id === over.id);
      return arrayMove(items, oldIdx, newIdx);
    });
  };

  // Dados do mapa: paradas selecionadas (numeradas) e disponíveis (cinza)
  const mapStops = useMemo(() => {
    const out: MapStop[] = [];
    selected.forEach((s, idx) => {
      const coords = coordsCache.get(s.appointment_id);
      if (!coords) return;
      out.push({
        id: s.appointment_id,
        petName: s.pet?.name ?? '—',
        guardianName: s.guardian?.full_name ?? null,
        address: s.address ?? null,
        direction: s._direction,
        sequence: idx,
        time: s.starts_at,
        lat: coords.lat,
        lng: coords.lng,
      });
    });
    return out;
  }, [selected, coordsCache]);

  const mapAvailableStops = useMemo(() => {
    const out: MapAvailableStop[] = [];
    for (const item of available) {
      const coords = coordsCache.get(item.appointment_id);
      if (!coords) continue;
      out.push({
        id: item.appointment_id,
        petName: item.pet?.name ?? '—',
        guardianName: item.guardian?.full_name ?? null,
        address: item.address ?? null,
        direction: item.direction === 'unknown' ? 'unknown' : (item.direction as 'pickup' | 'delivery'),
        lat: coords.lat,
        lng: coords.lng,
      });
    }
    return out;
  }, [available, coordsCache]);

  const googleMapsDirections = useMemo(() => {
    const points: MapPoint[] = [
      {
        lat: startCoords?.lat ?? null,
        lng: startCoords?.lng ?? null,
        address: effectiveStartAddress || null,
      },
      ...selected.map((s) => {
        const coords = coordsCache.get(s.appointment_id);
        return {
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          address: s.address ?? null,
        };
      }),
    ];
    return buildGoogleMapsDirectionsUrl(points);
  }, [startCoords, effectiveStartAddress, selected, coordsCache]);

  const staffOptions = useMemo(
    () => [
      { value: '', label: 'Sem motorista' },
      ...staff.filter((s) => s.active !== false).map((s) => ({ value: s.id, label: s.full_name })),
    ],
    [staff],
  );

  const vehicleOptions = useMemo(
    () => [
      { value: '', label: 'Sem veículo' },
      ...vehicles.map((v) => {
        const cap = v.has_cages && v.cages.length > 0
          ? v.cages.filter((c) => c.active).reduce((s, c) => s + c.capacity, 0)
          : v.capacity_animals;
        const plate = v.license_plate ? ` · ${v.license_plate}` : '';
        return { value: v.id, label: `${v.name}${plate} (${cap} anim.)` };
      }),
    ],
    [vehicles],
  );

  // Capacidade total do veículo selecionado
  const vehicleCapacity = useMemo(() => {
    if (!selectedVehicle) return null;
    const activeCages = selectedVehicle.cages.filter((c) => c.active);
    if (selectedVehicle.has_cages && activeCages.length > 0) {
      return activeCages.reduce((s, c) => s + c.capacity, 0);
    }
    return selectedVehicle.capacity_animals;
  }, [selectedVehicle]);

  const projectedPickups = useMemo(
    () => selected.filter((s) => s._direction === 'pickup').length,
    [selected],
  );

  const isOverCapacity = vehicleCapacity !== null && projectedPickups > vehicleCapacity;

  // Caixas disponíveis do veículo selecionado (ativas)
  const availableCages = useMemo(
    () => (selectedVehicle?.has_cages ? selectedVehicle.cages.filter((c) => c.active) : []),
    [selectedVehicle],
  );

  const handleSave = async () => {
    if (!clinicId) return;
    if (selected.length === 0) {
      showError('Adicione ao menos uma parada antes de salvar.');
      return;
    }
    if (isOverCapacity) {
      showError(
        `Capacidade do veículo excedida: ${projectedPickups} coleta(s) para capacidade ${vehicleCapacity}.`,
      );
      return;
    }
    if (startKind === 'custom' && customStartAddress.trim().length < 3) {
      showError('Informe o endereço de saída do motorista.');
      return;
    }
    if (startKind === 'clinic' && !clinicStartAddress) {
      showError(
        'A clínica não tem endereço cadastrado. Cadastre no perfil ou escolha «Outro endereço».',
      );
      return;
    }
    setBusy(true);
    try {
      let routeId: string;
      const startPayload = {
        start_kind: startKind,
        start_address: startKind === 'custom' ? customStartAddress.trim() : null,
        start_lat: startCoords?.lat ?? null,
        start_lng: startCoords?.lng ?? null,
      };
      const labelValue = routeLabel.trim() || null;

      if (editingRoute) {
        await hubPickupApi.patchRoute(editingRoute.id, {
          clinic_id: clinicId,
          driver_staff_id: driverStaffId || null,
          vehicle_id: vehicleId || null,
          notes: notes || null,
          label: labelValue,
          ...startPayload,
        });
        routeId = editingRoute.id;
      } else {
        const { route } = await hubPickupApi.createRoute({
          clinic_id: clinicId,
          unit_id: unitId ?? null,
          route_date: dateYmd,
          driver_staff_id: driverStaffId || null,
          vehicle_id: vehicleId || null,
          notes: notes || null,
          label: labelValue,
          ...startPayload,
        });
        routeId = route.id;
      }

      await hubPickupApi.addStops(routeId, {
        clinic_id: clinicId,
        stops: selected.map((s, idx) => ({
          hub_appointment_id: s.appointment_id,
          direction: s._direction,
          sequence: idx,
          cage_id: stopCages.get(s.appointment_id) ?? null,
        })),
      });

      showSuccess(editingRoute ? 'Rota atualizada.' : 'Rota criada com sucesso.');
      onSaved();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar rota.');
    } finally {
      setBusy(false);
    }
  };

  const handleSplitAfter = async (appointmentId: string) => {
    if (!clinicId || !editingRoute) return;
    const idx = selected.findIndex((s) => s.appointment_id === appointmentId);
    if (idx < 0 || idx >= selected.length - 1) {
      showError('Não há paradas após este ponto para dividir.');
      return;
    }
    setBusy(true);
    try {
      // Persistir ordem atual antes de dividir
      await hubPickupApi.patchRoute(editingRoute.id, {
        clinic_id: clinicId,
        driver_staff_id: driverStaffId || null,
        vehicle_id: vehicleId || null,
        notes: notes || null,
        label: routeLabel.trim() || null,
        start_kind: startKind,
        start_address: startKind === 'custom' ? customStartAddress.trim() : null,
        start_lat: startCoords?.lat ?? null,
        start_lng: startCoords?.lng ?? null,
      });
      await hubPickupApi.addStops(editingRoute.id, {
        clinic_id: clinicId,
        stops: selected.map((s, i) => ({
          hub_appointment_id: s.appointment_id,
          direction: s._direction,
          sequence: i,
          cage_id: stopCages.get(s.appointment_id) ?? null,
        })),
      });
      await hubPickupApi.splitRoute(editingRoute.id, {
        clinic_id: clinicId,
        after_sequence: idx,
        label: 'Lote 2',
        insert_clinic_return: true,
      });
      showSuccess('Rota dividida. O lote seguinte foi criado com retorno à clínica.');
      onSaved();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao dividir rota.');
    } finally {
      setBusy(false);
    }
  };

  const openSuggestDialog = () => {
    const poolLen = selected.length + available.length;
    if (poolLen === 0) {
      showError('Não há pernas para sugerir lotes.');
      return;
    }
    if (vehicleCapacity != null) {
      setSuggestCapacity(String(vehicleCapacity));
    } else if (!suggestCapacity.trim()) {
      setSuggestCapacity('4');
    }
    setSuggestOpen(true);
  };

  const handleSuggestBatches = async () => {
    if (!clinicId) return;
    const pool = [
      ...selected,
      ...available.map((i) => ({
        ...i,
        _direction: (i.direction === 'delivery' ? 'delivery' : 'pickup') as 'pickup' | 'delivery',
      })),
    ];
    if (pool.length === 0) {
      showError('Não há pernas para sugerir lotes.');
      return;
    }

    const capacityFromVehicle = vehicleCapacity;
    const capacityParsed = Number.parseInt(suggestCapacity, 10);
    const capacity =
      capacityFromVehicle != null && capacityFromVehicle >= 1
        ? capacityFromVehicle
        : Number.isFinite(capacityParsed) && capacityParsed >= 1
          ? capacityParsed
          : null;

    if (capacity == null) {
      showError('Informe a capacidade (pets por lote).');
      return;
    }

    setBusy(true);
    try {
      const suggestion = await hubPickupApi.suggestBatches({
        clinic_id: clinicId,
        vehicle_id: vehicleId || null,
        capacity,
        window_minutes: suggestWindow,
        stops: pool.map((s) => ({
          hub_appointment_id: s.appointment_id,
          direction: s._direction,
          starts_at: s.starts_at,
          lat: coordsCache.get(s.appointment_id)?.lat ?? null,
          lng: coordsCache.get(s.appointment_id)?.lng ?? null,
        })),
      });

      setSuggestOpen(false);

      if (suggestion.batches.length <= 1) {
        showSuccess(
          `Um único lote já atende (janela ${suggestWindow === 0 ? 'exata' : `${suggestWindow} min`}, capacidade ${suggestion.capacity}).`,
        );
        setBusy(false);
        return;
      }

      const startPayload = {
        start_kind: startKind,
        start_address: startKind === 'custom' ? customStartAddress.trim() : null,
        start_lat: startCoords?.lat ?? null,
        start_lng: startCoords?.lng ?? null,
      };

      for (let bIdx = 0; bIdx < suggestion.batches.length; bIdx++) {
        const batch = suggestion.batches[bIdx];
        const batchStops = batch.stop_ids
          .map((id) => pool.find((p) => p.appointment_id === id))
          .filter(Boolean) as Array<PickupDayBoardItem & { _direction: 'pickup' | 'delivery' }>;
        if (batchStops.length === 0) continue;

        const { route } = await hubPickupApi.createRoute({
          clinic_id: clinicId,
          unit_id: unitId ?? null,
          route_date: dateYmd,
          driver_staff_id: driverStaffId || null,
          vehicle_id: vehicleId || null,
          notes: notes || null,
          label: batch.label,
          sort_order: bIdx,
          ...startPayload,
        });
        await hubPickupApi.addStops(route.id, {
          clinic_id: clinicId,
          stops: batchStops.map((s, idx) => ({
            hub_appointment_id: s.appointment_id,
            direction: s._direction,
            sequence: idx,
          })),
        });
        if (bIdx < suggestion.batches.length - 1) {
          await hubPickupApi.addClinicReturn(route.id, { clinic_id: clinicId });
        }
      }

      const windowLabel = suggestWindow === 0 ? 'exata' : `${suggestWindow} min`;
      showSuccess(
        `${suggestion.batches.length} lotes criados (janela ${windowLabel}, capacidade ${suggestion.capacity}).`,
      );
      onSaved();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao sugerir lotes.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <HubSidePanel
      open={open}
      onClose={onClose}
      title={editingRoute ? 'Editar rota' : 'Nova rota'}
      titleIcon={<Truck size={22} strokeWidth={2} aria-hidden />}
      subtitle={dateYmd}
      size="wide"
      footer={
        <>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          {!editingRoute ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost"
              onClick={openSuggestDialog}
              disabled={busy}
              title="Agrupa por janela de horário e capacidade (pets por lote)"
            >
              {busy ? <Loader size={14} className="spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
              Sugerir lotes por horário
            </button>
          ) : null}
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            onClick={() => void handleSave()}
            disabled={busy || selected.length === 0 || isOverCapacity}
          >
            {busy ? <Loader size={14} className="spin" aria-hidden /> : null}
            {editingRoute ? 'Salvar rota' : 'Criar rota'}
          </button>
        </>
      }
    >
    <div className="hub-pickup-builder">
      <div className="hub-pickup-builder__form">
        <div className="hub-pickup-builder__field">
          <label className="hub-pickup-builder__label" htmlFor="hub-pb-label">
            Rótulo do turno/lote
          </label>
          <input
            id="hub-pb-label"
            className="hub-clientes__input"
            value={routeLabel}
            onChange={(e) => setRouteLabel(e.target.value)}
            placeholder="Ex.: Manhã, Tarde, Lote 1"
            maxLength={80}
          />
        </div>
        <div className="hub-pickup-builder__field hub-pickup-builder__field--full">
          <span className="hub-pickup-builder__label">Saída do motorista</span>
          <div className="hub-pickup-builder__start-seg" role="group" aria-label="Origem da rota">
            <button
              type="button"
              className={startKind === 'clinic' ? 'hub-pickup-builder__start-seg--active' : ''}
              onClick={() => setStartKind('clinic')}
            >
              Clínica
            </button>
            <button
              type="button"
              className={startKind === 'custom' ? 'hub-pickup-builder__start-seg--active' : ''}
              onClick={() => setStartKind('custom')}
            >
              Outro endereço
            </button>
          </div>
          {startKind === 'clinic' ? (
            <p className="hub-pickup-builder__start-hint">
              {clinicStartAddress
                ? clinicStartAddress
                : 'Endereço da clínica ainda não cadastrado no perfil.'}
            </p>
          ) : (
            <input
              className="hub-clientes__input"
              value={customStartAddress}
              onChange={(e) => setCustomStartAddress(e.target.value)}
              placeholder="Rua, número, bairro, cidade…"
              maxLength={500}
            />
          )}
        </div>
        <div className="hub-pickup-builder__field">
          <label className="hub-pickup-builder__label" htmlFor="hub-pb-driver">
            Motorista
          </label>
          <HubSearchableCombobox
            id="hub-pb-driver"
            className="hub-combobox--clientes"
            options={staffOptions}
            value={driverStaffId}
            onChange={setDriverStaffId}
            placeholder="Selecionar motorista"
            allowCreate={false}
          />
        </div>
        <div className="hub-pickup-builder__field">
          <label className="hub-pickup-builder__label" htmlFor="hub-pb-vehicle">
            Veículo
          </label>
          <HubSearchableCombobox
            id="hub-pb-vehicle"
            className="hub-combobox--clientes"
            options={vehicleOptions}
            value={vehicleId}
            onChange={(v) => { setVehicleId(v); setStopCages(new Map()); }}
            placeholder="Selecionar veículo"
            allowCreate={false}
          />
          {selectedVehicle && vehicleCapacity !== null && (
            <div className={`hub-pb__capacity-bar${isOverCapacity ? ' hub-pb__capacity-bar--over' : ''}`}>
              {isOverCapacity && <AlertTriangle size={13} />}
              <span>
                {projectedPickups} {projectedPickups === 1 ? 'coleta' : 'coletas'} a bordo / capacidade {vehicleCapacity}
                {selectedVehicle.license_plate && ` · ${selectedVehicle.license_plate}`}
              </span>
            </div>
          )}
        </div>
        <div className="hub-pickup-builder__field">
          <label className="hub-pickup-builder__label" htmlFor="hub-pb-notes">
            Observações (opcional)
          </label>
          <textarea
            id="hub-pb-notes"
            className="hub-clientes__input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas gerais da rota…"
            rows={2}
            maxLength={2000}
          />
        </div>
      </div>

      <div className="hub-pickup-builder__body">
        {/* Coluna esquerda: paradas disponíveis */}
        <div className="hub-pickup-builder__available">
          <p className="hub-pickup-builder__section-label">
            Pernas disponíveis ({available.length})
          </p>
          {available.length === 0 ? (
            <p className="hub-clientes__muted" style={{ fontSize: '0.8125rem' }}>
              Todas as pernas já foram adicionadas.
            </p>
          ) : (
            available.map((item) => (
              <button
                key={item.appointment_id}
                type="button"
                className="hub-pickup-builder__avail-item"
                onClick={() => addItem(item)}
              >
                <span
                  className={`hub-pickup-card__direction hub-pickup-card__direction--${
                    item.direction === 'unknown' ? 'unknown' : item.direction
                  }`}
                  style={{ fontSize: '0.7rem' }}
                >
                  {item.direction === 'pickup' ? '↓' : item.direction === 'delivery' ? '↑' : '?'}
                </span>
                <span>{item.pet?.name ?? '—'}</span>
                <span className="hub-clientes__muted" style={{ fontSize: '0.75rem' }}>
                  {item.guardian?.full_name} · {formatTime(item.starts_at)}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Coluna direita: paradas selecionadas e ordenadas */}
        <div className="hub-pickup-builder__selected">
          <p className="hub-pickup-builder__section-label">
            Paradas da rota ({selected.length}) — arraste para reordenar
          </p>
          {selected.length === 0 ? (
            <p className="hub-clientes__muted" style={{ fontSize: '0.8125rem' }}>
              Clique em uma perna à esquerda para adicionar.
            </p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={selected.map((s) => s.appointment_id)}
                strategy={verticalListSortingStrategy}
              >
                {selected.map((item, idx) => (
                  <div key={item.appointment_id} className="hub-pb__stop-row">
                    <div style={{ flex: 1, position: 'relative' }}>
                      <SortableStopItem
                        item={item}
                        onRemove={removeItem}
                        canSplit={!!editingRoute && idx < selected.length - 1 && !busy}
                        onSplitAfter={(id) => void handleSplitAfter(id)}
                      />
                      <button
                        type="button"
                        className="hub-pickup-builder__dir-toggle"
                        onClick={() => toggleDirection(item.appointment_id)}
                        title="Inverter sentido (coleta/entrega)"
                      >
                        ⇄
                      </button>
                    </div>
                    {availableCages.length > 0 && (
                      <div className="hub-pb__cage-assign">
                        <label className="hub-pb__cage-label">
                          <Package size={12} /> Caixa
                        </label>
                        <select
                          className="hub-pb__cage-select"
                          value={stopCages.get(item.appointment_id) ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setStopCages((prev) => {
                              const next = new Map(prev);
                              if (val) next.set(item.appointment_id, val);
                              else next.delete(item.appointment_id);
                              return next;
                            });
                          }}
                        >
                          <option value="">— sem caixa —</option>
                          {availableCages.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}{c.capacity > 1 ? ` (${c.capacity})` : ''}
                            </option>
                          ))}
                        </select>
                        {stopCages.get(item.appointment_id) && (() => {
                          const cage = availableCages.find((c) => c.id === stopCages.get(item.appointment_id));
                          return cage?.color ? (
                            <span
                              className="hub-pb__cage-color-dot"
                              style={{ background: cage.color }}
                              title={cage.name}
                            />
                          ) : null;
                        })()}
                      </div>
                    )}
                  </div>
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      {/* Mapa de preview — mostra pontos à medida que os endereços são geocodificados */}
      {(mapStops.length > 0 || mapAvailableStops.length > 0 || startCoords) ? (
        <div className="hub-pickup-builder__map-block">
          <div className="hub-pickup-builder__map-toolbar">
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
              disabled={!googleMapsDirections}
              title={
                googleMapsDirections
                  ? googleMapsDirections.truncated
                    ? 'Abre no Google Maps (rota com muitas paradas — o link cobre as primeiras)'
                    : 'Abrir rota no Google Maps'
                  : 'Inclua saída e ao menos uma parada com endereço'
              }
              onClick={() => {
                if (!googleMapsDirections) return;
                openGoogleMapsUrl(googleMapsDirections.url);
                if (googleMapsDirections.truncated) {
                  showError(
                    'A rota tem muitas paradas: o Google Maps abre as primeiras + a última. Ajuste a ordem no app se precisar.',
                  );
                }
              }}
            >
              <ExternalLink size={14} aria-hidden />
              Abrir no Google Maps
            </button>
          </div>
          <PickupRouteMap
            stops={mapStops}
            availableStops={mapAvailableStops}
            startPoint={
              startCoords
                ? {
                    lat: startCoords.lat,
                    lng: startCoords.lng,
                    label: startKind === 'clinic' ? 'Saída — Clínica' : 'Saída — Personalizada',
                    address: effectiveStartAddress || null,
                  }
                : null
            }
          />
        </div>
      ) : (
        <div className="hub-pickup-builder__map-placeholder">
          <span>Mapa disponível após geocodificação dos endereços…</span>
        </div>
      )}
    </div>
    </HubSidePanel>

    <HubModal
      open={suggestOpen}
      onClose={() => {
        if (!busy) setSuggestOpen(false);
      }}
      title="Sugerir lotes por horário"
      subtitle="Agrupa coleta e entrega pela janela escolhida e respeita a capacidade (1 pet por parada)."
      size="lg"
      footer={
        <>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost"
            onClick={() => setSuggestOpen(false)}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            onClick={() => void handleSuggestBatches()}
            disabled={busy}
          >
            {busy ? <Loader size={14} className="spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
            Gerar lotes
          </button>
        </>
      }
    >
      <div className="hub-pickup-suggest">
        <div className="hub-pickup-builder__field">
          <span className="hub-pickup-builder__label" id="hub-pb-suggest-window">
            Janela de horário
          </span>
          <div
            className="hub-pickup-builder__start-seg"
            role="radiogroup"
            aria-labelledby="hub-pb-suggest-window"
          >
            {(
              [
                { value: 0 as const, label: 'Exato' },
                { value: 15 as const, label: '15 min' },
                { value: 30 as const, label: '30 min' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={suggestWindow === opt.value}
                className={suggestWindow === opt.value ? 'hub-pickup-builder__start-seg--active' : ''}
                onClick={() => setSuggestWindow(opt.value)}
                disabled={busy}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="hub-pickup-builder__start-hint">
            {suggestWindow === 0
              ? 'Agrupa só paradas no mesmo minuto.'
              : `Agrupa paradas dentro de blocos de ${suggestWindow} minutos.`}
          </p>
        </div>

        <div className="hub-pickup-builder__field">
          <label className="hub-pickup-builder__label" htmlFor="hub-pb-suggest-cap">
            Capacidade (pets por lote)
          </label>
          {vehicleCapacity != null ? (
            <>
              <input
                id="hub-pb-suggest-cap"
                className="hub-clientes__input"
                type="number"
                min={1}
                value={vehicleCapacity}
                readOnly
                disabled
              />
              <p className="hub-pickup-builder__start-hint">
                Usando a capacidade do veículo selecionado
                {selectedVehicle?.name ? ` (${selectedVehicle.name})` : ''}.
              </p>
            </>
          ) : (
            <>
              <input
                id="hub-pb-suggest-cap"
                className="hub-clientes__input"
                type="number"
                min={1}
                step={1}
                value={suggestCapacity}
                onChange={(e) => setSuggestCapacity(e.target.value)}
                disabled={busy}
                placeholder="Ex.: 4"
              />
              <p className="hub-pickup-builder__start-hint">
                Sem veículo selecionado — informe quantos pets cabem em cada lote.
              </p>
            </>
          )}
        </div>
      </div>
    </HubModal>
    </>
  );
};

export default PickupRouteBuilder;
