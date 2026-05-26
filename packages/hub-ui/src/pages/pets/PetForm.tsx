import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { HubGuardian } from '../../api/hubGuardiansApi';
import type { PetFormValues } from './PetFormValues';
import { HubBrDateInput } from '../../components/HubBrDateInput';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { mergeBreedComboboxOptions, mergeSpeciesComboboxOptions } from './wizard/petSpeciesComboboxData';
import { wizardBreedOptionsForSpecies } from './wizard/petSpeciesBreedOptions';

const PET_FORM_SEX_OPTIONS: HubComboboxOption[] = [
  { value: '', label: '—' },
  { value: 'M', label: 'Macho' },
  { value: 'F', label: 'Fêmea' },
  { value: 'U', label: 'Indefinido' },
];

interface PetFormProps {
  value: PetFormValues;
  onChange: (next: PetFormValues) => void;
  onSubmit: (e: FormEvent) => void;
  guardians: HubGuardian[];
  submitting: boolean;
  canWrite: boolean;
  title: string;
  isEdit: boolean;
  onCancelEdit?: () => void;
  /** Mostra upload circular opcional (cadastro rápido). */
  showOptionalPhoto?: boolean;
}

export const PetForm: React.FC<PetFormProps> = ({
  value,
  onChange,
  onSubmit,
  guardians,
  submitting,
  canWrite,
  title,
  isEdit,
  onCancelEdit,
  showOptionalPhoto = false,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const patch = (partial: Partial<PetFormValues>) => {
    onChange({ ...value, ...partial });
  };

  const speciesTrim = value.species.trim();
  const breedTrim = value.breed.trim();

  const speciesComboOptions = useMemo(() => mergeSpeciesComboboxOptions(value.species), [value.species]);
  const breedComboOptions = useMemo(
    () => mergeBreedComboboxOptions(value.species, value.breed),
    [value.species, value.breed],
  );

  const primaryGuardianOptions = useMemo((): HubComboboxOption[] => {
    return guardians.map((g) => ({ value: g.id, label: g.full_name }));
  }, [guardians]);

  const secondaryGuardianOptions = useMemo((): HubComboboxOption[] => {
    return guardians
      .filter((g) => g.id !== value.primary_guardian_id)
      .map((g) => ({ value: g.id, label: g.full_name }));
  }, [guardians, value.primary_guardian_id]);

  const onSpeciesChange = (species: string) => {
    if (!species.trim()) {
      patch({ species: '', breed: '' });
      return;
    }
    const nextBreeds = wizardBreedOptionsForSpecies(species).filter((o) => o.value !== '');
    const keepBreed = !!breedTrim && nextBreeds.some((o) => o.value === value.breed);
    patch({ species, breed: keepBreed ? value.breed : '' });
  };

  const clearPhoto = () => {
    if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return;
    if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(URL.createObjectURL(f));
  };

  if (!canWrite) {
    return (
      <p className="hub-clientes__muted" style={{ margin: 0 }}>
        Não tem permissão para criar ou editar pets nesta clínica.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      {title ? <h2 className="hub-clientes__form-title">{title}</h2> : null}

      {showOptionalPhoto && (
        <div className="hub-pets-photo-field">
          <div className="hub-pets-photo-field__label-row">
            <span className="hub-pets-photo-field__title">Foto do pet</span>
            <span className="hub-pets-photo-field__optional">Opcional</span>
          </div>
          <div className="hub-pets-photo-field__row">
            <div className="hub-pets-photo-field__circle">
              {photoPreview ? (
                <img src={photoPreview} alt="" />
              ) : (
                <span>
                  Sem
                  <br />
                  foto
                </span>
              )}
            </div>
            <div className="hub-pets-photo-field__actions">
              <label className="hub-clientes__btn hub-clientes__btn--outline" style={{ cursor: 'pointer' }}>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={onPickFile}
                  className="hub-pets-sr-only"
                  aria-label="Escolher foto do pet (opcional)"
                />
                Escolher imagem
              </label>
              {photoPreview ? (
                <button type="button" className="hub-clientes__link-btn" onClick={clearPhoto}>
                  Remover foto
                </button>
              ) : null}
              <p className="hub-pets-photo-field__hint">
                Opcional: pré-visualização local. O armazenamento no perfil do pet será ligado numa próxima versão.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="hub-clientes__field">
        <label className="hub-clientes__label">Nome *</label>
        <input
          className="hub-clientes__input"
          value={value.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="Nome do animal"
          required
        />
      </div>
      <div className="hub-clientes__field">
        <label className="hub-clientes__label" htmlFor="pet-form-species">
          Espécie *
        </label>
        <HubSearchableCombobox
          id="pet-form-species"
          className="hub-combobox--clientes"
          options={speciesComboOptions}
          value={value.species}
          onChange={onSpeciesChange}
          placeholder="Selecionar espécie"
          searchPlaceholder="Buscar espécie…"
          allowCreate
          createEntityLabel="espécie"
          ariaLabel="Espécie do pet"
        />
      </div>
      <div className="hub-clientes__field">
        <label className="hub-clientes__label" htmlFor="pet-form-breed">
          Raça
        </label>
        <HubSearchableCombobox
          id="pet-form-breed"
          className="hub-combobox--clientes"
          options={breedComboOptions}
          value={value.breed}
          onChange={(v) => patch({ breed: v })}
          placeholder="Selecionar raça"
          searchPlaceholder="Buscar raça…"
          allowCreate
          createEntityLabel="raça"
          disabled={!speciesTrim}
          ariaLabel="Raça do pet"
        />
      </div>
      <div className="hub-clientes__field">
        <label className="hub-clientes__label" htmlFor="pet-form-sex">
          Sexo
        </label>
        <HubSearchableCombobox
          id="pet-form-sex"
          className="hub-combobox--clientes"
          options={PET_FORM_SEX_OPTIONS}
          value={value.sex}
          onChange={(v) => patch({ sex: v as PetFormValues['sex'] })}
          placeholder="—"
          searchPlaceholder="Buscar…"
          allowCreate={false}
          ariaLabel="Sexo do pet"
        />
      </div>
      <div className="hub-clientes__field">
        <label className="hub-clientes__label" htmlFor="pet-form-birth-date">
          Data de nascimento
        </label>
        <HubBrDateInput
          id="pet-form-birth-date"
          valueIso={value.birth_date}
          onChangeIso={(iso) => patch({ birth_date: iso })}
          className="hub-clientes__input"
        />
      </div>
      <div className="hub-clientes__field">
        <label className="hub-clientes__label" htmlFor="pet-form-primary-guardian">
          Tutor principal *
        </label>
        <HubSearchableCombobox
          id="pet-form-primary-guardian"
          className="hub-combobox--clientes"
          options={primaryGuardianOptions}
          value={value.primary_guardian_id}
          onChange={(v) => patch({ primary_guardian_id: v })}
          placeholder="— selecionar —"
          searchPlaceholder="Buscar tutor…"
          allowCreate={false}
          clearable={false}
          ariaLabel="Tutor principal"
        />
      </div>
      <div className="hub-clientes__field">
        <label className="hub-clientes__label" htmlFor="pet-form-secondary-guardian">
          Tutor secundário
        </label>
        <HubSearchableCombobox
          id="pet-form-secondary-guardian"
          className="hub-combobox--clientes"
          options={secondaryGuardianOptions}
          value={value.secondary_guardian_id}
          onChange={(v) => patch({ secondary_guardian_id: v })}
          placeholder="— nenhum —"
          searchPlaceholder="Buscar tutor…"
          allowCreate={false}
          ariaLabel="Tutor secundário"
        />
      </div>
      <div className="hub-clientes__field">
        <label className="hub-clientes__label">Notas</label>
        <textarea
          className="hub-clientes__textarea"
          value={value.notes}
          onChange={(e) => patch({ notes: e.target.value })}
          placeholder="Alertas clínicos, preferências, etc."
        />
      </div>
      <div className="hub-clientes__footer-btns">
        <button type="submit" className="hub-clientes__btn hub-clientes__btn--primary" disabled={submitting}>
          {isEdit ? 'Salvar alterações' : 'Adicionar pet'}
        </button>
        {isEdit && onCancelEdit && (
          <button type="button" className="hub-clientes__btn hub-clientes__btn--outline" onClick={onCancelEdit}>
            Cancelar edição
          </button>
        )}
      </div>
    </form>
  );
};
