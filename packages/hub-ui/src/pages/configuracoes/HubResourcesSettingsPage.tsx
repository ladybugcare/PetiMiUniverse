import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { apiRequest, getStoredClinicId, useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import { hubServiceGroupsApi, type HubServiceGroupRow } from '../../api/hubServiceGroupsApi';
import {
  hubResourcesApi,
  type AllocationPolicy,
  type HubResource,
  type HubResourceKind,
} from '../../api/hubResourcesApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import { ServiceGroupIcon } from '../../components/ServiceGroupIcon';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import { DEFAULT_GROUP_COLOR_HEX, hexToSoftFill, type HubServiceGroupValue } from '../../utils/serviceTypeSlug';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import './hub-resources.css';

const POLICY_OPTIONS: { value: AllocationPolicy; label: string }[] = [
  { value: 'optional', label: 'Opcional' },
  { value: 'prompt_on_start', label: 'Pedir ao iniciar' },
  { value: 'required_on_start', label: 'Obrigatório para iniciar' },
];

type UnitRow = { id: string; name: string };

function groupColor(group: HubServiceGroupRow): string {
  const raw = group.color?.trim() ?? '';
  if (/^#[0-9A-Fa-f]{6}$/.test(raw)) return raw;
  return DEFAULT_GROUP_COLOR_HEX[group.slug as HubServiceGroupValue] ?? DEFAULT_GROUP_COLOR_HEX.outros;
}

const HubResourcesSettingsPage: React.FC = () => {
  const { user, role: authRole } = useAuth();
  const { loading: permLoading, hasPermission } = usePermissions();
  const { showError, showSuccess } = useAlert();
  const clinicId = getStoredClinicId();
  const selectedUnitId = useSelectedUnitId();
  const canWrite = hasPermission('hub.service_types.write');
  const accessAllowed = hasPermission('hub.service_types.read');

  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<HubServiceGroupRow[]>([]);
  const [kinds, setKinds] = useState<HubResourceKind[]>([]);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [resources, setResources] = useState<HubResource[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [unitId, setUnitId] = useState<string>('');
  const [draftKind, setDraftKind] = useState<Record<string, string>>({});
  const [draftResource, setDraftResource] = useState<Record<string, string>>({});
  const [selectedSlug, setSelectedSlug] = useState('');

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const [groupRes, kindRes, unitRes] = await Promise.all([
        hubServiceGroupsApi.list(clinicId),
        hubResourcesApi.listKinds(clinicId),
        apiRequest(`/units/clinic/${encodeURIComponent(clinicId)}?activeOnly=true`) as Promise<{
          units?: UnitRow[];
        }>,
      ]);
      const nextGroups = (groupRes.service_groups ?? []).filter(
        (g) => !g.archived_at && g.slug !== 'leva_traz',
      );
      setGroups(nextGroups);
      setKinds(kindRes.kinds ?? []);
      const flags: Record<string, boolean> = {};
      for (const row of kindRes.settings ?? []) flags[row.service_group_slug] = row.enabled;
      setEnabled(flags);
      const nextUnits = unitRes.units ?? [];
      setUnits(nextUnits);
      setUnitId((current) => {
        if (current && nextUnits.some((u) => u.id === current)) return current;
        if (selectedUnitId && nextUnits.some((u) => u.id === selectedUnitId)) return selectedUnitId;
        return nextUnits[0]?.id ?? '';
      });
    } catch (e: unknown) {
      const message = (e as Error)?.message || '';
      showError(
        /schema cache|hub_resource/i.test(message)
          ? 'O catálogo de recursos ainda não está no banco. Execute a migration 120_create_hub_resources.sql no Supabase.'
          : message || 'Erro ao carregar recursos',
      );
    } finally {
      setLoading(false);
    }
  }, [clinicId, selectedUnitId, showError]);

  const loadResources = useCallback(async () => {
    if (!clinicId || !unitId) {
      setResources([]);
      return;
    }
    try {
      const res = await hubResourcesApi.list({ clinicId, unitId, includeInactive: true });
      setResources(res.resources ?? []);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar recursos da unidade');
    }
  }, [clinicId, unitId, showError]);

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) redirectAwayFromHub(authRole as AppRole);
  }, [permLoading, accessAllowed, authRole]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    void load();
  }, [clinicId, accessAllowed, load]);

  useEffect(() => {
    if (!accessAllowed) return;
    void loadResources();
  }, [accessAllowed, loadResources]);

  const unitOptions = useMemo(
    () => units.map((u) => ({ value: u.id, label: u.name })),
    [units],
  );

  useEffect(() => {
    setSelectedSlug((prev) => {
      if (prev && groups.some((g) => g.slug === prev)) return prev;
      return groups.find((g) => g.slug === 'banho_tosa')?.slug ?? groups[0]?.slug ?? '';
    });
  }, [groups]);

  const toggleGroup = async (slug: string, next: boolean) => {
    if (!clinicId || !canWrite) return;
    setEnabled((prev) => ({ ...prev, [slug]: next }));
    try {
      await hubResourcesApi.putGroupSetting({ clinic_id: clinicId, service_group_slug: slug, enabled: next });
    } catch (e: unknown) {
      setEnabled((prev) => ({ ...prev, [slug]: !next }));
      showError((e as Error)?.message || 'Erro ao salvar o grupo');
    }
  };

  const addKind = async (slug: string) => {
    if (!clinicId || !canWrite) return;
    const name = (draftKind[slug] ?? '').trim();
    if (!name) return;
    try {
      const res = await hubResourcesApi.createKind({
        clinic_id: clinicId,
        service_group_slug: slug,
        name,
        allocation_policy: 'prompt_on_start',
      });
      setKinds((prev) => [...prev, res.kind]);
      setDraftKind((prev) => ({ ...prev, [slug]: '' }));
      if (!enabled[slug]) await toggleGroup(slug, true);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao criar o tipo');
    }
  };

  const addResource = async (kindId: string) => {
    if (!clinicId || !unitId || !canWrite) return;
    const name = (draftResource[kindId] ?? '').trim();
    if (!name) return;
    try {
      const res = await hubResourcesApi.create({
        clinic_id: clinicId,
        unit_id: unitId,
        resource_kind_id: kindId,
        name,
      });
      setResources((prev) => [...prev, res.resource]);
      setDraftResource((prev) => ({ ...prev, [kindId]: '' }));
      showSuccess('Recurso cadastrado');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao cadastrar o recurso');
    }
  };

  if (!user) return <Navigate to="/login" replace />;
  if (permLoading || loading) {
    return (
      <div className="hub-res__state">
        <HubLoading variant="block" />
      </div>
    );
  }

  const selected = groups.find((g) => g.slug === selectedSlug) ?? null;
  const accent = selected ? groupColor(selected) : '#78909c';
  const selectedKinds = selected
    ? kinds.filter((k) => k.service_group_slug === selected.slug && k.active)
    : [];
  const catalogOn = selected ? Boolean(enabled[selected.slug]) : false;

  return (
    <div className="hub-res">
      <header className="hub-res__intro">
        <h2 className="hub-res__intro-title">Recursos da unidade</h2>
        <p className="hub-res__intro-text">
          Cadastre banheiras, mesas, consultórios ou blocos. No agendamento a escolha pode ficar para a hora
          do atendimento. Leva e Traz continua na frota.
        </p>
      </header>

      <div className="hub-res__unit">
        <label className="hub-res__unit-label" htmlFor="hub-resources-unit">
          Unidade
        </label>
        <HubSearchableCombobox
          id="hub-resources-unit"
          options={unitOptions}
          value={unitId}
          onChange={setUnitId}
          placeholder="Selecione a unidade"
          clearable={false}
          ariaLabel="Unidade dos recursos"
        />
      </div>

      {groups.length === 0 ? (
        <p className="hub-res__empty">Nenhum grupo de serviço encontrado.</p>
      ) : (
        <>
          <div className="hub-res__groups" role="tablist" aria-label="Grupos de serviço">
            {groups.map((group) => {
              const color = groupColor(group);
              const active = group.slug === selectedSlug;
              const on = Boolean(enabled[group.slug]);
              const kindIds = new Set(
                kinds.filter((k) => k.service_group_slug === group.slug).map((k) => k.id),
              );
              const count = resources.filter((r) => r.active && kindIds.has(r.resource_kind_id)).length;
              return (
                <button
                  key={group.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`hub-res__group-tab${active ? ' hub-res__group-tab--active' : ''}`}
                  style={active ? ({ ['--hub-res-accent' as string]: color } as React.CSSProperties) : undefined}
                  onClick={() => setSelectedSlug(group.slug)}
                >
                  <span
                    className="hub-res__group-tab-icon"
                    style={{ background: hexToSoftFill(color), color }}
                  >
                    <ServiceGroupIcon group={group.slug} color={color} size={16} />
                  </span>
                  <span className="hub-res__group-tab-meta">
                    <span className="hub-res__group-tab-name">{group.name}</span>
                    <span className="hub-res__group-tab-hint">
                      {on ? `${count} ${count === 1 ? 'ativo' : 'ativos'}` : 'Desligado'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {selected ? (
            <section
              className="hub-res__editor"
              style={{ ['--hub-res-accent' as string]: accent } as React.CSSProperties}
            >
              <div className="hub-res__editor-header">
                <span className="hub-res__editor-icon" style={{ background: hexToSoftFill(accent), color: accent }}>
                  <ServiceGroupIcon group={selected.slug} color={accent} size={18} />
                </span>
                <div className="hub-res__editor-heading">
                  <h3 className="hub-res__editor-title">{selected.name}</h3>
                  <p className="hub-res__editor-sub">
                    {catalogOn
                      ? 'A agenda lista os equipamentos desta unidade.'
                      : 'Desligado, o agendamento só anota o recurso por escrito.'}
                  </p>
                </div>
                <label className="hub-res__switch-wrap">
                  <span>Catálogo</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={catalogOn}
                    className={`hub-res__switch${catalogOn ? ' hub-res__switch--on' : ''}`}
                    disabled={!canWrite}
                    onClick={() => void toggleGroup(selected.slug, !catalogOn)}
                  />
                </label>
              </div>

              {catalogOn ? (
                <div className="hub-res__editor-body">
                  {selectedKinds.length === 0 ? (
                    <p className="hub-res__empty">
                      Nenhum tipo ainda. O tipo é o nome que aparece na tela, como Banheira ou Consultório.
                    </p>
                  ) : (
                    selectedKinds.map((kind) => {
                      const rows = resources.filter((r) => r.resource_kind_id === kind.id);
                      return (
                        <article key={kind.id} className="hub-res__kind">
                          <div className="hub-res__kind-head">
                            <h4 className="hub-res__kind-name">{kind.name}</h4>
                            <div className="hub-res__policy">
                              <HubSearchableCombobox
                                id={`hub-res-policy-${kind.id}`}
                                options={POLICY_OPTIONS}
                                value={kind.allocation_policy}
                                disabled={!canWrite}
                                clearable={false}
                                ariaLabel={`Política de ${kind.name}`}
                                searchPlaceholder="Buscar política"
                                onChange={(next) => {
                                  const allocation_policy = next as AllocationPolicy;
                                  if (!allocation_policy || allocation_policy === kind.allocation_policy) return;
                                  setKinds((prev) =>
                                    prev.map((k) => (k.id === kind.id ? { ...k, allocation_policy } : k)),
                                  );
                                  if (!clinicId) return;
                                  void hubResourcesApi
                                    .patchKind(kind.id, { clinic_id: clinicId, allocation_policy })
                                    .catch((err: unknown) =>
                                      showError((err as Error)?.message || 'Erro ao salvar a política'),
                                    );
                                }}
                              />
                            </div>
                            {canWrite ? (
                              <button
                                type="button"
                                className="hub-res__icon-btn hub-res__icon-btn--danger"
                                aria-label={`Excluir tipo ${kind.name}`}
                                onClick={() => {
                                  if (!clinicId) return;
                                  void hubResourcesApi
                                    .deleteKind(kind.id, clinicId)
                                    .then(() => {
                                      setKinds((prev) => prev.filter((k) => k.id !== kind.id));
                                      setResources((prev) => prev.filter((r) => r.resource_kind_id !== kind.id));
                                    })
                                    .catch((err: unknown) =>
                                      showError((err as Error)?.message || 'Erro ao excluir o tipo'),
                                    );
                                }}
                              >
                                <Trash2 size={16} />
                              </button>
                            ) : null}
                          </div>

                          {rows.length === 0 ? (
                            <p className="hub-res__kind-empty">Nenhum equipamento nesta unidade.</p>
                          ) : (
                            <ul className="hub-res__resources">
                              {rows.map((row) => (
                                <li
                                  key={row.id}
                                  className={`hub-res__resource${row.active ? '' : ' hub-res__resource--off'}`}
                                >
                                  <span className="hub-res__resource-name">{row.name}</span>
                                  {!row.active ? <span className="hub-res__badge">Inativo</span> : null}
                                  {canWrite ? (
                                    <span className="hub-res__resource-actions">
                                      <button
                                        type="button"
                                        className="hub-res__text-btn"
                                        onClick={() => {
                                          if (!clinicId) return;
                                          const active = !row.active;
                                          setResources((prev) =>
                                            prev.map((r) => (r.id === row.id ? { ...r, active } : r)),
                                          );
                                          void hubResourcesApi
                                            .patch(row.id, { clinic_id: clinicId, active })
                                            .catch((err: unknown) =>
                                              showError((err as Error)?.message || 'Erro ao atualizar'),
                                            );
                                        }}
                                      >
                                        {row.active ? 'Desativar' : 'Ativar'}
                                      </button>
                                      <button
                                        type="button"
                                        className="hub-res__icon-btn hub-res__icon-btn--danger"
                                        aria-label={`Excluir ${row.name}`}
                                        onClick={() => {
                                          if (!clinicId) return;
                                          void hubResourcesApi
                                            .delete(row.id, clinicId)
                                            .then(() => setResources((prev) => prev.filter((r) => r.id !== row.id)))
                                            .catch((err: unknown) =>
                                              showError((err as Error)?.message || 'Erro ao excluir'),
                                            );
                                        }}
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </span>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          )}

                          {canWrite && unitId ? (
                            <form
                              className="hub-res__inline"
                              onSubmit={(e) => {
                                e.preventDefault();
                                void addResource(kind.id);
                              }}
                            >
                              <input
                                className="hub-res__input"
                                placeholder={`Nova ${kind.name.toLowerCase()}`}
                                value={draftResource[kind.id] ?? ''}
                                onChange={(e) =>
                                  setDraftResource((prev) => ({ ...prev, [kind.id]: e.target.value }))
                                }
                              />
                              <button type="submit" className="hub-res__add-btn" disabled={!(draftResource[kind.id] ?? '').trim()}>
                                <Plus size={14} /> Adicionar
                              </button>
                            </form>
                          ) : null}
                        </article>
                      );
                    })
                  )}

                  {canWrite ? (
                    <form
                      className="hub-res__new-kind"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void addKind(selected.slug);
                      }}
                    >
                      <input
                        className="hub-res__input"
                        placeholder="Novo tipo, ex.: Banheira"
                        value={draftKind[selected.slug] ?? ''}
                        onChange={(e) => setDraftKind((prev) => ({ ...prev, [selected.slug]: e.target.value }))}
                      />
                      <button type="submit" className="hub-res__add-btn" disabled={!(draftKind[selected.slug] ?? '').trim()}>
                        <Plus size={14} /> Novo tipo
                      </button>
                    </form>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
};

export default HubResourcesSettingsPage;
