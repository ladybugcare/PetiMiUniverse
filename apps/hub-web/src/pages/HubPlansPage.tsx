import React, { useEffect } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ArrowRight, Network, User, Users } from 'lucide-react';
import { useAuth } from '@petimi/web-core';
import { signupLinkState } from '../utils/signupReturn';
import HubLandingFooter from '../components/landing/HubLandingFooter';
import HubLandingHeader from '../components/landing/HubLandingHeader';
import { useLandingMeta } from '../components/landing/useLandingMeta';

const PAGE_TITLE = 'Planos — PetMi Hub';
const PAGE_DESCRIPTION =
  'Os planos do PetMi Hub mudam conforme o porte do negócio. Clínica, banho e tosa, hotel, creche e leva e traz entram em todos.';

/**
 * Valores públicos previstos do catálogo de lançamento (migration 119),
 * os mesmos exibidos na tela de plano como referência — não são a condição de fundador.
 */
const PLANS = [
  {
    name: 'Essencial',
    icon: User,
    audience: 'Para quem está começando ou tem uma operação compacta.',
    units: '1 unidade',
    people: 'Até 5 pessoas na equipe',
    priceCents: 14900,
  },
  {
    name: 'Expansão',
    icon: Users,
    audience: 'Para empresas com equipes maiores ou mais unidades.',
    units: 'Até 3 unidades',
    people: 'Até 20 pessoas na equipe',
    priceCents: 29700,
    emphasis: true,
  },
  {
    name: 'Rede',
    icon: Network,
    audience: 'Para operações com múltiplas unidades e equipes amplas.',
    units: 'Várias unidades',
    people: 'Sem limite de equipe',
    priceCents: 49700,
  },
] as const;

const STEPS = [
  {
    title: 'Crie sua conta',
    text: 'Cadastre-se e confirme o e-mail para entrar.',
  },
  {
    title: 'Conheça suas condições',
    text: 'Ao configurar a organização, você aceita o Programa de Fundadores. Não há cobrança nessa etapa.',
  },
  {
    title: 'Comece sua jornada',
    text: 'Com a organização pronta, o acesso fica liberado até o lançamento. A proposta chega antes de qualquer cobrança.',
  },
] as const;

function formatLaunchPrice(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

const HubPlansPage: React.FC = () => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { hash } = location;
  useLandingMeta({ title: PAGE_TITLE, description: PAGE_DESCRIPTION });

  useEffect(() => {
    const id = hash.replace('#', '');
    if (!id) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scroll = () => {
      document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    };
    scroll();
    const early = window.setTimeout(scroll, 80);
    const late = window.setTimeout(scroll, 400);
    return () => {
      window.clearTimeout(early);
      window.clearTimeout(late);
    };
  }, [hash]);

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
              Clínica, banho e tosa, hotel e creche e leva e traz entram em todos os planos. O que muda é a
              capacidade: unidades e pessoas na equipe.
            </p>

            <ul className="hub-plans__grid">
              {PLANS.map((plan) => {
                const Icon = plan.icon;
                return (
                  <li
                    key={plan.name}
                    className={
                      'emphasis' in plan && plan.emphasis
                        ? 'hub-plans__card hub-plans__card--emphasis'
                        : 'hub-plans__card'
                    }
                  >
                    <span className="hub-plans__icon" aria-hidden>
                      <Icon size={18} strokeWidth={2} />
                    </span>
                    <h2>{plan.name}</h2>
                    <p className="hub-plans__audience">{plan.audience}</p>
                    <ul className="hub-plans__limits">
                      <li>{plan.units}</li>
                      <li>{plan.people}</li>
                    </ul>
                    <p className="hub-plans__price">
                      <span>Valor público previsto</span>
                      {formatLaunchPrice(plan.priceCents)}
                      <span>/mês</span>
                    </p>
                  </li>
                );
              })}
            </ul>

            <div id="condicoes" className="hub-plans__conditions">
              <h2>Condições especiais para quem chega primeiro.</h2>
              <p>
                Os primeiros participantes poderão conhecer uma proposta comercial diferenciada antes de
                contratar. Os valores acima são a referência pública prevista para o lançamento, não a condição
                de fundador.
              </p>
            </div>

            <section className="hub-plans-start" aria-labelledby="hub-plans-start-title">
              <h2 id="hub-plans-start-title">Como começar com o PetMi Hub?</h2>
              <ol className="hub-plans-start__steps">
                {STEPS.map((step, index) => (
                  <li key={step.title}>
                    <span aria-hidden>{String(index + 1).padStart(2, '0')}</span>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </li>
                ))}
              </ol>
            </section>

            <ul className="hub-plans__facts">
              <li>O cadastro não pede cartão e não gera cobrança.</li>
              <li>A participação no programa é confirmada ao configurar a organização.</li>
              <li>O plano pago só é escolhido depois, se fizer sentido para a operação.</li>
            </ul>

            <div className="hub-landing-hero__actions">
              <Link to="/signup" state={signupLinkState(location)} className="hub-landing-btn hub-landing-btn--primary">
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
