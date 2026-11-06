import React, { useEffect } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Headphones,
  Link2,
  ListChecks,
  PieChart,
  Users,
  Workflow,
} from 'lucide-react';
import { useAuth } from '@petimi/web-core';
import HubLandingFlow from '../components/landing/HubLandingFlow';
import HubLandingFooter from '../components/landing/HubLandingFooter';
import HubLandingHeader from '../components/landing/HubLandingHeader';
import HubLandingModules from '../components/landing/HubLandingModules';
import HubProductMockup from '../components/landing/HubProductMockup';
import { useLandingMeta } from '../components/landing/useLandingMeta';

const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const landingPetSrc = `${baseUrl}freelancer.png`;

const PAGE_TITLE = 'PetMi Hub — Toda a operação do negócio pet em um só lugar';
const PAGE_DESCRIPTION =
  'Da recepção ao atendimento, da rotina dos pets ao controle financeiro. Organize seu negócio, conecte a equipe e simplifique o dia a dia com o PetMi Hub.';

const BENEFITS = [
  {
    icon: Link2,
    title: 'Tudo conectado',
    hint: 'Da agenda ao financeiro, sem informações espalhadas.',
  },
  {
    icon: ListChecks,
    title: 'Menos trabalho manual',
    hint: 'Fluxos pensados para simplificar a rotina da equipe.',
  },
  {
    icon: Users,
    title: 'Sua equipe organizada',
    hint: 'Cada profissional com acesso ao que precisa.',
  },
] as const;

const PILLARS = [
  {
    icon: Headphones,
    name: 'Recepção',
    lead: 'Quem recebe o tutor organiza a chegada, a agenda e o cadastro.',
    items: ['Confirma horários e recebe o pet', 'Atualiza clientes e pets na hora', 'Vê quem está chegando no dia'],
  },
  {
    icon: Workflow,
    name: 'Operação',
    lead: 'Quem cuida do pet acompanha o fluxo do próprio serviço.',
    items: [
      'Veterinários no consultório e no prontuário',
      'Equipe de banho e tosa na fila do salão',
      'Hotel e creche na rotina da estadia',
    ],
  },
  {
    icon: PieChart,
    name: 'Gestão',
    lead: 'Quem conduz o negócio acompanha equipe, caixa e o dia.',
    items: ['Comandas, receitas e despesas', 'Convites e permissões da equipe', 'Relatórios da operação'],
  },
] as const;

const HubHomePage: React.FC = () => {
  const { user, loading } = useAuth();
  const { hash } = useLocation();
  useLandingMeta({ title: PAGE_TITLE, description: PAGE_DESCRIPTION });

  useEffect(() => {
    const id = hash.replace('#', '');
    if (!id) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scroll = () => {
      const target = document.getElementById(id);
      if (!target) return;
      target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    };
    scroll();
    // O router reposiciona a página depois da navegação entre rotas.
    const timer = window.setTimeout(scroll, 80);
    return () => window.clearTimeout(timer);
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
    return <Navigate to="/hub/clientes" replace />;
  }

  return (
    <div className="hub-landing-root">
      <div className="hub-landing-bg" aria-hidden />
      <HubLandingHeader />

      <main className="hub-landing-main">
        <section className="hub-landing-band hub-landing-band--hero" aria-labelledby="hub-landing-hero-title">
          <div className="hub-landing-wrap">
            <div className="hub-landing-hero">
              <div className="hub-landing-hero__copy">
                <p className="hub-landing-badge">
                  <span className="hub-landing-badge__dot" aria-hidden />
                  PetMi Hub · Operação do negócio pet
                </p>
                <h1 id="hub-landing-hero-title" className="hub-landing-hero__title">
                  Toda a operação do seu negócio pet.{' '}
                  <span className="hub-landing-hero__title-accent">Em um só lugar.</span>
                </h1>
                <p className="hub-landing-hero__subtitle">
                  Da recepção ao atendimento, da rotina dos pets ao controle financeiro. Organize seu negócio,
                  conecte sua equipe e simplifique o dia a dia com o PetMi Hub.
                </p>
                <div className="hub-landing-hero__actions">
                  <Link to="/signup" className="hub-landing-btn hub-landing-btn--primary">
                    Criar minha conta
                    <ArrowRight size={18} strokeWidth={2.25} aria-hidden />
                  </Link>
                  <Link to="/planos" className="hub-landing-btn hub-landing-btn--outline">
                    Conhecer os planos
                  </Link>
                </div>
                <ul className="hub-landing-trust" aria-label="Destaques do produto">
                  {BENEFITS.map(({ icon: Icon, title, hint }) => (
                    <li key={title} className="hub-landing-trust__item">
                      <span className="hub-landing-trust__icon" aria-hidden>
                        <Icon size={18} strokeWidth={2} />
                      </span>
                      <span className="hub-landing-trust__meta">
                        <span className="hub-landing-trust__title">{title}</span>
                        <span className="hub-landing-trust__hint">{hint}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="hub-landing-hero__visual">
                <HubProductMockup />
              </div>
            </div>
          </div>
        </section>

        <section className="hub-landing-band hub-landing-band--sand" aria-labelledby="hub-landing-pillars-title">
          <div className="hub-landing-wrap">
            <div className="hub-landing-pillars">
              <div className="hub-landing-pillars__intro">
                <h2 id="hub-landing-pillars-title" className="hub-landing-pillars__title">
                  Feito para quem faz o negócio acontecer
                </h2>
                <p className="hub-landing-pillars__lead">
                  Recepção, operação e gestão usam a mesma base — cada pessoa no trecho da rotina que é dela.
                </p>
              </div>
              <div className="hub-landing-pillars__row">
                {PILLARS.map(({ icon: Icon, name, lead, items }) => (
                  <div key={name} className="hub-landing-pillar">
                    <span className="hub-landing-pillar__icon-wrap" aria-hidden>
                      <Icon size={22} strokeWidth={2} />
                    </span>
                    <h3 className="hub-landing-pillar__name">{name}</h3>
                    <p className="hub-landing-pillar__lead">{lead}</p>
                    <ul className="hub-landing-pillar__list">
                      {items.map((line) => (
                        <li key={line} className="hub-landing-pillar__list-item">
                          <CheckCircle2
                            size={15}
                            strokeWidth={2.25}
                            className="hub-landing-pillar__check"
                            aria-hidden
                          />
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section
          id="funcionalidades"
          className="hub-landing-band"
          aria-labelledby="hub-landing-features-title"
        >
          <div className="hub-landing-wrap">
            <HubLandingModules />
          </div>
        </section>

        <section className="hub-landing-band hub-landing-band--sand" aria-labelledby="hub-landing-flow-title">
          <div className="hub-landing-wrap">
            <HubLandingFlow />
          </div>
        </section>

        <section id="fundadores" className="hub-landing-band" aria-labelledby="hub-landing-founders-title">
          <div className="hub-landing-wrap">
            <div className="hub-landing-founders">
              <p className="hub-landing-founders__seal">Programa de Fundadores</p>
              <h2 id="hub-landing-founders-title" className="hub-landing-founders__title">
                Seu negócio pode crescer junto com o PetMi Hub.
              </h2>
              <p className="hub-landing-founders__text">
                Estamos preparando o lançamento do PetMi Hub e queremos nossos primeiros profissionais e
                estabelecimentos ao nosso lado.
              </p>
              <p className="hub-landing-founders__text">
                Conheça nossos planos e descubra as condições especiais reservadas para quem começar essa jornada
                com a gente.
              </p>
              <Link to="/planos" className="hub-landing-btn hub-landing-btn--primary">
                Conhecer planos e benefícios
                <ArrowRight size={18} strokeWidth={2.25} aria-hidden />
              </Link>
            </div>
          </div>
        </section>

        <section className="hub-landing-band hub-landing-band--cta" aria-labelledby="hub-landing-cta-title">
          <div className="hub-landing-wrap">
            <div className="hub-landing-cta">
              <div className="hub-landing-cta__panel">
                <div className="hub-landing-cta__split">
                  <div className="hub-landing-cta__visual">
                    <img
                      src={landingPetSrc}
                      alt="Golden retriever, mascote visual do PetMi Hub"
                      className="hub-landing-cta__pet"
                      width={1600}
                      height={1200}
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="hub-landing-cta__visual-blob" aria-hidden />
                  </div>
                  <div className="hub-landing-cta__copy">
                    <h2 id="hub-landing-cta-title" className="hub-landing-cta__title">
                      Pronto para simplificar a rotina do seu negócio pet?
                    </h2>
                    <p className="hub-landing-cta__text">
                      Comece a organizar sua operação com uma plataforma feita para quem vive o dia a dia do
                      mercado pet.
                    </p>
                    <div className="hub-landing-cta__actions">
                      <Link to="/signup" className="hub-landing-btn hub-landing-btn--primary hub-landing-btn--lg">
                        Criar minha conta
                        <ArrowRight size={18} strokeWidth={2.25} aria-hidden />
                      </Link>
                      <Link to="/planos" className="hub-landing-btn hub-landing-btn--outline hub-landing-btn--lg">
                        Conhecer os planos
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <HubLandingFooter />
    </div>
  );
};

export default HubHomePage;
