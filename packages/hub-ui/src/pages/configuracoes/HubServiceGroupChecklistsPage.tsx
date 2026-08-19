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
import './hub-checklists.css';

type DraftItem = ChecklistTemplateItem & { draftKey: string };

let draftKeyCounter = 0;
function nextDraftKey() {
  draftKeyCounter += 1;
  return `draft_${draftKeyCounter}`;
}

function toDraftItems(items: ChecklistTemplateItem[]): DraftItem[] {
  return items.map((item) => ({ ...item, draftKey: nextDraftKey() }));
}

function groupAccent(group: ServiceGroupChecklistRow): string {
  return resolveServiceAccentColor(group.slug, group.color);
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

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    if (!clinicId || !canRead) return;
    setLoading(true);
    try {
      const res = await hubServiceGroupChecklistApi.list(clinicId);
      if (signal?.cancelled) return;
      const nextGroups = res.groups ?? [];
      setGroups(nextGroups);
      setSelectedSlug((prev) => {
        if (prev && nextGroups.some((g) => g.slug === prev)) return prev;
        return nextGroups[0]?.slug ?? '';
      });
    } catch (e: unknown) {
      if (signal?.cancelled) return;
      showError((e as Error)?.message || 'Erro ao carregar checklists');
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
      <div className="hub-cl__state">
        <p className="hub-clientes__muted">Sem permissão para visualizar configurações.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="hub-cl__state">
        <p className="hub-clientes__muted">Carregando checklists…</p>
      </div>
    );
  }

  if (!groups.length) {
    return (
      <div className="hub-cl__state">
        <p className="hub-clientes__muted">Nenhum grupo de serviço encontrado.</p>
      </div>
    );
  }

  const accent = selectedGroup ? groupAccent(selectedGroup) : '#78909c';
  const softFill = hexToSoftFill(accent);
  const canRestore =
    Boolean(selectedGroup?.is_custom) || Boolean(selectedGroup?.has_system_default);

  return (
    <div className="hub-cl">
      <header className="hub-cl__intro">
        <h2 className="hub-cl__intro-title">Checklists operacionais</h2>
        <p className="hub-cl__intro-text">
          Personalize os itens usados durante o atendimento. Hoje, apenas Banho &amp; Tosa exibe
          checklist na fila; os demais grupos ficam prontos para quando seus módulos forem
          integrados.
        </p>
      </header>

      <div className="hub-cl__groups" role="tablist" aria-label="Grupos de serviço">
        {groups.map((group) => {
          const groupColor = groupAccent(group);
          const active = group.slug === selectedSlug;
          return (
            <button
              key={group.slug}
              type="button"
              role="tab"
              aria-selected={active}
              className={`hub-cl__group-tab${active ? ' hub-cl__group-tab--active' : ''}`}
              style={active ? ({ ['--hub-cl-accent' as string]: groupColor } as React.CSSProperties) : undefined}
              onClick={() => setSelectedSlug(group.slug)}
            >
              <span
                className="hub-cl__group-tab-icon"
                style={{ background: hexToSoftFill(groupColor), color: groupColor }}
              >
                <ServiceGroupIcon group={group.slug} color={groupColor} size={16} />
              </span>
              <span className="hub-cl__group-tab-meta">
                <span className="hub-cl__group-tab-name">{group.name}</span>
                <span className="hub-cl__group-tab-hint">
                  {group.is_custom ? 'Personalizado' : 'Padrão'}
                  {' · '}
                  {group.items.length} {group.items.length === 1 ? 'item' : 'itens'}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {selectedGroup ? (
        <div
          className={`hub-cl__editor${isDirty ? ' hub-cl__editor--dirty' : ''}`}
          style={{ ['--hub-cl-accent' as string]: accent } as React.CSSProperties}
        >
          <div className="hub-cl__editor-header">
            <span className="hub-cl__editor-icon" style={{ background: softFill, color: accent }}>
              <ServiceGroupIcon group={selectedGroup.slug} color={accent} size={18} />
            </span>
            <div className="hub-cl__editor-heading">
              <div className="hub-cl__editor-title-row">
                <h3 className="hub-cl__editor-title">{selectedGroup.name}</h3>
                {selectedGroup.is_custom && (
                  <span className="hub-cl__badge hub-cl__badge--custom">Personalizado</span>
                )}
                {isDirty && <span className="hub-cl__badge hub-cl__badge--dirty">Não salvo</span>}
              </div>
              <p className="hub-cl__editor-sub">
                {selectedGroup.is_custom ? 'Checklist personalizado da clínica' : 'Usando padrão do sistema'}
                {selectedGroup.has_system_default ? ' · é possível restaurar o padrão' : ''}
              </p>
            </div>
          </div>

          <div className="hub-cl__editor-body">
            {draftItems.length === 0 ? (
              <p className="hub-cl__empty-items">
                Nenhum item configurado. Adicione itens ou salve a lista vazia para ocultar o
                checklist na operação.
              </p>
            ) : (
              <ul className="hub-cl__items">
                {draftItems.map((item, index) => (
                  <li key={item.draftKey} className="hub-cl__item">
                    <div className="hub-cl__item-order">
                      <button
                        type="button"
                        className="hub-cl__icon-btn"
                        disabled={!canWrite || index === 0}
                        onClick={() => moveItem(index, -1)}
                        aria-label="Mover para cima"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="hub-cl__icon-btn"
                        disabled={!canWrite || index === draftItems.length - 1}
                        onClick={() => moveItem(index, 1)}
                        aria-label="Mover para baixo"
                      >
                        <ArrowDown size={14} />
                      </button>
                    </div>

                    <input
                      className="hub-cl__item-input"
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
                      aria-label={`Item ${index + 1}`}
                    />

                    <HubCheckbox
                      className="hub-cl__item-check"
                      checked={Boolean(item.default_checked)}
                      disabled={!canWrite}
                      onChange={(checked) =>
                        setDraftItems((items) =>
                          items.map((row) =>
                            row.draftKey === item.draftKey
                              ? { ...row, default_checked: checked }
                              : row,
                          ),
                        )
                      }
                    >
                      Marcado por padrão
                    </HubCheckbox>

                    <button
                      type="button"
                      className="hub-cl__icon-btn hub-cl__icon-btn--danger hub-cl__item-delete"
                      disabled={!canWrite}
                      onClick={() => handleRemoveItem(item.draftKey)}
                      aria-label="Remover item"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {canWrite && (
              <button type="button" className="hub-cl__add-btn" onClick={handleAddItem}>
                <Plus size={16} />
                Adicionar item
              </button>
            )}

            {canWrite && (
              <div className="hub-cl__actions">
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary"
                  disabled={saving || !isDirty}
                  onClick={() => void handleSave()}
                >
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
                {isDirty && (
                  <button
                    type="button"
                    className="hub-clientes__btn hub-clientes__btn--ghost"
                    disabled={saving}
                    onClick={handleDiscard}
                  >
                    Descartar
                  </button>
                )}
                {canRestore && (
                  <button
                    type="button"
                    className="hub-clientes__btn hub-clientes__btn--ghost"
                    disabled={restoring || saving}
                    onClick={() => void handleRestoreDefault()}
                  >
                    {restoring ? 'Restaurando…' : 'Restaurar padrão'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default HubServiceGroupChecklistsPage;
