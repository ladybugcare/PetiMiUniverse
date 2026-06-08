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
} from 'lucide-react';
import { useAuth } from '@petimi/web-core';

const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const markSrc = `${baseUrl}hub-mark.svg`;
const vetBase = (import.meta.env.VITE_VET_WEB_URL || '').replace(/\/$/, '');

const FEATURES = [
  {
    icon: Users,
    title: 'Clientes e pets',
    description: 'Cadastro completo de tutores e animais, com histórico e vínculos organizados por unidade.',
  },
  {
    icon: Calendar,
    title: 'Agenda',
    description: 'Agendamentos centralizados para consultas, banho e tosa e demais serviços da clínica.',
  },
  {
    icon: Stethoscope,
    title: 'Clínica e atendimentos',
    description: 'Prontuário, casos clínicos, exames e prescrições em um fluxo integrado ao dia a dia.',
  },
  {
    icon: Wallet,
    title: 'Financeiro e caixa',
    description: 'Controle de receitas, comandas, pagamentos e movimentação de caixa em tempo real.',
  },
  {
    icon: FileText,
    title: 'Orçamentos',
    description: 'Crie e envie orçamentos profissionais para clientes e acompanhe aprovações.',
  },
  {
    icon: Package,
    title: 'Serviços e estoque',
    description: 'Catálogo de serviços, preços e controle de estoque para a operação completa.',
  },
  {
    icon: UserCog,
    title: 'Equipe',
    description: 'Gestão de colaboradores, permissões e papéis dentro da sua clínica.',
  },
] as const;

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
      <header className="hub-landing-header">
        <div className="hub-landing-header__inner">
          <div className="hub-landing-brand">
            <img src={markSrc} alt="" className="hub-landing-brand__mark" width={40} height={40} />
            <div className="hub-landing-brand__text">
              <span className="hub-landing-brand__name">PetMi Hub</span>
              <span className="hub-landing-brand__tagline">OPERAÇÃO DO NEGÓCIO PET</span>
            </div>
          </div>
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
        <section className="hub-landing-hero">
          <h1 className="hub-landing-hero__title">
            O sistema operacional da sua clínica pet
          </h1>
          <p className="hub-landing-hero__subtitle">
            O PetMi Hub reúne clientes, agenda, atendimentos, financeiro e equipe em uma
            plataforma pensada para quem gerencia o dia a dia de clínicas veterinárias,
            pet shops e centros de bem-estar animal.
          </p>
          <div className="hub-landing-hero__actions">
            <Link to="/login" className="hub-landing-btn hub-landing-btn--primary">
              Entrar
              <ArrowRight size={20} aria-hidden />
            </Link>
            <Link to="/signup" className="hub-landing-btn hub-landing-btn--outline">
              Criar conta
            </Link>
          </div>
        </section>

        <section className="hub-landing-about" aria-labelledby="hub-landing-about-title">
          <h2 id="hub-landing-about-title" className="hub-landing-section-title">
            Feito para quem opera o negócio
          </h2>
          <div className="hub-landing-about__content">
            <p>
              Enquanto o PetMi Vet conecta profissionais e clínicas, o Hub é onde sua
              equipe executa: recepção, gerência, veterinários internos e administradores
              trabalham juntos com dados centralizados e fluxos pensados para a rotina
              real de uma clínica.
            </p>
            <p>
              Do primeiro contato com o tutor até o fechamento do caixa, você tem visibilidade
              sobre clientes, pets, serviços e resultados — sem planilhas soltas nem sistemas
              desconectados.
            </p>
          </div>
        </section>

        <section className="hub-landing-features" aria-labelledby="hub-landing-features-title">
          <h2 id="hub-landing-features-title" className="hub-landing-section-title">
            Tudo que sua clínica precisa
          </h2>
          <ul className="hub-landing-features__grid">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <li key={title} className="hub-landing-feature-card">
                <span className="hub-landing-feature-card__icon" aria-hidden>
                  <Icon size={24} strokeWidth={2} />
                </span>
                <h3 className="hub-landing-feature-card__title">{title}</h3>
                <p className="hub-landing-feature-card__text">{description}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="hub-landing-cta" aria-labelledby="hub-landing-cta-title">
          <div className="hub-landing-cta__card">
            <h2 id="hub-landing-cta-title" className="hub-landing-cta__title">
              Pronto para começar?
            </h2>
            <p className="hub-landing-cta__text">
              Crie sua conta ou entre com as credenciais da sua clínica para acessar o Hub.
            </p>
            <div className="hub-landing-hero__actions hub-landing-hero__actions--center">
              <Link to="/signup" className="hub-landing-btn hub-landing-btn--primary">
                Criar conta
                <ArrowRight size={20} aria-hidden />
              </Link>
              <Link to="/login" className="hub-landing-btn hub-landing-btn--outline">
                Entrar
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="hub-landing-footer">
        <p className="hub-landing-footer__copy">
          © {new Date().getFullYear()} PetMi Hub — operação do negócio pet
        </p>
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
