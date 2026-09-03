import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { hubClinicSettingsApi } from '../../api/hubClinicSettingsApi';
import {
  DEFAULT_TEMPLATES,
  TEMPLATE_LABELS,
  TEMPLATE_VARS,
  renderTemplate,
  type MessageTemplateKey,
} from '../../utils/hubMessageTemplates';
import { useAlert } from '../../components/AlertProvider';
import '../clientes/clientes.css';
import './hub-message-templates.css';

type TemplateGroup = {
  label: string;
  keys: MessageTemplateKey[];
};

const TEMPLATE_GROUPS: TemplateGroup[] = [
  {
    label: 'Operacional',
    keys: ['pet_ready', 'pet_on_the_way', 'appointment_reminder'],
  },
  {
    label: 'Clínico',
    keys: ['exam_order_share', 'specialist_referral_share', 'prescription_share'],
  },
];

const PREVIEW_VARS: Record<MessageTemplateKey, Record<string, string>> = {
  pet_ready: { tutor: 'Maria', pet: 'Rex', clinica: 'PetMi Clínica' },
  pet_on_the_way: { tutor: 'João', pet: 'Bolinha' },
  appointment_reminder: { tutor: 'Ana', pet: 'Mel', data: '28/06/2026', hora: '14h30' },
  exam_order_share: { tutor: 'Maria', pet: 'Thor', link: 'https://hub.petimi.app/solicitacao-exame/abc123' },
  specialist_referral_share: { tutor: 'Maria', pet: 'Thor', link: 'https://hub.petimi.app/encaminhamento/abc123' },
  prescription_share: { tutor: 'Maria', pet: 'Thor', link: 'https://hub.petimi.app/receita/abc123' },
};

function insertAtCursor(
  value: string,
  insert: string,
  start: number,
  end: number,
): { next: string; caret: number } {
  const next = `${value.slice(0, start)}${insert}${value.slice(end)}`;
  return { next, caret: start + insert.length };
}

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
  const textareaRefs = useRef<Partial<Record<MessageTemplateKey, HTMLTextAreaElement | null>>>({});

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    if (!clinicId || !canRead) return;
    setLoading(true);
    try {
      const res = await hubClinicSettingsApi.get(clinicId);
      if (signal?.cancelled) return;
      const tpl = res.settings.message_templates ?? {};
      setOverrides(tpl);
      setDrafts(tpl);
    } catch (e: unknown) {
      if (signal?.cancelled) return;
      showError((e as Error)?.message || 'Erro ao carregar templates');
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
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao restaurar template');
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  };

  const insertVar = (key: MessageTemplateKey, varName: string) => {
    if (!canWrite) return;
    const el = textareaRefs.current[key];
    const current = drafts[key] ?? '';
    const token = `{${varName}}`;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const { next, caret } = insertAtCursor(current, token, start, end);
    setDrafts((d) => ({ ...d, [key]: next }));
    requestAnimationFrame(() => {
      const ta = textareaRefs.current[key];
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(caret, caret);
    });
  };

  if (!canRead) {
    return (
      <div className="hub-mt__empty">
        <p className="hub-clientes__muted">Sem permissão para visualizar configurações.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="hub-mt__loading">
        <p className="hub-clientes__muted">Carregando templates…</p>
      </div>
    );
  }

  return (
    <div className="hub-mt">
      <header className="hub-mt__intro">
        <h2 className="hub-mt__intro-title">Templates de mensagem</h2>
        <p className="hub-mt__intro-text">
          Personalize os textos pré-preenchidos enviados pelo WhatsApp aos tutores. O texto é só uma
          sugestão — o operador ainda precisa clicar para enviar. Clique em uma variável para
          inseri-la no texto.
        </p>
      </header>

      <div className="hub-mt__groups">
        {TEMPLATE_GROUPS.map((group) => (
          <section key={group.label} aria-labelledby={`hub-mt-group-${group.label}`}>
            <span className="hub-mt__group-label" id={`hub-mt-group-${group.label}`}>
              {group.label}
            </span>
            <div className="hub-mt__list">
              {group.keys.map((key) => {
                const isSaving = saving[key] ?? false;
                const hasCustom = Boolean(overrides[key]);
                const draftValue = drafts[key] ?? '';
                const savedValue = overrides[key] ?? '';
                const isDirty = draftValue !== savedValue;
                const previewText = renderTemplate(
                  key,
                  PREVIEW_VARS[key] as Parameters<typeof renderTemplate>[1],
                  draftValue ? { [key]: draftValue } : undefined,
                );

                return (
                  <article
                    key={key}
                    className={`hub-mt__card${isDirty ? ' hub-mt__card--dirty' : ''}`}
                  >
                    <div className="hub-mt__card-header">
                      <div className="hub-mt__card-icon" aria-hidden>
                        <MessageSquare size={18} strokeWidth={1.75} />
                      </div>
                      <div className="hub-mt__card-heading">
                        <div className="hub-mt__card-title-row">
                          <h3 className="hub-mt__card-title">{TEMPLATE_LABELS[key]}</h3>
                          {hasCustom && (
                            <span className="hub-mt__badge hub-mt__badge--custom">Personalizado</span>
                          )}
                          {isDirty && (
                            <span className="hub-mt__badge hub-mt__badge--dirty">Não salvo</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="hub-mt__card-body">
                      <div className="hub-mt__vars">
                        <span className="hub-mt__vars-label">Variáveis</span>
                        {TEMPLATE_VARS[key].map((v) => (
                          <button
                            key={v}
                            type="button"
                            className="hub-mt__chip"
                            disabled={!canWrite || isSaving}
                            title={canWrite ? `Inserir {${v}}` : `{${v}}`}
                            onClick={() => insertVar(key, v)}
                          >
                            {`{${v}}`}
                          </button>
                        ))}
                      </div>

                      <textarea
                        ref={(el) => {
                          textareaRefs.current[key] = el;
                        }}
                        className="hub-mt__textarea"
                        rows={3}
                        disabled={!canWrite || isSaving}
                        placeholder={DEFAULT_TEMPLATES[key]}
                        value={draftValue}
                        onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                        aria-label={TEMPLATE_LABELS[key]}
                      />

                      <div className="hub-mt__preview">
                        <p className="hub-mt__preview-label">Pré-visualização</p>
                        <p className="hub-mt__preview-bubble">{previewText}</p>
                      </div>

                      {canWrite && (
                        <div className="hub-mt__actions">
                          <button
                            type="button"
                            className="hub-clientes__btn hub-clientes__btn--primary"
                            disabled={isSaving || !isDirty}
                            onClick={() => void handleSave(key)}
                          >
                            {isSaving ? 'Salvando…' : 'Salvar'}
                          </button>
                          {isDirty && (
                            <button
                              type="button"
                              className="hub-clientes__btn hub-clientes__btn--ghost"
                              disabled={isSaving}
                              onClick={() =>
                                setDrafts((d) => ({ ...d, [key]: overrides[key] ?? '' }))
                              }
                            >
                              Descartar
                            </button>
                          )}
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
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default HubMessageTemplatesPage;
