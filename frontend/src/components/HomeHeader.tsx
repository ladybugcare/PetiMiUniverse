import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

const HomeHeader: React.FC = () => {
  const [signUpOpen, setSignUpOpen] = useState(false);
  const signUpRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
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
        {/* Logo */}
        <Link to="/" className="home-header-logo">
          <img 
            src="/logo_texto_lado.png" 
            alt="PetiMi" 
            style={{ 
              height: '140px', 
              width: 'auto',
              objectFit: 'contain',
              display: 'block',
              marginTop: '-35px',
              marginBottom: '-35px',
              alignSelf: 'center'
            }}
          />
        </Link>

        {/* Right side navigation */}
        <div className="home-header-nav">
          {/* Sign Up Dropdown */}
          <div className="dropdown-wrapper" ref={signUpRef}>
            <button
              className="dropdown-button"
              onClick={() => {
                setSignUpOpen(!signUpOpen);
              }}
            >
              Sign Up
              <svg 
                className={`dropdown-arrow ${signUpOpen ? 'open' : ''}`}
                width="12" 
                height="12" 
                viewBox="0 0 12 12" 
                fill="none"
              >
                <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
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

          {/* Login Button */}
          <Link
            to="/login"
            className="dropdown-button-outline"
            style={{ textDecoration: 'none' }}
          >
            Login
          </Link>
        </div>
      </div>
    </header>
  );
};

export default HomeHeader;

