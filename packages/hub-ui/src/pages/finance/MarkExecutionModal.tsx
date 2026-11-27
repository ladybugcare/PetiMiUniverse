import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { HubSidePanel } from '../../components/HubSidePanel';
import type { HubFinanceDayBoardItem } from '../../api/hubFinancialApi';
import { MarkExecutionForm, type MarkExecutionTarget } from './MarkExecutionForm';

export type { MarkExecutionTarget };

export type MarkExecutionModalProps = {
  open: boolean;
  item: MarkExecutionTarget | HubFinanceDayBoardItem | null;
  onClose: () => void;
  onDone: () => void;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
};

export const MarkExecutionModal: React.FC<MarkExecutionModalProps> = ({
  open,
  item,
  onClose,
  onDone,
  showError,
  showSuccess,
}) => {
  const target: MarkExecutionTarget | null = item
    ? {
        origin_type: item.origin_type,
        origin_id: item.origin_id,
        pet: item.pet,
        guardian: item.guardian,
      }
    : null;

  const subtitle = target
    ? [target.pet?.name, target.guardian?.full_name].filter(Boolean).join(' · ') || undefined
    : undefined;

  return (
    <HubSidePanel
      open={open && Boolean(target)}
      onClose={onClose}
      title="Marcar execução"
      titleIcon={<CheckCircle2 size={20} strokeWidth={1.75} aria-hidden />}
      subtitle={subtitle}
      contentKey={target ? `${target.origin_type}:${target.origin_id}` : 'closed'}
    >
      <MarkExecutionForm
        open={open && Boolean(target)}
        item={target}
        idPrefix="mark-execution-modal"
        keepOpenAfterSave={false}
        onCancel={onClose}
        onDone={() => {
          onDone();
          onClose();
        }}
        showError={showError}
        showSuccess={showSuccess}
      />
    </HubSidePanel>
  );
};

export default MarkExecutionModal;
