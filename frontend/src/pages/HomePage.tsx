import React from 'react';
import { Link } from 'react-router-dom';

const HomePage: React.FC = () => {
  return (
    <div className="min-h-screen">
      {/* Purple Hero Section with Paw Prints */}
      <section className="hero-purple flex items-center justify-center min-h-screen">
        <div className="container">
        <div className="hero-content flex flex-col items-center text-center">
            <h1 className="text-display text-5xl md:text-6xl font-bold mb-6 animate-fade-in-up text-center">
              PetiVet 🐾
            </h1>
            
            <p className="text-xl md:text-2xl mb-4 font-semibold text-center">
              Conectando clínicas e veterinários
            </p>
            
            <p className="text-base md:text-lg mb-12 max-w-3xl mx-auto opacity-90 text-center">
              A plataforma que revoluciona o atendimento veterinário, facilitando a conexão entre
              clínicas e profissionais qualificados
            </p>
            
            <div className="flex flex-col sm:flex-row gap-6 justify-center items-center mx-auto">
              <Link to="/clinic-signup" className="btn-white w-full sm:w-auto text-center">
                🏥 Cadastrar Clínica
              </Link>
              <Link to="/vet-signup" className="btn-white w-full sm:w-auto text-center">
                🩺 Cadastrar Veterinário
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* O que você pode fazer? */}
      <section className="section section-what-you-can-do">
        <div className="container">
          <div className="text-center mb-16 section-what-you-can-do__header">
            <h2 className="text-display text-4xl md:text-5xl font-bold mb-4">
              O que você pode fazer?
            </h2>
            <p className="text-xl">
              Escolha a opção que melhor se adequa ao seu perfil
            </p>
          </div>
          
          <div className="cards-grid gap-8">
            <Link to="/clinic-signup" className="icon-card group">
              <div className="icon-card-icon group-hover:scale-110 transition-transform">
                🏥
              </div>
              <div className="icon-card-content">
                <h3 className="text-display text-xl font-bold mb-2 text-neutral-800">
                  Cadastrar Clínica
                </h3>
                <p className="text-neutral-600 leading-relaxed">
                  Registre sua clínica veterinária e publique oportunidades de trabalho
                </p>
              </div>
            </Link>
            
            <Link to="/vet-signup" className="icon-card group">
              <div className="icon-card-icon group-hover:scale-110 transition-transform">
                🩺
              </div>
              <div className="icon-card-content">
                <h3 className="text-display text-xl font-bold mb-2 text-neutral-800">
                  Cadastrar Veterinário
                </h3>
                <p className="text-neutral-600 leading-relaxed">
                  Registre-se como profissional e encontre as melhores oportunidades
                </p>
              </div>
            </Link>
            
            <Link to="/demands" className="icon-card group">
              <div className="icon-card-icon group-hover:scale-110 transition-transform">
                📋
              </div>
              <div className="icon-card-content">
                <h3 className="text-display text-xl font-bold mb-2 text-neutral-800">
                  Ver Demandas
                </h3>
                <p className="text-neutral-600 leading-relaxed">
                  Visualize todas as demandas abertas por clínicas veterinárias
                </p>
              </div>
            </Link>
            
            <Link to="/login" className="icon-card group">
              <div className="icon-card-icon group-hover:scale-110 transition-transform">
                🔐
              </div>
              <div className="icon-card-content">
                <h3 className="text-display text-xl font-bold mb-2 text-neutral-800">
                  Login
                </h3>
                <p className="text-neutral-600 leading-relaxed">
                  Acesse sua conta para gerenciar suas informações e candidaturas
                </p>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Como funciona? - Timeline */}
      <section className="timeline-container">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-display text-4xl md:text-5xl font-bold mb-4 text-neutral-800">
              Como funciona?
            </h2>
            <p className="text-xl text-neutral-600">
              Um processo simples e eficiente para conectar clínicas e veterinários
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
            <div className="timeline-step">
              <div className="timeline-step-number" data-number="1">
                🏥
              </div>
              <h3 className="text-display text-2xl font-bold mb-3 text-neutral-800">
                Clínicas se cadastram
              </h3>
              <p className="text-neutral-600 leading-relaxed">
                Clínicas veterinárias registram suas informações e criam demandas de trabalho
              </p>
            </div>
            
            <div className="timeline-step">
              <div className="timeline-step-number" data-number="2">
                🩺
              </div>
              <h3 className="text-display text-2xl font-bold mb-3 text-neutral-800">
                Veterinários se candidatam
              </h3>
              <p className="text-neutral-600 leading-relaxed">
                Profissionais qualificados visualizam e se candidatam às oportunidades disponíveis
              </p>
            </div>
            
            <div className="timeline-step">
              <div className="timeline-step-number" data-number="3">
                ✅
              </div>
              <h3 className="text-display text-2xl font-bold mb-3 text-neutral-800">
                Conexão estabelecida
              </h3>
              <p className="text-neutral-600 leading-relaxed">
                Clínicas escolhem os melhores profissionais para suas necessidades
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-purple">
        <div className="container">
          <h2 className="text-display text-4xl md:text-5xl font-bold mb-6">
            Pronto para começar?
          </h2>
          <p className="text-xl md:text-2xl mb-8 opacity-90">
            Junte-se à comunidade PetiVet e faça parte da revolução no atendimento veterinário
          </p>
          <Link to="/clinic-signup" className="btn-white text-lg">
            Começar Agora
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div>
              <h3 className="text-display text-2xl font-bold mb-4" style={{color: '#a855f7'}}>
                PetiVet 🐾
              </h3>
              <p className="text-neutral-600">
                Conectando clínicas e veterinários para melhor atender nossos amigos de quatro patas
              </p>
            </div>
            
            <div>
              <h4 className="font-bold mb-4 text-neutral-800">Links Rápidos</h4>
              <ul className="space-y-2">
                <li><Link to="/clinic-signup" className="text-neutral-600 hover:text-purple-600 transition-colors">Cadastrar Clínica</Link></li>
                <li><Link to="/vet-signup" className="text-neutral-600 hover:text-purple-600 transition-colors">Cadastrar Veterinário</Link></li>
                <li><Link to="/demands" className="text-neutral-600 hover:text-purple-600 transition-colors">Ver Demandas</Link></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-bold mb-4 text-neutral-800">Contato</h4>
              <ul className="space-y-2 text-neutral-600">
                <li>contato@petivet.com</li>
                <li>(11) 98765-4321</li>
                <li>São Paulo, SP</li>
              </ul>
            </div>
          </div>
          
          <div className="footer-bottom">
            <p>Feito com ❤️ para pets e veterinários</p>
            <p className="mt-2">© 2025 PetiVet. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
