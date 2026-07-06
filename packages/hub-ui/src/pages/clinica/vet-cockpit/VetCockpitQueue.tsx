import React from 'react';
import type { DayBoardItem } from '../../../api/hubClinicalApi';
import {
  formatQueueTime,
  isItemEmergency,
  isItemLate,
  itemKey,
  itemOperationalStatus,
  itemStartsAt,
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

          return (
            <li key={key}>
              <button
                type="button"
                className={`vet-cockpit-queue__item${selected ? ' vet-cockpit-queue__item--selected' : ''}${isItemLate(item) ? ' vet-cockpit-queue__item--late' : ''}`}
                onClick={() => onSelect(item)}
              >
                <div className="vet-cockpit-queue__time">{time}</div>
                <div className="vet-cockpit-queue__body">
                  <div className="vet-cockpit-queue__row">
                    <span className="vet-cockpit-queue__pet">{petName}</span>
                    <span className={`vet-cockpit-queue__pill ${statusPillClass(st)}`}>
                      {VET_QUEUE_STATUS_LABEL[st] || st}
                    </span>
                  </div>
                  <p className="vet-cockpit-queue__service">{svc}</p>
                  <div className="vet-cockpit-queue__badges">
                    {isItemEmergency(item) ? (
                      <span className="vet-cockpit-badge vet-cockpit-badge--emergency" title="Emergência">
                        🚨
                      </span>
                    ) : null}
                    {isItemLate(item) ? (
                      <span className="vet-cockpit-badge vet-cockpit-badge--late" title="Atrasado">
                        🔴
                      </span>
                    ) : null}
                    {hints?.examsAvailable ? (
                      <span className="vet-cockpit-badge" title="Exames disponíveis">
                        🧪
                      </span>
                    ) : null}
                    {hints?.rxDraft ? (
                      <span className="vet-cockpit-badge" title="Prescrição pendente">
                        💊
                      </span>
                    ) : null}
                    {hints?.hospitalized ? (
                      <span className="vet-cockpit-badge" title="Internado">
                        🏥
                      </span>
                    ) : null}
                  </div>
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
