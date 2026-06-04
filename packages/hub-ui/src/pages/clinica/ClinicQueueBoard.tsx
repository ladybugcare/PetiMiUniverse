import React from 'react';
import { Link } from 'react-router-dom';
import type { DayBoardItem } from '../../api/hubClinicalApi';
import { petAgeDetailedLabel } from '../pets/petAge';

const STATUS_LABEL: Record<string, string> = {
  waiting: 'Aguardando',
  checked_in: 'Aguardando',
  in_progress: 'Em atendimento',
  completed: 'Finalizado',
  cancelled: 'Cancelado',
  confirmed: 'Confirmado',
  pending_confirm: 'A confirmar',
  done: 'Finalizado',
};

function formatTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function pillClass(status?: string): string {
  if (status === 'in_progress') return 'hub-clientes__pill hub-clinic-queue__pill--progress';
  if (status === 'completed' || status === 'done') return 'hub-clientes__pill hub-clinic-queue__pill--done';
  return 'hub-clientes__pill hub-clinic-queue__pill--waiting';
}

type Column = { id: string; title: string; statuses: string[] };

const COLUMNS: Column[] = [
  { id: 'waiting', title: 'Aguardando', statuses: ['waiting', 'checked_in', 'confirmed', 'pending_confirm'] },
  { id: 'progress', title: 'Em atendimento', statuses: ['in_progress'] },
  { id: 'done', title: 'Finalizados', statuses: ['completed', 'done'] },
];

type Props = {
  items: DayBoardItem[];
  canWrite: boolean;
  onOpen: (item: DayBoardItem) => void;
  searchQ: string;
};

const ClinicQueueBoard: React.FC<Props> = ({ items, canWrite, onOpen, searchQ }) => {
  const q = searchQ.trim().toLowerCase();
  const filtered = q
    ? items.filter((i) => {
        const pet = (i.pet?.name || '').toLowerCase();
        const tutor = (i.guardian?.full_name || '').toLowerCase();
        return pet.includes(q) || tutor.includes(q);
      })
    : items;

  return (
    <div className="hub-clinic-queue">
      {COLUMNS.map((col) => {
        const colItems = filtered.filter((i) => {
          const st = (i.status as string) || i.appointment_status || 'waiting';
          return col.statuses.includes(st);
        });
        return (
          <section key={col.id} className="hub-clinic-queue__col">
            <h3 className="hub-clinic-queue__col-title">
              {col.title} <span className="hub-clinic-queue__count">{colItems.length}</span>
            </h3>
            <div className="hub-clinic-queue__cards">
              {colItems.length === 0 ? (
                <p className="hub-clientes__muted hub-clinic-queue__empty">Nenhum nesta coluna.</p>
              ) : (
                colItems.map((item) => {
                  const isUnidentified = item.kind === 'appointment_slot' && !item.pet_id;
                  const petName = item.pet?.name || (isUnidentified ? 'A identificar' : 'Sem pet');
                  const tutor = item.guardian?.full_name || (isUnidentified ? 'A identificar' : '—');
                  const prof = item.staff_member?.full_name || 'Sem profissional';
                  const svc = item.service_type?.name || item.title || 'Consulta';
                  const st = (item.status as string) || item.appointment_status || 'waiting';
                  const time = formatTime(
                    item.starts_at || item.started_at || (item.appointment as { starts_at?: string })?.starts_at,
                  );
                  // Para appointment_slot o kind vem no campo direto; para encounter vem aninhado em appointment
                  const apptKind =
                    item.appointment_kind ??
                    (item as { appointment?: { appointment_kind?: string } }).appointment?.appointment_kind;
                  const isClinicalEncaixe = apptKind === 'clinical_walk_in' || apptKind === 'clinical_emergency';
                  const key = item.encounter_id || item.appointment_id || `${petName}-${time}`;
                  const apptId = item.appointment_id;

                  return (
                    <article key={key} className="hub-clinic-queue__card">
                      <div className="hub-clinic-queue__card-top">
                        <p className="hub-clinic-queue__pet">{petName}</p>
                        <span className={pillClass(st)}>{STATUS_LABEL[st] || st}</span>
                      </div>
                      {isClinicalEncaixe ? (
                        <p className="hub-clientes__pill hub-clinic-queue__pill--encaixe" style={{ marginTop: 6, marginBottom: 0 }}>
                          {apptKind === 'clinical_emergency' ? 'Urgência' : 'Encaixe clínico'}
                        </p>
                      ) : null}
                      {isUnidentified && !isClinicalEncaixe ? (
                        <p className="hub-clientes__pill hub-clinic-queue__pill--encaixe" style={{ marginTop: 6, marginBottom: 0 }}>
                          Urgência
                        </p>
                      ) : null}
                      <p className="hub-clientes__muted hub-clinic-queue__meta">{svc}</p>
                      {item.notes || item.chief_complaint ? (
                        <p className="hub-clientes__muted hub-clinic-queue__meta" style={{ fontStyle: 'italic' }}>
                          {item.notes || item.chief_complaint}
                        </p>
                      ) : null}
                      <p className="hub-clientes__muted hub-clinic-queue__meta">
                        {time} · {tutor}
                      </p>
                      <p className="hub-clientes__muted hub-clinic-queue__meta">Profissional: {prof}</p>
                      {item.pet?.birth_date ? (
                        <p className="hub-clientes__muted hub-clinic-queue__meta">
                          Idade: {petAgeDetailedLabel(item.pet.birth_date)}
                        </p>
                      ) : null}
                      <div className="hub-clinic-queue__actions">
                        {canWrite ? (
                          <button
                            type="button"
                            className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                            onClick={() => onOpen(item)}
                          >
                            {item.kind === 'encounter' ? 'Continuar' : 'Atender'}
                          </button>
                        ) : null}
                        {apptId ? (
                          <Link
                            to="/hub/appointments"
                            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                          >
                            Agenda
                          </Link>
                        ) : null}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default ClinicQueueBoard;
