import React, { createContext, useContext, useState, useCallback, ReactNode, useRef, useEffect } from 'react';
import Alert, { AlertType } from './Alert';
import { HubToastRegion, HubToastItemData } from './HubToast';

interface AlertOptions {
  title?: string;
  message: string;
  type?: AlertType;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  showCancel?: boolean;
}

/** Opções opcionais do terceiro argumento de `showSuccess`. */
export interface ShowSuccessToastOptions {
  durationMs?: number;
  onDismiss?: () => void;
}

interface ToastEntry extends HubToastItemData {
  durationMs: number;
  onDismiss?: () => void;
}

interface AlertContextType {
  showAlert: (options: AlertOptions) => void;
  showSuccess: (message: string, title?: string, options?: ShowSuccessToastOptions) => void;
  showError: (message: string, title?: string) => void;
  showWarning: (message: string, title?: string) => void;
  showInfo: (message: string, title?: string) => void;
  showConfirm: (message: string, onConfirm: () => void, title?: string) => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

const DEFAULT_TOAST_MS = 4500;

export const AlertProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [alertState, setAlertState] = useState<AlertOptions & { isOpen: boolean }>({
    isOpen: false,
    message: '',
    type: 'info',
  });
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const alertIdRef = useRef(0);
  const toastIdRef = useRef(0);
  const toastTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const isClosingRef = useRef(false);

  const dismissToast = useCallback((id: number) => {
    const t = toastTimeoutsRef.current.get(id);
    if (t) {
      clearTimeout(t);
      toastTimeoutsRef.current.delete(id);
    }
    setToasts((prev) => {
      const item = prev.find((x) => x.id === id);
      if (item?.onDismiss) {
        try {
          item.onDismiss();
        } catch (e) {
          console.error('[hub-ui AlertProvider] onDismiss toast:', e);
        }
      }
      return prev.filter((x) => x.id !== id);
    });
  }, []);

  const enqueueSuccessToast = useCallback(
    (message: string, title: string | undefined, durationMs: number, onDismiss?: () => void) => {
      const id = ++toastIdRef.current;
      const entry: ToastEntry = { id, message, title, durationMs, onDismiss };
      setToasts((prev) => [...prev, entry]);
      const timer = setTimeout(() => {
        toastTimeoutsRef.current.delete(id);
        dismissToast(id);
      }, durationMs);
      toastTimeoutsRef.current.set(id, timer);
    },
    [dismissToast],
  );

  useEffect(() => {
    return () => {
      toastTimeoutsRef.current.forEach(clearTimeout);
      toastTimeoutsRef.current.clear();
    };
  }, []);

  const openModal = useCallback((options: AlertOptions) => {
    alertIdRef.current += 1;
    isClosingRef.current = false;
    setAlertState({ ...options, isOpen: true });
  }, []);

  const showAlert = useCallback(
    (options: AlertOptions) => {
      if (options.type === 'success' && !options.showCancel && !options.onConfirm) {
        enqueueSuccessToast(options.message, options.title, DEFAULT_TOAST_MS, undefined);
        return;
      }
      openModal(options);
    },
    [openModal, enqueueSuccessToast],
  );

  const showSuccess = useCallback(
    (message: string, title?: string, options?: ShowSuccessToastOptions) => {
      enqueueSuccessToast(
        message,
        title || 'Sucesso!',
        options?.durationMs ?? DEFAULT_TOAST_MS,
        options?.onDismiss,
      );
    },
    [enqueueSuccessToast],
  );

  const showError = useCallback(
    (message: string, title?: string) => {
      openModal({ message, title: title || 'Erro', type: 'error' });
    },
    [openModal],
  );

  const showWarning = useCallback(
    (message: string, title?: string) => {
      openModal({ message, title: title || 'Atenção', type: 'warning' });
    },
    [openModal],
  );

  const showInfo = useCallback(
    (message: string, title?: string) => {
      openModal({ message, title: title || 'Informação', type: 'info' });
    },
    [openModal],
  );

  const showConfirm = useCallback(
    (message: string, onConfirm: () => void, title?: string) => {
      openModal({
        message,
        title: title || 'Confirmação',
        type: 'warning',
        showCancel: true,
        confirmText: 'Confirmar',
        onConfirm,
      });
    },
    [openModal],
  );

  const closeAlert = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    setAlertState((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
    setTimeout(() => {
      isClosingRef.current = false;
    }, 100);
  }, []);

  useEffect(() => {
    if (alertState.isOpen && process.env.NODE_ENV === 'development') {
      console.log('[hub-ui AlertProvider] open:', alertState.message);
    }
  }, [alertState.isOpen, alertState.message]);

  const toastItems: HubToastItemData[] = toasts.map(({ id, message, title }) => ({ id, message, title }));

  return (
    <AlertContext.Provider
      value={{ showAlert, showSuccess, showError, showWarning, showInfo, showConfirm }}
    >
      {children}
      <HubToastRegion items={toastItems} onDismiss={dismissToast} />
      <Alert
        isOpen={alertState.isOpen}
        onClose={closeAlert}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
        confirmText={alertState.confirmText}
        cancelText={alertState.cancelText}
        onConfirm={alertState.onConfirm}
        onCancel={alertState.onCancel}
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
