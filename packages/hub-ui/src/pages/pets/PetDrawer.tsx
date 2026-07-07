import React, { useMemo } from 'react';
import { Dog } from 'lucide-react';
import type { HubGuardian } from '../../api/hubGuardiansApi';
import type { HubPet } from '../../api/hubPetsApi';
import { HubSidePanel } from '../../components/HubSidePanel';
import { PetForm } from './PetForm';
import { PetDetailPanel } from './PetDetailPanel';
import type { PetFormValues } from './PetFormValues';
import { petAgeDetailedLabel } from './petAge';
import '../clientes/clientes.css';
import '../clientes/clientes-drawer.css';
import './pets-page.css';

export type PetDrawerMode = 'create' | 'edit' | 'detail';

export type PetDrawerProps = {
  open: boolean;
  onClose: () => void;
  mode: PetDrawerMode;
  canWrite: boolean;
  form: PetFormValues;
  onFormChange: (next: PetFormValues) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  guardians: HubGuardian[];
  pet: HubPet | null;
  editingId: string | null;
  onStartEdit: () => void;
  onOpenInNewPage: () => void;
  onArchive?: () => void;
  onCancelEdit: () => void;
  clinicId: string | null;
  unitId: string | null;
  canCreateReceivable: boolean;
};

const PET_FORM_ID = 'hub-pet-drawer-form';

export const PetDrawer: React.FC<PetDrawerProps> = ({
  open,
  onClose,
  mode,
  canWrite,
  form,
  onFormChange,
  onSubmit,
  submitting,
  guardians,
  pet,
  editingId,
  onStartEdit,
  onOpenInNewPage,
  onArchive,
  onCancelEdit,
  clinicId,
  unitId,
  canCreateReceivable,
}) => {
  const title = useMemo(() => {
    if (mode === 'detail' && pet) return pet.name;
    if (mode === 'edit') return 'Editar pet';
    return 'Cadastro rápido de pet';
  }, [mode, pet]);

  const subtitle = useMemo(() => {
    if (mode === 'detail' && pet) {
      const breed = pet.breed?.trim();
      const parts = [pet.species, breed || 'SRD'].filter(Boolean);
      const line = parts.join(' · ');
      const age = petAgeDetailedLabel(pet.birth_date);
      return [line, age].filter((s) => s && s !== '—').join(' · ') || undefined;
    }
    return undefined;
  }, [mode, pet]);

  const footer = useMemo(() => {
    if (mode === 'detail' && pet && canWrite) {
      return (
        <div className="hub-finance-page__drawer-footer">
          <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={onClose}>
            Fechar
          </button>
          <button type="button" className="hub-clientes__btn hub-clientes__btn--outline" onClick={onStartEdit}>
            Editar pet
          </button>
          <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={onOpenInNewPage}>
            Ver perfil completo
          </button>
        </div>
      );
    }

    if (mode === 'create' || mode === 'edit') {
      return (
        <div className="hub-finance-page__drawer-footer">
          <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={onCancelEdit} disabled={submitting}>
            Cancelar
          </button>
          <button
            type="submit"
            form={PET_FORM_ID}
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={submitting || !canWrite}
          >
            {submitting ? 'Salvando…' : mode === 'edit' ? 'Salvar alterações' : 'Adicionar pet'}
          </button>
        </div>
      );
    }

    if (mode === 'detail') {
      return (
        <div className="hub-finance-page__drawer-footer">
          <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={onClose}>
            Fechar
          </button>
        </div>
      );
    }

    return undefined;
  }, [mode, pet, canWrite, onClose, onStartEdit, onOpenInNewPage, onCancelEdit, submitting]);

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title={title}
      titleIcon={<Dog size={20} strokeWidth={2} aria-hidden />}
      subtitle={subtitle}
      footer={footer}
    >
      <div className="hub-clientes-drawer__content">
        {mode === 'detail' && pet ? (
          <PetDetailPanel
            pet={pet}
            onClose={onClose}
            onStartEdit={onStartEdit}
            onOpenInNewPage={onOpenInNewPage}
            onArchive={onArchive}
            hideNewPageButton
            hideHeader
            hideFooter
            canWrite={canWrite}
            clinicId={clinicId}
            unitId={unitId}
            canCreateReceivable={canCreateReceivable}
          />
        ) : (
          <PetForm
            key={mode === 'edit' ? `edit-${editingId}` : 'create-pet'}
            value={form}
            onChange={onFormChange}
            onSubmit={onSubmit}
            guardians={guardians}
            submitting={submitting}
            canWrite={canWrite}
            title=""
            isEdit={mode === 'edit'}
            showOptionalPhoto={mode === 'create'}
            hideFooter
            formId={PET_FORM_ID}
          />
        )}
      </div>
    </HubSidePanel>
  );
};

export default PetDrawer;
