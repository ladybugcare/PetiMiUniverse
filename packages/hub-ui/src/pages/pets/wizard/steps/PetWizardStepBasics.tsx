import React, { useMemo } from 'react';
import { Check, FileText, Heart, HelpCircle, X } from 'lucide-react';
import { HubDateField } from '../../../../components/HubDateField';
import { HubSearchableCombobox } from '../../../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../../../components/HubSearchableCombobox';
import type { PetWizardState } from '../types';
import { mergeBreedComboboxOptions, mergeSpeciesComboboxOptions } from '../petSpeciesComboboxData';
import { wizardBreedOptionsForSpecies } from '../petSpeciesBreedOptions';
import { petAgeLabel } from '../../petAge';
import { defaultBodyPorteForBreed } from '../../../../data/breedDefaultSizeTier';
import { COAT_TYPE_LABELS, COAT_TYPE_VALUES } from '../../../../utils/hubServiceTypesPricingMatrix';

const SIZE_OPTIONS: HubComboboxOption[] = [
  { value: '', label: '—' },
  { value: 'mini', label: 'Mini' },
  { value: 'pequeno', label: 'Pequeno' },
  { value: 'medio', label: 'Médio' },
  { value: 'grande', label: 'Grande' },
  { value: 'gigante', label: 'Gigante' },
];

const REFERRAL_OPTIONS: HubComboboxOption[] = [
  { value: '', label: '—' },
  { value: 'Indicação', label: 'Indicação' },
  { value: 'Instagram', label: 'Instagram' },
  { value: 'Google', label: 'Google' },
  { value: 'Já era cliente', label: 'Já era cliente' },
  { value: 'Passante', label: 'Passante' },
  { value: 'Outro', label: 'Outro' },
];

const COAT_TYPE_OPTIONS: HubComboboxOption[] = [
  { value: '', label: '—' },
  ...COAT_TYPE_VALUES.map((v) => ({ value: v, label: COAT_TYPE_LABELS[v] })),
];

type Props = {
  state: PetWizardState;
  update: (p: Partial<PetWizardState>) => void;
  photoPreview: string | null;
  onPhotoChange: (file: File | null) => void;
};

export const PetWizardStepBasics: React.FC<Props> = ({ state, update, photoPreview, onPhotoChange }) => {
  const age = petAgeLabel(state.birth_date || null);
  const speciesTrim = state.species.trim();

  const speciesComboOptions = useMemo(() => mergeSpeciesComboboxOptions(state.species), [state.species]);
  const breedComboOptions = useMemo(
    () => mergeBreedComboboxOptions(state.species, state.breed),
    [state.species, state.breed],
  );

  const onSpeciesChange = (species: string) => {
    if (!species.trim()) {
      update({ species: '', breed: '', isSRD: false, size: '' });
      return;
    }
    const nextBreeds = wizardBreedOptionsForSpecies(species).filter((o) => o.value !== '');
    const keepBreed = !!state.breed.trim() && nextBreeds.some((o) => o.value === state.breed);
    const nextBreed = keepBreed ? state.breed : '';
    const sug = nextBreed ? defaultBodyPorteForBreed(species, nextBreed) : '';
    update({
      species,
      breed: nextBreed,
      isSRD: false,
      ...(sug ? { size: sug } : { size: '' }),
    });
  };

  return (
    <div className="pet-wizard__basics">
      <div className="pet-wizard__block-head">
        <span className="pet-wizard__block-head-icon pet-wizard__block-head-icon--brand" aria-hidden>
          <Heart size={22} strokeWidth={2} />
        </span>
        <div>
          <h3 className="pet-wizard__block-title">Informações básicas</h3>
          <p className="pet-wizard__block-sub">Os dados abaixo são essenciais para o cadastro do pet.</p>
        </div>
      </div>

      <div className="pet-wizard__photo-block">
        <div>
          <div className="pet-wizard__photo-drop">
            {photoPreview ? (
              <img src={photoPreview} alt="" />
            ) : (
              <>
                Adicionar foto
                <span className="pet-wizard__photo-hint">PNG, JPG ou WEBP · máx. 5 MB (opcional)</span>
              </>
            )}
          </div>
          <label className="pet-wizard__btn pet-wizard__btn--ghost pet-wizard__photo-file-btn">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hub-pets-sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) {
                  onPhotoChange(null);
                  return;
                }
                if (f.size > 5 * 1024 * 1024) {
                  e.target.value = '';
                  return;
                }
                onPhotoChange(f);
              }}
            />
            Escolher arquivo
          </label>
        </div>
        <div className="pet-wizard__fields">
          <div>
            <label className="pet-wizard__label">
              Nome do pet <span className="req">*</span>
            </label>
            <input
              className="pet-wizard__input"
              value={state.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="Ex.: Mel, Thor, Luna"
            />
          </div>
          <div>
            <label className="pet-wizard__label">Apelido (opcional)</label>
            <input
              className="pet-wizard__input"
              value={state.nickname}
              onChange={(e) => update({ nickname: e.target.value })}
              placeholder="Ex.: Mell, Thorzinho"
            />
          </div>
          <div>
            <label className="pet-wizard__label" htmlFor="pet-wizard-species">
              Espécie <span className="req">*</span>
            </label>
            <HubSearchableCombobox
              id="pet-wizard-species"
              className="pet-wizard__combobox"
              options={speciesComboOptions}
              value={state.species}
              onChange={onSpeciesChange}
              placeholder="Selecionar espécie"
              searchPlaceholder="Buscar espécie…"
              allowCreate
              createEntityLabel="espécie"
              ariaLabel="Espécie do pet"
            />
          </div>
          <div>
            <label className="pet-wizard__label" htmlFor="pet-wizard-breed">
              Raça {!state.isSRD ? <span className="req">*</span> : null}
            </label>
            <HubSearchableCombobox
              id="pet-wizard-breed"
              className="pet-wizard__combobox"
              options={breedComboOptions}
              value={state.isSRD ? '' : state.breed}
              onChange={(v) => {
                const sug = speciesTrim ? defaultBodyPorteForBreed(speciesTrim, v) : '';
                update({ breed: v, isSRD: false, ...(sug ? { size: sug } : {}) });
              }}
              placeholder="Selecionar raça"
              searchPlaceholder="Buscar raça…"
              allowCreate
              createEntityLabel="raça"
              disabled={state.isSRD || !speciesTrim}
              ariaLabel="Raça do pet"
            />
          </div>
          <div className="pet-wizard__field--full">
            <div className="pet-wizard__toggle-row">
              <button
                type="button"
                className={`pet-wizard__switch ${state.isSRD ? 'pet-wizard__switch--on' : ''}`}
                role="switch"
                aria-checked={state.isSRD}
                aria-label="SRD — sem raça definida"
                onClick={() => {
                  const next = !state.isSRD;
                  update({ isSRD: next, breed: next ? '' : state.breed });
                }}
              />
              <span className="pet-wizard__label pet-wizard__label--inline">SRD</span>
              <span className="pet-wizard__hint-icon" title="Sem raça definida — raça desconhecida ou vira-lata">
                <HelpCircle size={16} strokeWidth={2} aria-hidden />
              </span>
            </div>
          </div>
          <div className="pet-wizard__field--full">
            <label className="pet-wizard__label">
              Sexo <span className="req">*</span>
            </label>
            <div className="pet-wizard__seg">
              {(
                [
                  ['M', 'Macho'],
                  ['F', 'Fêmea'],
                  ['U', 'Indefinido'],
                ] as const
              ).map(([v, lab]) => (
                <button
                  key={v}
                  type="button"
                  className={`pet-wizard__seg-btn ${state.sex === v ? 'pet-wizard__seg-btn--on' : ''}`}
                  onClick={() => update({ sex: v })}
                >
                  {lab}
                </button>
              ))}
            </div>
          </div>
          <div className="pet-wizard__field--full">
            <label className="pet-wizard__label">
              Castrado(a)? <span className="req">*</span>
            </label>
            <div className="pet-wizard__seg">
              {(
                [
                  ['Y', 'Sim', Check],
                  ['N', 'Não', X],
                ] as const
              ).map(([v, lab, Icon]) => (
                <button
                  key={v}
                  type="button"
                  className={`pet-wizard__seg-btn pet-wizard__seg-btn--neuter pet-wizard__seg-btn--neuter-${v.toLowerCase()} ${
                    state.neutered === v ? 'pet-wizard__seg-btn--on' : ''
                  }`}
                  onClick={() => update({ neutered: v })}
                >
                  <Icon size={18} strokeWidth={2.25} aria-hidden />
                  {lab}
                </button>
              ))}
            </div>
          </div>
          <div>
            <HubDateField
              id="pet-wizard-birth-date"
              label="Data de nascimento *"
              valueIso={state.birth_date}
              onChangeIso={(iso) => update({ birth_date: iso })}
              required
            />
          </div>
          <div>
            <label className="pet-wizard__label">Idade</label>
            <input className="pet-wizard__input pet-wizard__input--readonly" value={age} readOnly tabIndex={-1} aria-readonly />
          </div>
          <div>
            <label className="pet-wizard__label">Cor</label>
            <input
              className="pet-wizard__input"
              value={state.coatColor}
              onChange={(e) => update({ coatColor: e.target.value })}
              placeholder="Ex.: Caramelo"
            />
          </div>
          <div>
            <label className="pet-wizard__label" htmlFor="pet-wizard-coat-type">
              Pelagem
            </label>
            <HubSearchableCombobox
              id="pet-wizard-coat-type"
              className="pet-wizard__combobox"
              options={COAT_TYPE_OPTIONS}
              value={state.coatType}
              onChange={(v) => update({ coatType: v })}
              placeholder="Selecionar pelagem"
              searchPlaceholder="Buscar pelagem…"
              allowCreate={false}
              ariaLabel="Pelagem do pet"
            />
          </div>
          <div>
            <label className="pet-wizard__label">Microchip (opcional)</label>
            <input
              className="pet-wizard__input"
              value={state.microchip}
              onChange={(e) => update({ microchip: e.target.value })}
              placeholder="Número alfanumérico (não é o PetMi ID)"
            />
          </div>
          <div>
            <label className="pet-wizard__label">Peso (kg)</label>
            <input
              className="pet-wizard__input"
              inputMode="decimal"
              value={state.weightKg}
              onChange={(e) => update({ weightKg: e.target.value })}
              placeholder="opcional"
            />
          </div>
          <div>
            <label className="pet-wizard__label">Altura (cm)</label>
            <input
              className="pet-wizard__input"
              inputMode="numeric"
              value={state.heightCm}
              onChange={(e) => update({ heightCm: e.target.value })}
              placeholder="opcional"
            />
          </div>
          <div>
            <label className="pet-wizard__label" htmlFor="pet-wizard-size">
              Porte
            </label>
            <HubSearchableCombobox
              id="pet-wizard-size"
              className="pet-wizard__combobox"
              options={SIZE_OPTIONS}
              value={state.size}
              onChange={(v) => update({ size: v })}
              placeholder="—"
              searchPlaceholder="Buscar porte…"
              allowCreate={false}
              ariaLabel="Porte do pet"
            />
          </div>
        </div>
      </div>

      <div className="pet-wizard__basics-divider" />

      <div className="pet-wizard__block-head">
        <span className="pet-wizard__block-head-icon" aria-hidden>
          <FileText size={22} strokeWidth={2} />
        </span>
        <div>
          <h3 className="pet-wizard__block-title">Outras informações</h3>
          <p className="pet-wizard__block-sub">Preferências e contexto para a equipe.</p>
        </div>
      </div>

      <div className="pet-wizard__fields">
        <div className="pet-wizard__field--full">
          <label className="pet-wizard__label" htmlFor="pet-wizard-referral">
            Como nos conheceu?
          </label>
          <HubSearchableCombobox
            id="pet-wizard-referral"
            className="pet-wizard__combobox"
            options={REFERRAL_OPTIONS}
            value={state.referralSource}
            onChange={(v) => update({ referralSource: v })}
            placeholder="—"
            searchPlaceholder="Buscar origem…"
            allowCreate={false}
            ariaLabel="Como nos conheceu"
          />
        </div>
        <div className="pet-wizard__field--full">
          <label className="pet-wizard__label">Frequenta outros locais?</label>
          <div className="pet-wizard__seg">
            {(
              [
                ['Y', 'Sim'],
                ['N', 'Não'],
              ] as const
            ).map(([v, lab]) => (
              <button
                key={v}
                type="button"
                className={`pet-wizard__seg-btn ${state.visitsOther === v ? 'pet-wizard__seg-btn--on' : ''}`}
                onClick={() => update({ visitsOther: v })}
              >
                {lab}
              </button>
            ))}
          </div>
        </div>
        <div className="pet-wizard__field--full">
          <label className="pet-wizard__label">Observações</label>
          <textarea
            className="pet-wizard__textarea"
            value={state.otherObservations}
            onChange={(e) => update({ otherObservations: e.target.value })}
            placeholder="Preferências, alertas, contexto…"
          />
        </div>
      </div>
    </div>
  );
};
