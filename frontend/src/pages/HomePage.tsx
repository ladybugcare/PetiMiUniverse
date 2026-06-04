import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import HomeHeader from '../components/HomeHeader';
import HowItWorks from '../components/HowItWorks';
import {
  Heart,
  Building2,
  Stethoscope,
  ClipboardList,
  Lock,
  Instagram,
  CheckCircle,
  Dog,
  CalendarDays,
  Briefcase,
  Users,
  Shield,
  Home,
  Calendar,
  User,
} from 'lucide-react';
import IconWrapper from '../components/IconWrapper';

const HomePage: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    const id = location.hash?.replace(/^#/, '');
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    const t = window.setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
    return () => window.clearTimeout(t);
  }, [location.pathname, location.hash]);

  return (
    <div className="min-h-screen">
      <HomeHeader />

      <section className="hero-soft">
        <div className="hero-soft__bg" aria-hidden>
          <div className="hero-soft__blob hero-soft__blob--1" />
          <div className="hero-soft__blob hero-soft__blob--2" />
          <div className="hero-soft__blob hero-soft__blob--3" />
        </div>
        <span className="hero-soft__decor hero-soft__decor--1" aria-hidden>
          <IconWrapper icon={Heart} size={44} strokeWidth={1.25} />
        </span>
        <span className="hero-soft__decor hero-soft__decor--2" aria-hidden>
          <IconWrapper icon={Dog} size={38} strokeWidth={1.25} />
        </span>
        <span className="hero-soft__decor hero-soft__decor--3" aria-hidden>
          <IconWrapper icon={Heart} size={28} strokeWidth={1.25} />
        </span>
        <span className="hero-soft__decor hero-soft__decor--4" aria-hidden>
          <IconWrapper icon={Dog} size={32} strokeWidth={1.25} />
        </span>
        <span className="hero-soft__decor hero-soft__decor--5" aria-hidden>
          <IconWrapper icon={Heart} size={22} strokeWidth={1.25} />
        </span>

        <div className="container">
          <div className="hero-content-split">
            <div className="hero-text-left animate-fade-in-up">
              <div className="hero-eyebrow">
                <IconWrapper icon={Heart} size={14} fill="currentColor" strokeWidth={0} />
                O universo do cuidado animal
              </div>
              <h1 className="text-display text-4xl md:text-5xl lg:text-6xl font-bold mb-6 hero-headline">
                Conectando quem cuida, quem ama e{' '}
                <span className="hero-headline__accent">quem precisa.</span>
              </h1>

              <p className="hero-lead animate-fade-in-up animate-delay-100">
                O PetMi Vet é a plataforma que conecta clínicas veterinárias, veterinários, profissionais
                freelancers e tutores. Tudo em um só lugar — simples, humano e com foco no bem-estar dos
                pets.
              </p>

              <div className="hero-cta-row animate-fade-in-up animate-delay-200">
                <Link to="/vet-signup" className="btn btn-primary hero-cta-primary">
                  <IconWrapper icon={Dog} size={20} strokeWidth={2} />
                  Criar minha conta
                </Link>
                <Link to="/#servicos" className="btn btn-outline hero-cta-outline">
                  Explorar a plataforma
                </Link>
              </div>

              <div className="hero-feature-strip animate-fade-in-up animate-delay-300">
                <div className="hero-feature-item">
                  <IconWrapper icon={Building2} size={28} strokeWidth={1.5} color="var(--primary-600)" />
                  <span>Encontre clínicas e profissionais</span>
                </div>
                <div className="hero-feature-item">
                  <IconWrapper icon={CalendarDays} size={28} strokeWidth={1.5} color="var(--primary-600)" />
                  <span>Agende e gerencie atendimentos</span>
                </div>
                <div className="hero-feature-item">
                  <IconWrapper icon={Heart} size={28} strokeWidth={1.5} color="var(--primary-600)" />
                  <span>Cuide com amor, onde estiver</span>
                </div>
                <div className="hero-feature-item">
                  <IconWrapper icon={Briefcase} size={28} strokeWidth={1.5} color="var(--primary-600)" />
                  <span>Oportunidades para profissionais</span>
                </div>
              </div>
            </div>

            <div className="hero-images-right animate-scale-in animate-delay-300">
              <div className="hero-visual-composition">
                <div className="hero-pet-float hero-pet-float--1">
                  <div className="hero-pet-float__inner animate-float">
                    <img src="/pets/pet-showcase-1.png" alt="Cão" loading="lazy" />
                  </div>
                </div>
                <div className="hero-pet-float hero-pet-float--2">
                  <div className="hero-pet-float__inner animate-float" style={{ animationDelay: '0.25s' }}>
                    <img src="/pets/pet-showcase-2.png" alt="Cachorro" loading="lazy" />
                  </div>
                </div>
                <div className="hero-pet-float hero-pet-float--3">
                  <div className="hero-pet-float__inner animate-float" style={{ animationDelay: '0.5s' }}>
                    <img src="/pets/pet-showcase-6.png" alt="Pet" loading="lazy" />
                  </div>
                </div>
                <div className="hero-pet-float hero-pet-float--4">
                  <div className="hero-pet-float__inner animate-float" style={{ animationDelay: '0.75s' }}>
                    <img src="/pets/pet-showcase-3.png" alt="Pet" loading="lazy" />
                  </div>
                </div>
                <div className="hero-pet-float hero-pet-float--5">
                  <div className="hero-pet-float__inner animate-float" style={{ animationDelay: '1s' }}>
                    <img src="/pets/pet-showcase-5.png" alt="Pet" loading="lazy" />
                  </div>
                </div>

                <div className="hero-phone-wrap animate-float" style={{ animationDelay: '0.15s' }}>
                  <div className="hero-phone-shell">
                    <div className="hero-phone-inner">
                      <div className="hero-phone-bar" />
                      <p className="hero-phone-greet">Olá, Beatriz!</p>
                      <p className="hero-phone-sub">Bem-vindo de volta</p>

                      <div className="hero-phone-pet-card">
                        <img
                          src="/pets/pet-showcase-4.png"
                          alt=""
                          className="hero-phone-pet-card__avatar"
                          width={44}
                          height={44}
                        />
                        <div className="hero-phone-pet-card__text">
                          <span className="hero-phone-pet-card__label">Meu pet</span>
                          <span className="hero-phone-pet-card__name">Lua</span>
                        </div>
                      </div>

                      <div className="hero-phone-appt">
                        <div className="hero-phone-appt__icon" aria-hidden>
                          <IconWrapper icon={Calendar} size={14} strokeWidth={2} />
                        </div>
                        <div>
                          <span className="hero-phone-appt__title">Próxima consulta</span>
                          <span className="hero-phone-appt__meta">Amanhã · 14h</span>
                        </div>
                      </div>

                      <p className="hero-phone-quick-label">Acesso rápido</p>
                      <div className="hero-phone-grid">
                        <div className="hero-phone-tile">Clínicas</div>
                        <div className="hero-phone-tile">Vets</div>
                        <div className="hero-phone-tile">Serviços</div>
                        <div className="hero-phone-tile">Mais</div>
                      </div>

                      <div className="hero-phone-nav">
                        <span className="hero-phone-nav__item" aria-hidden>
                          <IconWrapper icon={Home} size={18} strokeWidth={2} color="var(--primary-600)" />
                        </span>
                        <span className="hero-phone-nav__item" aria-hidden>
                          <IconWrapper icon={Calendar} size={18} strokeWidth={2} color="var(--primary-600)" />
                        </span>
                        <span className="hero-phone-nav__fab" aria-hidden>
                          <IconWrapper icon={Dog} size={20} strokeWidth={2} color="#fff" />
                        </span>
                        <span className="hero-phone-nav__item" aria-hidden>
                          <IconWrapper icon={User} size={18} strokeWidth={2} color="var(--primary-600)" />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="home-stats-strip-wrap">
        <div className="container">
          <div className="home-stats-strip">
            <div className="home-stats-grid">
              <div className="home-stat">
                <div className="home-stat__icon">
                  <IconWrapper icon={Users} size={22} strokeWidth={1.75} />
                </div>
                <p className="home-stat__value">+120</p>
                <p className="home-stat__label">Profissionais cadastrados</p>
              </div>
              <div className="home-stat">
                <div className="home-stat__icon">
                  <IconWrapper icon={Building2} size={22} strokeWidth={1.75} />
                </div>
                <p className="home-stat__value">+35</p>
                <p className="home-stat__label">Clínicas parceiras</p>
              </div>
              <div className="home-stat">
                <div className="home-stat__icon">
                  <IconWrapper icon={Heart} size={22} strokeWidth={1.75} />
                </div>
                <p className="home-stat__value">+500</p>
                <p className="home-stat__label">Pets atendidos</p>
              </div>
            </div>
            <div className="home-stats-aside">
              <div className="home-stats-secure">
                <div className="home-stat__icon" style={{ marginBottom: 0 }}>
                  <IconWrapper icon={Shield} size={22} strokeWidth={1.75} />
                </div>
                <div>
                  <h3 className="home-stats-secure__title">Plataforma segura</h3>
                  <p>Dados e conversas pensados para privacidade entre clínicas e profissionais.</p>
                </div>
              </div>
              <div className="home-stats-mission">
                <h3 className="home-stats-mission__title">Apoiamos o cuidado responsável</h3>
                <p>
                  Transparência entre clínicas, profissionais e tutores, com respeito aos pets e à
                  privacidade de cada conversa.
                </p>
                <Link to="/#sobre">Conheça nossas iniciativas →</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section secondary-cta">
        <div className="container secondary-cta__content">
          <div>
            <span className="secondary-cta__eyebrow">Próximo passo</span>
            <h2>Converse com a equipe e conheça a plataforma de perto</h2>
            <p>
              Agende uma demo e veja como o PetMi Vet pode acelerar a gestão da sua clínica, engajar a
              equipe e colaborar com especialistas de confiança.
            </p>
            <div className="secondary-cta__benefits">
              <div>
                <IconWrapper icon={CheckCircle} size={16} /> Onboarding guiado com checklists inteligentes
              </div>
              <div>
                <IconWrapper icon={CheckCircle} size={16} /> Ferramentas para equipe: convites, agendas,
                unidades
              </div>
              <div>
                <IconWrapper icon={CheckCircle} size={16} /> Marketplace para vender serviços e produtos pet
              </div>
            </div>
          </div>
          <div className="secondary-cta__actions">
            <a className="btn-white" href="https://wa.me/5511999999999" target="_blank" rel="noopener noreferrer">
              Fale com a gente no WhatsApp
            </a>
            <a className="btn-white" href="mailto:contato@petivet.com">
              Agendar uma demo
            </a>
          </div>
        </div>
      </section>

      <HowItWorks />

      <section id="servicos" className="section section-what-you-can-do">
        <div className="container">
          <div className="text-center mb-16 section-what-you-can-do__header">
            <h2 className="text-display text-4xl md:text-5xl font-bold mb-4 animate-fade-in-up">
              O que você pode fazer?
            </h2>
            <p className="text-xl animate-fade-in-up animate-delay-100">
              Escolha a opção que melhor se adequa ao seu perfil
            </p>
          </div>

          <div className="cards-grid gap-8">
            <div className="icon-card group animate-scale-in">
              <div className="icon-card-icon group-hover:scale-110 transition-transform">
                <IconWrapper icon={Building2} size={48} strokeWidth={1.5} />
              </div>
              <div className="icon-card-content">
                <h3 className="text-display text-xl font-bold mb-2 text-neutral-800">Cadastrar Clínica</h3>
                <p className="text-neutral-600 leading-relaxed">
                  Registre sua clínica veterinária e publique oportunidades de trabalho
                </p>
              </div>
            </div>

            <div className="icon-card group animate-scale-in animate-delay-100">
              <div className="icon-card-icon group-hover:scale-110 transition-transform">
                <IconWrapper icon={Stethoscope} size={48} strokeWidth={1.5} />
              </div>
              <div className="icon-card-content">
                <h3 className="text-display text-xl font-bold mb-2 text-neutral-800">Cadastrar Veterinário</h3>
                <p className="text-neutral-600 leading-relaxed">
                  Registre-se como profissional e encontre as melhores oportunidades
                </p>
              </div>
            </div>

            <div className="icon-card group animate-scale-in animate-delay-200">
              <div className="icon-card-icon group-hover:scale-110 transition-transform">
                <IconWrapper icon={ClipboardList} size={48} strokeWidth={1.5} />
              </div>
              <div className="icon-card-content">
                <h3 className="text-display text-xl font-bold mb-2 text-neutral-800">Ver Demandas</h3>
                <p className="text-neutral-600 leading-relaxed">
                  Visualize todas as demandas abertas por clínicas veterinárias
                </p>
              </div>
            </div>

            <div className="icon-card group animate-scale-in animate-delay-300">
              <div className="icon-card-icon group-hover:scale-110 transition-transform">
                <IconWrapper icon={Lock} size={48} strokeWidth={1.5} />
              </div>
              <div className="icon-card-content">
                <h3 className="text-display text-xl font-bold mb-2 text-neutral-800">Login</h3>
                <p className="text-neutral-600 leading-relaxed">
                  Acesse sua conta para gerenciar suas informações e candidaturas
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer id="contato" className="footer footer--minimal">
        <div className="container">
          <div className="footer-content">
            <div className="footer-brand">
              <div className="footer-brand-mark">
                <img src="/just_logo.png" alt="" className="footer-logo-icon" width={52} height={52} decoding="async" />
                <span className="footer-wordmark">PetMi Vet</span>
              </div>
              <p>
                Conectando clínicas, profissionais e tutores para levar cuidado, agilidade e amor aos pets.
              </p>
            </div>

            <div className="footer-links">
              <h4>Links Rápidos</h4>
              <ul>
                <li>
                  <Link to="/clinic-signup">Cadastrar Clínica</Link>
                </li>
                <li>
                  <Link to="/vet-signup">Cadastrar Veterinário</Link>
                </li>
                <li>
                  <Link to="/demands">Ver Demandas</Link>
                </li>
              </ul>
            </div>

            <div className="footer-social">
              <h4>Conecte-se</h4>
              <a
                href="https://www.instagram.com/petivet.oficial"
                target="_blank"
                rel="noopener noreferrer"
                className="footer-social__link"
              >
                <IconWrapper icon={Instagram} size={22} strokeWidth={1.6} />
                <span>@petivet.oficial</span>
              </a>
              <p>Nossa rotina, bastidores e dicas semanais sobre gestão e bem-estar animal.</p>
            </div>

            <div className="footer-contact">
              <h4>Contato</h4>
              <ul>
                <li>contato@petivet.com</li>
                <li>(11) 98765-4321</li>
                <li>São Paulo, SP</li>
              </ul>
            </div>
          </div>

          <div className="footer-bottom">
            <p className="footer-bottom__tagline">
              Feito com <IconWrapper icon={Heart} size={18} fill="currentColor" /> para pets e veterinários
            </p>
            <p className="footer-bottom__copyright">© 2026 PetMi Vet. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
