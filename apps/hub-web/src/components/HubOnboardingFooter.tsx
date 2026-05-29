import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { HubCancelButton } from '@petimi/hub-ui';

type Props = {
  onCancel?: () => void;
  cancelLabel?: string;
  showBack?: boolean;
  onBack?: () => void;
  backLabel?: string;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
};

/** Rodapé de ações — mesmo padrão do wizard de pets (pet-wizard__footer). */
const HubOnboardingFooter: React.FC<Props> = ({
  onCancel,
  cancelLabel = 'Cancelar',
  showBack = false,
  onBack,
  backLabel = 'Anterior',
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  primaryLoading = false,
}) => {
  return (
    <footer className="pet-wizard__footer hub-onboarding__footer">
      {onCancel ? (
        <HubCancelButton onClick={onCancel}>{cancelLabel}</HubCancelButton>
      ) : (
        <span className="hub-onboarding__footer-spacer" aria-hidden />
      )}
      <div className="pet-wizard__footer-right">
        {showBack && onBack ? (
          <button type="button" className="pet-wizard__btn pet-wizard__btn--outline" onClick={onBack}>
            <ChevronLeft size={18} strokeWidth={2} aria-hidden />
            {backLabel}
          </button>
        ) : null}
        <button
          type="button"
          className="pet-wizard__btn pet-wizard__btn--primary"
          disabled={primaryDisabled || primaryLoading}
          onClick={onPrimary}
        >
          {primaryLoading ? 'A guardar…' : primaryLabel}
          {!primaryLoading ? <ChevronRight size={18} strokeWidth={2} aria-hidden /> : null}
        </button>
      </div>
    </footer>
  );
};

export default HubOnboardingFooter;
