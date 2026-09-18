import React, { useCallback, useMemo } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { GroomingDayBoardItem } from '../../api/hubGroomingApi';
import { petAgeDetailedLabel } from '../pets/petAge';
import { PORTE_LABELS, type PetBodyPorteValue } from '../../utils/hubServiceTypesPricingMatrix';
import {
  GROOMING_BOARD_COLUMNS,
  GROOMING_STAGE_LABELS,
  canOpenGroomingSessionFromAppointment,
  getItemBoardStage,
  itemBoardKey,
  pickDropTargetStage,
  resolveGroomingQuickAction,
  type GroomingQuickAction,
  type GroomingStage,
} from './groomingStages';

export type { GroomingQuickAction };

const ADVANCE_LABEL: Partial<Record<GroomingStage, string>> = {
  scheduled: 'Check-in',
  checked_in: 'Para fila',
  queued: 'Iniciar',
  in_service: 'Finalizar',
  finishing: 'Pronto',
  ready: 'Entregar',
  delivered: 'Encerrar',
};

const DRAG_CARD_PREFIX = 'grooming-card-';
const DROP_COL_PREFIX = 'grooming-col-';

function formatTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function pillClass(stage: GroomingStage): string {
  if (stage === 'in_service' || stage === 'finishing') {
    return 'hub-clientes__pill hub-clinic-queue__pill--progress';
  }
  if (stage === 'delivered' || stage === 'closed' || stage === 'ready') {
    return 'hub-clientes__pill hub-clinic-queue__pill--done';
  }
  return 'hub-clientes__pill hub-clinic-queue__pill--waiting';
}

function servicesLabel(item: GroomingDayBoardItem): string {
  const lines = item.services?.map((s) => s.name).filter(Boolean);
  if (lines?.length) return lines.join(' · ');
  return item.service_type?.name || item.title || 'Banho & Tosa';
}

function porteLabel(tier?: string): string | null {
  if (!tier) return null;
  return PORTE_LABELS[tier as PetBodyPorteValue] ?? tier;
}

function quickActionLabel(action: GroomingQuickAction, item: GroomingDayBoardItem): string {
  if (action.type === 'confirm_appointment') return 'Confirmar';
  if (action.type === 'check_in') {
    const stage = getItemBoardStage(item);
    if (stage === 'queued') return 'Iniciar';
    if (stage === 'checked_in') return 'Para fila';
    return 'Check-in';
  }
  const stage = getItemBoardStage(item);
  return ADVANCE_LABEL[stage] || 'Avançar';
}

function findItemByDragId(items: GroomingDayBoardItem[], dragId: string | number): GroomingDayBoardItem | null {
  const raw = String(dragId);
  if (!raw.startsWith(DRAG_CARD_PREFIX)) return null;
  const key = raw.slice(DRAG_CARD_PREFIX.length);
  return items.find((i) => itemBoardKey(i) === key) ?? null;
}

type DroppableColProps = {
  colId: string;
  title: React.ReactNode;
  count: number;
  children: React.ReactNode;
};

const GroomingDroppableColumn: React.FC<DroppableColProps> = ({ colId, title, count, children }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `${DROP_COL_PREFIX}${colId}` });
  return (
    <section
      ref={setNodeRef}
      className={`hub-clinic-queue__col${isOver ? ' hub-grooming-queue__col--drop-over' : ''}`}
    >
      <h3 className="hub-clinic-queue__col-title">
        {title} <span className="hub-clinic-queue__count">{count}</span>
      </h3>
      <div className="hub-clinic-queue__cards">{children}</div>
    </section>
  );
};

type DraggableCardProps = {
  dragId: string;
  disabled: boolean;
  children: React.ReactNode;
};

const GroomingDraggableCard: React.FC<DraggableCardProps> = ({ dragId, disabled, children }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
    disabled,
  });
  const style: React.CSSProperties = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 20 : undefined,
        opacity: isDragging ? 0.92 : undefined,
      }
    : {};

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`hub-grooming-queue__draggable${disabled ? '' : ' hub-grooming-queue__draggable--enabled'}`}
      {...(disabled ? {} : listeners)}
      {...(disabled ? {} : attributes)}
    >
      {children}
    </article>
  );
};

type Props = {
  items: GroomingDayBoardItem[];
  canWrite: boolean;
  /** Arrastar entre colunas = PATCH estágio (só com sessão); requer `grooming.queue.manage` na página. */
  canDragQueue?: boolean;
  onStageDrop?: (item: GroomingDayBoardItem, stage: GroomingStage) => void | Promise<void>;
  /** Pausa/retoma (`PATCH` paused); requer `grooming.queue.manage`. */
  canPauseQueue?: boolean;
  onPauseToggle?: (item: GroomingDayBoardItem) => void | Promise<void>;
  searchQ: string;
  onSelect: (item: GroomingDayBoardItem) => void;
  onQuickAction: (item: GroomingDayBoardItem, action: GroomingQuickAction) => void;
  onTogglePriority: (item: GroomingDayBoardItem) => void;
};

const GroomingQueueBoard: React.FC<Props> = ({
  items,
  canWrite,
  canDragQueue = false,
  onStageDrop,
  searchQ,
  onSelect,
  onQuickAction,
}) => {
  const q = searchQ.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? items.filter((i) => {
            const pet = (i.pet?.name || '').toLowerCase();
            const tutor = (i.guardian?.full_name || '').toLowerCase();
            return pet.includes(q) || tutor.includes(q);
          })
        : items,
    [items, q],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 10 } }));

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!onStageDrop || !canDragQueue) return;
      const { active, over } = event;
      if (!over) return;
      const item = findItemByDragId(filtered, active.id);
      if (!item) return;
      if (!item.session_id && !canOpenGroomingSessionFromAppointment(item)) return;
      const overId = String(over.id);
      if (!overId.startsWith(DROP_COL_PREFIX)) return;
      const colId = overId.slice(DROP_COL_PREFIX.length);
      const col = GROOMING_BOARD_COLUMNS.find((c) => c.id === colId);
      if (!col) return;
      const current = getItemBoardStage(item);
      const target = pickDropTargetStage(current, col.stages);
      if (!target || target === current) return;
      void onStageDrop(item, target);
    },
    [filtered, onStageDrop],
  );

  const renderCard = (item: GroomingDayBoardItem) => {
    const petName = item.pet?.name || 'Sem pet';
    const tutor = item.guardian?.full_name || '—';
    const prof = item.staff_member?.full_name || 'Sem profissional';
    const stage = getItemBoardStage(item);
    const time = formatTime(item.starts_at);
    const porte = porteLabel(item.pet?.size_tier);
    const duration =
      item.estimated_duration_minutes != null && item.estimated_duration_minutes > 0
        ? `${item.estimated_duration_minutes} min`
        : null;
    const quick = resolveGroomingQuickAction(item, canWrite);
    const priority = (item.priority ?? 0) > 0;
    const dragId = `${DRAG_CARD_PREFIX}${itemBoardKey(item)}`;
    const dragEnabled = Boolean(
      canDragQueue &&
        onStageDrop &&
        (item.session_id || canOpenGroomingSessionFromAppointment(item)),
    );
    const paused = Boolean(item.paused_at);

    const inner = (
      <>
        <div className="hub-clinic-queue__card-top">
          {item.pet?.avatar_url ? (
            <img
              src={item.pet.avatar_url}
              alt=""
              className="hub-grooming-queue__pet-avatar"
              draggable={false}
            />
          ) : null}
          <div className="hub-grooming-queue__card-head-text">
            <p className="hub-clinic-queue__pet">{petName}</p>
            <span className={pillClass(stage)}>{GROOMING_STAGE_LABELS[stage]}</span>
          </div>
        </div>
        <div className="hub-grooming-queue__badges">
          {item.pet?.is_first_grooming_visit ? (
            <span className="hub-grooming-queue__badge hub-grooming-queue__badge--first">1ª visita B&T</span>
          ) : null}
          {item.is_late ? <span className="hub-grooming-queue__late-tag">Em atraso</span> : null}
          {item.is_walk_in ? <span className="hub-grooming-queue__badge">Avulso</span> : null}
          {paused ? <span className="hub-grooming-queue__badge hub-grooming-queue__badge--paused">Pausado</span> : null}
          {priority ? <span className="hub-grooming-queue__priority-tag">Prioritário</span> : null}
          {item.appointment_kind === 'pickup_route' ? (
            <span className="hub-grooming-queue__badge">Leva e traz</span>
          ) : null}
        </div>
        <p className="hub-clientes__muted hub-clinic-queue__meta">{servicesLabel(item)}</p>
        <p className="hub-clientes__muted hub-clinic-queue__meta">
          {time} · {tutor}
        </p>
        <p className="hub-clientes__muted hub-clinic-queue__meta">
          {prof}
          {porte ? ` · ${porte}` : ''}
          {duration ? ` · ~${duration}` : ''}
        </p>
        {item.clinical_tags && item.clinical_tags.length > 0 ? (
          <div className="hub-grooming-tags hub-grooming-tags--card" aria-label="Alertas">
            {item.clinical_tags.map((t) => (
              <span key={t.key} className="hub-grooming-tags__pill">
                {t.label}
              </span>
            ))}
          </div>
        ) : null}
        {item.pet?.birth_date ? (
          <p className="hub-clientes__muted hub-clinic-queue__meta">Idade: {petAgeDetailedLabel(item.pet.birth_date)}</p>
        ) : null}
        <div className="hub-clinic-queue__actions">
          {quick ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
              onClick={(e) => {
                e.stopPropagation();
                void onQuickAction(item, quick);
              }}
            >
              {quickActionLabel(quick, item)}
            </button>
          ) : null}
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(item);
            }}
          >
            Detalhes
          </button>
        </div>
      </>
    );

    return (
      <GroomingDraggableCard key={itemBoardKey(item)} dragId={dragId} disabled={!dragEnabled}>
        <div
          className={`hub-clinic-queue__card${item.is_late ? ' hub-grooming-queue__card--late' : ''}${priority ? ' hub-grooming-queue__card--priority' : ''}${paused ? ' hub-grooming-queue__card--paused' : ''}`}
          onClick={() => onSelect(item)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(item);
            }
          }}
          role="button"
          tabIndex={0}
        >
          {inner}
        </div>
      </GroomingDraggableCard>
    );
  };

  const boardInner = (
    <>
      {GROOMING_BOARD_COLUMNS.map((col) => {
        const colItems = filtered.filter((i) => col.stages.includes(getItemBoardStage(i)));
        return (
          <GroomingDroppableColumn key={col.id} colId={col.id} title={col.title} count={colItems.length}>
            {colItems.length === 0 ? (
              <p className="hub-clientes__muted hub-clinic-queue__empty">Nenhum nesta coluna.</p>
            ) : (
              colItems.map((item) => renderCard(item))
            )}
          </GroomingDroppableColumn>
        );
      })}
    </>
  );

  return (
    <div className="hub-clinic-queue hub-grooming-queue hub-grooming-queue--5col">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        {boardInner}
      </DndContext>
    </div>
  );
};

export default GroomingQueueBoard;
