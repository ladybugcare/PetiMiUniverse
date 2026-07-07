import React from 'react';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

export type BlockCardHeaderProps = {
  blockNumber: number;
  title: string;
  expanded: boolean;
  onToggle: () => void;
  onRemove?: () => void;
};

export const BlockCardHeader: React.FC<BlockCardHeaderProps> = ({
  blockNumber,
  title,
  expanded,
  onToggle,
  onRemove,
}) => (
  <div className={`nam-block-card__header-row${expanded ? '' : ' nam-block-card__header-row--collapsed'}`}>
    <button type="button" className="nam-block-card__header" onClick={onToggle}>
      <span className="nam-block-card__header-left">
        <span className="nam-block-card__badge" aria-hidden>
          {blockNumber}
        </span>
        <span className="nam-block-card__title">{title}</span>
      </span>
      <span className="nam-block-card__toggle">
        {expanded ? 'Recolher' : 'Expandir'}
        {expanded ? <ChevronUp size={16} strokeWidth={2.5} /> : <ChevronDown size={16} strokeWidth={2.5} />}
      </span>
    </button>
    {onRemove ? (
      <button
        type="button"
        className="nam-block-card__remove"
        onClick={onRemove}
        aria-label="Remover bloco"
      >
        <Trash2 size={14} />
      </button>
    ) : null}
  </div>
);
