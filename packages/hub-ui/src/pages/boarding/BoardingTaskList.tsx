import React, { useRef, useState } from 'react';
import { Camera, Loader, RotateCcw } from 'lucide-react';
import { HubCheckbox } from '../../components/HubCheckbox';
import type { BoardingTask, BoardingTaskOutcome } from '../../api/hubBoardingApi';
import {
  OUTCOMES_BY_KIND,
  OUTCOME_BUTTON_LABELS,
  TASK_KIND_LABELS,
  formatHm,
  groupTasksByTime,
  isBatchEligible,
  isConcerningOutcome,
  isTaskOverdue,
  taskResultLabel,
} from './boardingCareUi';

export type BoardingTaskAction =
  | { type: 'outcome'; outcome: BoardingTaskOutcome; notes?: string | null }
  | { type: 'skip'; notes?: string | null }
  | { type: 'undo' };

type RowProps = {
  task: BoardingTask;
  showPet?: boolean;
  canExecute: boolean;
  busy: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (task: BoardingTask) => void;
  onAction: (task: BoardingTask, action: BoardingTaskAction) => void;
  onOpenPet?: (task: BoardingTask) => void;
  /** Foto ligada à tarefa (rotina / execução). */
  onAttachPhoto?: (task: BoardingTask, file: File) => void;
};

export const BoardingTaskRow: React.FC<RowProps> = ({
  task,
  showPet,
  canExecute,
  busy,
  selectable,
  selected,
  onToggleSelect,
  onAction,
  onOpenPet,
  onAttachPhoto,
}) => {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const photoRef = useRef<HTMLInputElement>(null);
  const pending = task.status === 'pending';
  const overdue = task.overdue ?? isTaskOverdue(task);
  const result = taskResultLabel(task);
  const concerning = task.status === 'done' && isConcerningOutcome(task.kind, task.outcome);
  const outcomes = OUTCOMES_BY_KIND[task.kind] ?? ['done', 'not_done'];

  const send = (action: BoardingTaskAction) => {
    const notes = note.trim() || null;
    if (action.type === 'undo') onAction(task, action);
    else onAction(task, { ...action, notes });
    setNote('');
    setNoteOpen(false);
  };

  const photoBtn =
    canExecute && onAttachPhoto ? (
      <>
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hub-boarding-task__file-input"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onAttachPhoto(task, file);
          }}
        />
        <button
          type="button"
          className="hub-clientes__link-btn hub-clientes__link-btn--with-icon"
          disabled={busy}
          onClick={() => photoRef.current?.click()}
          aria-label={`Anexar foto a ${task.title}`}
        >
          <Camera size={13} aria-hidden />
          Foto
        </button>
      </>
    ) : null;

  return (
    <li
      className={[
        'hub-boarding-task',
        pending ? '' : 'hub-boarding-task--done',
        overdue ? 'hub-boarding-task--overdue' : '',
        concerning ? 'hub-boarding-task--concern' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="hub-boarding-task__main">
        {selectable ? (
          <HubCheckbox
            checked={Boolean(selected)}
            onChange={() => onToggleSelect?.(task)}
            ariaLabel={`Selecionar ${task.pet_name ?? ''} para registro em lote`}
          />
        ) : null}
        <span className="hub-boarding-task__time">{task.scheduled_for ? formatHm(task.scheduled_for) : '—'}</span>
        <div className="hub-boarding-task__text">
          {showPet && task.pet_name ? (
            onOpenPet ? (
              <button type="button" className="hub-boarding-task__pet" onClick={() => onOpenPet(task)}>
                {task.pet_name}
              </button>
            ) : (
              <span className="hub-boarding-task__pet">{task.pet_name}</span>
            )
          ) : null}
          <span className="hub-boarding-task__title">{task.title}</span>
          {task.details ? <span className="hub-boarding-task__details">{task.details}</span> : null}
          {!pending && task.last_notes ? <span className="hub-boarding-task__details">{task.last_notes}</span> : null}
          {showPet && task.space_name ? <span className="hub-boarding-task__details">{task.space_name}</span> : null}
        </div>
        <div className="hub-boarding-task__state">
          {overdue ? <span className="hub-grooming-drawer__flag hub-grooming-drawer__flag--late">Atrasada</span> : null}
          {!pending && result ? (
            <span
              className={`hub-grooming-drawer__stage hub-grooming-drawer__stage--${concerning ? 'paused' : task.status === 'skipped' ? 'neutral' : 'done'}`}
            >
              {result}
            </span>
          ) : null}
          {pending && !overdue ? (
            <span className="hub-grooming-drawer__chip">{TASK_KIND_LABELS[task.kind] ?? 'Tarefa'}</span>
          ) : null}
        </div>
      </div>

      {canExecute ? (
        pending ? (
          <>
            <div className="hub-boarding-task__actions">
              {outcomes.map((o, idx) => (
                <button
                  key={o}
                  type="button"
                  className={`hub-clientes__btn hub-clientes__btn--sm ${idx === 0 ? 'hub-clientes__btn--primary' : 'hub-clientes__btn--ghost'}`}
                  disabled={busy}
                  onClick={() => send({ type: 'outcome', outcome: o })}
                >
                  {busy && idx === 0 ? <Loader size={14} className="spin" aria-hidden /> : null}
                  {OUTCOME_BUTTON_LABELS[o]}
                </button>
              ))}
              <button
                type="button"
                className="hub-clientes__link-btn"
                disabled={busy}
                onClick={() => setNoteOpen((v) => !v)}
                aria-expanded={noteOpen}
              >
                {noteOpen ? 'Fechar observação' : 'Observação'}
              </button>
              <button
                type="button"
                className="hub-clientes__link-btn"
                disabled={busy}
                onClick={() => send({ type: 'skip' })}
              >
                Não se aplica
              </button>
              {photoBtn}
            </div>
            {noteOpen ? (
              <textarea
                className="hub-clientes__input hub-boarding-task__note"
                rows={2}
                value={note}
                placeholder="Ex.: comeu metade, estava agitado…"
                onChange={(e) => setNote(e.target.value)}
              />
            ) : null}
          </>
        ) : (
          <div className="hub-boarding-task__actions">
            {task.executed_at ? (
              <span className="hub-boarding-task__details">{formatHm(task.executed_at)}</span>
            ) : null}
            {photoBtn}
            <button
              type="button"
              className="hub-clientes__link-btn hub-clientes__link-btn--with-icon"
              disabled={busy}
              onClick={() => send({ type: 'undo' })}
            >
              <RotateCcw size={13} aria-hidden />
              Desfazer
            </button>
          </div>
        )
      ) : null}
    </li>
  );
};

type ListProps = {
  tasks: BoardingTask[];
  showPet?: boolean;
  canExecute: boolean;
  busyTaskId?: string | null;
  onAction: (task: BoardingTask, action: BoardingTaskAction) => void;
  onOpenPet?: (task: BoardingTask) => void;
  onAttachPhoto?: (task: BoardingTask, file: File) => void;
  /** Visão por horário: Atrasadas, Agora, Próximas, Feitas. */
  grouped?: boolean;
  /** Seleção para registro em lote (só recreação, passeio e avulsas). */
  selection?: { ids: Set<string>; onToggle: (task: BoardingTask) => void } | null;
  emptyLabel?: string;
  nowMs?: number;
};

const GROUPS: { key: 'overdue' | 'now' | 'upcoming' | 'done'; label: string }[] = [
  { key: 'overdue', label: 'Atrasadas' },
  { key: 'now', label: 'Agora' },
  { key: 'upcoming', label: 'Próximas' },
  { key: 'done', label: 'Feitas' },
];

const BoardingTaskList: React.FC<ListProps> = ({
  tasks,
  showPet,
  canExecute,
  busyTaskId,
  onAction,
  onOpenPet,
  onAttachPhoto,
  grouped,
  selection,
  emptyLabel = 'Nenhuma tarefa.',
  nowMs,
}) => {
  const [showDone, setShowDone] = useState(false);

  if (!tasks.length) return <p className="hub-grooming-drawer__hint">{emptyLabel}</p>;

  const renderRow = (t: BoardingTask) => (
    <BoardingTaskRow
      key={t.id}
      task={t}
      showPet={showPet}
      canExecute={canExecute}
      busy={busyTaskId === t.id}
      selectable={Boolean(selection) && isBatchEligible(t) && t.can_group_play !== false}
      selected={selection?.ids.has(t.id)}
      onToggleSelect={selection?.onToggle}
      onAction={onAction}
      onOpenPet={onOpenPet}
      onAttachPhoto={onAttachPhoto}
    />
  );

  if (!grouped) {
    return <ul className="hub-boarding-tasks">{tasks.map(renderRow)}</ul>;
  }

  const groups = groupTasksByTime(tasks, nowMs);
  return (
    <div className="hub-boarding-task-groups">
      {GROUPS.map(({ key, label }) => {
        const list = groups[key];
        if (!list.length) return null;
        if (key === 'done') {
          return (
            <section key={key} className="hub-boarding-task-groups__group">
              <button
                type="button"
                className="hub-grooming-floor__done-toggle"
                onClick={() => setShowDone((v) => !v)}
                aria-expanded={showDone}
              >
                {showDone ? 'Ocultar feitas' : `Ver feitas (${list.length})`}
              </button>
              {showDone ? <ul className="hub-boarding-tasks">{list.map(renderRow)}</ul> : null}
            </section>
          );
        }
        return (
          <section key={key} className="hub-boarding-task-groups__group">
            <h4 className={`hub-clinic-queue__col-title${key === 'overdue' ? ' hub-boarding-task-groups__title--late' : ''}`}>
              {label} <span className="hub-clinic-queue__count">({list.length})</span>
            </h4>
            <ul className="hub-boarding-tasks">{list.map(renderRow)}</ul>
          </section>
        );
      })}
    </div>
  );
};

export default BoardingTaskList;
