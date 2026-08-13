import React, { useEffect, useMemo, useState } from 'react';
import { hubClinicalCasesApi, type HubClinicalCase } from '../../api/hubClinicalApi';
import { HubSearchableCombobox } from '../HubSearchableCombobox';
import type { HubComboboxOption } from '../HubSearchableCombobox';

export type ClinicalCaseLinkValue = {
  hub_case_id?: string | null;
  create_new_case?: boolean;
  new_case_title?: string | null;
};

type Props = {
  clinicId: string;
  petId: string;
  value: ClinicalCaseLinkValue;
  onChange: (v: ClinicalCaseLinkValue) => void;
  /** Chamado quando a lista de casos ativos é carregada; permite que o pai bloqueie o submit. */
  onHasActiveCases?: (hasActive: boolean) => void;
  disabled?: boolean;
};

/**
 * Verdadeiro quando o valor já possui uma escolha válida de caso.
 * Usado pela página pai para bloquear o submit quando há casos ativos mas nenhuma escolha feita.
 */
export function isCaseLinkResolved(
  value: ClinicalCaseLinkValue,
  hasActiveCases: boolean,
): boolean {
  if (!hasActiveCases) return true;
  return !!(value.hub_case_id || value.create_new_case);
}

/**
 * Exibe o seletor de caso clínico dentro de um painel de admissão/cirurgia.
 * - Pet sem casos ativos: nada é renderizado (auto-criação silenciosa).
 * - Pet com casos ativos: mostra radio "Associar a caso existente" / "Novo caso" + combobox.
 */
const ClinicalCaseLinkFields: React.FC<Props> = ({ clinicId, petId, value, onChange, onHasActiveCases, disabled }) => {
  const [activeCases, setActiveCases] = useState<HubClinicalCase[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clinicId || !petId) {
      setActiveCases([]);
      onHasActiveCases?.(false);
      return;
    }
    setLoading(true);
    void hubClinicalCasesApi
      .list(clinicId, { petId })
      .then((r) => {
        const active = (r.cases ?? []).filter(
          (c) => c.status === 'active' || c.status === 'monitoring',
        );
        setActiveCases(active);
        onHasActiveCases?.(active.length > 0);
        if (active.length === 0) {
          onChange({});
        }
      })
      .catch(() => { setActiveCases([]); onHasActiveCases?.(false); })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId, petId]);

  const caseOptions: HubComboboxOption[] = useMemo(
    () => activeCases.map((c) => ({ value: c.id, label: c.title })),
    [activeCases],
  );

  if (!petId || loading) {
    return loading ? (
      <p className="hub-clientes__muted" style={{ fontSize: 13 }}>Verificando casos ativos…</p>
    ) : null;
  }

  if (activeCases.length === 0) {
    return (
      <p className="hub-clientes__muted" style={{ fontSize: 13 }}>
        Nenhum caso ativo — um novo caso será criado automaticamente.
      </p>
    );
  }

  const mode: 'existing' | 'new' = value.create_new_case ? 'new' : 'existing';

  return (
    <div className="hub-clientes__form-stack" style={{ gap: 8 }}>
      <span className="hub-clientes__label">Caso clínico</span>
      <div style={{ display: 'flex', gap: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="radio"
            name="case-link-mode"
            checked={mode === 'existing'}
            disabled={disabled}
            onChange={() => onChange({ hub_case_id: activeCases.length === 1 ? activeCases[0]!.id : null })}
          />
          Associar a caso existente
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="radio"
            name="case-link-mode"
            checked={mode === 'new'}
            disabled={disabled}
            onChange={() => onChange({ create_new_case: true })}
          />
          Novo caso
        </label>
      </div>

      {mode === 'existing' && (
        <HubSearchableCombobox
          id="clinical-case-link-select"
          className="hub-combobox--clientes"
          options={caseOptions}
          value={value.hub_case_id ?? ''}
          onChange={(v) => onChange({ hub_case_id: v || null })}
          placeholder="Selecionar caso…"
          disabled={disabled}
        />
      )}

      {mode === 'new' && (
        <input
          className="hub-clientes__input"
          placeholder="Título do novo caso (opcional)"
          value={value.new_case_title ?? ''}
          disabled={disabled}
          onChange={(e) => onChange({ create_new_case: true, new_case_title: e.target.value || null })}
        />
      )}
    </div>
  );
};

export default ClinicalCaseLinkFields;
