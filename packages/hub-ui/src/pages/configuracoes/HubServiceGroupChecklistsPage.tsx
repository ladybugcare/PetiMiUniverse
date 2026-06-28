import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import {
  hubServiceGroupChecklistApi,
  type ChecklistTemplateItem,
  type ServiceGroupChecklistRow,
} from '../../api/hubServiceGroupChecklistApi';
import { useAlert } from '../../components/AlertProvider';
import { HubCheckbox } from '../../components/HubCheckbox';
import { ServiceGroupIcon } from '../../components/ServiceGroupIcon';
import { hexToSoftFill, resolveServiceAccentColor } from '../../utils/serviceTypeSlug';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';

type DraftItem = ChecklistTemplateItem & { draftKey: string };

let draftKeyCounter = 0;
function nextDraftKey() {
  draftKeyCounter += 1;
  return `draft_${draftKeyCounter}`;
}

function toDraftItems(items: ChecklistTemplateItem[]): DraftItem[] {
  return items.map((item) => ({ ...item, draftKey: nextDraftKey() }));
}

const HubServiceGroupChecklistsPage: React.FC = () => {
  const { hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const { showSuccess, showError } = useAlert();

  const canRead = hasPermission('hub.service_types.read');
  const canWrite = hasPermission('hub.service_types.write');

  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<ServiceGroupChecklistRow[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.slug === selectedSlug) ?? null,
    [groups, selectedSlug],
  );

  const load = useCallback(async () => {
    if (!clinicId || !canRead) return;
    setLoading(true);
    try {
      const res = await hubServiceGroupChecklistApi.list(clinicId);
      const nextGroups = res.groups ?? [];
      setGroups(nextGroups);
      setSelectedSlug((prev) => {
        if (prev && nextGroups.some((g) => g.slug === prev)) return prev;
        return nextGroups[0]?.slug ?? '';
      });
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar checklists');
    } finally {
      setLoading(false);
    }
  }, [clinicId, canRead, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedGroup) {
      setDraftItems([]);
      return;
    }
    setDraftItems(toDraftItems(selectedGroup.items));
  }, [selectedGroup?.slug, selectedGroup?.items, selectedGroup?.is_custom]);

  const isDirty = useMemo(() => {
    if (!selectedGroup) return false;
    const normalize = (items: ChecklistTemplateItem[]) =>
      items.map(({ key, label, default_checked }) => ({
        key,
        label,
        default_checked: Boolean(default_checked),
      }));
    return JSON.stringify(normalize(draftItems)) !== JSON.stringify(normalize(selectedGroup.items));
  }, [draftItems, selectedGroup]);

  const handleAddItem = () => {
    setDraftItems((items) => [
      ...items,
      { draftKey: nextDraftKey(), key: '', label: '', default_checked: false },
    ]);
  };

  const handleRemoveItem = (draftKey: string) => {
    setDraftItems((items) => items.filter((item) => item.draftKey !== draftKey));
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    setDraftItems((items) => {
      const next = [...items];
      const target = index + direction;
      if (target < 0 || target >= next.length) return items;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSave = async () => {
    if (!clinicId || !canWrite || !selectedGroup) return;
    const payload = draftItems
      .map((item) => ({
        key: item.key.trim() || undefined,
        label: item.label.trim(),
        default_checked: Boolean(item.default_checked),
      }))
      .filter((item) => item.label.length > 0);

    setSaving(true);
    try {
      const res = await hubServiceGroupChecklistApi.put(clinicId, selectedGroup.slug, payload);
      setGroups((prev) => prev.map((g) => (g.slug === res.group.slug ? res.group : g)));
      showSuccess('Checklist salvo com sucesso.');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar checklist');
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreDefault = async () => {
    if (!clinicId || !canWrite || !selectedGroup) return;
    setRestoring(true);
    try {
      const res = await hubServiceGroupChecklistApi.deleteOverride(clinicId, selectedGroup.slug);
      setGroups((prev) => prev.map((g) => (g.slug === res.group.slug ? res.group : g)));
      showSuccess('Checklist restaurado ao padrão.');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao restaurar checklist');
    } finally {
      setRestoring(false);
    }
  };

  const handleDiscard = () => {
    if (!selectedGroup) return;
    setDraftItems(toDraftItems(selectedGroup.items));
  };

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
        <p className="hub-clientes__muted">Carregando checklists…</p>
      </div>
    );
  }

  if (!groups.length) {
    return (
      <div className="hub-clientes__empty">
        <p className="hub-clientes__muted">Nenhum grupo de serviço encontrado.</p>
      </div>
    );
  }

  const accent = selectedGroup ? resolveServiceAccentColor(selectedGroup.slug, selectedGroup.color) : '#78909c';
  const softFill = hexToSoftFill(accent);

  return (
    <div className="hub-servicos-config__section" style={{ maxWidth: 760 }}>
      <p className="hub-clientes__muted" style={{ marginBottom: 20 }}>
        Personalize os itens de checklist usados durante o atendimento operacional. Hoje, apenas o
        grupo Banho &amp; Tosa exibe checklist na fila; os demais grupos ficam prontos para quando
        seus módulos operacionais forem integrados.
      </p>

      <div className="hub-servicos-config__inline-form" style={{ marginBottom: 20 }}>
        <label className="hub-clientes__field-label" htmlFor="checklist-group-select">
          Grupo de serviço
        </label>
        <select
          id="checklist-group-select"
          className="hub-input"
          value={selectedSlug}
          onChange={(e) => setSelectedSlug(e.target.value)}
          style={{ maxWidth: 360 }}
        >
          {groups.map((group) => (
            <option key={group.slug} value={group.slug}>
              {group.name}
            </option>
          ))}
        </select>
      </div>

      {selectedGroup ? (
        <div
          className="hub-servicos-config__inline-form"
          style={{ borderLeft: `4px solid ${accent}`, paddingLeft: 16 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span
              className="hub-servicos-config__group-icon-wrap"
              style={{ background: softFill, color: accent }}
            >
              <ServiceGroupIcon group={selectedGroup.slug} color={accent} size={18} />
            </span>
            <div style={{ flex: 1 }}>
              <h3 className="hub-servicos-config__inline-title" style={{ margin: 0 }}>
                {selectedGroup.name}
              </h3>
              <p className="hub-clientes__muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                {selectedGroup.is_custom ? 'Checklist personalizado' : 'Usando padrão do sistema'}
                {selectedGroup.has_system_default ? ' · pode restaurar padrão' : ''}
              </p>
            </div>
            {selectedGroup.is_custom && (
              <span className="hub-clientes__pill hub-clientes__pill--neutral" style={{ fontSize: 11 }}>
                Personalizado
              </span>
            )}
          </div>

          {draftItems.length === 0 ? (
            <p className="hub-clientes__muted" style={{ marginBottom: 12 }}>
              Nenhum item configurado. Adicione itens ou salve a lista vazia para ocultar o checklist
              na operação.
            </p>
          ) : (
            <ul className="hub-servicos-config__checklist-editor" style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
              {draftItems.map((item, index) => (
                <li
                  key={item.draftKey}
                  className="hub-servicos-config__checklist-editor-row"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto auto',
                    gap: 8,
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--ghost"
                      disabled={!canWrite || index === 0}
                      onClick={() => moveItem(index, -1)}
                      aria-label="Mover para cima"
                      style={{ padding: 4, minWidth: 0 }}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--ghost"
                      disabled={!canWrite || index === draftItems.length - 1}
                      onClick={() => moveItem(index, 1)}
                      aria-label="Mover para baixo"
                      style={{ padding: 4, minWidth: 0 }}
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>

                  <input
                    className="hub-input"
                    type="text"
                    disabled={!canWrite}
                    placeholder="Descrição do item"
                    value={item.label}
                    onChange={(e) =>
                      setDraftItems((items) =>
                        items.map((row) =>
                          row.draftKey === item.draftKey ? { ...row, label: e.target.value } : row,
                        ),
                      )
                    }
                  />

                  <HubCheckbox
                    checked={Boolean(item.default_checked)}
                    disabled={!canWrite}
                    onChange={(checked) =>
                      setDraftItems((items) =>
                        items.map((row) =>
                          row.draftKey === item.draftKey ? { ...row, default_checked: checked } : row,
                        ),
                      )
                    }
                  >
                    Marcado por padrão
                  </HubCheckbox>

                  <button
                    type="button"
                    className="hub-clientes__btn hub-clientes__btn--ghost"
                    disabled={!canWrite}
                    onClick={() => handleRemoveItem(item.draftKey)}
                    aria-label="Remover item"
                    style={{ color: 'var(--hc-danger, #c62828)' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {canWrite && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost"
                onClick={handleAddItem}
              >
                <Plus size={16} style={{ marginRight: 6 }} />
                Adicionar item
              </button>
            </div>
          )}

          {canWrite && (
            <div className="hub-servicos-config__inline-actions">
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary"
                disabled={saving || !isDirty}
                onClick={() => void handleSave()}
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              {(selectedGroup.is_custom || selectedGroup.has_system_default) && (
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--ghost"
                  disabled={restoring}
                  onClick={() => void handleRestoreDefault()}
                >
                  {restoring ? 'Restaurando…' : 'Restaurar padrão'}
                </button>
              )}
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost"
                disabled={!isDirty || saving}
                onClick={handleDiscard}
              >
                Descartar alterações
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default HubServiceGroupChecklistsPage;
