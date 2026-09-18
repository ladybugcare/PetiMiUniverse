import React, { useEffect, useState } from 'react';
import { Building2, Hash, Pencil, Phone, Plus, Store } from 'lucide-react';
import { useAlert, formatBrPhoneDisplay, HubLoading } from '@petimi/hub-ui';
import { usePermissions } from '@petimi/web-core';
import '@petimi/hub-ui/pages/clientes/clientes.css';
import HubProfilePhotoPicker from '../components/HubProfilePhotoPicker';
import HubClinicEditPanel from '../components/clinic-profile/HubClinicEditPanel';
import HubUnitEditPanel from '../components/clinic-profile/HubUnitEditPanel';
import {
  HubAccountProfileCard,
  HubAccountProfileEmpty,
  HubAccountProfileFields,
  HubAccountProfileHero,
  HubAccountProfileShell,
  HubAccountProfileUnitCard,
  formatProfileAddress,
  formatProfileDate,
  profileDash,
} from '../components/profile';
import { useHubUnit } from '../contexts/HubUnitContext';
import { hubClinicProfileApi } from '../services/hubClinicProfileApi';
import { hubUnitsApi } from '../services/hubUnitsApi';
import { formatCNPJ } from '../utils/brValidators';
import { clearHubUnitIncompleteHint } from '../utils/hubOnboardingState';
import type { HubClinicProfile, HubUnitProfile } from '../types/hubClinicProfile';

function unitFromListRow(row: {
  id: string;
  clinic_id: string;
  name?: string | null;
  nickname?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  technical_manager?: string | null;
  is_main?: boolean | null;
  status?: string | null;
  created_at?: string | null;
}): HubUnitProfile {
  return {
    id: row.id,
    clinic_id: row.clinic_id,
    name: row.name,
    nickname: row.nickname,
    address: row.address,
    city: row.city,
    state: row.state,
    phone: row.phone,
    technical_manager: row.technical_manager,
    is_main: row.is_main,
    status: row.status,
    created_at: row.created_at,
  };
}

const HubClinicaPerfilPage: React.FC = () => {
  const { clinicId, clinicName, selectedUnit, reload, loading: unitContextLoading } = useHubUnit();
  const { role: clinicRole, hasPermission } = usePermissions();
  const canEditClinicProfile = clinicRole === 'CADMIN' || clinicRole === 'CMANAGER';
  const canCreateUnit = hasPermission('unit.create');
  const { showSuccess, showError } = useAlert();
  const [clinic, setClinic] = useState<HubClinicProfile | null>(null);
  const [allUnits, setAllUnits] = useState<HubUnitProfile[]>([]);
  const [editingUnit, setEditingUnit] = useState<HubUnitProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editClinicOpen, setEditClinicOpen] = useState(false);
  const [createUnitOpen, setCreateUnitOpen] = useState(false);

  useEffect(() => {
    if (!clinicId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const [clinicRes, unitsRes] = await Promise.all([
          hubClinicProfileApi.getById(clinicId),
          hubUnitsApi.getByClinic(clinicId, false),
        ]);
        if (cancelled) return;
        setClinic(clinicRes.clinic);
        setAllUnits((unitsRes.units || []).map(unitFromListRow));
        clearHubUnitIncompleteHint();
      } catch (e: unknown) {
        if (!cancelled) {
          showError((e as Error)?.message || 'Erro ao carregar perfil da clínica');
          setClinic(null);
          if (selectedUnit) setAllUnits([unitFromListRow(selectedUnit)]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clinicId, showError]);

  const displayName = clinic?.name?.trim() || clinicName || 'Clínica';
  const cnpjDisplay = clinic?.cnpj ? formatCNPJ(clinic.cnpj) : 'CNPJ não informado';
  const unitCountLabel =
    allUnits.length === 1 ? '1 unidade' : allUnits.length > 1 ? `${allUnits.length} unidades` : 'Nenhuma unidade';

  const openEditUnit = (row: HubUnitProfile) => {
    setEditingUnit(row);
  };

  if (unitContextLoading || loading) {
    return (
      <HubAccountProfileShell>
        <HubLoading variant="block" label="Carregando perfil da clínica…" />
      </HubAccountProfileShell>
    );
  }

  if (!clinicId) {
    return (
      <HubAccountProfileShell>
        <HubAccountProfileEmpty
          icon={Building2}
          title="Nenhuma clínica associada"
          subtitle="Se você acabou de concluir o cadastro, recarregue os dados da clínica."
          action={
            <button type="button" className="hub-ap__btn hub-ap__btn--outline" onClick={() => void reload()}>
              Recarregar dados
            </button>
          }
        />
      </HubAccountProfileShell>
    );
  }

  return (
    <HubAccountProfileShell>
      <HubAccountProfileHero
        kicker="Perfil da clínica"
        name={displayName}
        photo={
          <HubProfilePhotoPicker
            mode={{
              kind: 'clinic',
              clinicId,
              onClinicUpdated: (c) => setClinic((prev) => (prev ? { ...prev, ...c } : prev)),
            }}
            photoUrl={clinic?.photo_url ?? undefined}
            displayName={displayName}
            size={88}
            disabled={!canEditClinicProfile}
          />
        }
        badges={['Clínica']}
        chips={[
          { icon: Hash, label: cnpjDisplay },
          { icon: Phone, label: formatBrPhoneDisplay(clinic?.phone) },
          { icon: Store, label: unitCountLabel },
        ]}
        meta={[{ label: 'Na PetMi desde', value: formatProfileDate(clinic?.created_at) }]}
      />

      <HubAccountProfileCard
        title="Organização"
        subtitle="Razão social, contato e endereço legal da clínica."
        actions={
          canEditClinicProfile ? (
            <button
              type="button"
              className="hub-ap__btn hub-ap__btn--outline"
              onClick={() => setEditClinicOpen(true)}
              disabled={!clinic}
            >
              <Pencil size={16} aria-hidden />
              Editar clínica
            </button>
          ) : null
        }
      >
        <HubAccountProfileFields
          fields={[
            { label: 'Nome da clínica', value: profileDash(clinic?.name) },
            { label: 'CNPJ', value: clinic?.cnpj ? formatCNPJ(clinic.cnpj) : '—' },
            { label: 'Telefone comercial', value: formatBrPhoneDisplay(clinic?.phone) },
            { label: 'Endereço', value: formatProfileAddress(clinic ?? {}) },
            { label: 'Descrição', value: profileDash(clinic?.description), block: Boolean(clinic?.description?.trim()) },
          ]}
        />
      </HubAccountProfileCard>

      <HubAccountProfileCard
        title="Unidades"
        subtitle="Cada unidade é um local operacional — agenda, caixa e equipe ficam separados por endereço."
        actions={
          canCreateUnit ? (
            <button type="button" className="hub-ap__btn hub-ap__btn--primary" onClick={() => setCreateUnitOpen(true)}>
              <Plus size={16} aria-hidden />
              Nova unidade
            </button>
          ) : null
        }
      >
        {allUnits.length > 0 ? (
          <div className="hub-ap__units">
            {allUnits.map((row) => (
              <HubAccountProfileUnitCard
                key={row.id}
                name={profileDash(row.name)}
                nickname={row.nickname}
                addressLine={formatProfileAddress(row)}
                phone={formatBrPhoneDisplay(row.phone)}
                technicalManager={profileDash(row.technical_manager)}
                isMain={row.is_main}
                status={row.status}
                canEdit={canEditClinicProfile}
                onEdit={() => openEditUnit(row)}
              />
            ))}
          </div>
        ) : (
          <HubAccountProfileEmpty
            icon={Store}
            title="Nenhuma unidade cadastrada"
            subtitle="Cadastre o primeiro local para operar agenda, caixa e equipe."
            action={
              canCreateUnit ? (
                <button type="button" className="hub-ap__btn hub-ap__btn--primary" onClick={() => setCreateUnitOpen(true)}>
                  <Plus size={16} aria-hidden />
                  Nova unidade
                </button>
              ) : null
            }
          />
        )}
      </HubAccountProfileCard>

      {clinic ? (
        <HubClinicEditPanel
          open={editClinicOpen}
          onClose={() => setEditClinicOpen(false)}
          clinicId={clinicId}
          clinic={clinic}
          onSaved={(c) => {
            setClinic(c);
            void reload();
          }}
          onError={showError}
          onSuccess={showSuccess}
        />
      ) : null}

      {editingUnit ? (
        <HubUnitEditPanel
          open
          onClose={() => setEditingUnit(null)}
          clinicId={clinicId}
          unit={editingUnit}
          onSaved={(u) => {
            setAllUnits((prev) => prev.map((row) => (row.id === u.id ? { ...row, ...u } : row)));
            setEditingUnit(null);
            void reload();
          }}
          onError={showError}
          onSuccess={showSuccess}
        />
      ) : null}

      <HubUnitEditPanel
        open={createUnitOpen}
        onClose={() => setCreateUnitOpen(false)}
        clinicId={clinicId}
        mode="create"
        defaultIsMain={allUnits.length === 0}
        clinicDefaults={{
          address: clinic?.address,
          city: clinic?.city,
          state: clinic?.state,
        }}
        onSaved={(u) => {
          setAllUnits((prev) => (prev.some((row) => row.id === u.id) ? prev : [...prev, u]));
          void reload();
        }}
        onError={showError}
        onSuccess={showSuccess}
      />
    </HubAccountProfileShell>
  );
};

export default HubClinicaPerfilPage;
