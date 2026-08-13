import React, { useEffect, useMemo, useState } from 'react';
import { User, Dog, Loader2, AlertCircle, Plus, Trash2, Building2, HelpCircle, MapPin } from 'lucide-react';
import type { HubClientKind } from '../../api/hubGuardiansApi';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubCancelButton } from '../../components/HubCancelButton';
import { HubBrPhoneInput } from '../../components/HubBrPhoneInput';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { hubGuardiansApi } from '../../api/hubGuardiansApi';
import { hubPetsApi } from '../../api/hubPetsApi';
import {
  mergeBreedComboboxOptions,
  mergeSpeciesComboboxOptions,
} from '../pets/wizard/petSpeciesComboboxData';
import { wizardBreedOptionsForSpecies } from '../pets/wizard/petSpeciesBreedOptions';
import {
  defaultBodyPorteForBreed,
  resolvePetBodyPorteForApi,
} from '../../data/breedDefaultSizeTier';
import {
  COAT_TYPE_LABELS,
  COAT_TYPE_VALUES,
  PET_BODY_PORTE_VALUES,
  PORTE_LABELS,
  type CoatTypeValue,
  type PetBodyPorteValue,
} from '../../utils/hubServiceTypesPricingMatrix';

export type QuickRegisterGuardianResult = { id: string; full_name: string };
export type QuickRegisterPetResult = {
  id: string;
  name: string;
  size_tier: string;
  coat_type: string | null;
  birth_date: string | null;
};

export type QuickRegisterSaveResult = {
  guardian: QuickRegisterGuardianResult;
  pets: QuickRegisterPetResult[];
};

type PetDraft = {
  key: string;
  name: string;
  species: string;
  breed: string;
  isSRD: boolean;
  sizeTier: PetBodyPorteValue | '';
  coatType: CoatTypeValue | '';
};

type Props = {
  open: boolean;
  clinicId: string;
  /** Tutor já selecionado — cadastra só pets. */
  petsOnly?: boolean;
  existingGuardianId?: string;
  existingGuardianName?: string;
  onClose: () => void;
  onSaved: (result: QuickRegisterSaveResult) => void | Promise<void>;
};

const PORTE_OPTIONS: HubComboboxOption[] = PET_BODY_PORTE_VALUES.map((v) => ({
  value: v,
  label: PORTE_LABELS[v],
}));

const COAT_OPTIONS: HubComboboxOption[] = COAT_TYPE_VALUES.map((v) => ({
  value: v,
  label: COAT_TYPE_LABELS[v],
}));

let petDraftSeq = 0;
function newPetDraft(): PetDraft {
  petDraftSeq += 1;
  return {
    key: `pet-${petDraftSeq}`,
    name: '',
    species: '',
    breed: '',
    isSRD: false,
    sizeTier: '',
    coatType: '',
  };
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

function isPetDraftEmpty(row: PetDraft): boolean {
  return (
    !row.name.trim() &&
    !row.species.trim() &&
    !row.breed.trim() &&
    !row.isSRD &&
    !row.sizeTier &&
    !row.coatType
  );
}

function isPetDraftComplete(row: PetDraft): boolean {
  if (!row.name.trim() || !row.species.trim() || !row.sizeTier) return false;
  if (!row.isSRD && !row.breed.trim()) return false;
  return true;
}

function emptyOrNull(s: string): string | null {
  const t = s.trim();
  return t ? t : null;
}

export const ReceptionQuickRegisterPanel: React.FC<Props> = ({
  open,
  clinicId,
  petsOnly = false,
  existingGuardianId,
  existingGuardianName,
  onClose,
  onSaved,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateHint, setDuplicateHint] = useState<string | null>(null);

  const [clientKind, setClientKind] = useState<HubClientKind>('individual');
  const [fullName, setFullName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [phone, setPhone] = useState('');
  const [taxId, setTaxId] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [stateUf, setStateUf] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [street, setStreet] = useState('');
  const [streetNumber, setStreetNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [petRows, setPetRows] = useState<PetDraft[]>(() => [newPetDraft()]);

  const isCompany = clientKind === 'company';

  useEffect(() => {
    if (!open) {
      setClientKind('individual');
      setFullName('');
      setLegalName('');
      setPhone('');
      setTaxId('');
      setPostalCode('');
      setStateUf('');
      setCity('');
      setDistrict('');
      setStreet('');
      setStreetNumber('');
      setComplement('');
      setPetRows([newPetDraft()]);
      setError(null);
      setDuplicateHint(null);
      setSubmitting(false);
    }
  }, [open]);

  const speciesOptionsByRow = useMemo(
    () => petRows.map((row) => mergeSpeciesComboboxOptions(row.species)),
    [petRows],
  );

  const breedOptionsByRow = useMemo(
    () => petRows.map((row) => mergeBreedComboboxOptions(row.species, row.breed)),
    [petRows],
  );

  const checkDuplicateGuardian = async () => {
    if (!clinicId || petsOnly) return;
    const q = digitsOnly(taxId).length >= 11 ? digitsOnly(taxId) : phone.trim();
    if (!q) {
      setDuplicateHint(null);
      return;
    }
    try {
      const { guardians } = await hubGuardiansApi.list(clinicId, false, { status: 'active', q });
      const hit = guardians[0];
      if (hit) {
        setDuplicateHint(
          `Já existe o cliente «${hit.full_name}». Selecione-o na lista em vez de cadastrar de novo.`,
        );
      } else {
        setDuplicateHint(null);
      }
    } catch {
      setDuplicateHint(null);
    }
  };

  const onCepBlur = async () => {
    const cep = digitsOnly(postalCode);
    if (cep.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const j = (await r.json()) as {
        erro?: boolean;
        localidade?: string;
        uf?: string;
        bairro?: string;
        logradouro?: string;
      };
      if (j.erro) return;
      if (j.localidade) setCity(j.localidade);
      if (j.uf) setStateUf(j.uf);
      if (j.bairro) setDistrict(j.bairro);
      if (j.logradouro) setStreet(j.logradouro);
    } catch {
      /* ignore */
    }
  };

  const patchPetRow = (key: string, patch: Partial<PetDraft>) => {
    setPetRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const onPetSpeciesChange = (key: string, species: string, current: PetDraft) => {
    if (!species.trim()) {
      patchPetRow(key, { species: '', breed: '', isSRD: false, sizeTier: '' });
      return;
    }
    const nextBreeds = wizardBreedOptionsForSpecies(species).filter((o) => o.value !== '');
    const keepBreed = !!current.breed.trim() && nextBreeds.some((o) => o.value === current.breed);
    const nextBreed = keepBreed ? current.breed : '';
    const sug = nextBreed ? defaultBodyPorteForBreed(species, nextBreed) : '';
    patchPetRow(key, {
      species,
      breed: nextBreed,
      isSRD: false,
      ...(sug ? { sizeTier: sug } : { sizeTier: '' }),
    });
  };

  const onPetBreedChange = (key: string, breed: string, species: string) => {
    const sug = species.trim() ? defaultBodyPorteForBreed(species, breed) : '';
    patchPetRow(key, { breed, isSRD: false, ...(sug ? { sizeTier: sug } : {}) });
  };

  const addPetRow = () => setPetRows((prev) => [...prev, newPetDraft()]);

  const removePetRow = (key: string) => {
    setPetRows((prev) => {
      if (prev.length <= 1) return [newPetDraft()];
      return prev.filter((r) => r.key !== key);
    });
  };

  const handleSubmit = async () => {
    if (!clinicId) return;
    setError(null);

    let guardianId = existingGuardianId ?? '';
    let guardianName = existingGuardianName ?? '';

    if (!petsOnly) {
      if (!fullName.trim()) {
        setError(isCompany ? 'Informe o nome fantasia.' : 'Informe o nome do tutor.');
        return;
      }
      if (!phone.trim()) {
        setError('Informe o telefone.');
        return;
      }
      if (!taxId.trim()) {
        setError(isCompany ? 'Informe o CNPJ.' : 'Informe o CPF.');
        return;
      }
    } else if (!guardianId) {
      setError('Tutor não identificado. Feche e selecione o tutor no agendamento.');
      return;
    }

    const activePetRows = petRows.filter((r) => !isPetDraftEmpty(r));
    for (const row of activePetRows) {
      if (!isPetDraftComplete(row)) {
        setError(
          'Preencha nome, espécie, raça (ou SRD) e porte de cada pet ou remova a linha incompleta.',
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      if (!petsOnly) {
        const q = digitsOnly(taxId).length >= 11 ? digitsOnly(taxId) : phone.trim();
        if (q) {
          const { guardians } = await hubGuardiansApi.list(clinicId, false, { status: 'active', q });
          const hit = guardians[0];
          if (hit) {
            setError(`Cliente já cadastrado: ${hit.full_name}. Selecione-o na lista.`);
            setSubmitting(false);
            return;
          }
        }
        const { guardian } = await hubGuardiansApi.create({
          clinic_id: clinicId,
          client_kind: clientKind,
          full_name: fullName.trim(),
          legal_name: isCompany && legalName.trim() ? legalName.trim() : null,
          phone: phone.trim(),
          tax_id: taxId.trim(),
          lead_source: 'Passante',
          postal_code: emptyOrNull(postalCode),
          state: emptyOrNull(stateUf),
          city: emptyOrNull(city),
          district: emptyOrNull(district),
          street: emptyOrNull(street),
          street_number: emptyOrNull(streetNumber),
          complement: emptyOrNull(complement),
        });
        guardianId = guardian.id;
        guardianName = guardian.full_name;
      }

      const createdPets: QuickRegisterPetResult[] = [];
      for (const row of activePetRows) {
        const breed = row.isSRD ? null : row.breed.trim() || null;
        const sizeTier = resolvePetBodyPorteForApi(row.sizeTier, row.species, breed ?? '');
        const { pet } = await hubPetsApi.create({
          clinic_id: clinicId,
          name: row.name.trim(),
          species: row.species.trim(),
          breed,
          size_tier: sizeTier,
          coat_type: row.coatType || null,
          primary_guardian_id: guardianId,
        });
        createdPets.push({
          id: pet.id,
          name: pet.name,
          size_tier: pet.size_tier,
          coat_type: pet.coat_type ?? null,
          birth_date: pet.birth_date ?? null,
        });
      }

      await onSaved({
        guardian: { id: guardianId, full_name: guardianName },
        pets: createdPets,
      });
      onClose();
    } catch (e: unknown) {
      setError((e as Error)?.message || 'Erro ao salvar cadastro.');
    } finally {
      setSubmitting(false);
    }
  };

  const title = petsOnly ? 'Cadastrar pets' : 'Cadastro rápido';
  const subtitle = petsOnly
    ? `Adicionar pets para ${existingGuardianName || 'o tutor selecionado'}.`
    : 'Tutor ou empresa e um ou mais pets para agendar ou registrar encaixe.';

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title={title}
      titleIcon={<User size={22} strokeWidth={2} aria-hidden />}
      subtitle={subtitle}
      footer={
        <>
          {error ? (
            <span className="nam-footer-error">
              <AlertCircle size={14} /> {error}
            </span>
          ) : null}
          <HubCancelButton onClick={onClose} disabled={submitting} />
          <button
            type="button"
            className="hub-btn hub-btn--primary"
            disabled={submitting}
            onClick={() => void handleSubmit()}
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="nam-field-shell__spin" aria-hidden /> Salvando…
              </>
            ) : (
              'Salvar'
            )}
          </button>
        </>
      }
    >
      <div className="nam-form rqr-form">
        {!petsOnly ? (
          <section className="rqr-section" aria-labelledby="rqr-guardian-heading">
            <h3 id="rqr-guardian-heading" className="rqr-section__title">
              <User size={18} strokeWidth={2} aria-hidden />
              Cliente
            </h3>
            <div className="rqr-section__body">
              <div className="rqr-segmented" role="tablist" aria-label="Tipo de cliente">
                <button
                  type="button"
                  role="tab"
                  aria-selected={!isCompany}
                  className={`rqr-segmented__btn${!isCompany ? ' rqr-segmented__btn--active' : ''}`}
                  onClick={() => setClientKind('individual')}
                >
                  <User size={16} strokeWidth={2} aria-hidden />
                  Tutor
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={isCompany}
                  className={`rqr-segmented__btn${isCompany ? ' rqr-segmented__btn--active' : ''}`}
                  onClick={() => setClientKind('company')}
                >
                  <Building2 size={16} strokeWidth={2} aria-hidden />
                  Empresa
                </button>
              </div>

              <div className="nam-field">
                <label className="nam-label" htmlFor="rqr-name">
                  {isCompany ? 'Nome fantasia' : 'Nome completo'}
                </label>
                <input
                  id="rqr-name"
                  className="nam-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete={isCompany ? 'organization' : 'name'}
                  placeholder={isCompany ? 'Nome da empresa' : 'Nome completo do tutor'}
                />
              </div>

              {isCompany ? (
                <div className="nam-field">
                  <label className="nam-label" htmlFor="rqr-legal-name">
                    Razão social
                  </label>
                  <input
                    id="rqr-legal-name"
                    className="nam-input"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    placeholder="Opcional"
                  />
                </div>
              ) : null}

              <div className="nam-row nam-row--cols2">
                <div className="nam-field">
                  <label className="nam-label" htmlFor="rqr-phone">
                    Telefone
                  </label>
                  <HubBrPhoneInput
                    id="rqr-phone"
                    className="nam-input"
                    value={phone}
                    onChange={setPhone}
                    onBlur={() => void checkDuplicateGuardian()}
                  />
                </div>
                <div className="nam-field">
                  <label className="nam-label" htmlFor="rqr-tax">
                    {isCompany ? 'CNPJ' : 'CPF'}
                  </label>
                  <input
                    id="rqr-tax"
                    className="nam-input"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    onBlur={() => void checkDuplicateGuardian()}
                    placeholder={isCompany ? 'CNPJ' : 'CPF'}
                    inputMode="numeric"
                  />
                </div>
              </div>
              {duplicateHint ? <p className="nam-muted">{duplicateHint}</p> : null}

              <div className="rqr-address-block">
                <p className="rqr-address-block__title">
                  <MapPin size={16} strokeWidth={2} aria-hidden />
                  Endereço
                  <span className="rqr-address-block__hint">para leva e traz</span>
                </p>
                <div className="nam-row nam-row--cols2">
                  <div className="nam-field">
                    <label className="nam-label" htmlFor="rqr-cep">
                      CEP
                    </label>
                    <input
                      id="rqr-cep"
                      className="nam-input"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      onBlur={() => void onCepBlur()}
                      placeholder="00000-000"
                      inputMode="numeric"
                      autoComplete="postal-code"
                    />
                  </div>
                  <div className="nam-field">
                    <label className="nam-label" htmlFor="rqr-uf">
                      Estado
                    </label>
                    <input
                      id="rqr-uf"
                      className="nam-input"
                      value={stateUf}
                      onChange={(e) => setStateUf(e.target.value)}
                      placeholder="UF"
                      autoComplete="address-level1"
                    />
                  </div>
                </div>
                <div className="nam-row nam-row--cols2">
                  <div className="nam-field">
                    <label className="nam-label" htmlFor="rqr-city">
                      Cidade
                    </label>
                    <input
                      id="rqr-city"
                      className="nam-input"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      autoComplete="address-level2"
                    />
                  </div>
                  <div className="nam-field">
                    <label className="nam-label" htmlFor="rqr-district">
                      Bairro
                    </label>
                    <input
                      id="rqr-district"
                      className="nam-input"
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      autoComplete="address-level3"
                    />
                  </div>
                </div>
                <div className="nam-field">
                  <label className="nam-label" htmlFor="rqr-street">
                    Endereço
                  </label>
                  <input
                    id="rqr-street"
                    className="nam-input"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    autoComplete="street-address"
                  />
                </div>
                <div className="nam-row nam-row--cols2">
                  <div className="nam-field">
                    <label className="nam-label" htmlFor="rqr-number">
                      Número
                    </label>
                    <input
                      id="rqr-number"
                      className="nam-input"
                      value={streetNumber}
                      onChange={(e) => setStreetNumber(e.target.value)}
                    />
                  </div>
                  <div className="nam-field">
                    <label className="nam-label" htmlFor="rqr-complement">
                      Complemento
                    </label>
                    <input
                      id="rqr-complement"
                      className="nam-input"
                      value={complement}
                      onChange={(e) => setComplement(e.target.value)}
                      placeholder="Apto, bloco…"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <div className="rqr-guardian-banner" role="status">
            <User size={18} strokeWidth={2} aria-hidden />
            <span>
              Tutor: <strong>{existingGuardianName || '—'}</strong>
            </span>
          </div>
        )}

        <section className="rqr-section" aria-labelledby="rqr-pets-heading">
          <h3 id="rqr-pets-heading" className="rqr-section__title">
            <Dog size={18} strokeWidth={2} aria-hidden />
            Pets
          </h3>
          <p className="nam-muted rqr-section__hint">
            Adicione um ou mais pets. Linhas em branco são ignoradas ao salvar.
          </p>
          <div className="rqr-pets-list">
            {petRows.map((row, index) => (
              <div key={row.key} className="rqr-pet-card">
                <div className="rqr-pet-card__head">
                  <span className="rqr-pet-card__label">Pet {index + 1}</span>
                  {petRows.length > 1 ? (
                    <button
                      type="button"
                      className="rqr-pet-card__remove"
                      aria-label={`Remover pet ${index + 1}`}
                      onClick={() => removePetRow(row.key)}
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  ) : null}
                </div>
                <div className="nam-field">
                  <label className="nam-label" htmlFor={`rqr-pet-name-${row.key}`}>
                    Nome
                  </label>
                  <input
                    id={`rqr-pet-name-${row.key}`}
                    className="nam-input"
                    value={row.name}
                    onChange={(e) => patchPetRow(row.key, { name: e.target.value })}
                  />
                </div>
                <div className="nam-row nam-row--cols2">
                  <div className="nam-field">
                    <label className="nam-label" htmlFor={`rqr-species-${row.key}`}>
                      Espécie
                    </label>
                    <HubSearchableCombobox
                      id={`rqr-species-${row.key}`}
                      options={speciesOptionsByRow[index] ?? []}
                      value={row.species}
                      onChange={(v) => onPetSpeciesChange(row.key, v, row)}
                      allowCreate
                      createEntityLabel="espécie"
                      placeholder="Ex.: Cão, Gato…"
                      clearable={false}
                    />
                  </div>
                  <div className="nam-field">
                    <label className="nam-label" htmlFor={`rqr-breed-${row.key}`}>
                      Raça
                    </label>
                    <HubSearchableCombobox
                      id={`rqr-breed-${row.key}`}
                      options={breedOptionsByRow[index] ?? []}
                      value={row.isSRD ? '' : row.breed}
                      onChange={(v) => onPetBreedChange(row.key, v, row.species)}
                      allowCreate
                      createEntityLabel="raça"
                      placeholder="Selecionar raça…"
                      disabled={row.isSRD || !row.species.trim()}
                      clearable={false}
                    />
                  </div>
                </div>
                <div className="rqr-srd-row">
                  <button
                    type="button"
                    className={`rqr-srd-switch${row.isSRD ? ' rqr-srd-switch--on' : ''}`}
                    role="switch"
                    aria-checked={row.isSRD}
                    aria-label="SRD — sem raça definida"
                    onClick={() => {
                      const next = !row.isSRD;
                      patchPetRow(row.key, { isSRD: next, breed: next ? '' : row.breed });
                    }}
                  />
                  <span className="nam-label rqr-srd-label">SRD</span>
                  <span
                    className="rqr-srd-hint"
                    title="Sem raça definida — raça desconhecida ou vira-lata"
                  >
                    <HelpCircle size={14} strokeWidth={2} aria-hidden />
                  </span>
                </div>
                <div className="nam-row nam-row--cols2">
                  <div className="nam-field">
                    <label className="nam-label" htmlFor={`rqr-porte-${row.key}`}>
                      Porte
                    </label>
                    <HubSearchableCombobox
                      id={`rqr-porte-${row.key}`}
                      options={PORTE_OPTIONS}
                      value={row.sizeTier}
                      onChange={(v) => patchPetRow(row.key, { sizeTier: v as PetBodyPorteValue })}
                      placeholder="Selecionar…"
                      clearable={false}
                    />
                  </div>
                  <div className="nam-field">
                    <label className="nam-label" htmlFor={`rqr-coat-${row.key}`}>
                      Pelagem
                    </label>
                    <HubSearchableCombobox
                      id={`rqr-coat-${row.key}`}
                      options={COAT_OPTIONS}
                      value={row.coatType}
                      onChange={(v) => patchPetRow(row.key, { coatType: v as CoatTypeValue })}
                      placeholder="Selecionar…"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="rqr-add-pet-btn" onClick={addPetRow}>
            <Plus size={16} strokeWidth={2} aria-hidden />
            Adicionar outro pet
          </button>
        </section>
      </div>
    </HubSidePanel>
  );
};
