import React, { useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle, Coins, X } from 'lucide-react';
import type { HubCashSession, HubCashSessionSummary, HubFinanceDayBoardItem } from '../../api/hubFinancialApi';
import { hubFinancialApi } from '../../api/hubFinancialApi';
import { enviarComandasAbertasAoFinanceiro, contarComandasAbertasEditaveis } from './caixaHandoffUtils';
import { sumDayBoardPendingAmount, sumOpenComandasPendingAmount } from './hubCaixaSessionHistory';

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

type Step = 'resumo' | 'pendencias' | 'gaveta';

export type EncerrarTurnoDrawerProps = {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  cashSession: HubCashSession;
  cashSummary: HubCashSessionSummary | null;
  openComandas: Array<Record<string, unknown>>;
  dayBoardItems: HubFinanceDayBoardItem[];
  expectedBalance: number;
  methodsTotal: number;
  onClosed: () => void;
};

export const EncerrarTurnoDrawer: React.FC<EncerrarTurnoDrawerProps> = ({
  open,
  onClose,
  clinicId,
  cashSession,
  cashSummary,
  openComandas,
  dayBoardItems,
  expectedBalance,
  methodsTotal,
  onClosed,
}) => {
  const [step, setStep] = useState<Step>('resumo');
  const [closeBal, setCloseBal] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [handoffDone, setHandoffDone] = useState(false);

  if (!open) return null;

  const dayBoardComandaIds = new Set(
    dayBoardItems.map((item) => item.billing.comanda_id).filter(Boolean).map(String),
  );
  const dayPendingTotal = round2(
    sumDayBoardPendingAmount(dayBoardItems) +
      sumOpenComandasPendingAmount(openComandas, dayBoardComandaIds),
  );
  const openComandasCount = contarComandasAbertasEditaveis(openComandas);
  const pendingBillingCount =
    openComandasCount +
    dayBoardItems.filter((i) => !i.billing.finance_handoff_at && i.billing.receivable_status !== 'paid').length;

  const closeInformedNum = (() => {
    const t = String(closeBal).trim();
    if (!t) return null;
    const v = Number(t.replace(',', '.'));
    return Number.isNaN(v) ? null : v;
  })();
  const diffPreview =
    closeInformedNum != null
      ? Math.round((closeInformedNum - expectedBalance + Number.EPSILON) * 100) / 100
      : null;

  const handleHandoff = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const result = await enviarComandasAbertasAoFinanceiro(openComandas, clinicId);
      if (!result.success) {
        setErrorMsg(`Falha em ${result.errors.length} item(ns):\n${result.errors.join('\n')}`);
        return;
      }
      setHandoffDone(true);
      setStep('gaveta');
    } catch (e) {
      setErrorMsg((e as Error)?.message || 'Erro ao enviar pendentes.');
    } finally {
      setBusy(false);
    }
  };

  const handleClose = async () => {
    const v = closeInformedNum;
    if (v == null || v < 0) {
      setErrorMsg('Informe o saldo de fechamento.');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      if (openComandasCount > 0 && !handoffDone) {
        const result = await enviarComandasAbertasAoFinanceiro(openComandas, clinicId);
        if (!result.success) {
          setErrorMsg(`Falha ao enviar ${result.errors.length} comanda(s):\n${result.errors.join('\n')}`);
          setBusy(false);
          return;
        }
      }
      await hubFinancialApi.closeCashSession(cashSession.id, {
        clinic_id: clinicId,
        closing_balance: v,
      });
      onClosed();
    } catch (e) {
      setErrorMsg((e as Error)?.message || 'Erro ao fechar caixa.');
      setBusy(false);
    }
  };

  const stepLabel = { resumo: '1', pendencias: '2', gaveta: '3' }[step];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="encerrar-turno-title"
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
          maxWidth: 520,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.14)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 2 }}>
              Passo {stepLabel} de 3
            </div>
            <h2
              id="encerrar-turno-title"
              style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1a1a1a' }}
            >
              {step === 'resumo' && 'Resumo da sessão'}
              {step === 'pendencias' && 'Pendências a resolver'}
              {step === 'gaveta' && 'Fechar o caixa'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: '#888',
              padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Progress bar */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            marginBottom: 24,
          }}
        >
          {(['resumo', 'pendencias', 'gaveta'] as Step[]).map((s) => (
            <div
              key={s}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background:
                  s === step
                    ? '#f0642f'
                    : ['gaveta'].includes(step) && s === 'pendencias'
                      ? '#f0642f'
                      : step === 'gaveta' && s === 'resumo'
                        ? '#f0642f'
                        : step === 'pendencias' && s === 'resumo'
                          ? '#f0642f'
                          : '#e5e5e5',
              }}
            />
          ))}
        </div>

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
              whiteSpace: 'pre-line',
            }}
          >
            <AlertCircle size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} aria-hidden />
            {errorMsg}
          </div>
        )}

        {/* ── Passo 1: Resumo ── */}
        {step === 'resumo' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
              {[
                {
                  label: 'Total recebido',
                  value: formatBrl(methodsTotal),
                  tone: 'green',
                },
                {
                  label: 'A receber no dia',
                  value: formatBrl(dayPendingTotal),
                  tone: dayPendingTotal > 0 ? 'amber' : 'green',
                },
                {
                  label: 'Comandas abertas',
                  value: openComandasCount > 0 ? `${openComandasCount} em aberto` : 'Nenhuma',
                  tone: openComandasCount > 0 ? 'amber' : 'green',
                },
                {
                  label: 'Saldo esperado da gaveta',
                  value: formatBrl(expectedBalance),
                  tone: 'neutral',
                },
              ].map(({ label, value, tone }) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: tone === 'green' ? '#f0fdf4' : tone === 'amber' ? '#fffbeb' : '#fafafa',
                    border: `1px solid ${tone === 'green' ? '#bbf7d0' : tone === 'amber' ? '#fde68a' : '#e5e5e5'}`,
                  }}
                >
                  <span style={{ fontSize: 13, color: '#555' }}>{label}</span>
                  <strong
                    style={{
                      fontSize: 14,
                      color: tone === 'green' ? '#065f46' : tone === 'amber' ? '#92400e' : '#1a1a1a',
                    }}
                  >
                    {value}
                  </strong>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setStep('pendencias')}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 12,
                border: 'none',
                background: '#f0642f',
                color: '#fff',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              Próximo <ArrowRight size={16} />
            </button>
          </>
        )}

        {/* ── Passo 2: Pendências ── */}
        {step === 'pendencias' && (
          <>
            {openComandasCount === 0 && pendingBillingCount === 0 ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '14px 16px',
                  borderRadius: 10,
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  marginBottom: 24,
                  color: '#065f46',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                <CheckCircle size={18} aria-hidden />
                Nenhuma pendência — ótimo trabalho!
              </div>
            ) : (
              <div style={{ marginBottom: 20 }}>
                {openComandasCount > 0 && (
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: 10,
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      marginBottom: 12,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>
                      <Coins size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} aria-hidden />
                      {openComandasCount} comanda(s) abertas
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: '#78350f', lineHeight: 1.5 }}>
                      Serão enviadas ao financeiro como cobrança pendente.
                    </p>
                  </div>
                )}
                {dayPendingTotal > 0 && (
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: 10,
                      background: '#fafafa',
                      border: '1px solid #e5e5e5',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 4 }}>
                      {formatBrl(dayPendingTotal)} a receber no painel do dia
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: '#777', lineHeight: 1.5 }}>
                      Recebíveis pendentes / parciais — ficam no Financeiro para cobrança posterior.
                    </p>
                  </div>
                )}
              </div>
            )}

            {handoffDone ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: '#065f46',
                  fontWeight: 600,
                  fontSize: 14,
                  marginBottom: 20,
                }}
              >
                <CheckCircle size={16} aria-hidden />
                Comandas enviadas ao financeiro com sucesso.
              </div>
            ) : openComandasCount > 0 ? (
              <button
                type="button"
                onClick={() => void handleHandoff()}
                disabled={busy}
                style={{
                  width: '100%',
                  padding: '11px 16px',
                  borderRadius: 12,
                  border: '1px solid #fcd34d',
                  background: '#fffbeb',
                  color: '#92400e',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.6 : 1,
                  marginBottom: 10,
                }}
              >
                {busy ? 'Enviando…' : 'Enviar pendentes ao financeiro'}
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setStep('gaveta')}
              disabled={busy}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 12,
                border: 'none',
                background: '#f0642f',
                color: '#fff',
                fontWeight: 700,
                fontSize: 14,
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              Próximo <ArrowRight size={16} />
            </button>
          </>
        )}

        {/* ── Passo 3: Gaveta / Fechamento ── */}
        {step === 'gaveta' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: '#fafafa',
                  border: '1px solid #e5e5e5',
                }}
              >
                <span style={{ fontSize: 13, color: '#555' }}>Saldo esperado</span>
                <strong style={{ fontSize: 14 }}>{formatBrl(expectedBalance)}</strong>
              </div>

              <div>
                <label
                  htmlFor="encerrar-close-bal"
                  style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 6 }}
                >
                  Saldo contado na gaveta
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    border: '1px solid #d1d5db',
                    borderRadius: 10,
                    overflow: 'hidden',
                    background: '#fff',
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
                    id="encerrar-close-bal"
                    value={closeBal}
                    onChange={(e) => setCloseBal(e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      border: 'none',
                      outline: 'none',
                      fontSize: 14,
                    }}
                  />
                </div>
              </div>

              {diffPreview != null && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: diffPreview >= -0.009 ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${diffPreview >= -0.009 ? '#bbf7d0' : '#fecaca'}`,
                  }}
                >
                  <span style={{ fontSize: 13, color: '#555' }}>Diferença</span>
                  <strong
                    style={{
                      fontSize: 14,
                      color: diffPreview >= -0.009 ? '#065f46' : '#dc2626',
                    }}
                  >
                    {formatBrl(diffPreview)}
                  </strong>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => void handleClose()}
              disabled={busy || closeInformedNum == null}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 12,
                border: 'none',
                background: closeInformedNum == null || busy ? '#ccc' : '#f0642f',
                color: '#fff',
                fontWeight: 700,
                fontSize: 14,
                cursor: closeInformedNum == null || busy ? 'not-allowed' : 'pointer',
              }}
            >
              {busy ? 'Fechando caixa…' : 'Fechar caixa'}
            </button>
          </>
        )}

        {step !== 'resumo' && (
          <button
            type="button"
            onClick={() => setStep(step === 'gaveta' ? 'pendencias' : 'resumo')}
            disabled={busy}
            style={{
              width: '100%',
              padding: '10px 16px',
              borderRadius: 12,
              border: 'none',
              background: 'transparent',
              fontWeight: 400,
              fontSize: 13,
              cursor: 'pointer',
              color: '#888',
              marginTop: 10,
            }}
          >
            ← Voltar
          </button>
        )}
      </div>
    </div>
  );
};
