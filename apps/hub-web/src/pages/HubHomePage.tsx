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
} from 'lucide-react';
import { useAuth } from '@petimi/web-core';

const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const hubLogoSrc = `${baseUrl}petmi-hub-logo.png`;
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

function HubProductMockup() {
  return (
    <div className="hub-landing-mock" aria-hidden>
      <div className="hub-landing-mock__chrome">
        <span className="hub-landing-mock__dot" />
        <span className="hub-landing-mock__dot hub-landing-mock__dot--amber" />
        <span className="hub-landing-mock__dot hub-landing-mock__dot--mint" />
      </div>
      <div className="hub-landing-mock__body">
        <div className="hub-landing-mock__grid">
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
          <div className="hub-landing-mock-card">
            <p className="hub-landing-mock-card__label">Financeiro</p>
            <p className="hub-landing-mock-card__title">Receitas do dia</p>
            <p className="hub-landing-mock-card__metric">R$ 4.280</p>
            <p className="hub-landing-mock-card__hint">+12% vs. ontem</p>
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
          <Link to="/" className="hub-landing-logo-link" aria-label="PetMi Hub — início">
            <img src={hubLogoSrc} alt="PetMi Hub" className="hub-landing-logo-img" />
          </Link>
          <nav className="hub-landing-nav" aria-label="Acesso">
            <Link to="/login" className="hub-landing-nav__link">
              Entrar
            </Link>
            <Link to="/signup" className="hub-landing-nav__cta">
              Cadastrar
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
              A operação do seu negócio pet em um só lugar
            </h1>
            <p className="hub-landing-hero__subtitle">
              Agenda, clientes, pets, atendimentos, banho e tosa, hotel, financeiro e equipe
              conectados em uma única plataforma.
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
              Da recepção ao financeiro, do banho e tosa à clínica veterinária, o PetMi Hub conecta
              toda a operação em um único lugar.
            </p>
          </div>
          <div className="hub-landing-pillars__row">
            <div className="hub-landing-pillar">
              <h3 className="hub-landing-pillar__name">Recepção</h3>
              <p className="hub-landing-pillar__text">Agendamentos, clientes e pets.</p>
            </div>
            <div className="hub-landing-pillar">
              <h3 className="hub-landing-pillar__name">Operação</h3>
              <p className="hub-landing-pillar__text">Clínica, banho e tosa, hotel e creche.</p>
            </div>
            <div className="hub-landing-pillar">
              <h3 className="hub-landing-pillar__name">Gestão</h3>
              <p className="hub-landing-pillar__text">Financeiro, estoque e equipe.</p>
            </div>
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
                  <Icon size={20} strokeWidth={2} />
                </span>
                <h3 className="hub-landing-feature-card__title">{title}</h3>
                <p className="hub-landing-feature-card__text">{description}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="hub-landing-cta" aria-labelledby="hub-landing-cta-title">
          <div className="hub-landing-cta__panel">
            <div className="hub-landing-cta__inner">
              <h2 id="hub-landing-cta-title" className="hub-landing-cta__title">
                Comece a organizar sua operação com o PetMi Hub
              </h2>
              <p className="hub-landing-cta__text">
                Centralize sua agenda, clientes, pets, atendimentos e financeiro em uma única
                plataforma.
              </p>
              <div className="hub-landing-cta__actions">
                <Link to="/signup" className="hub-landing-btn hub-landing-btn--primary hub-landing-btn--lg">
                  Criar conta
                  <ArrowRight size={18} strokeWidth={2.25} aria-hidden />
                </Link>
                <Link to="/login" className="hub-landing-btn hub-landing-btn--ghost hub-landing-btn--lg">
                  Entrar
                </Link>
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
