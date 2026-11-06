import React from 'react';
import { ArrowRight } from 'lucide-react';

const STEPS = [
  {
    title: 'Agenda',
    text: 'O compromisso entra na agenda da equipe.',
  },
  {
    title: 'Atendimento ou serviço',
    text: 'Consulta, banho, hospedagem ou outro serviço segue o fluxo do dia.',
  },
  {
    title: 'Comanda',
    text: 'O que foi feito vira comanda, pronta para cobrar no caixa.',
  },
  {
    title: 'Financeiro',
    text: 'O recebimento aparece nas contas e no fluxo de caixa.',
  },
] as const;

const HubLandingFlow: React.FC = () => {
  return (
    <div className="hub-landing-flow">
      <div className="hub-landing-section-intro">
        <h2 id="hub-landing-flow-title" className="hub-landing-section-title">
          Do primeiro agendamento ao controle financeiro. Tudo conectado.
        </h2>
        <p className="hub-landing-section-lead">
          O PetMi Hub liga a rotina do dia ao caixa. Não são módulos soltos: o serviço percorre o mesmo caminho.
        </p>
      </div>
      <ol className="hub-landing-flow__steps">
        {STEPS.map((step, index) => (
          <li key={step.title} className="hub-landing-flow__step">
            <article>
              <span className="hub-landing-flow__index" aria-hidden>
                {index + 1}
              </span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
            {index < STEPS.length - 1 ? (
              <span className="hub-landing-flow__arrow" aria-hidden>
                <ArrowRight size={18} strokeWidth={2} />
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
};

export default HubLandingFlow;
