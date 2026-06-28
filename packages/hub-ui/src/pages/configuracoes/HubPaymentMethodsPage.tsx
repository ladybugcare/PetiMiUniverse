import React, { useCallback, useEffect, useState } from 'react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { hubFinancialApi, type HubPaymentMethod } from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import {
  ALL_HUB_PAYMENT_METHODS,
  HUB_PAYMENT_METHOD_LABELS,
} from '../../utils/hubPaymentMethods';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';

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

  const load = useCallback(async () => {
    if (!clinicId || !canRead) return;
    setLoading(true);
    try {
      const res = await hubFinancialApi.getPaymentMethodSettings(clinicId);
      const methods = res.accepted_payment_methods?.length
        ? res.accepted_payment_methods
        : [...ALL_HUB_PAYMENT_METHODS];
      const set = new Set(methods);
      setEnabled(set);
      setSaved(set);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar formas de pagamento');
    } finally {
      setLoading(false);
    }
  }, [clinicId, canRead, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleMethod = (method: HubPaymentMethod) => {
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

  if (!canRead) {
    return (
      <div className="hub-clientes__empty">
        <p className="hub-clientes__muted">Sem permissão para visualizar configurações financeiras.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="hub-clientes__empty">
        <p className="hub-clientes__muted">Carregando formas de pagamento…</p>
      </div>
    );
  }

  return (
    <div className="hub-servicos-config__section" style={{ maxWidth: 560 }}>
      <p className="hub-clientes__muted" style={{ marginBottom: 24 }}>
        Define quais opções aparecem no checkout e no registro de pagamentos.
        Pagamentos já registrados continuam visíveis no histórico, mesmo que a forma seja desabilitada depois.
      </p>

      <div className="hub-servicos-config__inline-form" style={{ marginBottom: 20 }}>
        <h3 className="hub-servicos-config__inline-title" style={{ marginBottom: 16 }}>
          Formas aceitas
        </h3>

        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {ALL_HUB_PAYMENT_METHODS.map((method) => (
            <li key={method}>
              <label
                style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: canWrite ? 'pointer' : 'default' }}
              >
                <input
                  type="checkbox"
                  checked={enabled.has(method)}
                  disabled={!canWrite || saving || (enabled.has(method) && enabled.size <= 1)}
                  onChange={() => toggleMethod(method)}
                />
                <span>{HUB_PAYMENT_METHOD_LABELS[method]}</span>
              </label>
            </li>
          ))}
        </ul>

        <p className="hub-clientes__muted" style={{ fontSize: 12, marginTop: 12 }}>
          Pelo menos uma forma deve permanecer habilitada.
        </p>
      </div>

      {canWrite && (
        <div className="hub-servicos-config__inline-actions">
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
              Descartar alterações
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default HubPaymentMethodsPage;
