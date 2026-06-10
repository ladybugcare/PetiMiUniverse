import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';
import { shouldShowUnitIncompleteHint } from '../utils/hubOnboardingState';

/** Lembrete não bloqueante — completar dados opcionais da unidade (entrega futura). */
const HubUnitIncompleteBanner: React.FC = () => {
  const [, setHintTick] = useState(0);
  useEffect(() => {
    const onHintUpdated = () => setHintTick((n) => n + 1);
    window.addEventListener('petimi:hub-unit-hint-updated', onHintUpdated);
    return () => window.removeEventListener('petimi:hub-unit-hint-updated', onHintUpdated);
  }, []);

  if (!shouldShowUnitIncompleteHint()) return null;

  return (
    <div
      className="hub-unit-incomplete-banner"
      role="status"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '12px 16px',
        marginBottom: 16,
        background: '#fffbeb',
        border: '1px solid #fcd34d',
        borderRadius: 10,
        fontSize: 14,
        color: '#92400e',
      }}
    >
      <Info size={18} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
      <div>
        <strong>Complete o cadastro da unidade quando puder.</strong>
        <p style={{ margin: '4px 0 0', fontWeight: 400 }}>
          Responsável técnico, telefone dedicado e outros detalhes podem ser completados no perfil da clínica.
        </p>
        <Link to="/hub/perfil-clinica" style={{ color: '#b45309', fontWeight: 600 }}>
          Ver perfil da clínica
        </Link>
      </div>
    </div>
  );
};

export default HubUnitIncompleteBanner;
