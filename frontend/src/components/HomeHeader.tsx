import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

const HomeHeader: React.FC = () => {
  const [signUpOpen, setSignUpOpen] = useState(false);
  const signUpRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (signUpRef.current && !signUpRef.current.contains(event.target as Node)) {
        setSignUpOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="home-header">
      <div className="home-header-container">
        <div className="home-header-left">
          <Link to="/" className="home-header-logo">
            <img
              src="/logo_texto_lado.png"
              alt="PetMi Vet"
              className="home-header-logo-img"
            />
          </Link>
        </div>

        <nav className="home-header-links" aria-label="Principal">
          <Link to="/" className="home-header-link">
            Início
          </Link>
          <Link to="/#sobre" className="home-header-link">
            Sobre
          </Link>
          <Link to="/#servicos" className="home-header-link">
            Serviços
          </Link>
          <Link to="/#servicos" className="home-header-link">
            Para profissionais
          </Link>
          <Link to="/#contato" className="home-header-link">
            Contato
          </Link>
        </nav>

        <div className="home-header-nav">
          <Link to="/login" className="dropdown-button-outline" style={{ textDecoration: 'none' }}>
            Entrar
          </Link>
          <div className="dropdown-wrapper" ref={signUpRef}>
            <button
              type="button"
              className="dropdown-button"
              onClick={() => setSignUpOpen(!signUpOpen)}
              aria-expanded={signUpOpen}
              aria-haspopup="true"
            >
              Criar conta
              <svg
                className={`dropdown-arrow ${signUpOpen ? 'open' : ''}`}
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden
              >
                <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            {signUpOpen && (
              <div className="dropdown-menu">
                <Link
                  to="/vet-signup"
                  className="dropdown-item"
                  onClick={() => setSignUpOpen(false)}
                >
                  Cadastrar Veterinário
                </Link>
                <Link
                  to="/freelancer-signup"
                  className="dropdown-item"
                  onClick={() => setSignUpOpen(false)}
                >
                  Cadastrar Freelancer
                </Link>
                <Link
                  to="/clinic-signup"
                  className="dropdown-item"
                  onClick={() => setSignUpOpen(false)}
                >
                  Cadastrar Clínica
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default HomeHeader;
