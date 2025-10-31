import React, { useState } from 'react';
import { validatePassword } from '../utils/validators';

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  showStrength?: boolean;
  showRequirements?: boolean;
}

const PasswordInput: React.FC<PasswordInputProps> = ({ 
  value, 
  onChange, 
  placeholder = 'Digite sua senha',
  showStrength = true,
  showRequirements = true
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const validation = validatePassword(value);
  
  const getStrengthColor = () => {
    switch (validation.strength) {
      case 'strong': return '#22c55e';
      case 'medium': return '#f59e0b';
      default: return '#ef4444';
    }
  };
  
  const getStrengthText = () => {
    switch (validation.strength) {
      case 'strong': return 'Forte';
      case 'medium': return 'Média';
      default: return 'Fraca';
    }
  };
  
  return (
    <div className="password-input-container">
      <div className="password-input-wrapper">
        <input
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="input password-input"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="password-toggle-btn"
          aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
        >
          {showPassword ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          )}
        </button>
      </div>
      
      {showStrength && value.length > 0 && (
        <div className="password-strength-container">
          <div className="password-strength-bar">
            <div 
              className="password-strength-fill" 
              style={{ 
                width: validation.strength === 'strong' ? '100%' : validation.strength === 'medium' ? '66%' : '33%',
                backgroundColor: getStrengthColor()
              }}
            />
          </div>
          <span className="password-strength-text" style={{ color: getStrengthColor() }}>
            {getStrengthText()}
          </span>
        </div>
      )}
      
      {showRequirements && value.length > 0 && validation.errors.length > 0 && (
        <div className="password-requirements">
          <p className="text-sm font-medium text-neutral-700 mb-2">Requisitos:</p>
          <ul className="password-requirements-list">
            <li className={value.length >= 8 ? 'valid' : 'invalid'}>
              {value.length >= 8 ? '✓' : '○'} Mínimo de 8 caracteres
            </li>
            <li className={/[A-Z]/.test(value) ? 'valid' : 'invalid'}>
              {/[A-Z]/.test(value) ? '✓' : '○'} Pelo menos 1 letra maiúscula
            </li>
            <li className={/[0-9]/.test(value) ? 'valid' : 'invalid'}>
              {/[0-9]/.test(value) ? '✓' : '○'} Pelo menos 1 número
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default PasswordInput;

