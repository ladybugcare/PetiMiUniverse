import React, { FormEvent, useCallback, useMemo } from 'react';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { isoDateToBr } from './formatters';

export type GuardianFormValues = {
  full_name: string;
  phone: string;
  client_kind: 'individual' | 'company';
  legal_name: string;
  email: string;
  tax_id: string;
  id_doc_type: string;
  id_doc_number: string;
  birth_date_br: string;
  sex: '' | 'M' | 'F' | 'U';
  lead_source: string;
  postal_code: string;
  state: string;
  city: string;
  district: string;
  street: string;
  street_number: string;
  complement: string;
  notes: string;
};

export const emptyGuardianForm: GuardianFormValues = {
  full_name: '',
  phone: '',
  client_kind: 'individual',
  legal_name: '',
  email: '',
  tax_id: '',
  id_doc_type: '',
  id_doc_number: '',
  birth_date_br: '',
  sex: '',
  lead_source: '',
  postal_code: '',
  state: '',
  city: '',
  district: '',
  street: '',
  street_number: '',
  complement: '',
  notes: '',
};

interface GuardianCreateFormProps {
  value: GuardianFormValues;
  onChange: (next: GuardianFormValues) => void;
  onSubmit: (e: FormEvent) => void;
  submitting: boolean;
  canWrite: boolean;
  title: string;
}

const ORIGENS = [
  '',
  'Indicação',
  'Instagram',
  'Google',
  'Já era cliente',
  'Passante',
  'Outro',
];

const DOC_TIPOS = ['', 'RG', 'CNH', 'Passaporte', 'Outro'];

const CLIENT_KIND_OPTIONS: HubComboboxOption[] = [
  { value: 'individual', label: 'Tutor (pessoa física)' },
  { value: 'company', label: 'Empresa' },
];

const GUARDIAN_SEX_OPTIONS: HubComboboxOption[] = [
  { value: '', label: '—' },
  { value: 'M', label: 'Masculino' },
  { value: 'F', label: 'Feminino' },
  { value: 'U', label: 'Prefiro não informar' },
];

export const GuardianCreateForm: React.FC<GuardianCreateFormProps> = ({
  value,
  onChange,
  onSubmit,
  submitting,
  canWrite,
  title,
}) => {
  const docTypeOptions = useMemo(
    (): HubComboboxOption[] => DOC_TIPOS.map((o) => ({ value: o, label: o || '—' })),
    [],
  );
  const leadSourceOptions = useMemo(
    (): HubComboboxOption[] => ORIGENS.map((o) => ({ value: o, label: o || '—' })),
    [],
  );

  const patch = useCallback(
    (partial: Partial<GuardianFormValues>) => {
      onChange({ ...value, ...partial });
    },
    [onChange, value],
  );

  const onCepBlur = useCallback(async () => {
    const cep = value.postal_code.replace(/\D/g, '');
    if (cep.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const j = (await r.json()) as { erro?: boolean; localidade?: string; uf?: string; bairro?: string; logradouro?: string };
      if (j.erro) return;
      onChange({
        ...value,
        city: j.localidade || value.city,
        state: j.uf || value.state,
        district: j.bairro || value.district,
        street: j.logradouro || value.street,
      });
    } catch {
      /* ignore */
    }
  }, [onChange, value]);

  if (!canWrite) {
    return (
      <p className="hub-clientes__muted" style={{ margin: 0 }}>
        Sem permissão para criar ou editar clientes.
      </p>
    );
  }

  const isCompany = value.client_kind === 'company';

  return (
    <form onSubmit={onSubmit}>
      {title ? <h2 className="hub-clientes__form-title">{title}</h2> : null}

      <div className="hub-clientes__field">
        <label className="hub-clientes__label">Nome {isCompany ? '(nome fantasia)' : ''} *</label>
        <input
          className="hub-clientes__input"
          value={value.full_name}
          onChange={(e) => patch({ full_name: e.target.value })}
          required
          placeholder={isCompany ? 'Nome da empresa' : 'Nome completo'}
        />
      </div>

      <div className="hub-clientes__field">
        <label className="hub-clientes__label">Telefone *</label>
        <input
          className="hub-clientes__input"
          value={value.phone}
          onChange={(e) => patch({ phone: e.target.value })}
          required
          placeholder="(00) 00000-0000"
        />
      </div>

      <div className="hub-clientes__field">
        <label className="hub-clientes__label" htmlFor="hub-guardian-form-client-kind">
          Tipo *
        </label>
        <HubSearchableCombobox
          id="hub-guardian-form-client-kind"
          className="hub-combobox--clientes"
          options={CLIENT_KIND_OPTIONS}
          value={value.client_kind}
          onChange={(v) => patch({ client_kind: v as 'individual' | 'company' })}
          placeholder="Tipo"
          searchPlaceholder="Buscar…"
          allowCreate={false}
          clearable={false}
          ariaLabel="Tipo de cliente"
        />
      </div>

      {isCompany && (
        <div className="hub-clientes__field">
          <label className="hub-clientes__label">Razão social</label>
          <input
            className="hub-clientes__input"
            value={value.legal_name}
            onChange={(e) => patch({ legal_name: e.target.value })}
            placeholder="Opcional"
          />
        </div>
      )}

      <div className="hub-clientes__field">
        <label className="hub-clientes__label">CPF / CNPJ *</label>
        <input
          className="hub-clientes__input"
          value={value.tax_id}
          onChange={(e) => patch({ tax_id: e.target.value })}
          placeholder="Obrigatório"
          required
          aria-required
        />
      </div>

      <div className="hub-clientes__field">
        <label className="hub-clientes__label">E-mail</label>
        <input
          className="hub-clientes__input"
          type="email"
          value={value.email}
          onChange={(e) => patch({ email: e.target.value })}
          placeholder="opcional"
        />
      </div>

      <div className="hub-clientes__row2">
        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="hub-guardian-form-doc-type">
            Tipo doc.
          </label>
          <HubSearchableCombobox
            id="hub-guardian-form-doc-type"
            className="hub-combobox--clientes"
            options={docTypeOptions}
            value={value.id_doc_type}
            onChange={(v) => patch({ id_doc_type: v })}
            placeholder="Tipo doc."
            searchPlaceholder="Buscar…"
            allowCreate={false}
            ariaLabel="Tipo de documento"
          />
        </div>
        <div className="hub-clientes__field">
          <label className="hub-clientes__label">RG / doc.</label>
          <input
            className="hub-clientes__input"
            value={value.id_doc_number}
            onChange={(e) => patch({ id_doc_number: e.target.value })}
            placeholder="Número"
          />
        </div>
      </div>

      {!isCompany && (
        <>
          <div className="hub-clientes__field">
            <label className="hub-clientes__label">Nascimento (dd/mm/aaaa)</label>
            <input
              className="hub-clientes__input"
              value={value.birth_date_br}
              onChange={(e) => patch({ birth_date_br: e.target.value })}
              placeholder="dd/mm/aaaa"
            />
          </div>
          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="hub-guardian-form-sex">
              Sexo
            </label>
            <HubSearchableCombobox
              id="hub-guardian-form-sex"
              className="hub-combobox--clientes"
              options={GUARDIAN_SEX_OPTIONS}
              value={value.sex}
              onChange={(v) => patch({ sex: v as GuardianFormValues['sex'] })}
              placeholder="Sexo"
              searchPlaceholder="Buscar…"
              allowCreate={false}
              ariaLabel="Sexo"
            />
          </div>
        </>
      )}

      <div className="hub-clientes__field">
        <label className="hub-clientes__label" htmlFor="hub-guardian-form-lead-source">
          Origem
        </label>
        <HubSearchableCombobox
          id="hub-guardian-form-lead-source"
          className="hub-combobox--clientes"
          options={leadSourceOptions}
          value={value.lead_source}
          onChange={(v) => patch({ lead_source: v })}
          placeholder="Origem"
          searchPlaceholder="Buscar…"
          allowCreate={false}
          ariaLabel="Origem do lead"
        />
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--hc-border)', margin: '16px 0' }} />

      <p className="hub-clientes__section-title" style={{ marginBottom: 10 }}>
        Endereço
      </p>

      <div className="hub-clientes__row2">
        <div className="hub-clientes__field">
          <label className="hub-clientes__label">CEP</label>
          <input
            className="hub-clientes__input"
            value={value.postal_code}
            onChange={(e) => patch({ postal_code: e.target.value })}
            onBlur={() => void onCepBlur()}
            placeholder="00000-000"
          />
        </div>
        <div className="hub-clientes__field">
          <label className="hub-clientes__label">Estado</label>
          <input
            className="hub-clientes__input"
            value={value.state}
            onChange={(e) => patch({ state: e.target.value })}
            placeholder="UF"
          />
        </div>
      </div>

      <div className="hub-clientes__row2">
        <div className="hub-clientes__field">
          <label className="hub-clientes__label">Cidade</label>
          <input
            className="hub-clientes__input"
            value={value.city}
            onChange={(e) => patch({ city: e.target.value })}
          />
        </div>
        <div className="hub-clientes__field">
          <label className="hub-clientes__label">Bairro</label>
          <input
            className="hub-clientes__input"
            value={value.district}
            onChange={(e) => patch({ district: e.target.value })}
          />
        </div>
      </div>

      <div className="hub-clientes__field">
        <label className="hub-clientes__label">Endereço</label>
        <input
          className="hub-clientes__input"
          value={value.street}
          onChange={(e) => patch({ street: e.target.value })}
        />
      </div>

      <div className="hub-clientes__row2">
        <div className="hub-clientes__field">
          <label className="hub-clientes__label">Número</label>
          <input
            className="hub-clientes__input"
            value={value.street_number}
            onChange={(e) => patch({ street_number: e.target.value })}
          />
        </div>
        <div className="hub-clientes__field">
          <label className="hub-clientes__label">Complemento</label>
          <input
            className="hub-clientes__input"
            value={value.complement}
            onChange={(e) => patch({ complement: e.target.value })}
          />
        </div>
      </div>

      <div className="hub-clientes__field">
        <label className="hub-clientes__label">Observações</label>
        <textarea
          className="hub-clientes__textarea"
          value={value.notes}
          onChange={(e) => patch({ notes: e.target.value })}
          placeholder="Notas internas"
        />
      </div>

      <div className="hub-clientes__footer-btns">
        <button type="submit" className="hub-clientes__btn hub-clientes__btn--primary" disabled={submitting}>
          {submitting ? 'Salvando…' : 'Salvar cliente'}
        </button>
      </div>
    </form>
  );
};

export function guardianToFormValues(g: {
  full_name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  client_kind: 'individual' | 'company';
  legal_name: string | null;
  birth_date: string | null;
  sex: 'M' | 'F' | 'U' | null;
  tax_id: string | null;
  id_doc_type: string | null;
  id_doc_number: string | null;
  lead_source: string | null;
  postal_code: string | null;
  state: string | null;
  city: string | null;
  district: string | null;
  street: string | null;
  street_number: string | null;
  complement: string | null;
}): GuardianFormValues {
  return {
    full_name: g.full_name,
    phone: g.phone || '',
    client_kind: (g.client_kind as 'individual' | 'company') || 'individual',
    legal_name: g.legal_name || '',
    email: g.email || '',
    tax_id: g.tax_id || '',
    id_doc_type: g.id_doc_type || '',
    id_doc_number: g.id_doc_number || '',
    birth_date_br: isoDateToBr(g.birth_date),
    sex: (g.sex as GuardianFormValues['sex']) || '',
    lead_source: g.lead_source || '',
    postal_code: g.postal_code || '',
    state: g.state || '',
    city: g.city || '',
    district: g.district || '',
    street: g.street || '',
    street_number: g.street_number || '',
    complement: g.complement || '',
    notes: g.notes || '',
  };
}
