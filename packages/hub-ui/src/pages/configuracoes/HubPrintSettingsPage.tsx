import React, { useCallback, useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import {
  hubClinicSettingsApi,
  type HubCupomWidthMm,
} from '../../api/hubClinicSettingsApi';
import { useAlert } from '../../components/AlertProvider';
import '../clientes/clientes.css';
import './hub-payment-methods.css';
import './hub-print-settings.css';

const WIDTH_OPTIONS: Array<{ value: HubCupomWidthMm; label: string; hint: string }> = [
  {
    value: 80,
    label: '80 mm',
    hint: 'Bobina mais larga — padrão em muitas impressoras de cupom',
  },
  {
    value: 58,
    label: '58 mm',
    hint: 'Bobina estreita — impressoras portáteis e alguns modelos compactos',
  },
];

const HubPrintSettingsPage: React.FC = () => {
  const { hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const { showSuccess, showError } = useAlert();

  const canRead = hasPermission('hub.appointments.read');
  const canWrite = hasPermission('hub.appointments.write');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [widthMm, setWidthMm] = useState<HubCupomWidthMm>(80);
  const [savedWidthMm, setSavedWidthMm] = useState<HubCupomWidthMm>(80);

  const load = useCallback(
    async (signal?: { cancelled: boolean }) => {
      if (!clinicId || !canRead) return;
      setLoading(true);
      try {
        const res = await hubClinicSettingsApi.get(clinicId);
        if (signal?.cancelled) return;
        const w: HubCupomWidthMm = res.settings.cupom_width_mm === 58 ? 58 : 80;
        setWidthMm(w);
        setSavedWidthMm(w);
      } catch (e: unknown) {
        if (signal?.cancelled) return;
        showError((e as Error)?.message || 'Erro ao carregar configurações de impressão');
      } finally {
        if (!signal?.cancelled) setLoading(false);
      }
    },
    [clinicId, canRead, showError],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const handleSave = async () => {
    if (!clinicId || !canWrite) return;
    setSaving(true);
    try {
      const res = await hubClinicSettingsApi.patch(clinicId, { cupom_width_mm: widthMm });
      const w: HubCupomWidthMm = res.settings.cupom_width_mm === 58 ? 58 : 80;
      setWidthMm(w);
      setSavedWidthMm(w);
      showSuccess('Configuração de impressão salva.');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar configuração de impressão');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = widthMm !== savedWidthMm;

  if (!canRead) {
    return (
      <div className="hub-pm__state">
        <p className="hub-clientes__muted">Sem permissão para visualizar configurações do sistema.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="hub-pm__state">
        <p className="hub-clientes__muted">Carregando configurações de impressão…</p>
      </div>
    );
  }

  return (
    <div className="hub-pm">
      <header className="hub-pm__intro">
        <h2 className="hub-pm__intro-title">Impressão</h2>
        <p className="hub-pm__intro-text">
          Define a largura do cupom térmico de venda usado no caixa e na ficha da comanda. O PDF A4
          da comanda não muda. Escolha conforme a bobina da impressora da clínica.
        </p>
      </header>

      <section className={`hub-pm__card${hasChanges ? ' hub-pm__card--dirty' : ''}`}>
        <div className="hub-pm__card-header">
          <div className="hub-pm__card-icon" aria-hidden>
            <Printer size={18} strokeWidth={1.75} />
          </div>
          <div className="hub-pm__card-heading">
            <div className="hub-pm__card-title-row">
              <h3 className="hub-pm__card-title">Cupom térmico</h3>
            </div>
            <p className="hub-pm__card-sub">
              Documento operacional (não fiscal). Na impressão, use a impressora térmica e evite
              “ajustar à página” se o cupom sair estreito demais.
            </p>
          </div>
        </div>

        <div className="hub-print__options" role="radiogroup" aria-label="Largura do cupom">
          {WIDTH_OPTIONS.map((opt) => {
            const selected = widthMm === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`hub-print__option${selected ? ' hub-print__option--selected' : ''}`}
                disabled={!canWrite || saving}
                onClick={() => setWidthMm(opt.value)}
              >
                <span className="hub-print__option-label">{opt.label}</span>
                <span className="hub-print__option-hint">{opt.hint}</span>
              </button>
            );
          })}
        </div>
      </section>

      {canWrite ? (
        <div className="hub-pm__footer">
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={saving || !hasChanges}
            onClick={() => void handleSave()}
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default HubPrintSettingsPage;
