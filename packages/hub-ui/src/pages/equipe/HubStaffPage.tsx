import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Pencil, UserX } from 'lucide-react';
import { apiRequest, getStoredClinicId, useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import { hubStaffApi, type HubStaffMember } from '../../api/hubStaffApi';
import { hubServiceGroupsApi } from '../../api/hubServiceGroupsApi';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
import { type GroupJobMappings } from '../../utils/staffServiceCompatibility';
import { HubCheckbox } from '../../components/HubCheckbox';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import HubStaffDrawer from './HubStaffDrawer';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import './equipe-page.css';
import './equipe-drawer.css';

type DrawerMode = 'create' | 'edit';

const HubStaffPage: React.FC = () => {
  const { showError, showSuccess, showConfirm } = useAlert();
  const { user, role: authRole } = useAuth();
  const { loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const canWrite = hasPermission('hub.staff.write');
  const canInvite = hasPermission('hub.staff.invite') && hasPermission('user.invite');
  const accessAllowed = hasPermission('hub.staff.read');

  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<HubStaffMember[]>([]);
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [serviceTypes, setServiceTypes] = useState<HubServiceType[]>([]);
  const [jobMappings, setJobMappings] = useState<GroupJobMappings>({});
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('create');
  const [editingStaff, setEditingStaff] = useState<HubStaffMember | null>(null);

  const loadStaff = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const res = await hubStaffApi.list(clinicId, {
        search: search.trim() || undefined,
        active_only: activeOnly,
      });
      setStaff(res.staff || []);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar equipe');
    } finally {
      setLoading(false);
    }
  }, [clinicId, search, activeOnly, showError]);

  const loadRefs = useCallback(async () => {
    if (!clinicId) return;
    try {
      const [stRes, unitsRes, mapRes] = await Promise.all([
        hubServiceTypesApi.list(clinicId, true, false),
        apiRequest(`/units/clinic/${encodeURIComponent(clinicId)}?activeOnly=true`) as Promise<{
          units: { id: string; name: string }[];
        }>,
        hubServiceGroupsApi.getJobMappings(clinicId).catch(() => ({ mappings: {} as GroupJobMappings })),
      ]);
      setServiceTypes((stRes.service_types || []).filter((t) => t.active && !t.deleted_at));
      setJobMappings(mapRes.mappings ?? {});
      setUnits((unitsRes.units || []).map((u) => ({ id: u.id, name: u.name || 'Unidade' })));
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar serviços / unidades');
    }
  }, [clinicId, showError]);

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) redirectAwayFromHub(authRole as AppRole);
  }, [permLoading, accessAllowed, authRole]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    void loadRefs();
  }, [clinicId, accessAllowed, loadRefs]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    void loadStaff();
  }, [clinicId, accessAllowed, loadStaff]);

  const metrics = useMemo(() => {
    const total = staff.length;
    const active = staff.filter((s) => s.active).length;
    const withAccess = staff.filter((s) => s.has_hub_access).length;
    return { total, active, withAccess };
  }, [staff]);

  const openCreate = () => {
    if (!canWrite) return;
    setDrawerMode('create');
    setEditingStaff(null);
    setDrawerOpen(true);
  };

  const openEdit = (m: HubStaffMember) => {
    if (!canWrite) return;
    setDrawerMode('edit');
    setEditingStaff(m);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingStaff(null);
  };

  const inactivate = (m: HubStaffMember) => {
    if (!clinicId || !canWrite) return;
    showConfirm(
      `Inativar "${m.full_name}"?`,
      async () => {
        try {
          await hubStaffApi.patch(m.id, { clinic_id: clinicId, active: false });
          showSuccess('Inativado');
          await loadStaff();
          if (editingStaff?.id === m.id) closeDrawer();
        } catch (e: unknown) {
          showError((e as Error)?.message || 'Erro');
        }
      },
      'Inativar',
    );
  };

  if (!user) return <Navigate to="/login" replace />;
  if (!permLoading && !clinicId) {
    return (
      <div className="hub-clientes hub-equipe-page" style={{ padding: 24 }}>
        <p className="hub-clientes__muted">selecione uma clínica.</p>
      </div>
    );
  }
  if (permLoading || !accessAllowed) {
    return (
      <div className="hub-clientes hub-equipe-page" style={{ padding: 24 }}>
        <HubLoading variant="block" />
      </div>
    );
  }

  return (
    <div className="hub-clientes hub-servicos-page hub-equipe-page hub-equipe-page--full-width">
      <div className="hub-clientes__main">
        <div className="hub-servicos__metrics" aria-live="polite">
          <div className="hub-servicos__metric-card">
            <div className="hub-servicos__metric-card__text">
              <div className="hub-servicos__metric-label">Total</div>
              <div className="hub-servicos__metric-value">{loading ? '—' : metrics.total}</div>
            </div>
          </div>
          <div className="hub-servicos__metric-card">
            <div className="hub-servicos__metric-card__text">
              <div className="hub-servicos__metric-label">ativos</div>
              <div className="hub-servicos__metric-value">{loading ? '—' : metrics.active}</div>
            </div>
          </div>
          <div className="hub-servicos__metric-card">
            <div className="hub-servicos__metric-card__text">
              <div className="hub-servicos__metric-label">Com acesso Hub</div>
              <div className="hub-servicos__metric-value">{loading ? '—' : metrics.withAccess}</div>
            </div>
          </div>
        </div>

        <div className="hub-servicos__toolbar">
          <div className="hub-servicos__toolbar-row">
            <div className="hub-servicos__search-wrap">
              <input
                type="search"
                className="hub-servicos__search-input"
                placeholder="Buscar por nome, função ou e-mail…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void loadStaff();
                }}
                aria-label="Buscar"
              />
            </div>
            <HubCheckbox className="hub-clientes__muted" checked={activeOnly} onChange={setActiveOnly}>
              Só ativos
            </HubCheckbox>
            <button type="button" className="hub-servicos__btn-ghost-sm" onClick={() => void loadStaff()}>
              Buscar
            </button>
            {canWrite && (
              <button type="button" className="hub-servicos__btn-primary-icon" onClick={openCreate}>
                + Novo profissional
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <HubLoading variant="block" label="Carregando equipe…" />
        ) : (
          <>
          <div className="hub-servicos__table-wrap hub-clientes__table-wrap--desktop">
            <table className="hub-clientes__table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Função</th>
                  <th>Unidade</th>
                  <th>Estado</th>
                  <th>Acesso Hub</th>
                  {canWrite ? <th className="hub-clientes__th-actions">Ações</th> : null}
                </tr>
              </thead>
              <tbody>
                {staff.length === 0 ? (
                  <tr>
                    <td colSpan={canWrite ? 6 : 5} className="hub-clientes__muted">
                      Nenhum profissional encontrado.
                    </td>
                  </tr>
                ) : (
                  staff.map((m) => (
                    <tr
                      key={m.id}
                      className={canWrite ? 'hub-clientes__row-click' : undefined}
                      onClick={() => canWrite && openEdit(m)}
                      style={canWrite ? { cursor: 'pointer' } : undefined}
                    >
                      <td>
                        <strong>{m.full_name}</strong>
                        {m.display_name ? (
                          <div className="hub-clientes__muted" style={{ fontSize: 12 }}>
                            {m.display_name}
                          </div>
                        ) : null}
                      </td>
                      <td>{m.job_title}</td>
                      <td>{m.default_unit_name || '—'}</td>
                      <td className="hub-clientes__td-status">
                        <span
                          className={`hub-clientes__pill ${
                            m.active ? 'hub-clientes__pill--active' : 'hub-clientes__pill--inactive-alert'
                          }`}
                        >
                          {m.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td>
                        {m.has_hub_access
                          ? m.clinic_user_id
                            ? 'Sim · vinculado'
                            : 'Sim · sem vínculo'
                          : 'Não'}
                      </td>
                      {canWrite ? (
                        <td className="hub-clientes__td-actions" onClick={(e) => e.stopPropagation()}>
                          <div className="hub-servicos__row-actions">
                            <button
                              type="button"
                              className="hub-servicos__icon-btn"
                              title="Editar"
                              aria-label="Editar"
                              onClick={() => openEdit(m)}
                            >
                              <Pencil size={18} strokeWidth={2} />
                            </button>
                            {m.active ? (
                              <button
                                type="button"
                                className="hub-servicos__icon-btn hub-servicos__icon-btn--danger"
                                title="Inativar"
                                aria-label="Inativar"
                                onClick={() => inactivate(m)}
                              >
                                <UserX size={18} strokeWidth={2} />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="hub-clientes__mobile-list" aria-label="Lista de profissionais">
            {staff.length === 0 ? (
              <p className="hub-clientes__muted hub-clientes__mobile-list-empty">Nenhum profissional encontrado.</p>
            ) : (
              staff.map((m) => (
                <div
                  key={m.id}
                  className="hub-clientes__mobile-card"
                  role={canWrite ? 'button' : undefined}
                  tabIndex={canWrite ? 0 : undefined}
                  onClick={() => canWrite && openEdit(m)}
                  onKeyDown={(e) => {
                    if (!canWrite) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openEdit(m);
                    }
                  }}
                >
                  <div className="hub-clientes__mobile-card-top">
                    <div className="hub-clientes__mobile-card-main">
                      <span className="hub-clientes__mobile-card-name">{m.full_name}</span>
                      <span className="hub-clientes__muted hub-clientes__mobile-card-contact">
                        {m.job_title}
                        {m.default_unit_name ? ` · ${m.default_unit_name}` : ''}
                      </span>
                    </div>
                    <span
                      className={`hub-clientes__pill ${
                        m.active ? 'hub-clientes__pill--active' : 'hub-clientes__pill--inactive-alert'
                      }`}
                    >
                      {m.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <div className="hub-clientes__mobile-card-foot">
                    <span className="hub-clientes__muted" style={{ fontSize: 12 }}>
                      {m.has_hub_access
                        ? m.clinic_user_id
                          ? 'Acesso Hub · vinculado'
                          : 'Acesso Hub · sem vínculo'
                        : 'Sem acesso Hub'}
                    </span>
                    {canWrite ? (
                      <span
                        className="hub-clientes__mobile-card-pets"
                        onClick={(e) => e.stopPropagation()}
                        role="presentation"
                      >
                        <div className="hub-servicos__row-actions">
                          <button
                            type="button"
                            className="hub-servicos__icon-btn"
                            title="Editar"
                            aria-label="Editar"
                            onClick={() => openEdit(m)}
                          >
                            <Pencil size={18} strokeWidth={2} />
                          </button>
                          {m.active ? (
                            <button
                              type="button"
                              className="hub-servicos__icon-btn hub-servicos__icon-btn--danger"
                              title="Inativar"
                              aria-label="Inativar"
                              onClick={() => inactivate(m)}
                            >
                              <UserX size={18} strokeWidth={2} />
                            </button>
                          ) : null}
                        </div>
                      </span>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
          </>
        )}
      </div>

      {clinicId ? (
        <HubStaffDrawer
          open={drawerOpen}
          onClose={closeDrawer}
          mode={drawerMode}
          staff={editingStaff}
          clinicId={clinicId}
          canWrite={canWrite}
          canInvite={canInvite}
          serviceTypes={serviceTypes}
          jobMappings={jobMappings}
          units={units}
          onSaved={loadStaff}
        />
      ) : null}
    </div>
  );
};

export default HubStaffPage;
