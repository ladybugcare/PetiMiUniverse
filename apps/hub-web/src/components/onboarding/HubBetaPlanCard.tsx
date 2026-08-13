import React from 'react';
import { Sparkles } from 'lucide-react';
import { HubCheckbox } from '@petimi/hub-ui';

type Props = {
  termsAccepted: boolean;
  onTermsChange: (accepted: boolean) => void;
};

/** Card único do Programa Beta no onboarding (pré-MVP). */
const HubBetaPlanCard: React.FC<Props> = ({ termsAccepted, onTermsChange }) => {
  return (
    <div className="hub-beta-plan-card">
      <div className="hub-onboarding-section-head">
        <div className="hub-onboarding-section-icon hub-beta-plan-card__icon">
          <Sparkles size={22} />
        </div>
        <div>
          <h2 className="hub-clientes__title" style={{ fontSize: 18, margin: 0 }}>
            Programa Beta
          </h2>
          <p className="hub-clientes__subtitle" style={{ margin: '4px 0 0' }}>
            Única opção disponível neste momento
          </p>
        </div>
      </div>

      <ul className="hub-beta-plan-card__perks">
        <li>Acesso completo a todos os módulos do Hub</li>
        <li>Grátis durante o pré-MVP — sem cartão de crédito</li>
        <li>Clínica, Banho &amp; Tosa, Hotel &amp; Creche e operação core inclusos</li>
      </ul>

      <p className="hub-beta-plan-card__note">
        Depois do lançamento comercial, você poderá escolher plano base e módulos. Até lá, o
        Programa Beta libera tudo.
      </p>

      <HubCheckbox
        className="hub-onboarding-toggle-row hub-onboarding-field--full"
        checked={termsAccepted}
        onChange={onTermsChange}
      >
        Li e aceito participar do Programa Beta do PetMi Hub
      </HubCheckbox>
    </div>
  );
};

export default HubBetaPlanCard;
