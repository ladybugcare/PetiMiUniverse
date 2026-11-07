import React, { useMemo, useRef, useState } from 'react';
import { Camera, Plus } from 'lucide-react';
import { HubTimeField } from '../../components/HubTimeField';
import { HubCheckbox } from '../../components/HubCheckbox';
import { HubCancelButton } from '../../components/HubCancelButton';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import { useAlert } from '../../components/AlertProvider';
import {
  hubBoardingApi,
  type BoardingCareHandling,
  type BoardingIncident,
  type BoardingIncidentKind,
  type BoardingSeverity,
  type BoardingTask,
  type BoardingTaskKind,
} from '../../api/hubBoardingApi';
import { todayYmd } from '../../utils/hubCalendar';
import BoardingTaskList from './BoardingTaskList';
import { useBoardingTaskRunner } from './useBoardingTaskRunner';
import {
  INCIDENT_KIND_LABELS,
  SEVERITY_LABELS,
  TASK_KIND_LABELS,
  formatDateTimeShort,
  formatDayMonth,
  handlingNeedsAttention,
  summarizeHandling,
} from './boardingCareUi';

type Props = {
  clinicId: string;
  reservationId: string;
  stage: string;
  tasks: BoardingTask[];
  incidents: BoardingIncident[];
  handling?: BoardingCareHandling | null;
  canDailyReport: boolean;
  onChanged: () => void | Promise<void>;
};

const SEVERITY_VARIANT: Record<BoardingSeverity, string> = { low: 'neutral', medium: 'paused', high: 'progress' };

function localIso(dateYmd: string, hm: string): string {
  return new Date(`${dateYmd}T${hm || '00:00'}:00`).toISOString();
}

const BoardingStayRoutineTab: React.FC<Props> = ({
  clinicId,
  reservationId,
  stage,
  tasks,
  incidents,
  handling,
  canDailyReport,
  onChanged,
}) => {
  const { showError, showSuccess } = useAlert();
  const { busyTaskId, run } = useBoardingTaskRunner(clinicId, onChanged);
  const canExecute = canDailyReport && (stage === 'checked_in' || stage === 'checked_out');
  const active = stage === 'checked_in';

  const dates = useMemo(() => [...new Set(tasks.map((t) => t.task_date))].sort(), [tasks]);
  const today = todayYmd();
  const [day, setDay] = useState<string>(() => (dates.includes(today) ? today : dates[dates.length - 1] ?? today));
  const dayTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.task_date === day)
        .sort((a, b) => String(a.scheduled_for ?? '').localeCompare(String(b.scheduled_for ?? ''))),
    [tasks, day],
  );
  const doneCount = dayTasks.filter((t) => t.status !== 'pending').length;

  // Tarefa avulsa
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [taskKind, setTaskKind] = useState<BoardingTaskKind>('custom');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskTime, setTaskTime] = useState('');
  const [taskBusy, setTaskBusy] = useState(false);

  const createTask = async () => {
    if (!taskTitle.trim()) return;
    setTaskBusy(true);
    try {
      await hubBoardingApi.createTask(reservationId, {
        clinic_id: clinicId,
        kind: taskKind,
        title: taskTitle.trim(),
        scheduled_for: taskTime ? localIso(today, taskTime) : null,
      });
      setTaskFormOpen(false);
      setTaskTitle('');
      setTaskTime('');
      setTaskKind('custom');
      setDay(today);
      await onChanged();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao criar tarefa');
    } finally {
      setTaskBusy(false);
    }
  };

  // Intercorrências
  const [incFormOpen, setIncFormOpen] = useState(false);
  const [incKind, setIncKind] = useState<BoardingIncidentKind>('health');
  const [incSeverity, setIncSeverity] = useState<BoardingSeverity>('low');
  const [incDescription, setIncDescription] = useState('');
  const [incAction, setIncAction] = useState('');
  const [incNotified, setIncNotified] = useState(false);
  const [incPhoto, setIncPhoto] = useState<File | null>(null);
  const [incBusy, setIncBusy] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);

  const resetIncidentForm = () => {
    setIncFormOpen(false);
    setIncKind('health');
    setIncSeverity('low');
    setIncDescription('');
    setIncAction('');
    setIncNotified(false);
    setIncPhoto(null);
  };

  const createIncident = async () => {
    if (!incDescription.trim()) return;
    setIncBusy(true);
    try {
      const { incident } = await hubBoardingApi.createIncident(reservationId, {
        clinic_id: clinicId,
        kind: incKind,
        severity: incSeverity,
        description: incDescription.trim(),
        action_taken: incAction.trim() || null,
        tutor_notified: incNotified,
      });
      if (incPhoto) {
        await hubBoardingApi
          .uploadMedia({ clinicId, reservationId, file: incPhoto, incidentId: incident.id, caption: 'Intercorrência' })
          .catch(() => showError('Intercorrência registrada, mas a foto não foi enviada.'));
      }
      showSuccess('Intercorrência registrada');
      resetIncidentForm();
      await onChanged();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registrar intercorrência');
    } finally {
      setIncBusy(false);
    }
  };

  const patchIncident = async (incident: BoardingIncident, patch: { status?: 'resolved'; tutor_notified?: boolean; resolution_notes?: string | null }) => {
    setIncBusy(true);
    try {
      await hubBoardingApi.patchIncident(incident.id, { clinic_id: clinicId, ...patch });
      setResolvingId(null);
      setResolutionNotes('');
      await onChanged();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao atualizar intercorrência');
    } finally {
      setIncBusy(false);
    }
  };

  const sortedIncidents = [...incidents].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return String(b.occurred_at).localeCompare(String(a.occurred_at));
  });

  const handlingSummary = summarizeHandling(handling);
  const handlingAlert = handlingNeedsAttention(handling);

  const attachTaskPhoto = async (task: BoardingTask, file: File) => {
    try {
      await hubBoardingApi.uploadMedia({
        clinicId,
        reservationId,
        file,
        taskId: task.id,
        caption: task.title,
      });
      showSuccess('Foto anexada à tarefa');
      await onChanged();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao enviar a foto');
    }
  };

  return (
    <>
      {handlingSummary ? (
        <section
          className={`hub-grooming-drawer__callout${handlingAlert ? ' hub-grooming-drawer__callout--request' : ''}`}
          aria-label="Manejo do pet"
        >
          <h4 className="hub-grooming-drawer__heading">Manejo</h4>
          <p className="hub-grooming-drawer__hint">{handlingSummary}</p>
        </section>
      ) : null}

      <section className="hub-grooming-drawer__section">
        <div className="hub-grooming-drawer__heading-row">
          <h4 className="hub-grooming-drawer__heading">Rotina</h4>
          {dayTasks.length ? (
            <span className="hub-grooming-drawer__count">
              {doneCount}/{dayTasks.length} registradas
            </span>
          ) : null}
        </div>
        {dates.length > 1 ? (
          <div className="hub-clientes__btn-row hub-boarding-stay__days" role="tablist" aria-label="Dia da estadia">
            {dates.map((d) => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={d === day}
                className={`hub-clientes__btn hub-clientes__btn--sm ${d === day ? 'hub-clientes__btn--primary' : 'hub-clientes__btn--ghost'}`}
                onClick={() => setDay(d)}
              >
                {d === today ? 'Hoje' : formatDayMonth(d)}
              </button>
            ))}
          </div>
        ) : null}
        {!canExecute && stage === 'reserved' ? (
          <p className="hub-grooming-drawer__hint">As tarefas podem ser registradas depois do check-in.</p>
        ) : null}
        <BoardingTaskList
          tasks={dayTasks}
          canExecute={canExecute}
          busyTaskId={busyTaskId}
          onAction={(t, a) => void run(t, a)}
          onAttachPhoto={canDailyReport ? (t, file) => void attachTaskPhoto(t, file) : undefined}
          emptyLabel={
            tasks.length
              ? 'Nenhuma tarefa neste dia.'
              : 'Nenhuma tarefa ainda. Confirme o plano de cuidados para gerar a rotina.'
          }
        />

        {canDailyReport && active ? (
          taskFormOpen ? (
            <div className="hub-boarding-stay__form">
              <div className="hub-boarding-care__grid">
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="stay-task-kind">
                    Tipo
                  </label>
                  <HubSearchableCombobox
                    id="stay-task-kind"
                    options={(Object.keys(TASK_KIND_LABELS) as BoardingTaskKind[]).map((k) => ({
                      value: k,
                      label: TASK_KIND_LABELS[k],
                    }))}
                    value={taskKind}
                    placeholder="Tipo"
                    clearable={false}
                    onChange={(val) => setTaskKind((val || 'custom') as BoardingTaskKind)}
                  />
                </div>
                <HubTimeField id="stay-task-time" label="Horário (hoje)" valueHm={taskTime} onChangeHm={setTaskTime} minuteStep={5} />
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="stay-task-title">
                  Descrição
                </label>
                <input
                  id="stay-task-title"
                  className="hub-clientes__input"
                  value={taskTitle}
                  placeholder="Ex.: escovar o pelo, trocar a caminha"
                  onChange={(e) => setTaskTitle(e.target.value)}
                />
              </div>
              <div className="hub-clientes__panel-footer hub-boarding-stay__form-actions">
                <HubCancelButton onClick={() => setTaskFormOpen(false)} />
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                  disabled={taskBusy || !taskTitle.trim()}
                  onClick={() => void createTask()}
                >
                  {taskBusy ? 'Salvando…' : 'Adicionar tarefa'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="hub-clientes__link-btn hub-clientes__link-btn--with-icon hub-boarding-stay__add"
              onClick={() => setTaskFormOpen(true)}
            >
              <Plus size={14} aria-hidden />
              Tarefa avulsa
            </button>
          )
        ) : null}
      </section>

      <section className="hub-grooming-drawer__section">
        <div className="hub-grooming-drawer__heading-row">
          <h4 className="hub-grooming-drawer__heading">Intercorrências</h4>
          {incidents.some((i) => i.status === 'open') ? (
            <span className="hub-grooming-drawer__flag hub-grooming-drawer__flag--late">
              {incidents.filter((i) => i.status === 'open').length} em aberto
            </span>
          ) : null}
        </div>

        {sortedIncidents.length ? (
          <ul className="hub-grooming-drawer__timeline">
            {sortedIncidents.map((inc) => (
              <li key={inc.id} className="hub-grooming-drawer__timeline-item">
                <span
                  className={`hub-grooming-drawer__timeline-dot${inc.status === 'open' ? ' hub-boarding-stay__dot--open' : ' hub-boarding-stay__dot--resolved'}`}
                  aria-hidden
                />
                <div className="hub-boarding-stay__incident">
                  <p className="hub-grooming-drawer__timeline-title">
                    {INCIDENT_KIND_LABELS[inc.kind] ?? inc.kind}
                    <span className={`hub-grooming-drawer__stage hub-grooming-drawer__stage--${SEVERITY_VARIANT[inc.severity]}`}>
                      {SEVERITY_LABELS[inc.severity]}
                    </span>
                    {inc.status === 'resolved' ? (
                      <span className="hub-grooming-drawer__stage hub-grooming-drawer__stage--done">Resolvida</span>
                    ) : null}
                  </p>
                  <p className="hub-grooming-drawer__timeline-meta">
                    {formatDateTimeShort(inc.occurred_at)}
                    {inc.tutor_notified_at ? ' · Tutor avisado' : ' · Tutor ainda não avisado'}
                  </p>
                  <p className="hub-grooming-drawer__timeline-body">{inc.description}</p>
                  {inc.action_taken ? (
                    <p className="hub-grooming-drawer__timeline-body">
                      <strong>O que foi feito:</strong> {inc.action_taken}
                    </p>
                  ) : null}
                  {inc.resolution_notes ? (
                    <p className="hub-grooming-drawer__timeline-body">
                      <strong>Resolução:</strong> {inc.resolution_notes}
                    </p>
                  ) : null}
                  {canDailyReport && inc.status === 'open' ? (
                    resolvingId === inc.id ? (
                      <div className="hub-boarding-stay__form">
                        <textarea
                          className="hub-clientes__input"
                          rows={2}
                          value={resolutionNotes}
                          placeholder="Como foi resolvida?"
                          onChange={(e) => setResolutionNotes(e.target.value)}
                        />
                        <div className="hub-clientes__btn-row hub-boarding-stay__form-actions">
                          <HubCancelButton onClick={() => setResolvingId(null)} />
                          <button
                            type="button"
                            className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                            disabled={incBusy}
                            onClick={() =>
                              void patchIncident(inc, { status: 'resolved', resolution_notes: resolutionNotes.trim() || null })
                            }
                          >
                            Marcar como resolvida
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="hub-clientes__btn-row">
                        <button
                          type="button"
                          className="hub-clientes__link-btn"
                          disabled={incBusy}
                          onClick={() => {
                            setResolvingId(inc.id);
                            setResolutionNotes('');
                          }}
                        >
                          Resolver
                        </button>
                        {!inc.tutor_notified_at ? (
                          <button
                            type="button"
                            className="hub-clientes__link-btn"
                            disabled={incBusy}
                            onClick={() => void patchIncident(inc, { tutor_notified: true })}
                          >
                            Marcar tutor avisado
                          </button>
                        ) : null}
                      </div>
                    )
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hub-grooming-drawer__hint">Nenhuma intercorrência nesta estadia.</p>
        )}

        {canDailyReport && (active || stage === 'checked_out') ? (
          incFormOpen ? (
            <div className="hub-boarding-stay__form">
              <div className="hub-boarding-care__grid">
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="stay-inc-kind">
                    Tipo
                  </label>
                  <HubSearchableCombobox
                    id="stay-inc-kind"
                    options={(Object.keys(INCIDENT_KIND_LABELS) as BoardingIncidentKind[]).map((k) => ({
                      value: k,
                      label: INCIDENT_KIND_LABELS[k],
                    }))}
                    value={incKind}
                    placeholder="Tipo"
                    clearable={false}
                    onChange={(val) => setIncKind((val || 'other') as BoardingIncidentKind)}
                  />
                </div>
                <div className="hub-clientes__field">
                  <span className="hub-clientes__label">Gravidade</span>
                  <div className="hub-clientes__btn-row">
                    {(Object.keys(SEVERITY_LABELS) as BoardingSeverity[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={incSeverity === s}
                        className={`hub-clientes__btn hub-clientes__btn--sm ${incSeverity === s ? 'hub-clientes__btn--primary' : 'hub-clientes__btn--ghost'}`}
                        onClick={() => setIncSeverity(s)}
                      >
                        {SEVERITY_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="stay-inc-desc">
                  O que aconteceu
                </label>
                <textarea
                  id="stay-inc-desc"
                  className="hub-clientes__input"
                  rows={3}
                  value={incDescription}
                  onChange={(e) => setIncDescription(e.target.value)}
                />
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="stay-inc-action">
                  O que foi feito
                </label>
                <input
                  id="stay-inc-action"
                  className="hub-clientes__input"
                  value={incAction}
                  placeholder="Opcional"
                  onChange={(e) => setIncAction(e.target.value)}
                />
              </div>
              <HubCheckbox checked={incNotified} onChange={setIncNotified}>
                Tutor já foi avisado
              </HubCheckbox>
              <div className="hub-clientes__btn-row hub-boarding-stay__spaced">
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={(e) => setIncPhoto(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                  onClick={() => photoInputRef.current?.click()}
                >
                  <Camera size={14} aria-hidden />
                  {incPhoto ? 'Trocar foto' : 'Anexar foto'}
                </button>
                {incPhoto ? <span className="hub-grooming-drawer__muted">{incPhoto.name}</span> : null}
              </div>
              <div className="hub-clientes__panel-footer hub-boarding-stay__form-actions">
                <HubCancelButton onClick={resetIncidentForm} />
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                  disabled={incBusy || !incDescription.trim()}
                  onClick={() => void createIncident()}
                >
                  {incBusy ? 'Registrando…' : 'Registrar intercorrência'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="hub-clientes__link-btn hub-clientes__link-btn--with-icon hub-boarding-stay__add"
              onClick={() => setIncFormOpen(true)}
            >
              <Plus size={14} aria-hidden />
              Registrar intercorrência
            </button>
          )
        ) : null}
      </section>
    </>
  );
};

export default BoardingStayRoutineTab;
