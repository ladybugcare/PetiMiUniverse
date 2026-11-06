import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { signupLinkState } from '../../utils/signupReturn';
import HubProductCredit from '../HubProductCredit';

const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const logoSrc = `${baseUrl}petmi-hub.svg`;

const HubLandingFooter: React.FC = () => {
  const location = useLocation();
  const year = new Date().getFullYear();

  return (
    <footer className="hub-landing-footer">
      <div className="hub-landing-footer__inner">
        <div className="hub-landing-footer__brand">
          <Link to="/" className="hub-landing-footer__logo" aria-label="PetMi Hub — início">
            <img src={logoSrc} alt="" width={220} height={52} />
          </Link>
          <p className="hub-landing-footer__about">
            Plataforma para organizar a operação do negócio pet, da agenda ao financeiro.
          </p>
        </div>

        <nav className="hub-landing-footer__nav" aria-label="Rodapé">
          <Link to={{ pathname: '/', hash: 'funcionalidades' }}>Funcionalidades</Link>
          <Link to="/planos">Planos</Link>
          <Link to="/login">Entrar</Link>
          <Link to="/signup" state={signupLinkState(location)}>Criar conta</Link>
        </nav>
      </div>

      <div className="hub-landing-footer__legal">
        <HubProductCredit />
        <p className="hub-landing-footer__copy">© {year} PetMi Hub</p>
      </div>
    </footer>
  );
};

export default HubLandingFooter;
