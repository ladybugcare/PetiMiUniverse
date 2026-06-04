import React from 'react';
import type { DayBoardItem } from '../../api/hubClinicalApi';

type Props = {
  items: DayBoardItem[];
};

function countByStatus(items: DayBoardItem[], statuses: string[]): number {
  return items.filter((i) => {
    const st = (i.status as string) || i.appointment_status || 'waiting';
    return statuses.includes(st);
  }).length;
}

const ClinicDayMetrics: React.FC<Props> = ({ items }) => {
  const waiting = countByStatus(items, ['waiting', 'confirmed', 'pending_confirm']);
  const inProgress = countByStatus(items, ['in_progress']);
  const done = countByStatus(items, ['completed', 'done']);
  const encaixesNaAgenda = items.filter((i) => {
    if (i.kind !== 'encounter') return false;
    const k = (i as { appointment?: { appointment_kind?: string } }).appointment?.appointment_kind;
    if (k === 'clinical_walk_in' || k === 'clinical_emergency') return true;
    return !i.appointment_id;
  }).length;

  const cards = [
    { label: 'Aguardando', value: waiting },
    { label: 'Em atendimento', value: inProgress },
    { label: 'Finalizados', value: done },
    { label: 'Encaixe na agenda', value: encaixesNaAgenda },
  ];

  return (
    <div className="hub-clientes__metrics hub-clinic-metrics">
      {cards.map((c) => (
        <div key={c.label} className="hub-clientes__metric-card">
          <span className="hub-clientes__metric-value">{c.value}</span>
          <span className="hub-clientes__metric-label">{c.label}</span>
        </div>
      ))}
    </div>
  );
};

export default ClinicDayMetrics;
