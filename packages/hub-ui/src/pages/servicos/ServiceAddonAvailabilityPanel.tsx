import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Coins } from 'lucide-react';
import { hubServiceAddonsApi, type AddonAvailabilityItem } from '../../api/hubServiceAddonsApi';
import type { HubServiceType } from '../../api/hubServiceTypesApi';
import {
  coercePricingMatrixFromApi,
  computeReferenceFromMatrix,
} from '../../utils/hubServiceTypesPricingMatrix';
import { formatMoneyCurrencyBrl } from './serviceTypeFormUtils';
import { useAlert } from '../../components/AlertProvider';
import { HubCheckbox } from '../../components/HubCheckbox';

export type AddonAvailabilitySnapshot = {
  total: number;
  availableCount: number;
  availableNames: string[];
};

type Props = {
  serviceTypeId: string | null;
  /** Grupo (UUID) para listar adicionais na criação do serviço, antes de existir serviceTypeId. */
  serviceGroupId?: string | null;
  clinicId: string;
  serviceGroup: string;
  canWrite: boolean;
  /** Integrado no passo do wizard (sem título duplicado). */
  variant?: 'default' | 'wizard';
  onSnapshotChange?: (snapshot: AddonAvailabilitySnapshot | null) => void;
  /** Rascunho na criação: repassa itens ao formulário para gravar após criar o serviço. */
  onDraftItemsChange?: (items: AddonAvailabilityItem[]) => void;
};

function addonPriceSummary(addon: HubServiceType): string {
  const m = coercePricingMatrixFromApi(addon.pricing_matrix);
  if (m?.kind === 'personalizado' && m.tiers.length > 0) {
    const from = Math.min(...m.tiers.map((t) => t.sale_amount));
    const to = Math.max(...m.tiers.map((t) => t.sale_amount));
    if (from === to) return formatMoneyCurrencyBrl(from);
    return `${formatMoneyCurrencyBrl(from)} – ${formatMoneyCurrencyBrl(to)}`;
  }
  if (m) {
    const ref = computeReferenceFromMatrix(m);
    return formatMoneyCurrencyBrl(ref.sale);
  }
  const sale = addon.sale_amount ?? 0;
  return formatMoneyCurrencyBrl(sale);
}

export function buildAddonAvailabilitySnapshot(
  addons: HubServiceType[],
  items: AddonAvailabilityItem[]
): AddonAvailabilitySnapshot {
  const availMap = new Map(items.map((it) => [it.addon_service_type_id, it.is_available]));
  const availableNames: string[] = [];
  for (const a of addons) {
    if (availMap.get(a.id) !== false) availableNames.push(a.name);
  }
  return {
    total: addons.length,
    availableCount: availableNames.length,
    availableNames,
  };
}

function defaultItemsForAddons(list: HubServiceType[]): AddonAvailabilityItem[] {
  return list.map((a) => ({ addon_service_type_id: a.id, is_available: true }));
}

const ServiceAddonAvailabilityPanel: React.FC<Props> = ({
  serviceTypeId,
  serviceGroupId = null,
  clinicId,
  serviceGroup,
  canWrite,
  variant = 'default',
  onSnapshotChange,
  onDraftItemsChange,
}) => {
  const isWizard = variant === 'wizard';
  const isDraftMode = !serviceTypeId;
  const { showError, showSuccess } = useAlert();
  const [loading, setLoading] = useState(Boolean(serviceTypeId || serviceGroupId));
  const [saving, setSaving] = useState(false);
  const [addons, setAddons] = useState<HubServiceType[]>([]);
  const [items, setItems] = useState<AddonAvailabilityItem[]>([]);

  const publishSnapshot = useCallback(
    (list: HubServiceType[], availability: AddonAvailabilityItem[]) => {
      onSnapshotChange?.(list.length === 0 ? null : buildAddonAvailabilitySnapshot(list, availability));
    },
    [onSnapshotChange]
  );

  const applyAvailability = useCallback(
    (list: HubServiceType[], availability: AddonAvailabilityItem[]) => {
      setAddons(list);
      setItems(availability);
      publishSnapshot(list, availability);
      if (isDraftMode) onDraftItemsChange?.(availability);
    },
    [isDraftMode, onDraftItemsChange, publishSnapshot]
  );

  const load = useCallback(async () => {
    if (serviceTypeId) {
      setLoading(true);
      try {
        const res = await hubServiceAddonsApi.getAddonAvailability(serviceTypeId, clinicId);
        const list = res.addons ?? [];
        const availability = res.items ?? [];
        applyAvailability(list, availability);
      } catch (e: unknown) {
        showError((e as Error)?.message || 'Erro ao carregar adicionais');
        onSnapshotChange?.(null);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (serviceGroupId && serviceGroup.trim()) {
      setLoading(true);
      try {
        const res = await hubServiceAddonsApi.listGroupAddons(serviceGroupId, clinicId);
        const list = res.addons ?? [];
        const availability = defaultItemsForAddons(list);
        applyAvailability(list, availability);
      } catch (e: unknown) {
        showError((e as Error)?.message || 'Erro ao carregar adicionais do grupo');
        setAddons([]);
        setItems([]);
        onSnapshotChange?.(null);
        onDraftItemsChange?.([]);
      } finally {
        setLoading(false);
      }
      return;
    }

    setAddons([]);
    setItems([]);
    setLoading(false);
    onSnapshotChange?.(null);
    onDraftItemsChange?.([]);
  }, [
    clinicId,
    serviceTypeId,
    serviceGroupId,
    serviceGroup,
    showError,
    onSnapshotChange,
    onDraftItemsChange,
    applyAvailability,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const availMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const it of items) m.set(it.addon_service_type_id, it.is_available);
    return m;
  }, [items]);

  const snapshot = useMemo(() => buildAddonAvailabilitySnapshot(addons, items), [addons, items]);

  const commitItems = (next: AddonAvailabilityItem[]) => {
    setItems(next);
    publishSnapshot(addons, next);
    if (isDraftMode) onDraftItemsChange?.(next);
  };

  const toggle = (addonId: string) => {
    const existing = items.find((x) => x.addon_service_type_id === addonId);
    const next = existing
      ? items.map((x) =>
          x.addon_service_type_id === addonId ? { ...x, is_available: !x.is_available } : x
        )
      : [...items, { addon_service_type_id: addonId, is_available: false }];
    commitItems(next);
  };

  const setAllAvailable = (available: boolean) => {
    commitItems(
      addons.map((a) => ({
        addon_service_type_id: a.id,
        is_available: available,
      }))
    );
  };

  const save = async () => {
    if (!canWrite || !serviceTypeId) return;
    setSaving(true);
    try {
      await hubServiceAddonsApi.putAddonAvailability(serviceTypeId, { clinic_id: clinicId, items });
      showSuccess('Adicionais na agenda atualizados');
      await load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (isDraftMode && !serviceGroupId) {
    return (
      <div className={isWizard ? 'hub-service-addons-step' : 'pet-wizard__field--full'}>
        <div className="hub-service-addons-step__empty">
          <p className="hub-service-addons-step__empty-title">Selecione o grupo do serviço</p>
          <p className="hub-servicos__margin-info">
            Volte ao passo <strong>Informações gerais</strong> e escolha o grupo. Os adicionais cadastrados nesse grupo
            aparecerão aqui para você marcar.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <p className="hub-servicos__margin-info hub-service-addons-step__loading">
        Carregando adicionais do grupo…
      </p>
    );
  }

  if (addons.length === 0) {
    return (
      <div className={isWizard ? 'hub-service-addons-step' : 'pet-wizard__field--full'}>
        {!isWizard ? <h3 className="hub-servicos__form-section-title">Adicionais neste serviço</h3> : null}
        <div className="hub-service-addons-step__empty">
          <p className="hub-service-addons-step__empty-title">Nenhum adicional no grupo</p>
          <p className="hub-servicos__margin-info">
            O grupo «{serviceGroup}» ainda não tem adicionais associados.{' '}
            <Link to="/hub/configuracoes-sistema/servicos-funcoes">Gerenciar adicionais do grupo</Link> ou cadastre em{' '}
            <Link to="/hub/servicos/adicionais">Adicionais</Link>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={isWizard ? 'hub-service-addons-step' : 'pet-wizard__field--full'}>
      {!isWizard ? <h3 className="hub-servicos__form-section-title">Adicionais neste serviço</h3> : null}

      <div className="hub-service-addons-step__toolbar">
        <p className="hub-service-addons-step__lead">
          Só os adicionais marcados abaixo aparecem na agenda deste serviço.{' '}
          <Link to="/hub/configuracoes-sistema/servicos-funcoes">Gerenciar adicionais do grupo</Link>
        </p>
        <span className="hub-service-addons-step__badge" aria-live="polite">
          {snapshot.availableCount} de {snapshot.total} na agenda
        </span>
      </div>

      {canWrite ? (
        <div className="hub-service-addons-step__bulk">
          <button type="button" className="hub-service-addons-step__bulk-btn" onClick={() => setAllAvailable(true)}>
            Marcar todos
          </button>
          <button type="button" className="hub-service-addons-step__bulk-btn" onClick={() => setAllAvailable(false)}>
            Desmarcar todos
          </button>
        </div>
      ) : null}

      <ul className="hub-service-addons-step__list">
        {addons.map((a) => {
          const available = availMap.get(a.id) !== false;
          return (
            <li
              key={a.id}
              className={`hub-service-addons-step__card${available ? ' hub-service-addons-step__card--on' : ''}`}
            >
              <div className="hub-service-addons-step__card-main">
                <span className="hub-service-addons-step__card-name">{a.name}</span>
                <span className="hub-service-addons-step__card-meta">
                  {a.default_duration_minutes != null ? (
                    <>
                      <Clock size={14} aria-hidden />
                      {a.default_duration_minutes} min
                    </>
                  ) : (
                    <>
                      <Clock size={14} aria-hidden />
                      —
                    </>
                  )}
                  <span className="hub-service-addons-step__card-meta-sep" aria-hidden>
                    ·
                  </span>
                  <Coins size={14} aria-hidden />
                  {addonPriceSummary(a)}
                </span>
              </div>
              <HubCheckbox
                checked={available}
                disabled={!canWrite}
                onChange={() => toggle(a.id)}
                className="hub-service-addons-step__toggle"
                ariaLabel={`Disponível na agenda: ${a.name}`}
              >
                <span className="hub-service-addons-step__toggle-label">Na agenda</span>
              </HubCheckbox>
            </li>
          );
        })}
      </ul>

      {canWrite && !isDraftMode ? (
        <div className="hub-service-addons-step__actions">
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? 'Salvando…' : 'Salvar adicionais na agenda'}
          </button>
        </div>
      ) : null}
      {canWrite && isDraftMode ? (
        <p className="hub-servicos__margin-info hub-service-addons-step__draft-hint">
          As escolhas acima serão aplicadas quando você salvar o serviço na revisão.
        </p>
      ) : null}
    </div>
  );
};

export default ServiceAddonAvailabilityPanel;
