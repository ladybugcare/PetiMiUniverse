import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BedDouble, MapPin, Store, User } from 'lucide-react';
import { useAuth } from '@petimi/web-core';
import { getHubUserDisplayName } from '../../utils/hubUserDisplay';
import {
  HubCancelButton,
  HubSidePanel,
  HubSearchableCombobox,
  HubCheckbox,
  HubBrPhoneInput,
  formatBrPhoneFromApi,
  hubStaffApi,
  hubBoardingApi,
  type HubComboboxOption,
} from '@petimi/hub-ui';
import '@petimi/hub-ui/pages/clientes/clientes.css';
import './hub-unit-form.css';
import HubTechnicalManagerField from '../HubTechnicalManagerField';
import { hubClinicProfileApi } from '../../services/hubClinicProfileApi';
import { BRAZILIAN_UF_COMBO_OPTIONS } from '../../utils/brValidators';
import type { HubUnitProfile } from '../../types/hubClinicProfile';

export type HubUnitEditPanelProps = {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  unit?: HubUnitProfile | null;
  mode?: 'edit' | 'create';
  defaultIsMain?: boolean;
  clinicDefaults?: {
    address?: string | null;
    city?: string | null;
    state?: string | null;
  };
  onSaved: (unit: HubUnitProfile) => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

function suggestNickname(name: string): string {
  return name.trim().slice(0, 40);
}

const HubUnitEditPanel: React.FC<HubUnitEditPanelProps> = ({
  open,
  onClose,
  clinicId,
  unit,
  mode = 'edit',
  defaultIsMain = false,
  clinicDefaults,
  onSaved,
  onError,
  onSuccess,
}) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [staffOptions, setStaffOptions] = useState<HubComboboxOption[]>([]);
  const [technicalManagerSelf, setTechnicalManagerSelf] = useState(true);
  const [technicalManagerName, setTechnicalManagerName] = useState('');
  const [sameAsClinic, setSameAsClinic] = useState(false);
  const [form, setForm] = useState({
    name: '',
    nickname: '',
    address: '',
    city: '',
    state: 'SP',
    phone: '',
    is_main: false,
    hotel_slots: '' as string,
    daycare_slots_per_shift: '' as string,
  });
  const nicknameTouchedRef = useRef(false);

  const selfDisplayName = useMemo(() => getHubUserDisplayName(user), [user]);

  const isCreate = mode === 'create';
  const unitId = unit?.id;
  const idPrefix = isCreate ? 'create-un' : 'edit-un';
  const clinicAddress = clinicDefaults?.address?.trim() || '';
  const clinicCity = clinicDefaults?.city?.trim() || '';
  const clinicState = clinicDefaults?.state?.trim() || '';
  const canCopyClinicAddress = isCreate && Boolean(clinicAddress && clinicCity && clinicState);

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
    if (!isCreate && unitId) {
      void hubBoardingApi
        .getUnitSettings(clinicId, unitId)
        .then((res) => {
          const settings = res.settings?.[0];
          setForm((f) => ({
            ...f,
            hotel_slots: settings?.hotel_slots != null ? String(settings.hotel_slots) : '',
            daycare_slots_per_shift:
              settings?.daycare_slots_per_shift != null ? String(settings.daycare_slots_per_shift) : '',
          }));
        })
        .catch(() => {
          /* capacidade opcional — ignora se API indisponível */
        });
    }
  }, [open, clinicId, isCreate, unitId]);

  useEffect(() => {
    if (!open) return;
    nicknameTouchedRef.current = !isCreate;
    setSameAsClinic(false);
    if (isCreate) {
      setForm({
        name: '',
        nickname: '',
        address: '',
        city: clinicDefaults?.city?.trim() || '',
        state: clinicDefaults?.state?.trim() || 'SP',
        phone: '',
        is_main: defaultIsMain,
        hotel_slots: '',
        daycare_slots_per_shift: '',
      });
      setTechnicalManagerSelf(true);
      setTechnicalManagerName('');
      return;
    }
    if (!unit) return;
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
      phone: formatBrPhoneFromApi(unit.phone?.trim() || ''),
      is_main: unit.is_main === true,
      hotel_slots: '',
      daycare_slots_per_shift: '',
    });
    setTechnicalManagerSelf(isSelf);
    setTechnicalManagerName(isSelf ? '' : rt);
  }, [open, unit, selfDisplayName, isCreate, defaultIsMain, clinicDefaults?.city, clinicDefaults?.state]);

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

  const applySameAsClinic = (checked: boolean) => {
    setSameAsClinic(checked);
    if (!checked) return;
    setForm((f) => ({
      ...f,
      address: clinicAddress,
      city: clinicCity,
      state: clinicState || f.state,
    }));
  };

  const onNameChange = (name: string) => {
    setForm((f) => ({
      ...f,
      name,
      nickname: isCreate && !nicknameTouchedRef.current ? suggestNickname(name) : f.nickname,
    }));
  };

  const save = async () => {
    if (!valid) return;
    if (!isCreate && !unitId) return;
    setSaving(true);
    try {
      const parseOptionalInt = (raw: string): number | null => {
        const t = raw.trim();
        if (!t) return null;
        const n = Number(t);
        return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
      };
      const payload = {
        name: form.name.trim(),
        nickname: form.nickname.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state,
        phone: form.phone.trim() || null,
        technical_manager: technicalManagerResolved,
        is_main: form.is_main,
      };
      const res = isCreate
        ? await hubClinicProfileApi.createUnit(clinicId, payload)
        : await hubClinicProfileApi.patchUnit(unitId as string, clinicId, payload);
      await hubBoardingApi
        .patchUnitSettings({
          clinic_id: clinicId,
          unit_id: res.unit.id,
          hotel_slots: parseOptionalInt(form.hotel_slots),
          daycare_slots_per_shift: parseOptionalInt(form.daycare_slots_per_shift),
        })
        .catch(() => {
          /* capacidade opcional — ignora se API indisponível */
        });
      onSaved(res.unit);
      onSuccess(isCreate ? 'Unidade cadastrada.' : 'Dados da unidade atualizados.');
      onClose();
    } catch (e: unknown) {
      onError((e as Error)?.message || (isCreate ? 'Erro ao cadastrar unidade' : 'Erro ao salvar unidade'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title={isCreate ? 'Nova unidade' : 'Editar unidade'}
      titleIcon={<Store size={20} aria-hidden />}
      subtitle={
        isCreate
          ? 'Cadastre um local com agenda, caixa e equipe próprios.'
          : 'Atualize os dados operacionais desta unidade.'
      }
      footer={
        <div className="hub-clientes__btn-row">
          <HubCancelButton onClick={onClose} />
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={!valid || saving}
            onClick={() => void save()}
          >
            {saving
              ? isCreate
                ? 'Cadastrando…'
                : 'Salvando…'
              : isCreate
                ? 'Cadastrar unidade'
                : 'Salvar'}
          </button>
        </div>
      }
    >
      <div className="hub-uf">
        <section className="hub-uf__section">
          <header className="hub-uf__section-head">
            <span className="hub-uf__section-icon" aria-hidden>
              <Store size={18} strokeWidth={1.75} />
            </span>
            <div>
              <h3 className="hub-uf__section-title">Identidade</h3>
              <p className="hub-uf__section-sub">Como a unidade aparece no Hub e para a equipe.</p>
            </div>
          </header>
          <div className="hub-uf__grid">
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor={`${idPrefix}-name`}>
                Nome da unidade <span className="hub-uf__req">*</span>
              </label>
              <input
                id={`${idPrefix}-name`}
                className="hub-clientes__input"
                value={form.name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Ex.: Unidade Moema"
                autoComplete="off"
              />
            </div>
            <div className="hub-uf__row2">
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor={`${idPrefix}-nick`}>
                  Apelido <span className="hub-uf__req">*</span>
                </label>
                <input
                  id={`${idPrefix}-nick`}
                  className="hub-clientes__input"
                  value={form.nickname}
                  maxLength={100}
                  onChange={(e) => {
                    nicknameTouchedRef.current = true;
                    setForm((f) => ({ ...f, nickname: e.target.value }));
                  }}
                  placeholder="Ex.: Moema"
                  autoComplete="off"
                />
                <p className="hub-uf__hint">Aparece no seletor do cabeçalho e na agenda.</p>
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor={`${idPrefix}-phone`}>
                  Telefone
                </label>
                <HubBrPhoneInput
                  id={`${idPrefix}-phone`}
                  className="hub-clientes__input"
                  value={form.phone}
                  onChange={(phone) => setForm((f) => ({ ...f, phone }))}
                />
              </div>
            </div>
            <div className="hub-uf__toggle">
              <HubCheckbox
                className="hub-onboarding-toggle-row"
                checked={form.is_main}
                onChange={(is_main) => setForm((f) => ({ ...f, is_main }))}
              >
                Unidade principal (matriz)
              </HubCheckbox>
              <p className="hub-uf__toggle-sub">A matriz aparece primeiro no seletor de unidades.</p>
            </div>
          </div>
        </section>

        <section className="hub-uf__section">
          <header className="hub-uf__section-head">
            <span className="hub-uf__section-icon" aria-hidden>
              <MapPin size={18} strokeWidth={1.75} />
            </span>
            <div>
              <h3 className="hub-uf__section-title">Endereço</h3>
              <p className="hub-uf__section-sub">Local físico deste ponto de atendimento.</p>
            </div>
          </header>
          <div className="hub-uf__grid">
            {canCopyClinicAddress ? (
              <div className="hub-uf__toggle">
                <HubCheckbox
                  className="hub-onboarding-toggle-row"
                  checked={sameAsClinic}
                  onChange={applySameAsClinic}
                >
                  Usar o endereço da organização
                </HubCheckbox>
                <p className="hub-uf__toggle-sub">Copia rua, cidade e UF já cadastrados na clínica.</p>
              </div>
            ) : null}
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor={`${idPrefix}-addr`}>
                Logradouro <span className="hub-uf__req">*</span>
              </label>
              <input
                id={`${idPrefix}-addr`}
                className="hub-clientes__input"
                value={form.address}
                onChange={(e) => {
                  setSameAsClinic(false);
                  setForm((f) => ({ ...f, address: e.target.value }));
                }}
                placeholder="Rua, número e complemento"
                autoComplete="street-address"
              />
            </div>
            <div className="hub-uf__row2">
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor={`${idPrefix}-city`}>
                  Cidade <span className="hub-uf__req">*</span>
                </label>
                <input
                  id={`${idPrefix}-city`}
                  className="hub-clientes__input"
                  value={form.city}
                  onChange={(e) => {
                    setSameAsClinic(false);
                    setForm((f) => ({ ...f, city: e.target.value }));
                  }}
                  placeholder="São Paulo"
                  autoComplete="address-level2"
                />
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor={`${idPrefix}-uf`}>
                  UF <span className="hub-uf__req">*</span>
                </label>
                <HubSearchableCombobox
                  id={`${idPrefix}-uf`}
                  className="hub-combobox--clientes"
                  options={BRAZILIAN_UF_COMBO_OPTIONS}
                  value={form.state}
                  onChange={(v) => {
                    setSameAsClinic(false);
                    setForm((f) => ({ ...f, state: v }));
                  }}
                  placeholder="Selecionar UF"
                  searchPlaceholder="Buscar estado…"
                  allowCreate={false}
                  clearable={false}
                  ariaLabel="UF da unidade"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="hub-uf__section">
          <header className="hub-uf__section-head">
            <span className="hub-uf__section-icon" aria-hidden>
              <User size={18} strokeWidth={1.75} />
            </span>
            <div>
              <h3 className="hub-uf__section-title">Responsável técnico</h3>
              <p className="hub-uf__section-sub">Profissional de referência desta unidade.</p>
            </div>
          </header>
          <HubTechnicalManagerField
            idPrefix={idPrefix}
            selfDisplayName={selfDisplayName}
            isSelf={technicalManagerSelf}
            onIsSelfChange={setTechnicalManagerSelf}
            name={technicalManagerName}
            onNameChange={setTechnicalManagerName}
            staffOptions={staffOptions}
          />
        </section>

        <section className="hub-uf__section">
          <header className="hub-uf__section-head">
            <span className="hub-uf__section-icon" aria-hidden>
              <BedDouble size={18} strokeWidth={1.75} />
            </span>
            <div>
              <h3 className="hub-uf__section-title">Capacidade</h3>
              <p className="hub-uf__section-sub">Opcional. Deixe em branco se não houver limite.</p>
            </div>
          </header>
          <div className="hub-uf__row2">
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor={`${idPrefix}-hotel-slots`}>
                Vagas de hotel
              </label>
              <input
                id={`${idPrefix}-hotel-slots`}
                type="number"
                min={0}
                className="hub-clientes__input"
                placeholder="Sem limite"
                value={form.hotel_slots}
                onChange={(e) => setForm((f) => ({ ...f, hotel_slots: e.target.value }))}
              />
            </div>
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor={`${idPrefix}-daycare-slots`}>
                Cães por turno na creche
              </label>
              <input
                id={`${idPrefix}-daycare-slots`}
                type="number"
                min={0}
                className="hub-clientes__input"
                placeholder="Sem limite"
                value={form.daycare_slots_per_shift}
                onChange={(e) => setForm((f) => ({ ...f, daycare_slots_per_shift: e.target.value }))}
              />
            </div>
          </div>
        </section>
      </div>
    </HubSidePanel>
  );
};

export default HubUnitEditPanel;
