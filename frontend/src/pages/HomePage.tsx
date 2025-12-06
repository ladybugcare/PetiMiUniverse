import React from 'react';
import { Link } from 'react-router-dom';
import HomeHeader from '../components/HomeHeader';
import HowItWorks from '../components/HowItWorks';
import { Heart, Dog, Cat, Building2, Stethoscope, ClipboardList, Lock, Instagram, CheckCircle } from 'lucide-react';
import IconWrapper from '../components/IconWrapper';

const HomePage: React.FC = () => {
  return (
    <div className="min-h-screen">
      <HomeHeader />

      {/* Purple Hero Section with Paw Prints */}
      <section className="hero-purple">
        <div className="container">
          <div className="hero-content-split">
            {/* Lado esquerdo - Texto */}
            <div className="hero-text-left animate-fade-in-up">
              <h1 className="text-display text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
                Conectando quem cuida, quem ama e quem precisa.
              </h1>
              
              <p className="text-lg md:text-xl mb-6 opacity-90 animate-fade-in-up animate-delay-100">
                O PetiVet é a plataforma que une clínicas veterinárias, profissionais 
                independentes, freelancers e tutores em um só lugar. Aqui, quem oferece 
                cuidado encontra quem precisa dele — de forma simples, segura e com muito 
                amor pelos animais.{' '}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <IconWrapper icon={Heart} size={20} fill="currentColor" />
                  <IconWrapper icon={Dog} size={20} />
                  <IconWrapper icon={Cat} size={20} />
                </span>
              </p>
              
              <p className="text-base md:text-lg opacity-80 animate-fade-in-up animate-delay-200">
                Encontre clínicas próximas, descubra oportunidades de trabalho e colabore 
                com outros profissionais do mundo pet. O PetiVet foi criado para facilitar 
                conexões e fortalecer o cuidado animal.
              </p>
            </div>
            
            {/* Lado direito - Galeria circular */}
            <div className="hero-images-right animate-scale-in animate-delay-300">
              <div style={{ position: 'relative', width: '100%', maxWidth: '500px', height: '500px' }}>
                <div
                  className="hero-image-circle animate-float"
                  style={{ position: 'absolute', top: '20px', left: '20px', width: '200px', height: '200px', zIndex: 3 }}
                >
                  <img src="/img1.png" alt="Galeria PetiVet 1" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>

                <div
                  className="hero-image-circle"
                  style={{ position: 'absolute', top: '60px', right: '40px', width: '180px', height: '180px', zIndex: 4, animationDelay: '0.3s' }}
                >
                  <img src="/img2.jpg" alt="Galeria PetiVet 2" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>

                <div
                  className="hero-image-circle animate-float"
                  style={{ position: 'absolute', bottom: '80px', right: '80px', width: '240px', height: '240px', zIndex: 5, animationDelay: '0.15s' }}
                >
                  <img src="/im3.jpg" alt="Galeria PetiVet 3" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>

                <div
                  className="hero-image-circle"
                  style={{ position: 'absolute', bottom: '40px', left: '0', width: '160px', height: '160px', zIndex: 2, animationDelay: '0.5s' }}
                >
                  <img src="/img4.jpg" alt="Galeria PetiVet 4" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>

                <div
                  className="hero-image-circle animate-float"
                  style={{ position: 'absolute', bottom: '0', right: '20px', width: '140px', height: '140px', zIndex: 1, animationDelay: '0.7s' }}
                >
                  <img src="/img5.jpg" alt="Galeria PetiVet 5" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
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
              Agende uma demo e veja como o PetiVet pode acelerar a gestão da sua clínica,
              engajar a equipe e colaborar com especialistas de confiança.
            </p>
            <div className="secondary-cta__benefits">
              <div><IconWrapper icon={CheckCircle} size={16} /> Onboarding guiado com checklists inteligentes</div>
              <div><IconWrapper icon={CheckCircle} size={16} /> Ferramentas para equipe: convites, agendas, unidades</div>
              <div><IconWrapper icon={CheckCircle} size={16} /> Marketplace para vender serviços e produtos pet</div>
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

      {/* O que você pode fazer? */}
      <section className="section section-what-you-can-do">
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
                <h3 className="text-display text-xl font-bold mb-2 text-neutral-800">
                  Cadastrar Clínica
                </h3>
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
                <h3 className="text-display text-xl font-bold mb-2 text-neutral-800">
                  Cadastrar Veterinário
                </h3>
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
                <h3 className="text-display text-xl font-bold mb-2 text-neutral-800">
                  Ver Demandas
                </h3>
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
                <h3 className="text-display text-xl font-bold mb-2 text-neutral-800">
                  Login
                </h3>
                <p className="text-neutral-600 leading-relaxed">
                  Acesse sua conta para gerenciar suas informações e candidaturas
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer footer--minimal">
        <div className="container">
          <div className="footer-content">
            <div className="footer-brand">
              <img 
                src="/logo_branco.png" 
                alt="PetiMi" 
                className="footer-logo"
              />
              <p>
                Conectando clínicas, profissionais e tutores para levar cuidado,
                agilidade e amor aos pets.
              </p>
            </div>
            
            <div className="footer-links">
              <h4>Links Rápidos</h4>
              <ul>
                <li><Link to="/clinic-signup">Cadastrar Clínica</Link></li>
                <li><Link to="/vet-signup">Cadastrar Veterinário</Link></li>
                <li><Link to="/demands">Ver Demandas</Link></li>
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
            <p className="footer-bottom__copyright">© 2025 PetiMi. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
