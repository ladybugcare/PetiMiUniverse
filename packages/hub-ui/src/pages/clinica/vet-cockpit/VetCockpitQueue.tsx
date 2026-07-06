import React from 'react';
import { AlertCircle, BedDouble, Clock, FlaskConical, Pill } from 'lucide-react';
import type { DayBoardItem } from '../../../api/hubClinicalApi';
import {
  formatQueueTime,
  isItemEmergency,
  isItemLate,
  itemKey,
  itemOperationalStatus,
  itemStartsAt,
  petInitials,
  VET_QUEUE_STATUS_LABEL,
} from './vetCockpitUtils';

type Props = {
  items: DayBoardItem[];
  selectedKey: string | null;
  onSelect: (item: DayBoardItem) => void;
  loading?: boolean;
  badgeHints?: Record<string, { examsAvailable?: boolean; rxDraft?: boolean; hospitalized?: boolean }>;
};

function statusPillClass(status: string): string {
  if (status === 'in_progress') return 'vet-cockpit-queue__pill--progress';
  if (status === 'awaiting_exams') return 'vet-cockpit-queue__pill--exams';
  if (status === 'exams_returned') return 'vet-cockpit-queue__pill--returned';
  if (status === 'completed' || status === 'done') return 'vet-cockpit-queue__pill--done';
  if (status === 'checked_in') return 'vet-cockpit-queue__pill--checked';
  return 'vet-cockpit-queue__pill--waiting';
}

function queueItemTags(
  item: DayBoardItem,
  hints?: { examsAvailable?: boolean; rxDraft?: boolean; hospitalized?: boolean },
): Array<{ key: string; label: string; className: string }> {
  const tags: Array<{ key: string; label: string; className: string }> = [];
  if (isItemEmergency(item)) {
    tags.push({ key: 'emergency', label: 'Emergência', className: 'vet-cockpit-queue__tag--emergency' });
  }
  if (isItemLate(item)) {
    tags.push({ key: 'late', label: 'Atrasado', className: 'vet-cockpit-queue__tag--late' });
  }
  if (hints?.examsAvailable) {
    tags.push({ key: 'exams', label: 'Exames prontos', className: 'vet-cockpit-queue__tag--info' });
  }
  if (hints?.rxDraft) {
    tags.push({ key: 'rx', label: 'Prescrição rascunho', className: 'vet-cockpit-queue__tag--info' });
  }
  if (hints?.hospitalized) {
    tags.push({ key: 'hospital', label: 'Internado', className: 'vet-cockpit-queue__tag--info' });
  }
  return tags;
}

const VetCockpitQueue: React.FC<Props> = ({ items, selectedKey, onSelect, loading, badgeHints }) => {
  if (loading) {
    return (
      <div className="vet-cockpit-queue">
        <p className="hub-clientes__muted">Carregando fila…</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="vet-cockpit-queue">
        <p className="hub-clientes__muted">Nenhum atendimento na sua fila hoje.</p>
      </div>
    );
  }

  return (
    <div className="vet-cockpit-queue">
      <h2 className="vet-cockpit-queue__title">Minha fila</h2>
      <ul className="vet-cockpit-queue__list">
        {items.map((item) => {
          const key = itemKey(item);
          const st = itemOperationalStatus(item);
          const petName = item.pet?.name || 'Sem pet';
          const svc = item.service_type?.name || item.title || 'Consulta';
          const time = formatQueueTime(itemStartsAt(item));
          const hints = badgeHints?.[item.pet_id || key];
          const selected = selectedKey === key;
          const late = isItemLate(item);
          const tags = queueItemTags(item, hints);

          return (
            <li key={key}>
              <button
                type="button"
                className={[
                  'vet-cockpit-queue__item',
                  selected ? 'vet-cockpit-queue__item--selected' : '',
                  late ? 'vet-cockpit-queue__item--late' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onSelect(item)}
                aria-current={selected ? 'true' : undefined}
              >
                <div className="vet-cockpit-queue__time-col">
                  <Clock size={14} strokeWidth={2} aria-hidden className="vet-cockpit-queue__time-icon" />
                  <span className="vet-cockpit-queue__time">{time}</span>
                </div>
                <div className="vet-cockpit-queue__avatar" aria-hidden>
                  {petInitials(petName)}
                </div>
                <div className="vet-cockpit-queue__body">
                  <div className="vet-cockpit-queue__row">
                    <span className="vet-cockpit-queue__pet">{petName}</span>
                    <span className={`vet-cockpit-queue__pill ${statusPillClass(st)}`}>
                      {VET_QUEUE_STATUS_LABEL[st] || st}
                    </span>
                  </div>
                  <p className="vet-cockpit-queue__service">{svc}</p>
                  {tags.length > 0 ? (
                    <div className="vet-cockpit-queue__tags" aria-label="Indicadores">
                      {tags.map((tag) => (
                        <span key={tag.key} className={`vet-cockpit-queue__tag ${tag.className}`}>
                          {tag.key === 'emergency' ? <AlertCircle size={12} aria-hidden /> : null}
                          {tag.key === 'late' ? <Clock size={12} aria-hidden /> : null}
                          {tag.key === 'exams' ? <FlaskConical size={12} aria-hidden /> : null}
                          {tag.key === 'rx' ? <Pill size={12} aria-hidden /> : null}
                          {tag.key === 'hospital' ? <BedDouble size={12} aria-hidden /> : null}
                          {tag.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default VetCockpitQueue;
