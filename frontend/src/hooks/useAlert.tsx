import React, { createContext, useContext, useState, useCallback, ReactNode, useRef, useEffect } from 'react';
import Alert, { AlertType } from '../components/Alert';
import { CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';

interface AlertOptions {
  title?: string;
  message: string;
  type?: AlertType;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  showCancel?: boolean;
}

interface AlertContextType {
  showAlert: (options: AlertOptions) => void;
  showSuccess: (message: string, title?: string) => void;
  showError: (message: string, title?: string) => void;
  showWarning: (message: string, title?: string) => void;
  showInfo: (message: string, title?: string) => void;
  showConfirm: (message: string, onConfirm: () => void, title?: string) => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const AlertProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [alertState, setAlertState] = useState<AlertOptions & { isOpen: boolean }>({
    isOpen: false,
    message: '',
    type: 'info',
  });
  
  // Usar ref para garantir que o alerta não seja fechado acidentalmente por re-renderizações
  const alertIdRef = useRef(0);
  const isClosingRef = useRef(false);

  const showAlert = useCallback((options: AlertOptions) => {
    // Incrementar ID para garantir que cada alerta seja único
    alertIdRef.current += 1;
    const currentAlertId = alertIdRef.current;
    isClosingRef.current = false;
    
    setAlertState({
      ...options,
      isOpen: true,
    });
    
    // Log para debug (pode ser removido em produção)
    if (process.env.NODE_ENV === 'development') {
      console.log('[AlertProvider] Mostrando alerta:', { ...options, alertId: currentAlertId });
    }
  }, []);

  const showSuccess = useCallback((message: string, title?: string) => {
    showAlert({
      message,
      title: title || 'Sucesso!',
      type: 'success',
    });
  }, [showAlert]);

  const showError = useCallback((message: string, title?: string) => {
    showAlert({
      message,
      title: title || 'Erro',
      type: 'error',
    });
  }, [showAlert]);

  const showWarning = useCallback((message: string, title?: string) => {
    showAlert({
      message,
      title: title || 'Atenção',
      type: 'warning',
    });
  }, [showAlert]);

  const showInfo = useCallback((message: string, title?: string) => {
    showAlert({
      message,
      title: title || 'Informação',
      type: 'info',
    });
  }, [showAlert]);

  const showConfirm = useCallback((message: string, onConfirm: () => void, title?: string) => {
    showAlert({
      message,
      title: title || 'Confirmação',
      type: 'warning',
      showCancel: true,
      confirmText: 'Confirmar',
      onConfirm,
    });
  }, [showAlert]);

  const closeAlert = useCallback(() => {
    if (isClosingRef.current) {
      // Já está fechando, ignorar
      return;
    }
    
    isClosingRef.current = true;
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[AlertProvider] Fechando alerta');
    }
    
    setAlertState((prev) => {
      // Só fechar se realmente estiver aberto (evita fechamentos acidentais)
      if (prev.isOpen) {
        return { ...prev, isOpen: false };
      }
      return prev;
    });
    
    // Resetar flag após um pequeno delay
    setTimeout(() => {
      isClosingRef.current = false;
    }, 100);
  }, []);

  // Proteção: garantir que o alerta não seja fechado acidentalmente por mudanças de estado
  useEffect(() => {
    if (alertState.isOpen && process.env.NODE_ENV === 'development') {
      console.log('[AlertProvider] Alerta está aberto:', {
        message: alertState.message,
        title: alertState.title,
        type: alertState.type,
      });
    }
  }, [alertState.isOpen, alertState.message, alertState.title, alertState.type]);

  return (
    <AlertContext.Provider
      value={{
        showAlert,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        showConfirm,
      }}
    >
      {children}
      <Alert
        isOpen={alertState.isOpen}
        onClose={closeAlert}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
        confirmText={alertState.confirmText}
        cancelText={alertState.cancelText}
        onConfirm={alertState.onConfirm}
        showCancel={alertState.showCancel}
      />
    </AlertContext.Provider>
  );
};

export const useAlert = (): AlertContextType => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
};

