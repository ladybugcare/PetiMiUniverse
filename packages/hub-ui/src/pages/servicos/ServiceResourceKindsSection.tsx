import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { hubResourcesApi, type HubResourceKind } from '../../api/hubResourcesApi';
import { HubCheckbox } from '../../components/HubCheckbox';

type ServiceResourceKindsSectionProps = {
  clinicId: string;
  serviceGroup: string;
  mode: 'inherit' | 'custom';
  selectedIds: string[];
  onModeChange: (mode: 'inherit' | 'custom') => void;
  onSelectedChange: (ids: string[]) => void;
};

export const ServiceResourceKindsSection: React.FC<ServiceResourceKindsSectionProps> = ({
  clinicId,
  serviceGroup,
  mode,
  selectedIds,
  onModeChange,
  onSelectedChange,
}) => {
  const [kinds, setKinds] = useState<HubResourceKind[]>([]);

  useEffect(() => {
    if (!clinicId || !serviceGroup || serviceGroup === 'leva_traz') {
      setKinds([]);
      return;
    }
    let cancelled = false;
    void hubResourcesApi
      .listKinds(clinicId, serviceGroup)
      .then((res) => {
        if (!cancelled) setKinds((res.kinds ?? []).filter((k) => k.active));
      })
      .catch(() => {
        if (!cancelled) setKinds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [clinicId, serviceGroup]);

  if (serviceGroup === 'leva_traz') return null;

  return (
    <div className="pet-wizard__field--full">
      <span className="pet-wizard__label">Onde é feito</span>
      <p className="hub-servicos__margin-info" style={{ marginTop: 0, marginBottom: 8 }}>
        Por padrão o serviço usa todos os recursos do grupo. Restrinja só quando banho e tosa, por exemplo,
        usarem equipamentos diferentes.{' '}
        <Link to="/hub/configuracoes-sistema/recursos">Cadastrar recursos</Link>
      </p>
      {kinds.length === 0 ? (
        <p className="hub-servicos__margin-info">Este grupo ainda não tem tipos de recurso.</p>
      ) : (
        <>
          <div className="hub-servicos__seg" role="group" aria-label="Recursos do serviço">
            <button
              type="button"
              className={mode === 'inherit' ? 'hub-servicos__seg--active' : ''}
              onClick={() => onModeChange('inherit')}
            >
              Todos do grupo
            </button>
            <button
              type="button"
              className={mode === 'custom' ? 'hub-servicos__seg--active' : ''}
              onClick={() => onModeChange('custom')}
            >
              Só alguns
            </button>
          </div>
          {mode === 'custom' ? (
            <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
              {kinds.map((kind) => (
                <HubCheckbox
                  key={kind.id}
                  checked={selectedIds.includes(kind.id)}
                  onChange={(checked) => {
                    onSelectedChange(
                      checked ? [...selectedIds, kind.id] : selectedIds.filter((id) => id !== kind.id),
                    );
                  }}
                >
                  {kind.name}
                </HubCheckbox>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};
