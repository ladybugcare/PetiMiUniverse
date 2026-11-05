import React from 'react';
import { HubCheckbox } from '@petimi/hub-ui';

type Props = {
  termsAccepted: boolean;
  onTermsChange: (accepted: boolean) => void;
};

/** Única opção do cadastro enquanto o Hub não foi lançado. */
const HubBetaPlanCard: React.FC<Props> = ({ termsAccepted, onTermsChange }) => {
  return (
    <div className="hub-onboarding-founder">
      <section className="hub-assinatura__founder" aria-current="true">
        <p className="hub-assinatura__founder-seal">
          Programa Fundador ativo · condições especiais no lançamento
        </p>
        <article className="hub-assinatura__beta">
          <div className="hub-assinatura__beta-status">
            <span className="hub-assinatura__beta-kicker">Parceiro fundador</span>
            <h2 className="hub-assinatura__beta-title">Você faz parte do Programa Fundador</h2>
            <p className="hub-assinatura__beta-lead">
              Acesso completo e gratuito até o lançamento oficial.
            </p>
          </div>
          <div className="hub-assinatura__beta-benefit">
            <p className="hub-assinatura__beta-copy">
              Por entrar antes da abertura do PetMi Hub, você terá uma condição especial de
              lançamento, com valor diferenciado em relação aos planos públicos.
            </p>
            <p className="hub-assinatura__beta-copy">
              Antes de qualquer cobrança, enviaremos sua proposta com antecedência. Você poderá
              escolher seu plano e só seguirá se fizer sentido para sua operação.
            </p>
          </div>
        </article>
      </section>
      <HubCheckbox
        className="hub-onboarding-toggle-row hub-onboarding-field--full"
        checked={termsAccepted}
        onChange={onTermsChange}
      >
        Li e aceito participar do Programa Fundador do PetMi Hub
      </HubCheckbox>
    </div>
  );
};

export default HubBetaPlanCard;
