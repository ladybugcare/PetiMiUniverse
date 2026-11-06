import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@petimi/web-core';
import HubLandingFooter from '../components/landing/HubLandingFooter';
import HubLandingHeader from '../components/landing/HubLandingHeader';
import { useLandingMeta } from '../components/landing/useLandingMeta';

const PAGE_TITLE = 'Planos — PetMi Hub';
const PAGE_DESCRIPTION =
  'Os planos do PetMi Hub mudam conforme o porte do negócio. Clínica, banho e tosa, hotel, creche e leva e traz entram em todos.';

const PLANS = [
  {
    name: 'Essencial',
    text: 'Uma unidade e equipe de até 5 pessoas.',
  },
  {
    name: 'Expansão',
    text: 'Até 3 unidades e 20 pessoas na equipe.',
  },
  {
    name: 'Rede',
    text: 'Várias unidades, sem limite de equipe.',
  },
] as const;

/**
 * Página pública de planos. Não exibe preços: no pré-lançamento os valores
 * ainda são tratados como previstos e a condição de fundador é apresentada
 * antes de qualquer cobrança.
 */
const HubPlansPage: React.FC = () => {
  const { user, loading } = useAuth();
  useLandingMeta({ title: PAGE_TITLE, description: PAGE_DESCRIPTION });

  if (loading) {
    return (
      <div className="hub-landing-root">
        <div className="hub-landing-loading" role="status">
          Carregando…
        </div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/hub/assinatura" replace />;
  }

  return (
    <div className="hub-landing-root">
      <div className="hub-landing-bg" aria-hidden />
      <HubLandingHeader />
      <main className="hub-landing-main">
        <section className="hub-landing-band hub-landing-band--hero" aria-labelledby="hub-plans-title">
          <div className="hub-landing-wrap hub-plans">
            <p className="hub-landing-badge">
              <span className="hub-landing-badge__dot" aria-hidden />
              Planos do PetMi Hub
            </p>
            <h1 id="hub-plans-title" className="hub-landing-hero__title">
              O mesmo sistema. O porte que cabe no seu negócio.
            </h1>
            <p className="hub-landing-hero__subtitle">
              Clínica, banho e tosa, hotel e creche e leva e traz entram em todos os planos. O que muda é o
              tamanho da operação: unidades e pessoas na equipe.
            </p>
            <ul className="hub-plans__grid">
              {PLANS.map((plan) => (
                <li key={plan.name} className="hub-plans__card">
                  <h2>{plan.name}</h2>
                  <p>{plan.text}</p>
                </li>
              ))}
            </ul>
            <p className="hub-plans__note">
              O PetMi Hub está em pré-lançamento. Quem cria a conta agora entra no Programa de Fundadores e
              conhece a condição comercial antes de qualquer cobrança.
            </p>
            <div className="hub-landing-hero__actions">
              <Link to="/signup" className="hub-landing-btn hub-landing-btn--primary">
                Criar minha conta
                <ArrowRight size={18} strokeWidth={2.25} aria-hidden />
              </Link>
              <Link to={{ pathname: '/', hash: 'fundadores' }} className="hub-landing-btn hub-landing-btn--outline">
                Ver o Programa de Fundadores
              </Link>
            </div>
          </div>
        </section>
      </main>
      <HubLandingFooter />
    </div>
  );
};

export default HubPlansPage;
