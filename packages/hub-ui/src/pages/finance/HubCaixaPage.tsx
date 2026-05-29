import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import { AlertCircle } from 'lucide-react';
import { useAlert } from '../../components/AlertProvider';
import { hubFinancialApi, type HubFinanceUnbilledItem, type HubCashSession } from '../../api/hubFinancialApi';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import './hub-finance-page.css';

const SELECTED_UNIT_KEY = 'selected_unit_id';

function getSelectedUnitId(): string | null {
  try {
    return localStorage.getItem(SELECTED_UNIT_KEY);
  } catch {
    return null;
  }
}

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

const HubCaixaPage: React.FC = () => {
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError, showSuccess } = useAlert();
  const clinicId = getStoredClinicId();
  const unitId = getSelectedUnitId();

  const [pending, setPending] = useState(0);
  const [items, setItems] = useState<HubFinanceUnbilledItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cashOpen, setCashOpen] = useState<HubCashSession | null>(null);
  const [openBal, setOpenBal] = useState('0');
  const [closeBal, setCloseBal] = useState('');
  const [movType, setMovType] = useState<'withdrawal' | 'deposit'>('withdrawal');
  const [movAmount, setMovAmount] = useState('');
  const [movNotes, setMovNotes] = useState('');

  const load = useCallback(async () => {
    if (!clinicId || !unitId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [c, list, cash] = await Promise.all([
        hubFinancialApi.getPendingBillingCount(clinicId, unitId),
        hubFinancialApi.listUnbilledCompleted(clinicId, unitId),
        hubFinancialApi.getCashSessionOpen(clinicId, unitId),
      ]);
      setPending(c);
      setItems(list);
      setCashOpen(cash.cash_session ?? null);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar caixa');
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId, showError]);

  useEffect(() => {
    if (!permLoading && hasPermission('hub.financial.read')) void load();
  }, [permLoading, hasPermission, load]);

  if (!permLoading && !hasPermission('hub.financial.read')) {
    return <Navigate to="/hub/clientes" replace />;
  }

  const shell = (children: React.ReactNode) => (
    <div className="hub-clientes hub-servicos-page hub-finance-page">
      <div className="hub-clientes__main">{children}</div>
    </div>
  );

  if (!clinicId || !unitId) {
    return shell(
      <p className="hub-clientes__muted">Selecione uma unidade no cabeçalho para usar o Caixa.</p>,
    );
  }

  const onGerarCobranca = async (row: HubFinanceUnbilledItem) => {
    if (!hasPermission('hub.receivables.create')) {
      showError('Sem permissão para gerar cobrança.');
      return;
    }
    if (!window.confirm(`Gerar cobrança de ${formatBrl(row.estimated_amount)} (${row.origin_label})?`)) return;
    try {
      await hubFinancialApi.createReceivable({
        clinic_id: clinicId,
        source_type: row.source_type,
        source_id: row.source_id,
      });
      showSuccess('Cobrança criada.');
      await load();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao gerar cobrança');
    }
  };

  const onWaive = async (row: HubFinanceUnbilledItem) => {
    if (!hasPermission('hub.financial.write')) {
      showError('Sem permissão para marcar sem cobrança (waive).');
      return;
    }
    const reason = window.prompt('Motivo para não cobrar este atendimento (mín. 3 caracteres):');
    if (!reason || reason.trim().length < 3) return;
    try {
      await hubFinancialApi.waiveBilling({
        clinic_id: clinicId,
        source_type: row.source_type,
        source_id: row.source_id,
        reason: reason.trim(),
      });
      showSuccess('Registado como sem cobrança.');
      await load();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao registar');
    }
  };

  const onOpenCash = async () => {
    if (!hasPermission('hub.cash.session')) {
      showError('Sem permissão para abrir caixa.');
      return;
    }
    const v = Number(String(openBal).replace(',', '.'));
    if (Number.isNaN(v) || v < 0) {
      showError('Saldo inicial inválido.');
      return;
    }
    try {
      await hubFinancialApi.openCashSession({ clinic_id: clinicId, unit_id: unitId, opening_balance: v });
      showSuccess('Caixa aberto.');
      await load();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao abrir caixa');
    }
  };

  const onCloseCash = async () => {
    if (!cashOpen?.id) return;
    const sessionId = cashOpen.id;
    const v = Number(String(closeBal).replace(',', '.'));
    if (Number.isNaN(v) || v < 0) {
      showError('Saldo de fecho inválido.');
      return;
    }
    try {
      await hubFinancialApi.closeCashSession(sessionId, {
        clinic_id: clinicId,
        closing_balance: v,
      });
      showSuccess('Caixa fechado.');
      setCloseBal('');
      await load();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao fechar caixa');
    }
  };

  const onCashMovement = async () => {
    if (!cashOpen?.id) return;
    if (!hasPermission('hub.cash.session')) {
      showError('Sem permissão para movimentar caixa.');
      return;
    }
    const v = Number(String(movAmount).replace(',', '.'));
    if (Number.isNaN(v) || v <= 0) {
      showError('Valor inválido.');
      return;
    }
    try {
      await hubFinancialApi.createCashMovement(cashOpen.id, {
        clinic_id: clinicId,
        movement_type: movType,
        amount: v,
        notes: movNotes.trim() || null,
      });
      showSuccess(movType === 'withdrawal' ? 'Sangria registada.' : 'Suprimento registado.');
      setMovAmount('');
      setMovNotes('');
      await load();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao registar movimento');
    }
  };

  return shell(
    <>
      <div className="hub-clientes__title-block">
        <h1 className="hub-clientes__title">Caixa</h1>
        <p className="hub-clientes__subtitle">Sessão de caixa, sangria/suprimento e atendimentos sem cobrança.</p>
      </div>

      <div className="hub-servicos__metrics" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Atendimentos sem cobrança</div>
            <div className="hub-servicos__metric-value">{loading ? '—' : String(pending)}</div>
            <div className="hub-servicos__metric-sub">Pendentes de gerar cobrança ou waive</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <AlertCircle size={22} strokeWidth={1.75} />
          </div>
        </div>
      </div>

      <section className="hub-finance-page__section">
        <h2 className="hub-clientes__form-title">Sessão de caixa</h2>
        {!cashOpen ? (
          <div className="hub-finance-page__card-panel">
            <div className="hub-clientes__field hub-finance-page__field-compact">
              <label className="hub-clientes__label" htmlFor="caixa-open-bal">
                Saldo inicial (abertura)
              </label>
              <input
                id="caixa-open-bal"
                className="hub-clientes__input"
                value={openBal}
                onChange={(e) => setOpenBal(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={() => void onOpenCash()}>
              Abrir caixa
            </button>
          </div>
        ) : (
          <div className="hub-finance-page__card-panel hub-finance-page__card-panel--stack">
            <p className="hub-clientes__muted" style={{ margin: '0 0 12px' }}>
              Caixa aberto nesta unidade.
            </p>
            <h3 className="hub-finance-page__subsection-title">Sangria / suprimento</h3>
            <div className="hub-finance-page__expense-toolbar">
              <div className="hub-clientes__field hub-finance-page__field-compact">
                <span className="hub-clientes__label">Tipo</span>
                <select
                  className="hub-clientes__select-input"
                  value={movType}
                  onChange={(e) => setMovType(e.target.value as 'withdrawal' | 'deposit')}
                  aria-label="Tipo de movimento"
                >
                  <option value="withdrawal">Sangria (retirada)</option>
                  <option value="deposit">Suprimento (entrada)</option>
                </select>
              </div>
              <div className="hub-clientes__field hub-finance-page__field-compact">
                <label className="hub-clientes__label" htmlFor="caixa-mov-amt">
                  Valor
                </label>
                <input
                  id="caixa-mov-amt"
                  className="hub-clientes__input"
                  value={movAmount}
                  onChange={(e) => setMovAmount(e.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div className="hub-clientes__field hub-finance-page__field-grow">
                <label className="hub-clientes__label" htmlFor="caixa-mov-notes">
                  Notas
                </label>
                <input
                  id="caixa-mov-notes"
                  className="hub-clientes__input"
                  value={movNotes}
                  onChange={(e) => setMovNotes(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary hub-finance-page__btn-align"
                onClick={() => void onCashMovement()}
              >
                Registar
              </button>
            </div>
            <div className="hub-finance-page__close-row">
              <div className="hub-clientes__field hub-finance-page__field-grow">
                <label className="hub-clientes__label" htmlFor="caixa-close-bal">
                  Saldo informado no fecho
                </label>
                <input
                  id="caixa-close-bal"
                  className="hub-clientes__input"
                  value={closeBal}
                  onChange={(e) => setCloseBal(e.target.value)}
                  placeholder="0,00"
                  inputMode="decimal"
                />
              </div>
              <button type="button" className="hub-clientes__btn" onClick={() => void onCloseCash()}>
                Fechar caixa
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="hub-finance-page__section">
        <h2 className="hub-clientes__form-title">Pendentes de cobrança</h2>
        {loading ? (
          <p className="hub-clientes__muted">A carregar…</p>
        ) : items.length === 0 ? (
          <p className="hub-clientes__muted">Nenhum atendimento concluído aguardando cobrança nesta unidade.</p>
        ) : (
          <div className="hub-servicos__table-wrap">
            <table className="hub-clientes__table hub-finance-page__table">
              <thead>
                <tr>
                  <th>Origem</th>
                  <th>Cliente</th>
                  <th>Pet</th>
                  <th>Data</th>
                  <th className="hub-finance-page__th-num">Valor est.</th>
                  <th className="hub-clientes__th-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={`${row.source_type}:${row.source_id}`}>
                    <td>{row.origin_label}</td>
                    <td>{row.guardian?.full_name ?? '—'}</td>
                    <td>{row.pet?.name ?? '—'}</td>
                    <td>{row.completed_at ? new Date(row.completed_at).toLocaleString('pt-BR') : '—'}</td>
                    <td className="hub-finance-page__td-num">{formatBrl(row.estimated_amount)}</td>
                    <td className="hub-clientes__td-actions">
                      <div className="hub-clientes__td-actions-inner">
                        <button
                          type="button"
                          className="hub-servicos__btn-ghost-sm"
                          onClick={() => void onGerarCobranca(row)}
                        >
                          Gerar cobrança
                        </button>
                        <button type="button" className="hub-servicos__btn-ghost-sm" onClick={() => void onWaive(row)}>
                          Sem cobrança
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>,
  );
};

export default HubCaixaPage;
