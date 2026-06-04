import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  hubServiceAddonsApi,
  type AddonDeploymentGroup,
  type AddonDeploymentItem,
} from '../../api/hubServiceAddonsApi';
import { useAlert } from '../../components/AlertProvider';
import { HubCheckbox } from '../../components/HubCheckbox';
import { serviceGroupLabel } from '../../utils/serviceTypeSlug';

type Props = {
  addonId: string;
  clinicId: string;
  canWrite: boolean;
};

type GroupDraft = AddonDeploymentGroup & { desiredInGroup: boolean };

type GroupBaseline = {
  in_group: boolean;
  fullyActive: boolean;
};

function groupCheckboxState(g: GroupDraft): {
  checked: boolean;
  indeterminate: boolean;
} {
  if (!g.desiredInGroup) {
    return { checked: false, indeterminate: false };
  }
  if (g.service_count === 0) {
    return { checked: true, indeterminate: false };
  }
  if (g.available_count >= g.service_count) {
    return { checked: true, indeterminate: false };
  }
  return { checked: false, indeterminate: true };
}

function partialLabel(g: GroupDraft): string | null {
  if (!g.desiredInGroup || g.service_count === 0) return null;
  if (g.available_count >= g.service_count) return null;
  return `Ativo em ${g.available_count} de ${g.service_count} serviços`;
}

const AddonGroupDeploymentsPanel: React.FC<Props> = ({ addonId, clinicId, canWrite }) => {
  const { showError, showSuccess } = useAlert();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState<GroupDraft[]>([]);
  const [baseline, setBaseline] = useState<Map<string, GroupBaseline>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hubServiceAddonsApi.getAddonDeployments(addonId, clinicId);
      const rows = (res.groups ?? []).map((g) => ({
        ...g,
        desiredInGroup: g.in_group,
      }));
      setGroups(rows);
      setBaseline(
        new Map(
          rows.map((g) => [
            g.slug,
            {
              in_group: g.in_group,
              fullyActive:
                g.in_group && (g.service_count === 0 || g.available_count >= g.service_count),
            },
          ])
        )
      );
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar grupos');
    } finally {
      setLoading(false);
    }
  }, [addonId, clinicId, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirtyItems = useMemo((): AddonDeploymentItem[] => {
    const items: AddonDeploymentItem[] = [];
    for (const g of groups) {
      const b = baseline.get(g.slug) ?? { in_group: false, fullyActive: false };
      const wantsFullyActive =
        g.desiredInGroup && (g.service_count === 0 || g.available_count >= g.service_count);
      if (g.desiredInGroup !== b.in_group) {
        items.push({ service_group_slug: g.slug, enabled: g.desiredInGroup });
      } else if (wantsFullyActive && g.desiredInGroup && !b.fullyActive) {
        items.push({ service_group_slug: g.slug, enabled: true });
      }
    }
    return items;
  }, [groups, baseline]);

  const toggleGroup = (slug: string) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.slug !== slug) return g;
        const { checked, indeterminate } = groupCheckboxState(g);
        const fullyOn = checked && !indeterminate;
        if (fullyOn) {
          return { ...g, desiredInGroup: false, available_count: 0 };
        }
        return { ...g, desiredInGroup: true, available_count: g.service_count };
      })
    );
  };

  const save = async () => {
    if (!canWrite || dirtyItems.length === 0) return;
    setSaving(true);
    try {
      await hubServiceAddonsApi.putAddonDeployments(addonId, {
        clinic_id: clinicId,
        items: dirtyItems,
      });
      showSuccess('Adicionais nos grupos atualizados');
      await load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="hub-servicos__margin-info">Carregando grupos de serviço…</p>;
  }

  if (groups.length === 0) {
    return (
      <div className="pet-wizard__field--full">
        <h3 className="hub-servicos__form-section-title">Adicionais por grupo</h3>
        <p className="hub-servicos__margin-info">
          Ainda não há grupos de serviço. Crie em{' '}
          <Link to="/hub/configuracoes-sistema/servicos-funcoes">Configurações → Grupos</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="pet-wizard__field--full hub-servicos-config__addons-block">
      <h3 className="hub-servicos__form-section-title">Adicionais por grupo</h3>
      <p className="hub-servicos__margin-info" style={{ marginBottom: 12 }}>
        Marcar um grupo ativa este adicional no grupo e em todos os serviços principais já criados desse grupo.
        Desmarcar remove o adicional do grupo. Se desativar o adicional em um serviço específico, o estado aqui
        aparece parcial até voltar a ativar.{' '}
        <Link to="/hub/configuracoes-sistema/servicos-funcoes">Gerenciar adicionais por grupo</Link>
      </p>
      <ul className="hub-servicos-config__addon-checklist hub-servicos-config__addon-deployments-list">
        {groups.map((g) => {
          const { checked, indeterminate } = groupCheckboxState(g);
          const partial = partialLabel(g);
          return (
            <li key={g.slug} className="hub-servicos-config__addon-deployment-row">
              <HubCheckbox
                checked={checked}
                indeterminate={indeterminate}
                disabled={!canWrite}
                onChange={() => toggleGroup(g.slug)}
              >
                {g.name}
                {g.archived ? ' (arquivado)' : ''}
                <span className="hub-clientes__muted hub-servicos-config__addon-deployment-meta">
                  {' '}
                  · {serviceGroupLabel(g.slug)}
                  {g.service_count > 0 ? ` · ${g.service_count} serviço${g.service_count === 1 ? '' : 's'}` : ''}
                </span>
              </HubCheckbox>
              {partial ? (
                <p className="hub-servicos-config__addon-deployment-partial">{partial}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {canWrite ? (
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--primary"
          style={{ marginTop: 12 }}
          disabled={saving || dirtyItems.length === 0}
          onClick={() => void save()}
        >
          {saving ? 'Salvando…' : 'Salvar adicionais nos grupos'}
        </button>
      ) : null}
    </div>
  );
};

export default AddonGroupDeploymentsPanel;
