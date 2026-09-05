import React from 'react';
import { AlertCircle, BedDouble, Clock, FlaskConical, Pill } from 'lucide-react';
import { HubRefreshingBanner } from '../../../components/HubLoading';
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
  refreshing?: boolean;
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

const VetCockpitQueue: React.FC<Props> = ({ items, selectedKey, onSelect, loading, refreshing, badgeHints }) => {
  return (
    <div className="vet-cockpit-queue hub-loading-host">
      <h2 className="vet-cockpit-queue__title">
        Minha fila
        {items.length > 0 ? (
          <span className="vet-cockpit-queue__count">{items.length}</span>
        ) : null}
      </h2>
      <HubRefreshingBanner show={Boolean(refreshing)} label="Atualizando fila…" />
      {loading && items.length === 0 ? (
        <p className="hub-clientes__muted">Carregando fila…</p>
      ) : items.length === 0 ? (
        <p className="hub-clientes__muted">Nenhum atendimento na fila neste dia.</p>
      ) : (
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
            const emergency = isItemEmergency(item);
            const tags = queueItemTags(item, hints);

            return (
              <li key={key}>
                <button
                  type="button"
                  className={[
                    'vet-cockpit-queue__item',
                    selected ? 'vet-cockpit-queue__item--selected' : '',
                    emergency ? 'vet-cockpit-queue__item--emergency' : late ? 'vet-cockpit-queue__item--late' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onSelect(item)}
                  aria-current={selected ? 'true' : undefined}
                >
                  <div className="vet-cockpit-queue__meta">
                    <span className="vet-cockpit-queue__time">
                      <Clock size={13} strokeWidth={2} aria-hidden className="vet-cockpit-queue__time-icon" />
                      {time}
                    </span>
                    <span className="vet-cockpit-queue__service">{svc}</span>
                  </div>
                  <div className="vet-cockpit-queue__identity">
                    <div className="vet-cockpit-queue__avatar" aria-hidden>
                      {petInitials(petName)}
                    </div>
                    <div className="vet-cockpit-queue__identity-text">
                      <span className="vet-cockpit-queue__pet">{petName}</span>
                      <span className={`vet-cockpit-queue__pill ${statusPillClass(st)}`}>
                        {VET_QUEUE_STATUS_LABEL[st] || st}
                      </span>
                    </div>
                  </div>
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
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default VetCockpitQueue;
