import React, { useEffect, useState } from 'react';
import { AlertCircle, Unlock, X } from 'lucide-react';
import { hubFinancialApi } from '../../api/hubFinancialApi';

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function toInputAmount(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

export type IniciarTurnoDrawerProps = {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  unitId: string;
  lastClosingBalance?: number | null;
  onOpened: () => void | Promise<void>;
};

export const IniciarTurnoDrawer: React.FC<IniciarTurnoDrawerProps> = ({
  open,
  onClose,
  clinicId,
  unitId,
  lastClosingBalance,
  onOpened,
}) => {
  const [openBal, setOpenBal] = useState('0');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    setBusy(false);
    setOpenBal(
      lastClosingBalance != null && Number.isFinite(lastClosingBalance)
        ? toInputAmount(lastClosingBalance)
        : '0',
    );
  }, [open, lastClosingBalance]);

  if (!open) return null;

  const openingNum = (() => {
    const t = String(openBal).trim();
    if (!t) return null;
    const v = Number(t.replace(',', '.'));
    return Number.isNaN(v) || v < 0 ? null : v;
  })();

  const handleStart = async () => {
    if (openingNum == null) {
      setErrorMsg('Informe o saldo inicial da gaveta.');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      await hubFinancialApi.openCashSession({
        clinic_id: clinicId,
        unit_id: unitId,
        opening_balance: openingNum,
      });
      await onOpened();
    } catch (e) {
      setErrorMsg((e as Error)?.message || 'Erro ao iniciar o turno.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="iniciar-turno-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '20px 20px 0 0',
          padding: '28px 32px 36px',
          maxWidth: 480,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.14)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2
            id="iniciar-turno-title"
            style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1a1a1a' }}
          >
            Iniciar turno
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            disabled={busy}
            style={{
              border: 'none',
              background: 'none',
              cursor: busy ? 'not-allowed' : 'pointer',
              color: '#888',
              padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>

        <p style={{ margin: '0 0 20px', fontSize: 14, color: '#555', lineHeight: 1.5 }}>
          Informe o valor em dinheiro na gaveta para abrir o caixa deste turno.
        </p>

        {errorMsg && (
          <div
            role="alert"
            style={{
              marginBottom: 16,
              padding: '10px 14px',
              borderRadius: 10,
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              fontSize: 13,
            }}
          >
            <AlertCircle size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} aria-hidden />
            {errorMsg}
          </div>
        )}

        {lastClosingBalance != null && Number.isFinite(lastClosingBalance) && (
          <div
            style={{
              marginBottom: 16,
              padding: '10px 14px',
              borderRadius: 10,
              background: '#fafafa',
              border: '1px solid #e5e5e5',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 13,
              color: '#555',
            }}
          >
            <span>Último fechamento</span>
            <strong style={{ color: '#1a1a1a' }}>{formatBrl(lastClosingBalance)}</strong>
          </div>
        )}

        <label
          htmlFor="iniciar-open-bal"
          style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 6 }}
        >
          Saldo inicial da gaveta
        </label>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            border: '1px solid #d1d5db',
            borderRadius: 10,
            overflow: 'hidden',
            background: '#fff',
            marginBottom: 24,
          }}
        >
          <span
            style={{
              padding: '10px 12px',
              borderRight: '1px solid #e5e5e5',
              color: '#888',
              fontSize: 14,
              background: '#f9f9f9',
            }}
          >
            R$
          </span>
          <input
            id="iniciar-open-bal"
            value={openBal}
            onChange={(e) => setOpenBal(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            autoFocus
            style={{
              flex: 1,
              padding: '10px 12px',
              border: 'none',
              outline: 'none',
              fontSize: 14,
            }}
          />
        </div>

        <button
          type="button"
          onClick={() => void handleStart()}
          disabled={busy || openingNum == null}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: 12,
            border: 'none',
            background: openingNum == null || busy ? '#ccc' : '#f0642f',
            color: '#fff',
            fontWeight: 700,
            fontSize: 14,
            cursor: openingNum == null || busy ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Unlock size={16} strokeWidth={2} />
          {busy ? 'Abrindo caixa…' : 'Iniciar turno'}
        </button>
      </div>
    </div>
  );
};
