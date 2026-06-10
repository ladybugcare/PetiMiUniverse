import React, { useEffect, useState } from 'react';
import {
  Building2,
  Store,
  FileText,
  MapPin,
  Phone,
  Pencil,
  Hash,
  AlignLeft,
  User,
} from 'lucide-react';
import HubProfilePhotoPicker from '../components/HubProfilePhotoPicker';
import HubClinicEditPanel from '../components/clinic-profile/HubClinicEditPanel';
import HubUnitEditPanel from '../components/clinic-profile/HubUnitEditPanel';
import { useAlert } from '@petimi/hub-ui';
import '@petimi/hub-ui/pages/clientes/clientes.css';
import { useHubUnit } from '../contexts/HubUnitContext';
import { hubClinicProfileApi } from '../services/hubClinicProfileApi';
import { hubUnitsApi } from '../services/hubUnitsApi';
import { formatCNPJ } from '../utils/brValidators';
import { clearHubUnitIncompleteHint } from '../utils/hubOnboardingState';
import type { HubClinicProfile, HubUnitProfile } from '../types/hubClinicProfile';

const terracotta = '#c86a4d';

function formatDatePt(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
}

function dash(value?: string | null): string {
  const t = value?.trim();
  return t || '—';
}

function formatAddress(parts: { address?: string | null; city?: string | null; state?: string | null }): string {
  const line = [parts.address, parts.city, parts.state].map((p) => p?.trim()).filter(Boolean);
  return line.length ? line.join(' · ') : '—';
}

function unitStatusLabel(status?: string | null): string {
  const s = (status || '').toLowerCase();
  if (s === 'active' || s === 'approved') return 'Ativo';
  if (s === 'pending_review' || s === 'pending_approval') return 'Pendente';
  if (s === 'suspended' || s === 'rejected') return 'Inativo';
  return status?.trim() || '—';
}

function UnitStatusPill({ status }: { status?: string | null }) {
  const s = (status || '').toLowerCase();
  if (s === 'active' || s === 'approved') {
    return <span className="hub-clientes__pill hub-clientes__pill--active">Ativo</span>;
  }
  if (s === 'suspended' || s === 'rejected') {
    return <span className="hub-clientes__pill hub-clientes__pill--inactive-alert">Inativo</span>;
  }
  return <span className="hub-clientes__pill hub-clientes__pill--inactive">{unitStatusLabel(status)}</span>;
}

type CellProps = { icon: React.ReactNode; label: string; value: React.ReactNode };

const InfoCell: React.FC<CellProps> = ({ icon, label, value }) => (
  <div className="hub-meu-perfil__cell">
    <div className="hub-meu-perfil__cell-icon" aria-hidden>
      {icon}
    </div>
    <div className="hub-meu-perfil__cell-label">{label}</div>
    <div className="hub-meu-perfil__cell-value">{value}</div>
  </div>
);

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
  const { clinicId, clinicName, selectedUnit, units, reload, loading: unitContextLoading } = useHubUnit();
  const { showSuccess, showError } = useAlert();
  const [clinic, setClinic] = useState<HubClinicProfile | null>(null);
  const [unit, setUnit] = useState<HubUnitProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editClinicOpen, setEditClinicOpen] = useState(false);
  const [editUnitOpen, setEditUnitOpen] = useState(false);

  useEffect(() => {
    if (!clinicId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const resolveUnitId = () => {
      if (selectedUnit?.id) return selectedUnit.id;
      const main = units.find((u) => u.is_main);
      return main?.id ?? units[0]?.id ?? null;
    };

    (async () => {
      const unitId = resolveUnitId();
      try {
        const [clinicRes, unitsRes] = await Promise.all([
          hubClinicProfileApi.getById(clinicId),
          hubUnitsApi.getByClinic(clinicId, false),
        ]);
        if (cancelled) return;

        setClinic(clinicRes.clinic);

        const list = unitsRes.units || [];
        const fromList =
          (unitId ? list.find((u) => u.id === unitId) : null) ||
          list.find((u) => u.is_main) ||
          list[0];

        if (unitId) {
          try {
            const detail = await hubUnitsApi.getById(unitId);
            if (!cancelled) setUnit(detail.unit);
          } catch {
            if (!cancelled) setUnit(fromList ? unitFromListRow(fromList) : null);
          }
        } else if (!cancelled) {
          setUnit(fromList ? unitFromListRow(fromList) : selectedUnit ? unitFromListRow(selectedUnit) : null);
        }

        if (!cancelled) clearHubUnitIncompleteHint();
      } catch (e: unknown) {
        if (!cancelled) {
          showError((e as Error)?.message || 'Erro ao carregar perfil da clínica');
          setClinic(null);
          if (selectedUnit) setUnit(unitFromListRow(selectedUnit));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clinicId, selectedUnit, units, showError]);

  const displayName = clinic?.name?.trim() || clinicName || 'Clínica';
  const unitLabel = selectedUnit?.nickname?.trim() || selectedUnit?.name || '—';
  const badge = selectedUnit?.is_main ? 'Unidade principal' : 'Clínica';
  const cnpjDisplay = clinic?.cnpj ? formatCNPJ(clinic.cnpj) : '—';
  const memberSince = formatDatePt(clinic?.created_at);
  const unitSince = formatDatePt(unit?.created_at);

  if (unitContextLoading || loading) {
    return (
      <div className="hub-meu-perfil">
        <p className="hub-meu-perfil__panel-sub">A carregar perfil da clínica…</p>
      </div>
    );
  }

  if (!clinicId) {
    return (
      <div className="hub-meu-perfil">
        <p className="hub-meu-perfil__panel-sub">Nenhuma clínica associada à sua conta.</p>
        <p className="hub-meu-perfil__panel-sub" style={{ marginTop: 8 }}>
          Se acabou de concluir o cadastro, tente{' '}
          <button
            type="button"
            className="hub-meu-perfil__btn-outline"
            style={{ display: 'inline-flex', marginTop: 8 }}
            onClick={() => void reload()}
          >
            recarregar dados da clínica
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="hub-meu-perfil">
      <aside className="hub-meu-perfil__sidebar">
        <div className="hub-meu-perfil__card hub-meu-perfil__summary">
          <HubProfilePhotoPicker
            mode={{
              kind: 'clinic',
              clinicId,
              onClinicUpdated: (c) => setClinic((prev) => (prev ? { ...prev, ...c } : prev)),
            }}
            photoUrl={clinic?.photo_url ?? undefined}
            displayName={displayName}
            size={96}
            disabled={!clinicId}
          />
          <h2 className="hub-meu-perfil__sidebar-name">{displayName}</h2>
          <span className="hub-meu-perfil__badge">{badge}</span>
          <div className="hub-meu-perfil__contact">
            <span>{cnpjDisplay !== '—' ? `CNPJ ${cnpjDisplay}` : 'CNPJ não informado'}</span>
            <span>{dash(clinic?.phone)}</span>
            <span>Unidade atual: {unitLabel}</span>
          </div>
        </div>

        <div className="hub-meu-perfil__card hub-meu-perfil__aside-meta">
          <div className="hub-meu-perfil__meta-row">
            <span className="hub-meu-perfil__meta-label">Clínica desde</span>
            <span className="hub-meu-perfil__meta-value">{memberSince}</span>
          </div>
          {unit ? (
            <div className="hub-meu-perfil__meta-row">
              <span className="hub-meu-perfil__meta-label">Unidade cadastrada</span>
              <span className="hub-meu-perfil__meta-value">{unitSince}</span>
            </div>
          ) : null}
        </div>
      </aside>

      <div className="hub-meu-perfil__main">
        <section className="hub-meu-perfil__panel">
          <header className="hub-meu-perfil__panel-head">
            <div>
              <h2 className="hub-meu-perfil__panel-title">Dados da organização</h2>
              <p className="hub-meu-perfil__panel-sub">
                Informações legais e de contacto da clínica (razão social).
              </p>
            </div>
            <button
              type="button"
              className="hub-meu-perfil__btn-outline"
              onClick={() => setEditClinicOpen(true)}
              disabled={!clinic}
            >
              <Pencil size={16} aria-hidden />
              Editar clínica
            </button>
          </header>
          <div className="hub-meu-perfil__grid">
            <InfoCell icon={<Building2 size={20} color={terracotta} />} label="Nome da clínica" value={dash(clinic?.name)} />
            <InfoCell icon={<Hash size={20} color={terracotta} />} label="CNPJ" value={cnpjDisplay} />
            <InfoCell icon={<Phone size={20} color={terracotta} />} label="Telefone comercial" value={dash(clinic?.phone)} />
            <InfoCell
              icon={<MapPin size={20} color={terracotta} />}
              label="Endereço"
              value={formatAddress(clinic ?? {})}
            />
            <InfoCell
              icon={<AlignLeft size={20} color={terracotta} />}
              label="Descrição"
              value={dash(clinic?.description)}
            />
          </div>
        </section>

        {unit ? (
          <section className="hub-meu-perfil__panel hub-meu-perfil__panel--spaced">
            <header className="hub-meu-perfil__panel-head">
              <div>
                <h2 className="hub-meu-perfil__panel-title">Unidade operacional</h2>
                <p className="hub-meu-perfil__panel-sub">
                  Dados da unidade selecionada no header ({unitLabel}).
                </p>
              </div>
              <button type="button" className="hub-meu-perfil__btn-outline" onClick={() => setEditUnitOpen(true)}>
                <Pencil size={16} aria-hidden />
                Editar unidade
              </button>
            </header>
            <div className="hub-meu-perfil__grid">
              <InfoCell icon={<Store size={20} color={terracotta} />} label="Nome da unidade" value={dash(unit.name)} />
              <InfoCell icon={<FileText size={20} color={terracotta} />} label="Apelido (agenda)" value={dash(unit.nickname)} />
              <InfoCell icon={<Phone size={20} color={terracotta} />} label="Telefone da unidade" value={dash(unit.phone)} />
              <InfoCell
                icon={<User size={20} color={terracotta} />}
                label="Responsável técnico"
                value={dash(unit.technical_manager)}
              />
              <InfoCell
                icon={<MapPin size={20} color={terracotta} />}
                label="Endereço"
                value={formatAddress(unit)}
              />
              <InfoCell
                icon={<Store size={20} color={terracotta} />}
                label="Status"
                value={<UnitStatusPill status={unit.status} />}
              />
            </div>
          </section>
        ) : null}
      </div>

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

      {unit ? (
        <HubUnitEditPanel
          open={editUnitOpen}
          onClose={() => setEditUnitOpen(false)}
          clinicId={clinicId}
          unit={unit}
          onSaved={(u) => {
            setUnit(u);
            void reload();
          }}
          onError={showError}
          onSuccess={showSuccess}
        />
      ) : null}
    </div>
  );
};

export default HubClinicaPerfilPage;
