import React from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';

export type AlertType = 'success' | 'error' | 'warning' | 'info';

export interface AlertProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  type?: AlertType;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  showCancel?: boolean;
}

const Alert: React.FC<AlertProps> = ({
  isOpen,
  onClose,
  title,
  message,
  type = 'info',
  confirmText = 'OK',
  cancelText = 'Cancelar',
  onConfirm,
  showCancel = false,
}) => {
  if (!isOpen) return null;

  const meta = (() => {
    switch (type) {
      case 'success':
        return { Icon: CheckCircle, color: '#10b981', bgColor: '#d1fae5' };
      case 'error':
        return { Icon: XCircle, color: '#ef4444', bgColor: '#fee2e2' };
      case 'warning':
        return { Icon: AlertTriangle, color: '#f59e0b', bgColor: '#fef3c7' };
      default:
        return { Icon: Info, color: '#6366f1', bgColor: '#ede9fe' };
    }
  })();
  const { Icon, color, bgColor } = meta;

  const handleConfirm = () => {
    onConfirm?.();
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: 16,
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: 16,
          padding: 32,
          maxWidth: 440,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: bgColor,
            color,
          }}
        >
          <Icon size={32} />
        </div>
        <div style={{ textAlign: 'center', width: '100%' }}>
          {title && <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 600 }}>{title}</h3>}
          <p style={{ margin: 0, fontSize: 15, color: '#525252', lineHeight: 1.6 }}>{message}</p>
        </div>
        <div style={{ display: 'flex', gap: 12, width: '100%' }}>
          {showCancel && (
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '12px 24px',
                borderRadius: 8,
                border: '1px solid #e5e5e5',
                background: '#fafafa',
                cursor: 'pointer',
              }}
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            style={{
              flex: 1,
              padding: '12px 24px',
              borderRadius: 8,
              border: 'none',
              background: color,
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Alert;
