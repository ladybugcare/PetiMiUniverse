import React, { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { HubCancelButton, HubSidePanel, HubSearchableCombobox } from '@petimi/hub-ui';
import '@petimi/hub-ui/pages/clientes/clientes.css';
import { hubClinicProfileApi } from '../../services/hubClinicProfileApi';
import { BRAZILIAN_UF_COMBO_OPTIONS } from '../../utils/brValidators';
import type { HubClinicProfile } from '../../types/hubClinicProfile';

export type HubClinicEditPanelProps = {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  clinic: HubClinicProfile;
  onSaved: (clinic: HubClinicProfile) => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

const HubClinicEditPanel: React.FC<HubClinicEditPanelProps> = ({
  open,
  onClose,
  clinicId,
  clinic,
  onSaved,
  onError,
  onSuccess,
}) => {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    city: '',
    state: 'SP',
    description: '',
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      name: clinic.name?.trim() || '',
      phone: clinic.phone?.trim() || '',
      address: clinic.address?.trim() || '',
      city: clinic.city?.trim() || '',
      state: clinic.state?.trim() || 'SP',
      description: clinic.description?.trim() || '',
    });
  }, [open, clinic]);

  const valid =
    form.name.trim().length >= 2 &&
    form.address.trim().length >= 3 &&
    form.city.trim().length >= 2 &&
    form.state.length === 2;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const res = await hubClinicProfileApi.patchClinic(clinicId, {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state,
        description: form.description.trim() || null,
      });
      onSaved(res.clinic);
      onSuccess('Dados da clínica atualizados.');
      onClose();
    } catch (e: unknown) {
      onError((e as Error)?.message || 'Erro ao guardar clínica');
    } finally {
      setSaving(false);
    }
  };

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title="Editar clínica"
      titleIcon={<Building2 size={20} aria-hidden />}
      subtitle="Razão social e contacto da organização"
      footer={
        <div className="hub-clientes__btn-row">
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={!valid || saving}
            onClick={() => void save()}
          >
            {saving ? 'A guardar…' : 'Guardar'}
          </button>
          <HubCancelButton onClick={onClose} />
        </div>
      }
    >
      <div className="hub-clientes__form-grid" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="edit-cl-name">
            Nome da clínica
          </label>
          <input
            id="edit-cl-name"
            className="hub-clientes__input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="edit-cl-phone">
            Telefone comercial
          </label>
          <input
            id="edit-cl-phone"
            className="hub-clientes__input"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </div>
        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="edit-cl-addr">
            Endereço
          </label>
          <input
            id="edit-cl-addr"
            className="hub-clientes__input"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          />
        </div>
        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="edit-cl-city">
            Cidade
          </label>
          <input
            id="edit-cl-city"
            className="hub-clientes__input"
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
          />
        </div>
        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="edit-cl-uf">
            UF
          </label>
          <HubSearchableCombobox
            id="edit-cl-uf"
            className="hub-combobox--clientes"
            options={BRAZILIAN_UF_COMBO_OPTIONS}
            value={form.state}
            onChange={(v) => setForm((f) => ({ ...f, state: v }))}
            placeholder="Selecionar UF"
            searchPlaceholder="Buscar estado…"
            allowCreate={false}
            clearable={false}
            ariaLabel="UF da clínica"
          />
        </div>
        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="edit-cl-desc">
            Descrição
          </label>
          <textarea
            id="edit-cl-desc"
            className="hub-clientes__input"
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
      </div>
    </HubSidePanel>
  );
};

export default HubClinicEditPanel;
