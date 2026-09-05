import React, { useEffect, useId, useMemo, useState } from 'react';
import { hubClinicalCasesApi, type HubClinicalCase } from '../../api/hubClinicalApi';
import { HubSearchableCombobox } from '../HubSearchableCombobox';
import type { HubComboboxOption } from '../HubSearchableCombobox';
import { HubCwsChoiceChips } from '../../pages/clinica/HubCwsChoiceChips';
import type { AnamnesisChip } from '../../pages/clinica/anamnesisOptions';

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
  /** Prefixo sugerido no título do caso novo (ex.: motivo da internação). */
  suggestedTitle?: string | null;
  /** Texto quando não há casos ativos. */
  emptyActiveHint?: string;
  /** Texto abaixo do título do caso novo. */
  blankTitleHint?: string;
  /** `agenda` usa rótulos e campos do novo agendamento. */
  tone?: 'clinic' | 'agenda';
};

const CASE_MODE_OPTIONS: AnamnesisChip[] = [
  { key: 'existing', label: 'Caso existente' },
  { key: 'new', label: 'Novo caso' },
];

/**
 * Verdadeiro quando o valor já possui uma escolha válida de caso.
 * Usado pela página pai para bloquear o submit quando há casos ativos mas nenhuma escolha feita.
 */
export function isCaseLinkResolved(
  value: ClinicalCaseLinkValue,
  hasActiveCases: boolean,
): boolean {
  if (value.hub_case_id) return true;
  if (value.create_new_case) return true;
  return !hasActiveCases;
}

/**
 * Seletor de caso clínico no padrão do atendimento: chips + combobox ou título.
 * Sem casos ativos, mostra só o título do caso que será criado.
 */
const ClinicalCaseLinkFields: React.FC<Props> = ({
  clinicId,
  petId,
  value,
  onChange,
  onHasActiveCases,
  disabled,
  suggestedTitle,
  emptyActiveHint = 'Nenhum caso ativo — um novo caso será criado.',
  blankTitleHint = 'Se ficar em branco, usamos o motivo ou o procedimento informado.',
  tone = 'clinic',
}) => {
  const fieldId = useId();
  const [activeCases, setActiveCases] = useState<HubClinicalCase[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clinicId || !petId) {
      setActiveCases([]);
      onHasActiveCases?.(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void hubClinicalCasesApi
      .list(clinicId, { petId })
      .then((r) => {
        if (cancelled) return;
        const active = (r.cases ?? []).filter(
          (c) => c.status === 'active' || c.status === 'monitoring',
        );
        setActiveCases(active);
        onHasActiveCases?.(active.length > 0);
        if (value.hub_case_id || value.create_new_case) return;
        if (active.length === 0) {
          onChange({ create_new_case: true, new_case_title: value.new_case_title ?? null });
        } else if (active.length === 1) {
          onChange({ hub_case_id: active[0]!.id });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setActiveCases([]);
        onHasActiveCases?.(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId, petId]);

  const caseOptions: HubComboboxOption[] = useMemo(() => {
    const opts = activeCases.map((c) => ({ value: c.id, label: c.title }));
    const selected = value.hub_case_id?.trim();
    if (selected && !opts.some((o) => o.value === selected)) {
      opts.push({ value: selected, label: 'Caso já vinculado' });
    }
    return opts;
  }, [activeCases, value.hub_case_id]);

  if (!petId) return null;

  const agenda = tone === 'agenda';
  const labelClass = agenda ? 'nam-label' : 'hub-clientes__label';
  const hintClass = agenda ? 'nam-muted' : 'hub-cws-exam-form__hint';

  if (loading) {
    return (
      <div className={agenda ? 'nam-field' : 'hub-clinic-field hub-cws-field-tight'}>
        <span className={labelClass}>Caso clínico</span>
        <p className={agenda ? 'nam-muted' : 'hub-clientes__muted'}>Verificando casos ativos…</p>
      </div>
    );
  }

  const hasActive = activeCases.length > 0;
  const mode: 'existing' | 'new' = value.create_new_case || !hasActive ? 'new' : 'existing';
  const titlePlaceholder = suggestedTitle?.trim()
    ? `Ex.: ${suggestedTitle.trim()}`
    : 'Ex.: pós-operatório, gastroenterite…';

  const setMode = (next: 'existing' | 'new') => {
    if (next === 'new') {
      onChange({
        create_new_case: true,
        new_case_title: value.new_case_title ?? suggestedTitle ?? null,
      });
      return;
    }
    onChange({
      hub_case_id: activeCases.length === 1 ? activeCases[0]!.id : value.hub_case_id ?? null,
    });
  };

  return (
    <div className={agenda ? 'nam-field hub-hosp-admit__case' : 'hub-cws-an-block hub-cws-an-block--tight'}>
      {agenda ? <span className="nam-label">Caso clínico</span> : <div className="hub-cws-an-block__title">Caso clínico</div>}
      {hasActive ? (
        agenda ? (
          <div className="hub-hosp-admit__seg" role="group" aria-label="Como vincular o caso clínico">
            <button
              type="button"
              className={mode === 'existing' ? 'is-on' : undefined}
              disabled={disabled}
              onClick={() => setMode('existing')}
            >
              Caso existente
            </button>
            <button
              type="button"
              className={mode === 'new' ? 'is-on' : undefined}
              disabled={disabled}
              onClick={() => setMode('new')}
            >
              Novo caso
            </button>
          </div>
        ) : (
          <HubCwsChoiceChips
            options={CASE_MODE_OPTIONS}
            value={mode}
            ariaLabel="Como vincular o caso clínico"
            disabled={disabled}
            onChange={(next) => {
              if (next === 'existing' || next === 'new') setMode(next);
            }}
          />
        )
      ) : (
        <p className={agenda ? 'nam-muted' : 'hub-clientes__muted'}>
          {emptyActiveHint}
        </p>
      )}

      {mode === 'existing' && hasActive ? (
        <div className={agenda ? 'nam-field' : 'hub-clinic-field hub-cws-field-tight'} style={agenda ? { marginTop: 10 } : { marginTop: 10, marginBottom: 0 }}>
          {agenda ? null : <label htmlFor={`${fieldId}-case`}>Selecionar caso</label>}
          <HubSearchableCombobox
            id={`${fieldId}-case`}
            className="hub-combobox--clientes"
            options={caseOptions}
            value={value.hub_case_id ?? ''}
            onChange={(v) => onChange({ hub_case_id: v || null })}
            placeholder="Selecionar caso…"
            searchPlaceholder="Título do caso…"
            disabled={disabled}
            ariaLabel="Caso clínico existente"
          />
        </div>
      ) : null}

      {mode === 'new' ? (
        <div className={agenda ? 'nam-field' : 'hub-clinic-field hub-cws-field-tight'} style={agenda ? { marginTop: 10 } : { marginTop: 10, marginBottom: 0 }}>
          {agenda ? (
            <label className="nam-label" htmlFor={`${fieldId}-title`}>
              Título do novo caso
            </label>
          ) : (
            <label htmlFor={`${fieldId}-title`}>Título do novo caso</label>
          )}
          <input
            id={`${fieldId}-title`}
            className={agenda ? 'nam-input' : 'hub-clientes__input'}
            placeholder={titlePlaceholder}
            value={value.new_case_title ?? ''}
            disabled={disabled}
            onChange={(e) =>
              onChange({ create_new_case: true, new_case_title: e.target.value || null })
            }
          />
          <p className={hintClass} style={{ marginTop: 8, marginBottom: 0 }}>
            {blankTitleHint}
          </p>
        </div>
      ) : null}
    </div>
  );
};

export default ClinicalCaseLinkFields;
