import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dog, Pencil } from 'lucide-react';
import { usePermissions } from '@petimi/web-core';
import { HubLoading } from './HubLoading';
import { HubCheckbox } from './HubCheckbox';
import { HubSearchableCombobox, type HubComboboxOption } from './HubSearchableCombobox';
import { HubMultiSelectCombobox } from './HubMultiSelectCombobox';
import { hubSpecialPricesApi, type HubSpecialPrice } from '../api/hubSpecialPricesApi';
import { hubServiceTypesApi, type HubServiceType } from '../api/hubServiceTypesApi';
import { useAlert } from './AlertProvider';
import './hub-special-prices.css';

function formatBrl(n: number): string {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatSaleInput(n: number): string {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',');
}

const SCOPE_LABEL: Record<HubSpecialPrice['scope'], string> = {
  pet: 'Pet',
  guardian: 'Tutor',
  family_plan: 'Plano família',
};

const STATUS_LABEL: Record<HubSpecialPrice['status'], string> = {
  pending_approval: 'Aguardando aprovação',
  active: 'Ativo',
  inactive: 'Inativo',
};

type Props = {
  clinicId: string;
  /** Modo pet: lista acordos do pet (+ família/tutor aplicáveis). */
  petId?: string;
  /** Modo tutor: lista acordos do tutor e planos família. */
  guardianId?: string | null;
  /** Pets do tutor (para plano família). */
  guardianPets?: Array<{ id: string; name: string }>;
  canWrite?: boolean;
};

export const SpecialPricesSection: React.FC<Props> = ({
  clinicId,
  petId,
  guardianId,
  guardianPets = [],
  canWrite = false,
}) => {
  const { hasPermission } = usePermissions();
  const canApprove = hasPermission('hub.financial.write');
  const alert = useAlert();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<HubSpecialPrice[]>([]);
  const [services, setServices] = useState<HubServiceType[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [scope, setScope] = useState<HubSpecialPrice['scope']>(petId ? 'pet' : 'guardian');
  const [serviceId, setServiceId] = useState('');
  const [saleAmount, setSaleAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [autoTrack, setAutoTrack] = useState(false);
  const [memberPetIds, setMemberPetIds] = useState<string[]>([]);

  const isEditing = Boolean(editingId);
  const editingRow = useMemo(
    () => (editingId ? rows.find((r) => r.id === editingId) ?? null : null),
    [editingId, rows]
  );

  const serviceNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of services) m.set(s.id, s.name);
    return m;
  }, [services]);

  const scopeOptions = useMemo<HubComboboxOption[]>(() => {
    const opts: HubComboboxOption[] = [];
    if (petId) opts.push({ value: 'pet', label: 'Só este pet' });
    if (guardianId) opts.push({ value: 'guardian', label: 'Todos os pets do tutor' });
    if (guardianId && guardianPets.length >= 2) {
      opts.push({ value: 'family_plan', label: 'Plano família' });
    }
    return opts;
  }, [guardianId, guardianPets.length, petId]);

  const scopeHint = useMemo(() => {
    if (scope === 'pet') return 'O valor especial vale só para este pet neste serviço.';
    if (scope === 'guardian') {
      return 'O mesmo valor especial vale para cada pet do tutor neste serviço.';
    }
    if (scope === 'family_plan') {
      return 'Você define um valor total do grupo; o sistema rateia entre os pets escolhidos.';
    }
    return null;
  }, [scope]);

  const serviceOptions = useMemo<HubComboboxOption[]>(
    () =>
      services.map((s) => ({
        value: s.id,
        label: `${s.name} · catálogo ${formatBrl(Number(s.sale_amount) || 0)}`,
      })),
    [services]
  );

  const petMultiOptions = useMemo<HubComboboxOption[]>(
    () => guardianPets.map((p) => ({ value: p.id, label: p.name })),
    [guardianPets]
  );

  const petNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of guardianPets) m.set(p.id, p.name);
    return m;
  }, [guardianPets]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, svcRes] = await Promise.all([
        hubSpecialPricesApi.list({
          clinic_id: clinicId,
          pet_id: petId,
          guardian_id: !petId ? guardianId : undefined,
          status: 'all',
        }),
        hubServiceTypesApi.list(clinicId),
      ]);
      setRows(listRes.special_prices);
      setServices((svcRes.service_types ?? []).filter((s) => s.active !== false && !s.deleted_at));
    } catch (e) {
      alert.showError((e as Error)?.message || 'Erro ao carregar preços especiais');
    } finally {
      setLoading(false);
    }
  }, [alert, clinicId, guardianId, petId]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setScope(petId ? 'pet' : 'guardian');
    setServiceId('');
    setSaleAmount('');
    setNotes('');
    setAutoTrack(false);
    setMemberPetIds([]);
    setEditingId(null);
    setShowForm(false);
  };

  const openCreateForm = () => {
    setEditingId(null);
    setScope(petId ? 'pet' : 'guardian');
    setServiceId('');
    setSaleAmount('');
    setNotes('');
    setAutoTrack(false);
    setMemberPetIds([]);
    setShowForm(true);
  };

  const openEditForm = (row: HubSpecialPrice) => {
    setEditingId(row.id);
    setScope(row.scope);
    setServiceId(row.hub_service_type_id);
    setSaleAmount(formatSaleInput(row.sale_amount));
    setNotes(row.notes ?? '');
    setAutoTrack(Boolean(row.auto_track_catalog));
    setMemberPetIds(row.scope === 'family_plan' ? [...(row.member_pet_ids ?? [])] : []);
    setShowForm(true);
  };

  const handleSave = async () => {
    const sale = Number(String(saleAmount).replace(',', '.'));
    if (!serviceId || !Number.isFinite(sale) || sale < 0) {
      alert.showError('Informe o serviço e um valor válido');
      return;
    }
    if (scope === 'family_plan' && memberPetIds.length < 2) {
      alert.showError('Selecione pelo menos 2 pets para o plano família');
      return;
    }

    if (isEditing && editingId) {
      setSaving(true);
      try {
        const prev = editingRow;
        const moneyChanged = prev != null && Math.abs(prev.sale_amount - sale) > 0.001;
        const membersChanged =
          scope === 'family_plan' &&
          prev != null &&
          JSON.stringify([...(prev.member_pet_ids ?? [])].sort()) !==
            JSON.stringify([...memberPetIds].sort());

        await hubSpecialPricesApi.patch(editingId, {
          clinic_id: clinicId,
          sale_amount: sale,
          notes: notes.trim() || null,
          auto_track_catalog: autoTrack,
          member_pet_ids: scope === 'family_plan' ? memberPetIds : undefined,
          clear_catalog_review: true,
        });

        const needsReapproval =
          !canApprove &&
          prev?.status === 'active' &&
          (moneyChanged || membersChanged);

        alert.showSuccess(
          needsReapproval
            ? 'Acordo atualizado — aguardando aprovação do financeiro/CADMIN.'
            : 'Acordo atualizado.'
        );
        resetForm();
        await load();
      } catch (e) {
        alert.showError((e as Error)?.message || 'Erro ao salvar');
      } finally {
        setSaving(false);
      }
      return;
    }

    if (scope === 'pet' && !petId) {
      alert.showError('Pet obrigatório');
      return;
    }
    if ((scope === 'guardian' || scope === 'family_plan') && !guardianId) {
      alert.showError('Tutor obrigatório');
      return;
    }

    setSaving(true);
    try {
      const res = await hubSpecialPricesApi.create({
        clinic_id: clinicId,
        scope,
        pet_id: scope === 'pet' ? petId : null,
        guardian_id: scope === 'pet' ? guardianId ?? null : guardianId!,
        hub_service_type_id: serviceId,
        sale_amount: sale,
        notes: notes.trim() || null,
        auto_track_catalog: autoTrack,
        member_pet_ids: scope === 'family_plan' ? memberPetIds : undefined,
      });
      alert.showSuccess(
        res.auto_approved
          ? 'Preço especial salvo e ativo.'
          : 'Preço especial criado — aguardando aprovação do financeiro/CADMIN.'
      );
      resetForm();
      await load();
    } catch (e) {
      alert.showError((e as Error)?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await hubSpecialPricesApi.approve(id, clinicId);
      alert.showSuccess('Preço especial aprovado.');
      await load();
    } catch (e) {
      alert.showError((e as Error)?.message || 'Erro ao aprovar');
    }
  };

  const handleToggleActive = async (row: HubSpecialPrice) => {
    const currentlyOn = row.status === 'active' || row.status === 'pending_approval';
    if (currentlyOn) {
      try {
        setTogglingId(row.id);
        await hubSpecialPricesApi.patch(row.id, { clinic_id: clinicId, status: 'inactive' });
        alert.showSuccess('Preço especial desativado.');
        if (editingId === row.id) resetForm();
        await load();
      } catch (e) {
        alert.showError((e as Error)?.message || 'Erro ao desativar');
      } finally {
        setTogglingId(null);
      }
      return;
    }

    if (!canApprove) {
      alert.showError('Apenas CADMIN ou financeiro podem reativar preços especiais.');
      return;
    }

    try {
      setTogglingId(row.id);
      await hubSpecialPricesApi.patch(row.id, { clinic_id: clinicId, status: 'active' });
      alert.showSuccess('Preço especial reativado.');
      await load();
    } catch (e) {
      alert.showError((e as Error)?.message || 'Erro ao reativar');
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) {
    return <HubLoading variant="inline" label="Carregando preços especiais…" size="sm" />;
  }

  const familySharePreview =
    scope === 'family_plan' && memberPetIds.length >= 2
      ? formatBrl(Number(String(saleAmount).replace(',', '.')) / memberPetIds.length || 0)
      : null;

  const editingServiceLabel =
    editingRow != null
      ? editingRow.service_name?.trim() ||
        serviceNameById.get(editingRow.hub_service_type_id) ||
        'Serviço'
      : null;

  return (
    <div className="hub-special-prices">
      <div className="hub-pets-detail__history-section-head" style={{ marginBottom: 10 }}>
        <h4 className="hub-clientes__label" style={{ margin: 0 }}>
          Preços especiais
        </h4>
        {canWrite ? (
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--outline hub-clientes__btn--sm"
            onClick={() => {
              if (showForm) resetForm();
              else openCreateForm();
            }}
          >
            {showForm ? 'Cancelar' : '+ Novo acordo'}
          </button>
        ) : null}
      </div>

      <p className="hub-clientes__muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 12 }}>
        Valores por pet, por tutor ou plano família (total rateado). A recepção pode cadastrar; CADMIN e financeiro
        aprovam — se eles criarem, já fica ativo.
      </p>

      {showForm ? (
        <div className="hub-clientes__contact-card" style={{ marginBottom: 12, padding: 14 }}>
          <p className="hub-special-prices__form-title">
            {isEditing ? 'Editar acordo' : 'Novo acordo'}
          </p>

          {isEditing ? (
            <div className="hub-clientes__field">
              <span className="hub-clientes__label">Escopo e serviço</span>
              <p className="hub-special-prices__locked-meta">
                {SCOPE_LABEL[scope]}
                {editingRow?.scope === 'pet' && editingRow.pet_id
                  ? ` · ${petNameById.get(editingRow.pet_id) ?? 'Pet'}`
                  : ''}
                {' · '}
                {editingServiceLabel}
              </p>
              <p className="hub-clientes__muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                Escopo e serviço não podem ser alterados — crie um novo acordo se precisar trocar.
              </p>
            </div>
          ) : (
            <>
              <div className="hub-clientes__field">
                <span className="hub-clientes__label" id="sp-scope-label">
                  Escopo
                </span>
                <div
                  className={`hub-special-prices__scope${
                    scopeOptions.length >= 3 ? ' hub-special-prices__scope--stack' : ''
                  }`}
                  role="radiogroup"
                  aria-labelledby="sp-scope-label"
                >
                  {scopeOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={scope === opt.value}
                      className={`hub-special-prices__scope-btn${
                        scope === opt.value ? ' hub-special-prices__scope-btn--active' : ''
                      }`}
                      onClick={() => {
                        setScope(opt.value as HubSpecialPrice['scope']);
                        if (opt.value !== 'family_plan') setMemberPetIds([]);
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {scopeHint ? (
                  <p className="hub-special-prices__scope-hint">{scopeHint}</p>
                ) : null}
                {guardianId && guardianPets.length < 2 ? (
                  <p className="hub-special-prices__scope-hint">
                    Plano família aparece quando o tutor tiver pelo menos 2 pets cadastrados.
                  </p>
                ) : null}
              </div>

              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="sp-service">
                  Serviço
                </label>
                <HubSearchableCombobox
                  id="sp-service"
                  className="hub-combobox--clientes"
                  options={serviceOptions}
                  value={serviceId}
                  onChange={setServiceId}
                  placeholder="Selecionar serviço…"
                  searchPlaceholder="Buscar serviço…"
                  emptyResultsLabel="Nenhum serviço encontrado"
                  allowCreate={false}
                  clearable={false}
                  ariaLabel="Serviço do preço especial"
                />
              </div>
            </>
          )}

          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="sp-sale-amount">
              {scope === 'family_plan' ? 'Valor total do plano (R$)' : 'Valor especial (R$)'}
            </label>
            <input
              id="sp-sale-amount"
              className="hub-clientes__input"
              inputMode="decimal"
              value={saleAmount}
              onChange={(e) => setSaleAmount(e.target.value)}
              placeholder="Ex.: 50"
            />
          </div>

          {scope === 'family_plan' ? (
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor="sp-family-pets">
                Pets no plano
              </label>
              <HubMultiSelectCombobox
                id="sp-family-pets"
                className="hub-combobox--clientes"
                options={petMultiOptions}
                value={memberPetIds}
                onChange={setMemberPetIds}
                placeholder="Selecionar pets…"
                searchPlaceholder="Buscar pet…"
                emptyResultsLabel="Nenhum pet encontrado"
                resolveLabel={(id) => petNameById.get(id) ?? id}
                triggerIcon={<Dog size={18} strokeWidth={2} aria-hidden />}
                ariaLabel="Pets do plano família"
              />
              {familySharePreview ? (
                <p className="hub-clientes__muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
                  Rateio ≈ {familySharePreview} por pet
                </p>
              ) : (
                <p className="hub-clientes__muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
                  Selecione pelo menos 2 pets.
                </p>
              )}
            </div>
          ) : null}

          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="sp-notes">
              Observação
            </label>
            <input
              id="sp-notes"
              className="hub-clientes__input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: fidelidade — 2 pets"
            />
          </div>

          <div className="hub-clientes__field" style={{ marginBottom: 14 }}>
            <HubCheckbox checked={autoTrack} onChange={setAutoTrack}>
              Acompanhar reajuste do catálogo (sobe o especial pelo mesmo delta em R$)
            </HubCheckbox>
          </div>

          {isEditing && !canApprove && editingRow?.status === 'active' ? (
            <p className="hub-clientes__muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 12 }}>
              Alterar o valor ou os pets do plano envia o acordo para nova aprovação.
            </p>
          ) : null}

          <div className="hub-clientes__btn-row">
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving
                ? 'Salvando…'
                : isEditing
                  ? 'Salvar alterações'
                  : canApprove
                    ? 'Salvar e ativar'
                    : 'Enviar para aprovação'}
            </button>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--outline hub-clientes__btn--sm"
              disabled={saving}
              onClick={resetForm}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="hub-clientes__empty-state">Nenhum preço especial cadastrado.</div>
      ) : (
        <ul className="hub-special-prices__list">
          {rows.map((r) => {
            const svcName =
              r.service_name?.trim() || serviceNameById.get(r.hub_service_type_id) || 'Serviço';
            const memberCount = r.member_pet_ids?.length ?? 0;
            const sharePerPet =
              r.scope === 'family_plan' && memberCount > 0
                ? formatBrl(r.sale_amount / memberCount)
                : null;
            const isOn = r.status === 'active' || r.status === 'pending_approval';
            const toggling = togglingId === r.id;
            const petLabel =
              r.scope === 'pet' && r.pet_id ? petNameById.get(r.pet_id) ?? null : null;
            const familyPetNames =
              r.scope === 'family_plan' && (r.member_pet_ids?.length ?? 0) > 0
                ? (r.member_pet_ids ?? [])
                    .map((id) => petNameById.get(id))
                    .filter((n): n is string => Boolean(n))
                : [];
            const scopeBadgeLabel =
              r.scope === 'pet' && petLabel ? petLabel : SCOPE_LABEL[r.scope];
            const metaParts = [
              r.catalog_sale_at_set != null ? `Catálogo ${formatBrl(r.catalog_sale_at_set)}` : null,
              r.auto_track_catalog ? 'Auto-reajuste' : null,
              r.scope === 'family_plan'
                ? familyPetNames.length > 0
                  ? familyPetNames.join(', ')
                  : memberCount > 0
                    ? `${memberCount} pets`
                    : null
                : null,
              r.notes?.trim() || null,
            ].filter(Boolean);
            const isRowEditing = editingId === r.id;

            return (
              <li
                key={r.id}
                className={`hub-special-prices__row${
                  r.status === 'inactive' ? ' hub-special-prices__row--inactive' : ''
                }${isRowEditing ? ' hub-special-prices__row--editing' : ''}`}
              >
                <div className="hub-special-prices__row-main">
                  <div className="hub-special-prices__row-head">
                    <p className="hub-special-prices__row-title">{svcName}</p>
                    <span
                      className={`hub-special-prices__badge hub-special-prices__badge--scope${
                        r.scope === 'pet' && petLabel ? ' hub-special-prices__badge--pet' : ''
                      }`}
                    >
                      {scopeBadgeLabel}
                    </span>
                    {r.status === 'pending_approval' ? (
                      <span className="hub-special-prices__badge hub-special-prices__badge--pending">
                        {STATUS_LABEL.pending_approval}
                      </span>
                    ) : null}
                  </div>
                  {metaParts.length > 0 ? (
                    <p className="hub-special-prices__row-meta">{metaParts.join(' · ')}</p>
                  ) : null}
                  {r.needs_catalog_review ? (
                    <p className="hub-special-prices__row-warn">Catálogo mudou — revise o valor</p>
                  ) : null}
                </div>

                <div className="hub-special-prices__row-aside">
                  <div className="hub-special-prices__row-price">
                    <p className="hub-special-prices__row-amount">{formatBrl(r.sale_amount)}</p>
                    {sharePerPet ? (
                      <span className="hub-special-prices__row-share">≈ {sharePerPet} / pet</span>
                    ) : null}
                  </div>

                  {canWrite ? (
                    <button
                      type="button"
                      className="hub-special-prices__icon-btn"
                      aria-label={`Editar acordo de ${svcName}`}
                      title="Editar"
                      disabled={toggling}
                      onClick={() => openEditForm(r)}
                    >
                      <Pencil size={15} strokeWidth={2} aria-hidden />
                    </button>
                  ) : null}

                  {canApprove && r.status === 'pending_approval' ? (
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                      disabled={toggling}
                      onClick={() => void handleApprove(r.id)}
                    >
                      Aprovar
                    </button>
                  ) : null}

                  {canWrite ? (
                    <button
                      type="button"
                      className={`hub-special-prices__switch${isOn ? ' hub-special-prices__switch--on' : ''}`}
                      role="switch"
                      aria-checked={isOn}
                      aria-label={
                        isOn
                          ? `Desativar preço especial de ${svcName}`
                          : `Ativar preço especial de ${svcName}`
                      }
                      disabled={toggling || (!isOn && !canApprove)}
                      onClick={() => void handleToggleActive(r)}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
