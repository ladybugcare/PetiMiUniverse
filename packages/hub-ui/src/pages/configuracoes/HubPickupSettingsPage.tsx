import React, { useCallback, useEffect, useState } from 'react';
import { Car, ChevronDown, ChevronUp, Edit2, Package, Plus, Trash2 } from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import {
  hubPickupVehiclesApi,
  type PickupVehicle,
  type TransportCage,
} from '../../api/hubPickupVehiclesApi';
import { useAlert } from '../../components/AlertProvider';
import { HubSidePanel } from '../../components/HubSidePanel';
import { maskLicensePlate } from '../../utils/maskLicensePlate';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import './hub-pickup-settings.css';

// ─── Capacidade total do veículo ─────────────────────────────────────────────

function calcCapacity(vehicle: PickupVehicle): number {
  if (vehicle.has_cages && vehicle.cages.length > 0) {
    return vehicle.cages.filter((c) => c.active).reduce((s, c) => s + c.capacity, 0);
  }
  return vehicle.capacity_animals;
}

// ─── Formulário de veículo ────────────────────────────────────────────────────

type VehicleFormState = {
  name: string;
  license_plate: string;
  color: string;
  capacity_animals: string;
  has_cages: boolean;
  notes: string;
};

const emptyVehicleForm = (): VehicleFormState => ({
  name: '',
  license_plate: '',
  color: '',
  capacity_animals: '1',
  has_cages: false,
  notes: '',
});

function vehicleFormFromRow(v: PickupVehicle): VehicleFormState {
  return {
    name: v.name,
    license_plate: maskLicensePlate(v.license_plate ?? ''),
    color: v.color ?? '',
    capacity_animals: String(v.capacity_animals),
    has_cages: v.has_cages,
    notes: v.notes ?? '',
  };
}

// ─── Formulário de caixa ──────────────────────────────────────────────────────

type CageFormState = {
  name: string;
  color: string;
  capacity: string;
};

const emptyCageForm = (): CageFormState => ({ name: '', color: '', capacity: '1' });

function cageFormFromRow(c: TransportCage): CageFormState {
  return { name: c.name, color: c.color ?? '', capacity: String(c.capacity) };
}

const VEHICLE_FORM_ID = 'hub-ps-vehicle-form';
const CAGE_FORM_ID = 'hub-ps-cage-form';

type DraftCage = {
  draftKey: string;
  id?: string;
  name: string;
  color: string;
  capacity: string;
};

let draftCageCounter = 0;
function nextDraftCageKey() {
  draftCageCounter += 1;
  return `cage_draft_${draftCageCounter}`;
}

function emptyDraftCage(partial?: Partial<DraftCage>): DraftCage {
  return {
    draftKey: nextDraftCageKey(),
    name: '',
    color: '',
    capacity: '1',
    ...partial,
  };
}

function draftsFromCages(cages: TransportCage[]): DraftCage[] {
  if (cages.length === 0) return [emptyDraftCage()];
  return cages.map((c) =>
    emptyDraftCage({
      id: c.id,
      name: c.name,
      color: c.color ?? '',
      capacity: String(c.capacity),
    }),
  );
}

function draftCageCapacityTotal(drafts: DraftCage[]): number {
  return drafts.reduce((sum, c) => sum + Math.max(1, parseInt(c.capacity, 10) || 1), 0);
}

// ─── Seletor de cor ───────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
  '#6b7280', '#f5f0eb', '#1e293b', '#ffffff',
];

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="hub-ps__color-picker">
      <div className="hub-ps__color-presets" role="listbox" aria-label="Cores predefinidas">
        {PRESET_COLORS.map((c) => {
          const active = value.toLowerCase() === c.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              role="option"
              aria-selected={active}
              className={`hub-ps__color-swatch${active ? ' hub-ps__color-swatch--active' : ''}`}
              style={{
                background: c,
                border: c === '#ffffff' ? '1px solid #d0c8c0' : undefined,
              }}
              title={c}
              onClick={() => onChange(c)}
            />
          );
        })}
      </div>
      <input
        type="text"
        className="hub-clientes__input hub-ps__color-hex"
        placeholder="#hex ou nome"
        value={value}
        maxLength={30}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Cor personalizada"
      />
    </div>
  );
}

// ─── Painel de veículo ────────────────────────────────────────────────────────

function VehiclePanel({
  open,
  clinicId,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  clinicId: string;
  editing: PickupVehicle | null;
  onClose: () => void;
  onSaved: (v: PickupVehicle) => void;
}) {
  const { showError } = useAlert();
  const [form, setForm] = useState<VehicleFormState>(emptyVehicleForm());
  const [cageDrafts, setCageDrafts] = useState<DraftCage[]>([emptyDraftCage()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm(vehicleFormFromRow(editing));
      setCageDrafts(editing.has_cages ? draftsFromCages(editing.cages) : [emptyDraftCage()]);
    } else {
      setForm(emptyVehicleForm());
      setCageDrafts([emptyDraftCage()]);
    }
    setSaving(false);
  }, [open, editing]);

  const set = (k: keyof VehicleFormState, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const setHasCages = (checked: boolean) => {
    setForm((f) => ({ ...f, has_cages: checked }));
    if (checked && cageDrafts.length === 0) {
      setCageDrafts([emptyDraftCage()]);
    }
  };

  const updateCageDraft = (draftKey: string, patch: Partial<DraftCage>) => {
    setCageDrafts((rows) =>
      rows.map((row) => (row.draftKey === draftKey ? { ...row, ...patch } : row)),
    );
  };

  const removeCageDraft = (draftKey: string) => {
    setCageDrafts((rows) => {
      const next = rows.filter((row) => row.draftKey !== draftKey);
      return next.length > 0 ? next : [emptyDraftCage()];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    const preparedCages = form.has_cages
      ? cageDrafts
          .map((c) => ({
            draftKey: c.draftKey,
            id: c.id,
            name: c.name.trim(),
            color: c.color.trim() || null,
            capacity: Math.max(1, parseInt(c.capacity, 10) || 1),
          }))
          .filter((c) => c.name.length > 0)
      : [];

    if (form.has_cages && preparedCages.length === 0) {
      showError('Adicione pelo menos uma caixa com nome e capacidade.');
      return;
    }

    setSaving(true);
    try {
      const capacityFromCages = preparedCages.reduce((s, c) => s + c.capacity, 0);
      const payload = {
        clinic_id: clinicId,
        name: form.name.trim(),
        license_plate: maskLicensePlate(form.license_plate).trim() || null,
        color: form.color.trim() || null,
        capacity_animals: form.has_cages
          ? Math.max(1, capacityFromCages)
          : Math.max(1, parseInt(form.capacity_animals, 10) || 1),
        has_cages: form.has_cages,
        notes: form.notes.trim() || null,
      };

      let vehicle: PickupVehicle;
      if (editing) {
        const res = await hubPickupVehiclesApi.patchVehicle(editing.id, payload);
        vehicle = { ...res.vehicle, cages: editing.cages };
      } else {
        const res = await hubPickupVehiclesApi.createVehicle(payload);
        vehicle = res.vehicle;
      }

      if (form.has_cages) {
        const existingIds = new Set((editing?.cages ?? []).map((c) => c.id));
        const keptIds = new Set(preparedCages.map((c) => c.id).filter(Boolean) as string[]);

        for (const cage of editing?.cages ?? []) {
          if (!keptIds.has(cage.id)) {
            await hubPickupVehiclesApi.deleteCage(cage.id, clinicId);
          }
        }

        const savedCages: TransportCage[] = [];
        for (let i = 0; i < preparedCages.length; i++) {
          const cage = preparedCages[i];
          const cagePayload = {
            clinic_id: clinicId,
            name: cage.name,
            color: cage.color,
            capacity: cage.capacity,
            sort_order: i,
          };
          if (cage.id && existingIds.has(cage.id)) {
            const res = await hubPickupVehiclesApi.patchCage(cage.id, cagePayload);
            savedCages.push(res.cage);
          } else {
            const res = await hubPickupVehiclesApi.createCage(vehicle.id, cagePayload);
            savedCages.push(res.cage);
          }
        }
        vehicle = { ...vehicle, cages: savedCages, has_cages: true };
      } else {
        for (const cage of editing?.cages ?? []) {
          await hubPickupVehiclesApi.deleteCage(cage.id, clinicId);
        }
        vehicle = { ...vehicle, cages: [], has_cages: false };
      }

      onSaved(vehicle);
    } catch (err: unknown) {
      showError((err as Error)?.message || 'Erro ao salvar veículo');
    } finally {
      setSaving(false);
    }
  };

  const cagesTotal = draftCageCapacityTotal(cageDrafts);

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title={editing ? 'Editar veículo' : 'Novo veículo'}
      titleIcon={<Car size={18} strokeWidth={1.75} />}
      subtitle={
        editing
          ? 'Atualize os dados da frota usados nas rotas de Leva e Traz.'
          : 'Cadastre um veículo para usar ao montar rotas de transporte.'
      }
      footer={
        <div className="hub-ps__panel-footer">
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form={VEHICLE_FORM_ID}
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={saving || !form.name.trim()}
          >
            {saving ? 'Salvando…' : 'Salvar veículo'}
          </button>
        </div>
      }
    >
      <form id={VEHICLE_FORM_ID} onSubmit={(e) => void handleSubmit(e)} className="hub-ps__panel-form">
        <div className="hub-ps__section">
          <div className="hub-ps__section-header">
            <h3 className="hub-ps__section-title">Identificação</h3>
            <p className="hub-ps__section-sub">Dados básicos do veículo na frota.</p>
          </div>

          <div className="hub-ps__field">
            <label className="hub-clientes__label" htmlFor="hub-ps-vehicle-name">
              Nome *
            </label>
            <input
              id="hub-ps-vehicle-name"
              className="hub-clientes__input"
              placeholder="Ex.: Van Branca, Gol Prata"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
            />
          </div>

          <div className="hub-ps__field hub-ps__field--plate">
            <label className="hub-clientes__label" htmlFor="hub-ps-vehicle-plate">
              Placa
            </label>
            <input
              id="hub-ps-vehicle-plate"
              className="hub-clientes__input hub-ps__plate-input"
              placeholder="ABC-1D23"
              value={form.license_plate}
              onChange={(e) => set('license_plate', maskLicensePlate(e.target.value))}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              maxLength={8}
              aria-describedby="hub-ps-vehicle-plate-hint"
            />
            <p id="hub-ps-vehicle-plate-hint" className="hub-ps__hint">
              Antiga (ABC-1234) ou Mercosul (ABC-1D23)
            </p>
          </div>

          <div className="hub-ps__field">
            <span className="hub-clientes__label">Cor do veículo</span>
            <ColorPicker value={form.color} onChange={(v) => set('color', v)} />
          </div>
        </div>

        <div className="hub-ps__section">
          <div className="hub-ps__section-header">
            <h3 className="hub-ps__section-title">Capacidade</h3>
            <p className="hub-ps__section-sub">
              Informe quantos pets cabem no veículo — no total ou por caixa de transporte.
            </p>
          </div>

          <div className="hub-ps__field">
            <span className="hub-clientes__label">Como medir a capacidade?</span>
            <div className="hub-ps__seg" role="radiogroup" aria-label="Como medir a capacidade">
              <button
                type="button"
                role="radio"
                aria-checked={!form.has_cages}
                className={!form.has_cages ? 'hub-ps__seg--active' : undefined}
                onClick={() => setHasCages(false)}
              >
                Total do veículo
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={form.has_cages}
                className={form.has_cages ? 'hub-ps__seg--active' : undefined}
                onClick={() => setHasCages(true)}
              >
                Por caixas
              </button>
            </div>
          </div>

          {form.has_cages ? (
            <div className="hub-ps__cages-editor">
              <p className="hub-ps__cages-editor-lead">
                Adicione cada caixa e diga quantos pets cabem nela. O total do veículo é a soma.
              </p>
              <div className="hub-ps__cages-editor-list">
                {cageDrafts.map((cage, index) => (
                  <div key={cage.draftKey} className="hub-ps__cage-draft">
                    <div className="hub-ps__cage-draft-head">
                      <span className="hub-ps__cage-draft-index">Caixa {index + 1}</span>
                      <button
                        type="button"
                        className="hub-ps__icon-btn hub-ps__icon-btn--danger"
                        onClick={() => removeCageDraft(cage.draftKey)}
                        aria-label={`Remover caixa ${index + 1}`}
                        disabled={cageDrafts.length <= 1}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="hub-ps__cage-draft-fields">
                      <div className="hub-ps__field">
                        <label className="hub-clientes__label" htmlFor={`hub-ps-cage-name-${cage.draftKey}`}>
                          Nome
                        </label>
                        <input
                          id={`hub-ps-cage-name-${cage.draftKey}`}
                          className="hub-clientes__input"
                          placeholder="Ex.: Caixa grande, Caixinha azul"
                          value={cage.name}
                          onChange={(e) => updateCageDraft(cage.draftKey, { name: e.target.value })}
                        />
                      </div>
                      <div className="hub-ps__field hub-ps__field--pets">
                        <label
                          className="hub-clientes__label"
                          htmlFor={`hub-ps-cage-cap-${cage.draftKey}`}
                        >
                          Pets
                        </label>
                        <input
                          id={`hub-ps-cage-cap-${cage.draftKey}`}
                          type="number"
                          min={1}
                          className="hub-clientes__input"
                          value={cage.capacity}
                          onChange={(e) =>
                            updateCageDraft(cage.draftKey, { capacity: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hub-ps__cages-editor-footer">
                <button
                  type="button"
                  className="hub-ps__add-cage-btn"
                  onClick={() => setCageDrafts((rows) => [...rows, emptyDraftCage()])}
                >
                  <Plus size={13} /> Adicionar caixa
                </button>
                <span className="hub-ps__cages-editor-total">
                  Capacidade total: <strong>{cagesTotal}</strong>{' '}
                  {cagesTotal === 1 ? 'pet' : 'pets'}
                </span>
              </div>
            </div>
          ) : (
            <div className="hub-ps__field hub-ps__field--narrow">
              <label className="hub-clientes__label" htmlFor="hub-ps-vehicle-capacity">
                Quantos pets cabem?
              </label>
              <input
                id="hub-ps-vehicle-capacity"
                type="number"
                min={1}
                className="hub-clientes__input"
                value={form.capacity_animals}
                onChange={(e) => set('capacity_animals', e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="hub-ps__section">
          <div className="hub-ps__section-header">
            <h3 className="hub-ps__section-title">Observações</h3>
            <p className="hub-ps__section-sub">Opcional — detalhes úteis para a equipe.</p>
          </div>
          <div className="hub-ps__field">
            <label className="hub-clientes__label hub-ps__sr-only" htmlFor="hub-ps-vehicle-notes">
              Observações
            </label>
            <textarea
              id="hub-ps-vehicle-notes"
              className="hub-clientes__textarea"
              rows={3}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Informações extras sobre o veículo…"
            />
          </div>
        </div>
      </form>
    </HubSidePanel>
  );
}

// ─── Painel de caixa ──────────────────────────────────────────────────────────

function CagePanel({
  open,
  clinicId,
  vehicleId,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  clinicId: string;
  vehicleId: string;
  editing: TransportCage | null;
  onClose: () => void;
  onSaved: (c: TransportCage) => void;
}) {
  const { showError } = useAlert();
  const [form, setForm] = useState<CageFormState>(emptyCageForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(editing ? cageFormFromRow(editing) : emptyCageForm());
    setSaving(false);
  }, [open, editing]);

  const set = (k: keyof CageFormState, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        clinic_id: clinicId,
        name: form.name.trim(),
        color: form.color.trim() || null,
        capacity: Math.max(1, parseInt(form.capacity) || 1),
      };
      let result: TransportCage;
      if (editing) {
        const res = await hubPickupVehiclesApi.patchCage(editing.id, payload);
        result = res.cage;
      } else {
        const res = await hubPickupVehiclesApi.createCage(vehicleId, payload);
        result = res.cage;
      }
      onSaved(result);
    } catch (err: unknown) {
      showError((err as Error)?.message || 'Erro ao salvar caixa');
    } finally {
      setSaving(false);
    }
  };

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title={editing ? 'Editar caixa' : 'Nova caixa'}
      titleIcon={<Package size={18} strokeWidth={1.75} />}
      subtitle="Cada caixa tem sua própria capacidade em pets. Um veículo pode ter várias."
      footer={
        <div className="hub-ps__panel-footer">
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form={CAGE_FORM_ID}
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={saving || !form.name.trim()}
          >
            {saving ? 'Salvando…' : 'Salvar caixa'}
          </button>
        </div>
      }
    >
      <form id={CAGE_FORM_ID} onSubmit={(e) => void handleSubmit(e)} className="hub-ps__panel-form">
        <div className="hub-ps__field">
          <label className="hub-clientes__label" htmlFor="hub-ps-cage-name">
            Nome da caixa *
          </label>
          <input
            id="hub-ps-cage-name"
            className="hub-clientes__input"
            placeholder="Ex.: Caixa Grande, Caixinha Azul"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
          />
        </div>
        <div className="hub-ps__row2">
          <div className="hub-ps__field">
            <span className="hub-clientes__label">Cor</span>
            <ColorPicker value={form.color} onChange={(v) => set('color', v)} />
          </div>
          <div className="hub-ps__field hub-ps__field--narrow">
            <label className="hub-clientes__label" htmlFor="hub-ps-cage-capacity">
              Capacidade
            </label>
            <input
              id="hub-ps-cage-capacity"
              type="number"
              min={1}
              className="hub-clientes__input"
              value={form.capacity}
              onChange={(e) => set('capacity', e.target.value)}
            />
            <p className="hub-ps__hint">animais por caixa</p>
          </div>
        </div>
      </form>
    </HubSidePanel>
  );
}

// ─── Card de caixa ────────────────────────────────────────────────────────────

function CageRow({
  cage,
  canWrite,
  onEdit,
  onDelete,
}: {
  cage: TransportCage;
  canWrite: boolean;
  onEdit: (c: TransportCage) => void;
  onDelete: (c: TransportCage) => void;
}) {
  return (
    <div className={`hub-ps__cage-row${cage.active ? '' : ' hub-ps__cage-row--inactive'}`}>
      {cage.color && (
        <span
          className="hub-ps__cage-color"
          style={{ background: cage.color }}
          title={cage.color}
        />
      )}
      <span className="hub-ps__cage-name">{cage.name}</span>
      <span className="hub-ps__cage-capacity">
        {cage.capacity} {cage.capacity === 1 ? 'animal' : 'animais'}
      </span>
      {!cage.active && <span className="hub-ps__badge hub-ps__badge--off">Inativa</span>}
      {canWrite && (
        <div className="hub-ps__cage-actions">
          <button type="button" className="hub-ps__icon-btn" onClick={() => onEdit(cage)} title="Editar">
            <Edit2 size={14} />
          </button>
          <button
            type="button"
            className="hub-ps__icon-btn hub-ps__icon-btn--danger"
            onClick={() => onDelete(cage)}
            title="Remover"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Card de veículo ──────────────────────────────────────────────────────────

function VehicleCard({
  vehicle,
  canWrite,
  onEdit,
  onToggleActive,
  onAddCage,
  onEditCage,
  onDeleteCage,
}: {
  vehicle: PickupVehicle;
  canWrite: boolean;
  onEdit: (v: PickupVehicle) => void;
  onToggleActive: (v: PickupVehicle) => void;
  onAddCage: (vehicleId: string) => void;
  onEditCage: (c: TransportCage) => void;
  onDeleteCage: (c: TransportCage) => void;
}) {
  const [open, setOpen] = useState(false);
  const totalCap = calcCapacity(vehicle);
  const activeCages = vehicle.cages.filter((c) => c.active);

  return (
    <div className={`hub-ps__vehicle-card${vehicle.active ? '' : ' hub-ps__vehicle-card--inactive'}`}>
      <div className="hub-ps__vehicle-header" onClick={() => setOpen((o) => !o)}>
        <div className="hub-ps__vehicle-icon">
          {vehicle.color ? <Car size={20} style={{ color: vehicle.color }} /> : <Car size={20} />}
        </div>
        <div className="hub-ps__vehicle-info">
          <span className="hub-ps__vehicle-name">{vehicle.name}</span>
          <div className="hub-ps__vehicle-meta">
            {vehicle.license_plate && (
              <span className="hub-ps__vehicle-plate">{vehicle.license_plate}</span>
            )}
            <span className="hub-ps__capacity-badge">
              {vehicle.has_cages
                ? `${activeCages.length} caixa${activeCages.length !== 1 ? 's' : ''} · ${totalCap} animal${totalCap !== 1 ? 'is' : ''}`
                : `${totalCap} animal${totalCap !== 1 ? 'is' : ''}`}
            </span>
            {!vehicle.active && <span className="hub-ps__badge hub-ps__badge--off">Inativo</span>}
          </div>
        </div>
        <div className="hub-ps__vehicle-actions" onClick={(e) => e.stopPropagation()}>
          {canWrite && (
            <>
              <button
                type="button"
                className="hub-ps__icon-btn"
                onClick={() => onEdit(vehicle)}
                title="Editar veículo"
              >
                <Edit2 size={15} />
              </button>
              <button
                type="button"
                className={`hub-ps__icon-btn${vehicle.active ? '' : ' hub-ps__icon-btn--muted'}`}
                onClick={() => onToggleActive(vehicle)}
                title={vehicle.active ? 'Desativar veículo' : 'Reativar veículo'}
              >
                <span className="hub-ps__action-label">
                  {vehicle.active ? 'Desativar' : 'Reativar'}
                </span>
              </button>
            </>
          )}
          <button type="button" className="hub-ps__icon-btn" onClick={() => setOpen((o) => !o)}>
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="hub-ps__vehicle-body">
          {vehicle.notes && <p className="hub-ps__vehicle-notes">{vehicle.notes}</p>}

          {vehicle.has_cages ? (
            <div className="hub-ps__cages-section">
              <div className="hub-ps__cages-header">
                <span className="hub-ps__cages-title">
                  <Package size={14} /> Caixas de transporte
                </span>
                {canWrite && (
                  <button
                    type="button"
                    className="hub-ps__add-cage-btn"
                    onClick={() => onAddCage(vehicle.id)}
                  >
                    <Plus size={13} /> Adicionar caixa
                  </button>
                )}
              </div>

              {vehicle.cages.length === 0 ? (
                <p className="hub-ps__empty-cages">
                  Nenhuma caixa cadastrada. Adicione as caixas para controlar a capacidade.
                </p>
              ) : (
                <div className="hub-ps__cages-list">
                  {vehicle.cages.map((cage) => (
                    <CageRow
                      key={cage.id}
                      cage={cage}
                      canWrite={canWrite}
                      onEdit={onEditCage}
                      onDelete={onDeleteCage}
                    />
                  ))}
                </div>
              )}

              {vehicle.cages.length > 0 && (
                <p className="hub-ps__capacity-total">
                  Capacidade total ativa:{' '}
                  <strong>
                    {totalCap} {totalCap === 1 ? 'animal' : 'animais'}
                  </strong>
                </p>
              )}
            </div>
          ) : (
            <p className="hub-ps__no-cages-msg">
              Este veículo não usa caixas. Capacidade:{' '}
              <strong>
                {vehicle.capacity_animals}{' '}
                {vehicle.capacity_animals === 1 ? 'animal' : 'animais'}
              </strong>
              .
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

const HubPickupSettingsPage: React.FC = () => {
  const { hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const { showSuccess, showError } = useAlert();

  const canRead = hasPermission('pickup.routes.read');
  const canWrite = hasPermission('pickup.routes.manage');

  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<PickupVehicle[]>([]);
  const [showInactive, setShowInactive] = useState(false);

  const [vehiclePanel, setVehiclePanel] = useState<{ open: boolean; editing: PickupVehicle | null }>({
    open: false,
    editing: null,
  });
  const [cagePanel, setCagePanel] = useState<{
    open: boolean;
    vehicleId: string;
    editing: TransportCage | null;
  }>({
    open: false,
    vehicleId: '',
    editing: null,
  });

  const load = useCallback(
    async (signal?: { cancelled: boolean }) => {
      if (!clinicId || !canRead) return;
      setLoading(true);
      try {
        const res = await hubPickupVehiclesApi.listVehicles(clinicId, { includeInactive: true });
        if (signal?.cancelled) return;
        setVehicles(res.vehicles);
      } catch (e: unknown) {
        if (signal?.cancelled) return;
        showError((e as Error)?.message || 'Erro ao carregar veículos');
      } finally {
        if (!signal?.cancelled) setLoading(false);
      }
    },
    [clinicId, canRead, showError],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const hasInactive = vehicles.some((v) => !v.active);
  const displayed = showInactive ? vehicles : vehicles.filter((v) => v.active);
  const isTrulyEmpty = !loading && vehicles.length === 0;
  const isFilteredEmpty = !loading && vehicles.length > 0 && displayed.length === 0;

  const openNewVehicle = () => setVehiclePanel({ open: true, editing: null });

  const handleVehicleSaved = (v: PickupVehicle) => {
    const wasEditing = Boolean(vehiclePanel.editing);
    setVehicles((prev) => {
      const idx = prev.findIndex((x) => x.id === v.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = v;
        return next;
      }
      return [...prev, v];
    });
    setVehiclePanel({ open: false, editing: null });
    showSuccess(wasEditing ? 'Veículo atualizado.' : 'Veículo cadastrado.');
  };

  const handleToggleVehicle = async (v: PickupVehicle) => {
    if (!clinicId) return;
    try {
      const res = await hubPickupVehiclesApi.patchVehicle(v.id, {
        clinic_id: clinicId,
        active: !v.active,
      });
      setVehicles((prev) =>
        prev.map((x) => (x.id === v.id ? { ...res.vehicle, cages: v.cages } : x)),
      );
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao alterar status do veículo');
    }
  };

  const handleCageSaved = (cage: TransportCage) => {
    const wasEditing = Boolean(cagePanel.editing);
    setVehicles((prev) =>
      prev.map((v) => {
        if (v.id !== cage.vehicle_id) return v;
        const cages = v.cages.find((c) => c.id === cage.id)
          ? v.cages.map((c) => (c.id === cage.id ? cage : c))
          : [...v.cages, cage];
        return { ...v, cages };
      }),
    );
    setCagePanel({ open: false, vehicleId: '', editing: null });
    showSuccess(wasEditing ? 'Caixa atualizada.' : 'Caixa adicionada.');
  };

  const handleDeleteCage = async (cage: TransportCage) => {
    if (!clinicId) return;
    if (!confirm(`Remover a caixa "${cage.name}"?`)) return;
    try {
      await hubPickupVehiclesApi.deleteCage(cage.id, clinicId);
      setVehicles((prev) =>
        prev.map((v) =>
          v.id === cage.vehicle_id ? { ...v, cages: v.cages.filter((c) => c.id !== cage.id) } : v,
        ),
      );
      showSuccess('Caixa removida.');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao remover caixa');
    }
  };

  if (!canRead) {
    return (
      <div className="hub-ps__state">
        <p className="hub-clientes__muted">
          Sem permissão para visualizar configurações de Leva e Traz.
        </p>
      </div>
    );
  }

  return (
    <div className="hub-ps">
      <header className="hub-ps__intro">
        <h2 className="hub-ps__intro-title">Frota — Leva e Traz</h2>
        <p className="hub-ps__intro-text">
          Cadastre os veículos usados no serviço de transporte e configure as caixas de cada um. A
          capacidade total é usada como referência ao montar rotas.
        </p>
      </header>

      {!isTrulyEmpty && (
        <div className="hub-ps__toolbar">
          {hasInactive && (
            <label className="hub-ps__inactive-toggle">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Mostrar inativos
            </label>
          )}
          {canWrite && (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              onClick={openNewVehicle}
            >
              <Plus size={15} /> Novo veículo
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="hub-ps__state">
          <p className="hub-clientes__muted">Carregando veículos…</p>
        </div>
      ) : isTrulyEmpty ? (
        <div className="hub-ps__empty">
          <div className="hub-ps__empty-icon-wrap" aria-hidden>
            <Car size={28} />
          </div>
          <p className="hub-ps__empty-title">Nenhum veículo cadastrado</p>
          <p className="hub-ps__empty-text">
            Cadastre os veículos para selecionar ao criar uma rota de Leva e Traz.
          </p>
          {canWrite && (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              onClick={openNewVehicle}
            >
              <Plus size={15} /> Cadastrar veículo
            </button>
          )}
        </div>
      ) : isFilteredEmpty ? (
        <div className="hub-ps__empty hub-ps__empty--compact">
          <p className="hub-ps__empty-title">Nenhum veículo ativo</p>
          <p className="hub-ps__empty-text">
            Há veículos inativos. Use &quot;Mostrar inativos&quot; acima para vê-los ou cadastre um
            novo.
          </p>
        </div>
      ) : (
        <div className="hub-ps__vehicle-list">
          {displayed.map((v) => (
            <VehicleCard
              key={v.id}
              vehicle={v}
              canWrite={canWrite}
              onEdit={(veh) => setVehiclePanel({ open: true, editing: veh })}
              onToggleActive={handleToggleVehicle}
              onAddCage={(vid) => setCagePanel({ open: true, vehicleId: vid, editing: null })}
              onEditCage={(c) =>
                setCagePanel({ open: true, vehicleId: c.vehicle_id, editing: c })
              }
              onDeleteCage={handleDeleteCage}
            />
          ))}
        </div>
      )}

      {clinicId && (
        <>
          <VehiclePanel
            open={vehiclePanel.open}
            clinicId={clinicId}
            editing={vehiclePanel.editing}
            onClose={() => setVehiclePanel({ open: false, editing: null })}
            onSaved={handleVehicleSaved}
          />
          <CagePanel
            open={cagePanel.open}
            clinicId={clinicId}
            vehicleId={cagePanel.vehicleId}
            editing={cagePanel.editing}
            onClose={() => setCagePanel({ open: false, vehicleId: '', editing: null })}
            onSaved={handleCageSaved}
          />
        </>
      )}
    </div>
  );
};

export default HubPickupSettingsPage;
