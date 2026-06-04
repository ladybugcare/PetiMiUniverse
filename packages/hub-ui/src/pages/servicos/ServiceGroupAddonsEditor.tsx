import React, { useCallback, useEffect, useState } from 'react';
import { hubServiceAddonsApi } from '../../api/hubServiceAddonsApi';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
import { useAlert } from '../../components/AlertProvider';
import { HubCheckbox } from '../../components/HubCheckbox';

type Props = {
  groupId: string;
  clinicId: string;
  canWrite: boolean;
};

const ServiceGroupAddonsEditor: React.FC<Props> = ({ groupId, clinicId, canWrite }) => {
  const { showError, showSuccess } = useAlert();
  const [catalog, setCatalog] = useState<HubServiceType[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [addonsRes, groupRes] = await Promise.all([
        hubServiceTypesApi.list(clinicId, true, false, true),
        hubServiceAddonsApi.listGroupAddons(groupId, clinicId),
      ]);
      setCatalog(addonsRes.service_types ?? []);
      setSelected(new Set(groupRes.addon_service_type_ids ?? []));
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar adicionais do grupo');
    } finally {
      setLoading(false);
    }
  }, [clinicId, groupId, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (!canWrite) return;
    setSaving(true);
    try {
      const ordered = catalog.filter((a) => selected.has(a.id)).map((a) => a.id);
      await hubServiceAddonsApi.putGroupAddons(groupId, {
        clinic_id: clinicId,
        addon_service_type_ids: ordered,
      });
      showSuccess('Adicionais do grupo atualizados');
      await load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="hub-servicos__margin-info">Carregando catálogo de adicionais…</p>;

  return (
    <div className="hub-servicos-config__addons-block">
      <h3 className="hub-servicos__form-section-title">Adicionais deste grupo</h3>
      <p className="hub-clientes__muted" style={{ marginBottom: 12 }}>
        Ao marcar um adicional, ele passa a estar disponível em todos os serviços principais já criados deste grupo.
        Você pode desativar serviço a serviço no formulário de cada serviço ou gerenciar tudo no formulário do
        adicional.
      </p>
      {catalog.length === 0 ? (
        <p className="hub-servicos__margin-info">
          Ainda não há adicionais no catálogo. Crie em{' '}
          <a href="/hub/servicos/adicionais">Serviços → Adicionais</a>.
        </p>
      ) : (
        <ul className="hub-servicos-config__addon-checklist">
          {catalog.map((a) => (
            <li key={a.id}>
              <HubCheckbox
                checked={selected.has(a.id)}
                disabled={!canWrite}
                onChange={() => toggle(a.id)}
              >
                {a.name}
                {a.default_duration_minutes != null ? ` · ${a.default_duration_minutes} min` : ''}
              </HubCheckbox>
            </li>
          ))}
        </ul>
      )}
      {canWrite && catalog.length > 0 ? (
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--primary"
          style={{ marginTop: 12 }}
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? 'Salvando…' : 'Salvar adicionais do grupo'}
        </button>
      ) : null}
    </div>
  );
};

export default ServiceGroupAddonsEditor;
