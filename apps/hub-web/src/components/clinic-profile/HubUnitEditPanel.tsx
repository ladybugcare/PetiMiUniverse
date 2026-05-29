import React, { useEffect, useMemo, useState } from 'react';
import { Store } from 'lucide-react';
import { useAuth } from '@petimi/web-core';
import { getHubUserDisplayName } from '../../utils/hubUserDisplay';
import {
  HubCancelButton,
  HubSidePanel,
  HubSearchableCombobox,
  HubCheckbox,
  hubStaffApi,
  type HubComboboxOption,
} from '@petimi/hub-ui';
import '@petimi/hub-ui/pages/clientes/clientes.css';
import HubTechnicalManagerField from '../HubTechnicalManagerField';
import { hubClinicProfileApi } from '../../services/hubClinicProfileApi';
import { BRAZILIAN_UF_COMBO_OPTIONS } from '../../utils/brValidators';
import type { HubUnitProfile } from '../../types/hubClinicProfile';

export type HubUnitEditPanelProps = {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  unit: HubUnitProfile;
  onSaved: (unit: HubUnitProfile) => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

const HubUnitEditPanel: React.FC<HubUnitEditPanelProps> = ({
  open,
  onClose,
  clinicId,
  unit,
  onSaved,
  onError,
  onSuccess,
}) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [staffOptions, setStaffOptions] = useState<HubComboboxOption[]>([]);
  const [technicalManagerSelf, setTechnicalManagerSelf] = useState(true);
  const [technicalManagerName, setTechnicalManagerName] = useState('');
  const [form, setForm] = useState({
    name: '',
    nickname: '',
    address: '',
    city: '',
    state: 'SP',
    phone: '',
    is_main: false,
  });

  const selfDisplayName = useMemo(() => getHubUserDisplayName(user), [user]);

  useEffect(() => {
    if (!open || !clinicId) return;
    void hubStaffApi.list(clinicId, { active_only: true }).then((res) => {
      setStaffOptions(
        (res.staff || []).map((s) => ({
          value: s.full_name.trim(),
          label: s.display_name?.trim() || s.full_name.trim(),
        })),
      );
    });
  }, [open, clinicId]);

  useEffect(() => {
    if (!open) return;
    const rt = unit.technical_manager?.trim() || '';
    const selfNorm = selfDisplayName.trim().toLowerCase();
    const rtNorm = rt.toLowerCase();
    const isSelf = !rt || (selfNorm.length > 0 && rtNorm === selfNorm);

    setForm({
      name: unit.name?.trim() || '',
      nickname: unit.nickname?.trim() || '',
      address: unit.address?.trim() || '',
      city: unit.city?.trim() || '',
      state: unit.state?.trim() || 'SP',
      phone: unit.phone?.trim() || '',
      is_main: unit.is_main === true,
    });
    setTechnicalManagerSelf(isSelf);
    setTechnicalManagerName(isSelf ? '' : rt);
  }, [open, unit, selfDisplayName]);

  const technicalManagerResolved = technicalManagerSelf
    ? selfDisplayName.trim()
    : technicalManagerName.trim();

  const valid =
    form.name.trim().length >= 2 &&
    form.nickname.trim().length >= 1 &&
    form.address.trim().length >= 3 &&
    form.city.trim().length >= 2 &&
    form.state.length === 2 &&
    technicalManagerResolved.length >= 2;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const res = await hubClinicProfileApi.patchUnit(unit.id, clinicId, {
        name: form.name.trim(),
        nickname: form.nickname.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state,
        phone: form.phone.trim() || null,
        technical_manager: technicalManagerResolved,
        is_main: form.is_main,
      });
      onSaved(res.unit);
      onSuccess('Dados da unidade atualizados.');
      onClose();
    } catch (e: unknown) {
      onError((e as Error)?.message || 'Erro ao guardar unidade');
    } finally {
      setSaving(false);
    }
  };

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title="Editar unidade"
      titleIcon={<Store size={20} aria-hidden />}
      subtitle="Unidade operacional e responsável técnico"
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
          <label className="hub-clientes__label" htmlFor="edit-un-name">
            Nome da unidade
          </label>
          <input
            id="edit-un-name"
            className="hub-clientes__input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="edit-un-nick">
            Apelido (agenda)
          </label>
          <input
            id="edit-un-nick"
            className="hub-clientes__input"
            value={form.nickname}
            onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
          />
        </div>
        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="edit-un-phone">
            Telefone da unidade
          </label>
          <input
            id="edit-un-phone"
            className="hub-clientes__input"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </div>
        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="edit-un-addr">
            Endereço
          </label>
          <input
            id="edit-un-addr"
            className="hub-clientes__input"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          />
        </div>
        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="edit-un-city">
            Cidade
          </label>
          <input
            id="edit-un-city"
            className="hub-clientes__input"
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
          />
        </div>
        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="edit-un-uf">
            UF
          </label>
          <HubSearchableCombobox
            id="edit-un-uf"
            className="hub-combobox--clientes"
            options={BRAZILIAN_UF_COMBO_OPTIONS}
            value={form.state}
            onChange={(v) => setForm((f) => ({ ...f, state: v }))}
            placeholder="Selecionar UF"
            searchPlaceholder="Buscar estado…"
            allowCreate={false}
            clearable={false}
            ariaLabel="UF da unidade"
          />
        </div>
        <HubTechnicalManagerField
          idPrefix="edit-un"
          selfDisplayName={selfDisplayName}
          isSelf={technicalManagerSelf}
          onIsSelfChange={setTechnicalManagerSelf}
          name={technicalManagerName}
          onNameChange={setTechnicalManagerName}
          staffOptions={staffOptions}
        />
        <HubCheckbox
          className="hub-onboarding-toggle-row"
          checked={form.is_main}
          onChange={(is_main) => setForm((f) => ({ ...f, is_main }))}
        >
          Unidade principal (matriz)
        </HubCheckbox>
      </div>
    </HubSidePanel>
  );
};

export default HubUnitEditPanel;
