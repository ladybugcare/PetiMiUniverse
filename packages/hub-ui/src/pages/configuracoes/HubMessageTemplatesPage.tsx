import React, { useCallback, useEffect, useState } from 'react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { hubClinicSettingsApi } from '../../api/hubClinicSettingsApi';
import {
  DEFAULT_TEMPLATES,
  TEMPLATE_LABELS,
  TEMPLATE_PLACEHOLDER_HINTS,
  renderTemplate,
  type MessageTemplateKey,
} from '../../utils/hubMessageTemplates';
import { useAlert } from '../../components/AlertProvider';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';

const TEMPLATE_KEYS: MessageTemplateKey[] = ['pet_ready', 'pet_on_the_way', 'appointment_reminder'];

const PREVIEW_VARS: Record<MessageTemplateKey, Record<string, string>> = {
  pet_ready: { tutor: 'Maria', pet: 'Rex', clinica: 'PetMi Clínica' },
  pet_on_the_way: { tutor: 'João', pet: 'Bolinha' },
  appointment_reminder: { tutor: 'Ana', pet: 'Mel', data: '28/06/2026', hora: '14h30' },
};

const HubMessageTemplatesPage: React.FC = () => {
  const { hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const { showSuccess, showError } = useAlert();

  const canRead = hasPermission('hub.appointments.read');
  const canWrite = hasPermission('hub.appointments.write');

  const [loading, setLoading] = useState(true);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!clinicId || !canRead) return;
    setLoading(true);
    try {
      const res = await hubClinicSettingsApi.get(clinicId);
      const tpl = res.settings.message_templates ?? {};
      setOverrides(tpl);
      setDrafts(tpl);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar templates');
    } finally {
      setLoading(false);
    }
  }, [clinicId, canRead, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (key: MessageTemplateKey) => {
    if (!clinicId || !canWrite) return;
    const draft = drafts[key]?.trim();
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      const next = { ...overrides };
      if (!draft || draft === DEFAULT_TEMPLATES[key]) {
        delete next[key];
      } else {
        next[key] = draft;
      }
      const res = await hubClinicSettingsApi.patch(clinicId, { message_templates: next });
      const saved = res.settings.message_templates ?? {};
      setOverrides(saved);
      setDrafts(saved);
      showSuccess('Template salvo com sucesso.');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar template');
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  };

  const handleRestore = async (key: MessageTemplateKey) => {
    if (!clinicId || !canWrite) return;
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      const next = { ...overrides };
      delete next[key];
      const res = await hubClinicSettingsApi.patch(clinicId, { message_templates: next });
      const saved = res.settings.message_templates ?? {};
      setOverrides(saved);
      setDrafts((d) => ({ ...d, [key]: '' }));
      showSuccess('Template restaurado ao padrão.');
      setOverrides(saved);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao restaurar template');
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  };

  const getEffectiveText = (key: MessageTemplateKey) =>
    drafts[key]?.trim() || DEFAULT_TEMPLATES[key];

  if (!canRead) {
    return (
      <div className="hub-clientes__empty">
        <p className="hub-clientes__muted">Sem permissão para visualizar configurações.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="hub-clientes__empty">
        <p className="hub-clientes__muted">Carregando templates…</p>
      </div>
    );
  }

  return (
    <div className="hub-servicos-config__section" style={{ maxWidth: 720 }}>
      <p className="hub-clientes__muted" style={{ marginBottom: 24 }}>
        Personalize os textos pré-preenchidos enviados pelo WhatsApp aos tutores. O texto é apenas
        uma sugestão — o operador ainda precisa clicar para enviar.
      </p>

      {TEMPLATE_KEYS.map((key) => {
        const isSaving = saving[key] ?? false;
        const hasCustom = Boolean(overrides[key]);
        const previewText = renderTemplate(
          key,
          PREVIEW_VARS[key] as Parameters<typeof renderTemplate>[1],
          drafts[key] ? { [key]: drafts[key] } : undefined,
        );

        return (
          <div key={key} className="hub-servicos-config__inline-form" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <h3 className="hub-servicos-config__inline-title" style={{ margin: 0, flex: 1 }}>
                {TEMPLATE_LABELS[key]}
              </h3>
              {hasCustom && (
                <span className="hub-clientes__pill hub-clientes__pill--neutral" style={{ fontSize: 11 }}>
                  Personalizado
                </span>
              )}
            </div>

            <p className="hub-clientes__muted" style={{ fontSize: 12, marginBottom: 6 }}>
              {TEMPLATE_PLACEHOLDER_HINTS[key]}
            </p>

            <textarea
              className="hub-input"
              rows={3}
              disabled={!canWrite || isSaving}
              placeholder={DEFAULT_TEMPLATES[key]}
              value={drafts[key] ?? ''}
              onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
              style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', marginBottom: 8 }}
            />

            <div
              className="hub-servicos-config__inline-form"
              style={{ background: 'var(--hc-surface, #f8f7f7)', padding: '10px 12px', marginBottom: 10 }}
            >
              <p className="hub-clientes__muted" style={{ fontSize: 11, margin: '0 0 4px' }}>
                Pré-visualização (com dados de exemplo):
              </p>
              <p style={{ margin: 0, fontSize: 13 }}>{previewText}</p>
            </div>

            {canWrite && (
              <div className="hub-servicos-config__inline-actions">
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary"
                  disabled={isSaving}
                  onClick={() => void handleSave(key)}
                >
                  {isSaving ? 'Salvando…' : 'Salvar'}
                </button>
                {hasCustom && (
                  <button
                    type="button"
                    className="hub-clientes__btn hub-clientes__btn--ghost"
                    disabled={isSaving}
                    onClick={() => void handleRestore(key)}
                  >
                    Restaurar padrão
                  </button>
                )}
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--ghost"
                  disabled={isSaving}
                  onClick={() =>
                    setDrafts((d) => ({ ...d, [key]: overrides[key] ?? '' }))
                  }
                >
                  Descartar alterações
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default HubMessageTemplatesPage;
