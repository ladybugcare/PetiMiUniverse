import React, { useCallback, useEffect, useState } from 'react';
import {
  Banknote,
  CreditCard,
  Landmark,
  Link2,
  QrCode,
  Wallet,
  WalletCards,
} from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { hubFinancialApi, type HubPaymentMethod } from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubCheckbox } from '../../components/HubCheckbox';
import {
  ALL_HUB_PAYMENT_METHODS,
  HUB_PAYMENT_METHOD_LABELS,
} from '../../utils/hubPaymentMethods';
import '../clientes/clientes.css';
import './hub-payment-methods.css';

const METHOD_META: Record<
  HubPaymentMethod,
  { icon: React.ReactNode; hint: string }
> = {
  pix: {
    icon: <QrCode size={18} strokeWidth={1.75} />,
    hint: 'Pagamento instantâneo via QR Code ou chave',
  },
  cash: {
    icon: <Banknote size={18} strokeWidth={1.75} />,
    hint: 'Recebimento em espécie no caixa',
  },
  credit_card: {
    icon: <CreditCard size={18} strokeWidth={1.75} />,
    hint: 'Máquina ou digitação — crédito',
  },
  debit_card: {
    icon: <WalletCards size={18} strokeWidth={1.75} />,
    hint: 'Máquina ou digitação — débito',
  },
  transfer: {
    icon: <Landmark size={18} strokeWidth={1.75} />,
    hint: 'TED, DOC ou transferência bancária',
  },
  payment_link: {
    icon: <Link2 size={18} strokeWidth={1.75} />,
    hint: 'Link enviado ao tutor para pagar online',
  },
  customer_credit: {
    icon: <Wallet size={18} strokeWidth={1.75} />,
    hint: 'Saldo ou crédito já existente do tutor',
  },
};

const HubPaymentMethodsPage: React.FC = () => {
  const { hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const { showSuccess, showError } = useAlert();

  const canRead = hasPermission('hub.financial.read');
  const canWrite = hasPermission('hub.financial.write');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState<Set<HubPaymentMethod>>(new Set(ALL_HUB_PAYMENT_METHODS));
  const [saved, setSaved] = useState<Set<HubPaymentMethod>>(new Set(ALL_HUB_PAYMENT_METHODS));

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    if (!clinicId || !canRead) return;
    setLoading(true);
    try {
      const res = await hubFinancialApi.getPaymentMethodSettings(clinicId);
      if (signal?.cancelled) return;
      const methods = res.accepted_payment_methods?.length
        ? res.accepted_payment_methods
        : [...ALL_HUB_PAYMENT_METHODS];
      const set = new Set(methods);
      setEnabled(set);
      setSaved(set);
    } catch (e: unknown) {
      if (signal?.cancelled) return;
      showError((e as Error)?.message || 'Erro ao carregar formas de pagamento');
    } finally {
      if (!signal?.cancelled) setLoading(false);
    }
  }, [clinicId, canRead, showError]);

  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const toggleMethod = (method: HubPaymentMethod) => {
    if (!canWrite || saving) return;
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(method)) {
        if (next.size <= 1) return prev;
        next.delete(method);
      } else {
        next.add(method);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!clinicId || !canWrite) return;
    if (enabled.size === 0) {
      showError('Selecione pelo menos uma forma de pagamento.');
      return;
    }
    setSaving(true);
    try {
      const methods = ALL_HUB_PAYMENT_METHODS.filter((m) => enabled.has(m));
      const res = await hubFinancialApi.patchPaymentMethodSettings(clinicId, methods);
      const set = new Set(res.accepted_payment_methods);
      setEnabled(set);
      setSaved(set);
      showSuccess('Formas de pagamento salvas com sucesso.');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar formas de pagamento');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = ALL_HUB_PAYMENT_METHODS.some(
    (m) => enabled.has(m) !== saved.has(m),
  );
  const enabledCount = enabled.size;

  if (!canRead) {
    return (
      <div className="hub-pm__state">
        <p className="hub-clientes__muted">Sem permissão para visualizar configurações financeiras.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="hub-pm__state">
        <p className="hub-clientes__muted">Carregando formas de pagamento…</p>
      </div>
    );
  }

  return (
    <div className="hub-pm">
      <header className="hub-pm__intro">
        <h2 className="hub-pm__intro-title">Formas de pagamento</h2>
        <p className="hub-pm__intro-text">
          Define quais opções aparecem no checkout e no registro de pagamentos. Pagamentos já
          registrados continuam visíveis no histórico, mesmo que a forma seja desabilitada depois.
        </p>
      </header>

      <div className={`hub-pm__card${hasChanges ? ' hub-pm__card--dirty' : ''}`}>
        <div className="hub-pm__card-header">
          <div className="hub-pm__card-icon" aria-hidden>
            <WalletCards size={18} strokeWidth={1.75} />
          </div>
          <div className="hub-pm__card-heading">
            <div className="hub-pm__card-title-row">
              <h3 className="hub-pm__card-title">Formas aceitas</h3>
              {hasChanges && <span className="hub-pm__badge hub-pm__badge--dirty">Não salvo</span>}
            </div>
            <p className="hub-pm__card-sub">
              {enabledCount} de {ALL_HUB_PAYMENT_METHODS.length}{' '}
              {enabledCount === 1 ? 'habilitada' : 'habilitadas'}
            </p>
          </div>
        </div>

        <ul className="hub-pm__list">
          {ALL_HUB_PAYMENT_METHODS.map((method) => {
            const isOn = enabled.has(method);
            const isLastEnabled = isOn && enabled.size <= 1;
            const meta = METHOD_META[method];
            return (
              <li
                key={method}
                className={`hub-pm__item${isOn ? ' hub-pm__item--on' : ' hub-pm__item--off'}${
                  !canWrite || saving || isLastEnabled ? ' hub-pm__item--locked' : ''
                }`}
                onClick={() => {
                  if (!canWrite || saving || isLastEnabled) return;
                  toggleMethod(method);
                }}
              >
                <span className="hub-pm__item-icon" aria-hidden>
                  {meta.icon}
                </span>
                <div className="hub-pm__item-body">
                  <span className="hub-pm__item-name">{HUB_PAYMENT_METHOD_LABELS[method]}</span>
                  <span className="hub-pm__item-hint">
                    {isLastEnabled
                      ? 'Pelo menos uma forma deve permanecer habilitada'
                      : meta.hint}
                  </span>
                </div>
                <div
                  className="hub-pm__item-toggle"
                  onClick={(e) => e.stopPropagation()}
                >
                  <HubCheckbox
                    checked={isOn}
                    disabled={!canWrite || saving || isLastEnabled}
                    onChange={() => toggleMethod(method)}
                    ariaLabel={HUB_PAYMENT_METHOD_LABELS[method]}
                  />
                </div>
              </li>
            );
          })}
        </ul>

        {canWrite && (
          <div className="hub-pm__footer">
            <p className="hub-pm__hint">
              Pelo menos uma forma deve permanecer habilitada no checkout.
            </p>
            <div className="hub-pm__actions">
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary"
                disabled={saving || !hasChanges}
                onClick={() => void handleSave()}
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              {hasChanges && (
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--ghost"
                  disabled={saving}
                  onClick={() => setEnabled(new Set(saved))}
                >
                  Descartar
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HubPaymentMethodsPage;
