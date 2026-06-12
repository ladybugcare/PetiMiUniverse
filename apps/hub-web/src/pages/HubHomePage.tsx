import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  ArrowRight,
  Calendar,
  Users,
  Stethoscope,
  Wallet,
  FileText,
  Package,
  UserCog,
  Sparkles,
  Building2,
  CheckCircle2,
  Shield,
  Layers,
  Headphones,
  Workflow,
  PieChart,
} from 'lucide-react';
import { useAuth } from '@petimi/web-core';

const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const markSrc = `${baseUrl}hub-mark.svg`;
const landingPetSrc = `${baseUrl}freelancer.png`;
const vetBase = (import.meta.env.VITE_VET_WEB_URL || '').replace(/\/$/, '');

const FEATURES = [
  {
    icon: Users,
    title: 'Clientes e Pets',
    description: 'Cadastro completo de tutores, animais e histórico.',
  },
  {
    icon: Calendar,
    title: 'Agenda',
    description: 'Agendamentos centralizados para todos os serviços.',
  },
  {
    icon: Stethoscope,
    title: 'Clínica Veterinária',
    description: 'Prontuários, consultas, casos clínicos e prescrições.',
  },
  {
    icon: Sparkles,
    title: 'Banho e Tosa',
    description: 'Gestão operacional dos serviços e acompanhamento do fluxo.',
  },
  {
    icon: Building2,
    title: 'Hotel e Creche',
    description: 'Controle de hospedagens, atividades e rotina dos pets.',
  },
  {
    icon: Wallet,
    title: 'Financeiro e Caixa',
    description: 'Receitas, despesas, cobranças e movimentação financeira.',
  },
  {
    icon: UserCog,
    title: 'Equipe',
    description: 'Permissões, colaboradores e gestão operacional.',
  },
  {
    icon: FileText,
    title: 'Orçamentos',
    description: 'Criação e acompanhamento de propostas comerciais.',
  },
  {
    icon: Package,
    title: 'Serviços e Estoque',
    description: 'Catálogo, preços e controle de produtos.',
  },
] as const;

const PILLARS = [
  {
    icon: Headphones,
    name: 'Recepção',
    items: ['Agenda e confirmações', 'Check-in e filas', 'Cadastro de clientes e pets'],
  },
  {
    icon: Workflow,
    name: 'Operação',
    items: ['Clínica veterinária', 'Banho e tosa', 'Hotel e creche'],
  },
  {
    icon: PieChart,
    name: 'Gestão',
    items: ['Financeiro e caixa', 'Equipe e permissões', 'Indicadores do dia a dia'],
  },
] as const;

const TRUST_PILLS = [
  {
    icon: Layers,
    title: 'Completo',
    hint: 'Do atendimento ao fechamento do caixa.',
  },
  {
    icon: Sparkles,
    title: 'Simples',
    hint: 'Fluxos pensados para o time usar no balcão.',
  },
  {
    icon: Shield,
    title: 'Seguro',
    hint: 'Dados e acessos com controle por perfil.',
  },
] as const;

function HubProductMockup() {
  return (
    <div className="hub-landing-mock" aria-hidden>
      <div className="hub-landing-mock__chrome">
        <span className="hub-landing-mock__dot" />
        <span className="hub-landing-mock__dot hub-landing-mock__dot--amber" />
        <span className="hub-landing-mock__dot hub-landing-mock__dot--mint" />
      </div>
      <div className="hub-landing-mock__shell">
        <aside className="hub-landing-mock__rail">
          <span className="hub-landing-mock__rail-i hub-landing-mock__rail-i--on" />
          <span className="hub-landing-mock__rail-i" />
          <span className="hub-landing-mock__rail-i" />
          <span className="hub-landing-mock__rail-i" />
          <span className="hub-landing-mock__rail-i" />
        </aside>
        <div className="hub-landing-mock__body">
          <div className="hub-landing-mock__topbar">
            <div>
              <p className="hub-landing-mock__hello">Olá, Beatriz!</p>
              <p className="hub-landing-mock__sub">Resumo da operação de hoje</p>
            </div>
            <span className="hub-landing-mock__avatar" />
          </div>
          <div className="hub-landing-mock__grid">
            <div className="hub-landing-mock-card hub-landing-mock-card--chart hub-landing-mock-card--span2">
              <p className="hub-landing-mock-card__label">Financeiro</p>
              <p className="hub-landing-mock-card__title">Receita — últimos 7 dias</p>
              <div className="hub-landing-mock-bars" aria-hidden>
                <span style={{ height: '42%' }} />
                <span style={{ height: '68%' }} />
                <span style={{ height: '55%' }} />
                <span style={{ height: '88%' }} />
                <span style={{ height: '72%' }} />
                <span style={{ height: '94%' }} />
                <span style={{ height: '61%' }} />
              </div>
            </div>
            <div className="hub-landing-mock-card hub-landing-mock-card--span2">
              <p className="hub-landing-mock-card__label">Agenda</p>
              <p className="hub-landing-mock-card__title">Próximos atendimentos</p>
              <ul className="hub-landing-mock-list">
                <li>
                  <span className="hub-landing-mock-list__t">10:00</span> Consulta — Luna
                </li>
                <li>
                  <span className="hub-landing-mock-list__t">11:30</span> Banho — Thor
                </li>
                <li>
                  <span className="hub-landing-mock-list__t">14:00</span> Hotel — Mel
                </li>
              </ul>
            </div>
            <div className="hub-landing-mock-card hub-landing-mock-card--kanban">
              <p className="hub-landing-mock-card__label">Banho e Tosa</p>
              <div className="hub-landing-mock-kanban">
                <div className="hub-landing-mock-kanban__col">
                  <span className="hub-landing-mock-kanban__head">Fila</span>
                  <span className="hub-landing-mock-pill">Bella</span>
                </div>
                <div className="hub-landing-mock-kanban__col">
                  <span className="hub-landing-mock-kanban__head">Em serviço</span>
                  <span className="hub-landing-mock-pill hub-landing-mock-pill--active">Fred</span>
                </div>
                <div className="hub-landing-mock-kanban__col">
                  <span className="hub-landing-mock-kanban__head">Pronto</span>
                  <span className="hub-landing-mock-pill">Nina</span>
                </div>
              </div>
            </div>
            <div className="hub-landing-mock-card">
              <p className="hub-landing-mock-card__label">Clínica</p>
              <p className="hub-landing-mock-card__title">Consultas agendadas</p>
              <p className="hub-landing-mock-card__metric">6</p>
              <p className="hub-landing-mock-card__hint">3 salas ativas</p>
            </div>
            <div className="hub-landing-mock-card">
              <p className="hub-landing-mock-card__label">Hotel</p>
              <p className="hub-landing-mock-card__title">Pets hospedados</p>
              <p className="hub-landing-mock-card__metric">14</p>
              <p className="hub-landing-mock-card__hint">Ocupação 78%</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const HubHomePage: React.FC = () => {
  const { user, loading } = useAuth();

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

  const vetHome = vetBase ? `${vetBase}/` : null;

  return (
    <div className="hub-landing-root">
      <div className="hub-landing-bg" aria-hidden />

      <header className="hub-landing-header">
        <div className="hub-landing-header__inner">
          <Link to="/" className="hub-landing-brand" aria-label="PetMi Hub — início">
            <span className="hub-landing-brand__mark-wrap">
              <img src={markSrc} alt="" className="hub-landing-brand__mark" width={40} height={40} />
            </span>
            <span className="hub-landing-brand__text">
              <span className="hub-landing-brand__name">PetMi Hub</span>
              <span className="hub-landing-brand__tagline">Operação do negócio pet</span>
            </span>
          </Link>
          <nav className="hub-landing-nav" aria-label="Acesso">
            <Link to="/login" className="hub-landing-nav__link">
              Entrar
            </Link>
            <Link to="/signup" className="hub-landing-nav__cta">
              Criar conta
            </Link>
          </nav>
        </div>
      </header>

      <main className="hub-landing-main">
        <section className="hub-landing-hero" aria-labelledby="hub-landing-hero-title">
          <div className="hub-landing-hero__copy">
            <p className="hub-landing-badge">
              <span className="hub-landing-badge__dot" aria-hidden />
              PetMi Hub · Operação do negócio pet
            </p>
            <h1 id="hub-landing-hero-title" className="hub-landing-hero__title">
              A operação do seu negócio pet{' '}
              <span className="hub-landing-hero__title-accent">em um só lugar</span>
            </h1>
            <p className="hub-landing-hero__subtitle">
              Agenda, clientes, pets, atendimentos, banho e tosa, hotel, financeiro e equipe em uma
              plataforma pensada para clínicas, pet shops e centros de bem-estar animal.
            </p>
            <div className="hub-landing-hero__actions">
              <Link to="/signup" className="hub-landing-btn hub-landing-btn--primary">
                Criar conta
                <ArrowRight size={18} strokeWidth={2.25} aria-hidden />
              </Link>
              <Link to="/login" className="hub-landing-btn hub-landing-btn--outline">
                Entrar
              </Link>
            </div>
            <ul className="hub-landing-trust" aria-label="Destaques do produto">
              {TRUST_PILLS.map(({ icon: Icon, title, hint }) => (
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
        </section>

        <section className="hub-landing-pillars" aria-labelledby="hub-landing-pillars-title">
          <div className="hub-landing-pillars__intro">
            <h2 id="hub-landing-pillars-title" className="hub-landing-pillars__title">
              Feito para quem faz o negócio acontecer
            </h2>
            <p className="hub-landing-pillars__lead">
              Da recepção ao financeiro, do banho e tosa à clínica veterinária: tudo conectado para o
              seu time trabalhar com fluidez.
            </p>
          </div>
          <div className="hub-landing-pillars__row">
            {PILLARS.map(({ icon: Icon, name, items }) => (
              <div key={name} className="hub-landing-pillar">
                <span className="hub-landing-pillar__icon-wrap" aria-hidden>
                  <Icon size={22} strokeWidth={2} />
                </span>
                <h3 className="hub-landing-pillar__name">{name}</h3>
                <ul className="hub-landing-pillar__list">
                  {items.map((line) => (
                    <li key={line} className="hub-landing-pillar__list-item">
                      <CheckCircle2 size={15} strokeWidth={2.25} className="hub-landing-pillar__check" aria-hidden />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="hub-landing-features" aria-labelledby="hub-landing-features-title">
          <h2 id="hub-landing-features-title" className="hub-landing-section-title">
            Tudo o que sua empresa pet precisa
          </h2>
          <ul className="hub-landing-features__grid">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <li key={title} className="hub-landing-feature-card">
                <span className="hub-landing-feature-card__icon" aria-hidden>
                  <Icon size={22} strokeWidth={2} />
                </span>
                <div className="hub-landing-feature-card__body">
                  <h3 className="hub-landing-feature-card__title">{title}</h3>
                  <p className="hub-landing-feature-card__text">{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="hub-landing-cta" aria-labelledby="hub-landing-cta-title">
          <div className="hub-landing-cta__panel">
            <div className="hub-landing-cta__split">
              <div className="hub-landing-cta__visual" aria-hidden>
                <img
                  src={landingPetSrc}
                  alt=""
                  className="hub-landing-cta__pet"
                  width={280}
                  height={280}
                />
                <div className="hub-landing-cta__visual-blob" />
              </div>
              <div className="hub-landing-cta__copy">
                <h2 id="hub-landing-cta-title" className="hub-landing-cta__title">
                  Comece a <span className="hub-landing-cta__title-accent">organizar sua operação</span>{' '}
                  com o PetMi Hub
                </h2>
                <p className="hub-landing-cta__text">
                  Centralize sua agenda, clientes, pets, atendimentos e financeiro em uma única
                  plataforma.
                </p>
                <div className="hub-landing-cta__actions">
                  <Link
                    to="/signup"
                    className="hub-landing-btn hub-landing-btn--primary hub-landing-btn--lg"
                  >
                    Criar conta
                    <ArrowRight size={18} strokeWidth={2.25} aria-hidden />
                  </Link>
                  <Link to="/login" className="hub-landing-btn hub-landing-btn--outline hub-landing-btn--lg">
                    Entrar
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="hub-landing-footer">
        <p className="hub-landing-footer__copy">© 2026 PetMi Hub — operação do negócio pet</p>
        {vetHome && (
          <a href={vetHome} className="hub-landing-footer__vet-link">
            Ir para o PetMi Vet
          </a>
        )}
      </footer>
    </div>
  );
};

export default HubHomePage;
