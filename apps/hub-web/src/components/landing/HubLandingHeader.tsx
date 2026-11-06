import React, { useEffect, useId, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { signupLinkState } from '../../utils/signupReturn';
import { Menu, X } from 'lucide-react';

const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const logoSrc = `${baseUrl}petmi-hub.svg`;

const HubLandingHeader: React.FC = () => {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className="hub-landing-header">
      <div className="hub-landing-header__inner">
        <Link to="/" className="hub-landing-brand" aria-label="PetMi Hub — início" onClick={close}>
          <img src={logoSrc} alt="" className="hub-landing-brand__logo" width={172} height={40} />
        </Link>

        <button
          type="button"
          className="hub-landing-menu-btn"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={22} strokeWidth={2} aria-hidden /> : <Menu size={22} strokeWidth={2} aria-hidden />}
          <span className="hub-landing-sr">{open ? 'Fechar menu' : 'Abrir menu'}</span>
        </button>

        <nav
          id={menuId}
          className={open ? 'hub-landing-nav hub-landing-nav--open' : 'hub-landing-nav'}
          aria-label="Seções e acesso"
        >
          <Link to={{ pathname: '/', hash: 'funcionalidades' }} className="hub-landing-nav__link" onClick={close}>
            Funcionalidades
          </Link>
          <Link to="/planos" className="hub-landing-nav__link" onClick={close}>
            Planos
          </Link>
          <Link to="/login" className="hub-landing-nav__link" onClick={close}>
            Entrar
          </Link>
          <Link to="/signup" state={signupLinkState(location)} className="hub-landing-nav__cta" onClick={close}>
            Criar conta
          </Link>
        </nav>
      </div>
    </header>
  );
};

export default HubLandingHeader;
