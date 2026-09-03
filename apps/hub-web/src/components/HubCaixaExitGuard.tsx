import React from 'react';
import { useCaixaExitGuard } from '../hooks/useCaixaExitGuard';

/**
 * Host do modal de saída do caixa.
 * Componente separado (não só um hook no shell) para garantir que o consumo do
 * HubCashSessionContext ocorra sempre como filho do Provider.
 */
export const HubCaixaExitGuard: React.FC = () => {
  const { ExitGuardModal } = useCaixaExitGuard();
  return <ExitGuardModal />;
};

export default HubCaixaExitGuard;
