import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, GripVertical, Loader, X } from 'lucide-react';
import { getStoredClinicId } from '@petimi/web-core';
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
import { hubPickupApi, type PickupDayBoardItem, type PickupRoute } from '../../api/hubPickupApi';
import { hubStaffApi, type HubStaffMember } from '../../api/hubStaffApi';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import { useAlert } from '../../components/AlertProvider';

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
}: {
  item: PickupDayBoardItem & { _direction: 'pickup' | 'delivery' };
  onRemove: (id: string) => void;
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
        <span className="hub-pickup-builder__stop-meta">
          {item.guardian?.full_name ?? ''}
          {item.address ? ` · ${item.address}` : ''}
          {' · '}
          {formatTime(item.starts_at)}
        </span>
      </div>
      <button
        type="button"
        className="hub-clientes__icon-btn"
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
  looseItems: PickupDayBoardItem[];
  dateYmd: string;
  unitId?: string;
  editingRoute?: PickupRoute | null;
  onClose: () => void;
  onSaved: () => void;
};

const PickupRouteBuilder: React.FC<Props> = ({
  looseItems,
  dateYmd,
  unitId,
  editingRoute,
  onClose,
  onSaved,
}) => {
  const clinicId = getStoredClinicId();
  const { showError, showSuccess } = useAlert();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const [staff, setStaff] = useState<HubStaffMember[]>([]);
  const [driverStaffId, setDriverStaffId] = useState(editingRoute?.driver_staff_id ?? '');
  const [vehicleLabel, setVehicleLabel] = useState(editingRoute?.vehicle_label ?? '');
  const [notes, setNotes] = useState(editingRoute?.notes ?? '');
  const [busy, setBusy] = useState(false);

  // Paradas selecionadas com direção confirmada
  type StopCandidate = PickupDayBoardItem & { _direction: 'pickup' | 'delivery' };
  const [selected, setSelected] = useState<StopCandidate[]>([]);

  useEffect(() => {
    if (!clinicId) return;
    void hubStaffApi.list(clinicId).then((r) => setStaff(r.staff ?? [])).catch(() => setStaff([]));
  }, [clinicId]);

  // Itens soltos disponíveis (não já selecionados)
  const available = useMemo(
    () => looseItems.filter((i) => !selected.some((s) => s.appointment_id === i.appointment_id)),
    [looseItems, selected],
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

  const staffOptions = useMemo(
    () => [
      { value: '', label: 'Sem motorista' },
      ...staff.filter((s) => s.active !== false).map((s) => ({ value: s.id, label: s.full_name })),
    ],
    [staff],
  );

  const handleSave = async () => {
    if (!clinicId) return;
    if (selected.length === 0) {
      showError('Adicione ao menos uma parada antes de salvar.');
      return;
    }
    setBusy(true);
    try {
      let routeId: string;

      if (editingRoute) {
        await hubPickupApi.patchRoute(editingRoute.id, {
          clinic_id: clinicId,
          driver_staff_id: driverStaffId || null,
          vehicle_label: vehicleLabel || null,
          notes: notes || null,
        });
        routeId = editingRoute.id;
      } else {
        const { route } = await hubPickupApi.createRoute({
          clinic_id: clinicId,
          unit_id: unitId ?? null,
          route_date: dateYmd,
          driver_staff_id: driverStaffId || null,
          vehicle_label: vehicleLabel || null,
          notes: notes || null,
        });
        routeId = route.id;
      }

      await hubPickupApi.addStops(routeId, {
        clinic_id: clinicId,
        stops: selected.map((s, idx) => ({
          hub_appointment_id: s.appointment_id,
          direction: s._direction,
          sequence: idx,
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

  return (
    <div className="hub-pickup-builder">
      <div className="hub-pickup-builder__header">
        <span className="hub-pickup-builder__title">
          {editingRoute ? 'Editar rota' : 'Nova rota'} — {dateYmd}
        </span>
        <button type="button" className="hub-clientes__icon-btn" onClick={onClose} aria-label="Fechar">
          <X size={16} />
        </button>
      </div>

      <div className="hub-pickup-builder__form">
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
            Veículo (opcional)
          </label>
          <input
            id="hub-pb-vehicle"
            type="text"
            className="hub-clientes__input"
            value={vehicleLabel}
            onChange={(e) => setVehicleLabel(e.target.value)}
            placeholder="Ex.: Van branca, Gol prata"
            maxLength={200}
          />
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
                {selected.map((item) => (
                  <div key={item.appointment_id} style={{ position: 'relative' }}>
                    <SortableStopItem item={item} onRemove={removeItem} />
                    <button
                      type="button"
                      className="hub-pickup-builder__dir-toggle"
                      onClick={() => toggleDirection(item.appointment_id)}
                      title="Inverter sentido (coleta/entrega)"
                    >
                      ⇄
                    </button>
                  </div>
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      <div className="hub-pickup-builder__footer">
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--ghost"
          onClick={onClose}
          disabled={busy}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--primary"
          onClick={() => void handleSave()}
          disabled={busy || selected.length === 0}
        >
          {busy ? <Loader size={14} className="spin" aria-hidden /> : null}
          {editingRoute ? 'Salvar rota' : 'Criar rota'}
        </button>
      </div>
    </div>
  );
};

export default PickupRouteBuilder;
