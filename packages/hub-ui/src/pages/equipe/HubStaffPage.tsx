import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Check, Pencil, UserX } from 'lucide-react';
import { apiRequest, getStoredClinicId, useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import { hubStaffApi, type HubStaffAccessRole, type HubStaffMember } from '../../api/hubStaffApi';
import { hubServiceGroupsApi } from '../../api/hubServiceGroupsApi';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
import {
  HUB_JOB_FUNCTION_OPTIONS,
  VET_JOB_TITLE_VALUE,
  professionalKindFromJobTitle,
} from '../../constants/hubJobFunctions';
import { suggestServiceTypeIdsForJobTitle, type GroupJobMappings } from '../../utils/staffServiceCompatibility';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubDateField } from '../../components/HubDateField';
import { HubCheckbox } from '../../components/HubCheckbox';
import { HubCancelButton } from '../../components/HubCancelButton';
import { ServiceGroupIcon } from '../../components/ServiceGroupIcon';
import { useAlert } from '../../components/AlertProvider';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import {
  SERVICE_GROUP_OPTIONS,
  KNOWN_SERVICE_GROUP_SLUGS,
  resolveServiceAccentColor,
  type HubServiceGroupValue,
} from '../../utils/serviceTypeSlug';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import '../pets/pets-page.css';
import './equipe-page.css';

const allowedClinicRoles = ['CADMIN', 'CMANAGER', 'CASSISTANT', 'CVET_INTERNAL'] as const;

/** Rótulos produto → roles aceites em convites / `clinic_users`. */
const HUB_ACCESS_ROLE_OPTIONS: { value: HubStaffAccessRole; label: string }[] = [
  { value: 'CADMIN', label: 'Administrador' },
  { value: 'CMANAGER', label: 'Gerente / Financeiro' },
  { value: 'CASSISTANT', label: 'Recepção / Operacional' },
  { value: 'CVET_INTERNAL', label: 'Veterinário (perfil interno)' },
];

const WEEKDAY_OPTS: { bit: number; label: string }[] = [
  { bit: 1, label: 'Seg' },
  { bit: 2, label: 'Ter' },
  { bit: 3, label: 'Qua' },
  { bit: 4, label: 'Qui' },
  { bit: 5, label: 'Sex' },
  { bit: 6, label: 'Sáb' },
  { bit: 0, label: 'Dom' },
];

type PanelMode = 'none' | 'create' | 'edit';

type FormState = {
  full_name: string;
  display_name: string;
  photo_url: string;
  phone: string;
  whatsapp_phone: string;
  email: string;
  birth_date: string;
  job_title: string;
  specialties: string;
  crmv: string;
  crmv_uf: string;
  internal_notes: string;
  active: boolean;
  has_hub_access: boolean;
  hub_access_email: string;
  hub_access_role: HubStaffAccessRole | '';
  accepts_appointments: boolean;
  available_days: number[];
  work_start: string;
  work_end: string;
  break_minutes: string;
  default_unit_id: string;
  agenda_color: string;
  service_type_ids: string[];
};

const emptyForm = (): FormState => ({
  full_name: '',
  display_name: '',
  photo_url: '',
  phone: '',
  whatsapp_phone: '',
  email: '',
  birth_date: '',
  job_title: '',
  specialties: '',
  crmv: '',
  crmv_uf: '',
  internal_notes: '',
  active: true,
  has_hub_access: false,
  hub_access_email: '',
  hub_access_role: '',
  accepts_appointments: false,
  available_days: [],
  work_start: '09:00',
  work_end: '18:00',
  break_minutes: '',
  default_unit_id: '',
  agenda_color: '#3B82F6',
  service_type_ids: [],
});

function parseDays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((n) => typeof n === 'number' && n >= 0 && n <= 6) as number[];
}

function parseWorkHours(raw: unknown): { start: string; end: string } {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const s = typeof o.default_start === 'string' ? o.default_start : '09:00';
    const e = typeof o.default_end === 'string' ? o.default_end : '18:00';
    return { start: s, end: e };
  }
  return { start: '09:00', end: '18:00' };
}

function isoDateOnlyFromApi(raw: string | null | undefined): string {
  if (raw == null || raw === '') return '';
  const s = String(raw);
  const d = s.length >= 10 ? s.slice(0, 10) : s;
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
}

const fromRow = (m: HubStaffMember, activeServiceTypeIds?: Set<string>): FormState => {
  const wh = parseWorkHours(m.work_hours);
  const linkedIds = (m.service_types ?? []).map((s) => s.id);
  const service_type_ids =
    activeServiceTypeIds != null && activeServiceTypeIds.size > 0
      ? linkedIds.filter((id) => activeServiceTypeIds.has(id))
      : linkedIds;
  return {
    full_name: m.full_name,
    display_name: m.display_name ?? '',
    photo_url: m.photo_url ?? '',
    phone: m.phone ?? '',
    whatsapp_phone: m.whatsapp_phone ?? '',
    email: m.email ?? '',
    birth_date: isoDateOnlyFromApi(m.birth_date),
    job_title: m.job_title,
    specialties: m.specialties ?? '',
    crmv: m.crmv ?? '',
    crmv_uf: m.crmv_uf ?? '',
    internal_notes: m.internal_notes ?? '',
    active: m.active,
    has_hub_access: m.has_hub_access,
    hub_access_email: m.hub_access_email ?? '',
    hub_access_role: (m.hub_access_role as HubStaffAccessRole) ?? '',
    accepts_appointments: m.accepts_appointments,
    available_days: parseDays(m.available_days),
    work_start: wh.start,
    work_end: wh.end,
    break_minutes: m.break_minutes != null ? String(m.break_minutes) : '',
    default_unit_id: m.default_unit_id ?? '',
    agenda_color: m.agenda_color || '#3B82F6',
    service_type_ids,
  };
};

const HubStaffPage: React.FC = () => {
  const { showError, showSuccess, showConfirm } = useAlert();
  const { user, role: authRole } = useAuth();
  const { role: clinicRole, loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const canWrite = hasPermission('hub.staff.write');
  const canInvite = hasPermission('hub.staff.invite') && hasPermission('user.invite');
  const accessAllowed =
    clinicRole && allowedClinicRoles.includes(clinicRole as (typeof allowedClinicRoles)[number]);

  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<HubStaffMember[]>([]);
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [serviceTypes, setServiceTypes] = useState<HubServiceType[]>([]);
  const [jobMappings, setJobMappings] = useState<GroupJobMappings>({});
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [panelMode, setPanelMode] = useState<PanelMode>('none');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

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
        apiRequest(`/units/clinic/${encodeURIComponent(clinicId)}?activeOnly=true`) as Promise<{ units: { id: string; name: string }[] }>,
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

  /** Opções canônicas + valor atual (`job_title`) para texto livre / função criada na pesquisa. */
  const jobTitleComboboxOptions = useMemo((): HubComboboxOption[] => {
    const rows: HubComboboxOption[] = HUB_JOB_FUNCTION_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
    const jt = form.job_title.trim();
    if (jt && !rows.some((r) => r.value === jt)) {
      rows.push({ value: jt, label: jt });
    }
    return [{ value: '', label: '—' }, ...rows];
  }, [form.job_title]);

  const selectedJobFunctionDescription = useMemo(() => {
    return HUB_JOB_FUNCTION_OPTIONS.find((o) => o.value === form.job_title.trim())?.description ?? '';
  }, [form.job_title]);

  const crmvFieldsVisible = form.job_title.trim() === VET_JOB_TITLE_VALUE;

  const serviceTypesByGroup = useMemo(() => {
    const map = new Map<string, HubServiceType[]>();
    for (const o of SERVICE_GROUP_OPTIONS) {
      map.set(o.value, []);
    }
    for (const t of serviceTypes) {
      const raw = (t.service_group || 'outros').trim();
      const key: HubServiceGroupValue = KNOWN_SERVICE_GROUP_SLUGS.has(raw as HubServiceGroupValue)
        ? (raw as HubServiceGroupValue)
        : 'outros';
      map.get(key)!.push(t);
    }
    return map;
  }, [serviceTypes]);

  const staffServiceGroupRows = useMemo(() => {
    return SERVICE_GROUP_OPTIONS.map((opt) => {
      const typesIn = serviceTypesByGroup.get(opt.value) ?? [];
      const ids = typesIn.map((t) => t.id);
      const nSel = ids.filter((id) => form.service_type_ids.includes(id)).length;
      const firstHex = typesIn.find((t) => {
        const c = (t.group_color ?? t.agenda_color)?.trim();
        return c && /^#[0-9A-Fa-f]{6}$/.test(c);
      });
      const accent =
        (firstHex?.group_color ?? firstHex?.agenda_color)?.trim() ?? resolveServiceAccentColor(null, opt.value);
      return {
        opt,
        disabled: typesIn.length === 0,
        selected: typesIn.length > 0 && nSel === typesIn.length,
        partial: nSel > 0 && nSel < typesIn.length,
        accent,
      };
    });
  }, [serviceTypesByGroup, form.service_type_ids]);

  const toggleServiceGroup = useCallback(
    (groupValue: string) => {
      const list = serviceTypesByGroup.get(groupValue) ?? [];
      const ids = list.map((t) => t.id);
      if (ids.length === 0) return;
      setForm((f) => {
        const allOn = ids.every((id) => f.service_type_ids.includes(id));
        if (allOn) {
          return { ...f, service_type_ids: f.service_type_ids.filter((id) => !ids.includes(id)) };
        }
        const merged = new Set(f.service_type_ids);
        for (const id of ids) merged.add(id);
        return { ...f, service_type_ids: [...merged] };
      });
    },
    [serviceTypesByGroup]
  );

  const [staffPhotoLocalPreview, setStaffPhotoLocalPreview] = useState<string | null>(null);
  const [staffPhotoUploading, setStaffPhotoUploading] = useState(false);
  const staffPhotoInputRef = useRef<HTMLInputElement>(null);
  const staffPhotoBlobRef = useRef<string | null>(null);

  const clearStaffPhotoLocal = useCallback(() => {
    if (staffPhotoBlobRef.current) {
      URL.revokeObjectURL(staffPhotoBlobRef.current);
      staffPhotoBlobRef.current = null;
    }
    setStaffPhotoLocalPreview(null);
    setStaffPhotoUploading(false);
  }, []);

  useEffect(() => {
    return () => {
      if (staffPhotoBlobRef.current) {
        URL.revokeObjectURL(staffPhotoBlobRef.current);
        staffPhotoBlobRef.current = null;
      }
    };
  }, []);

  const processStaffPhotoFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file || !clinicId || !canWrite) return;
      const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
      if (!allowed.includes(file.type)) {
        showError('Use PNG, JPG ou WEBP.');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        showError('Imagem grande demais (máx. 5 MB).');
        return;
      }
      const blobUrl = URL.createObjectURL(file);
      if (staffPhotoBlobRef.current) {
        URL.revokeObjectURL(staffPhotoBlobRef.current);
        staffPhotoBlobRef.current = null;
      }
      staffPhotoBlobRef.current = blobUrl;
      setStaffPhotoLocalPreview(blobUrl);
      setStaffPhotoUploading(true);
      try {
        const { url } = await hubStaffApi.uploadPhoto(clinicId, file);
        if (staffPhotoBlobRef.current) {
          URL.revokeObjectURL(staffPhotoBlobRef.current);
          staffPhotoBlobRef.current = null;
        }
        setStaffPhotoLocalPreview(null);
        setForm((f) => ({ ...f, photo_url: url }));
      } catch (e: unknown) {
        if (staffPhotoBlobRef.current) {
          URL.revokeObjectURL(staffPhotoBlobRef.current);
          staffPhotoBlobRef.current = null;
        }
        setStaffPhotoLocalPreview(null);
        showError((e as Error)?.message || 'Erro ao enviar foto');
      } finally {
        setStaffPhotoUploading(false);
      }
    },
    [clinicId, canWrite, showError]
  );

  const openCreate = () => {
    if (!canWrite) return;
    clearStaffPhotoLocal();
    setPanelMode('create');
    setEditingId(null);
    setForm(emptyForm());
  };

  const openEdit = (m: HubStaffMember) => {
    if (!canWrite) return;
    clearStaffPhotoLocal();
    setPanelMode('edit');
    setEditingId(m.id);
    const activeIds = new Set(serviceTypes.map((t) => t.id));
    setForm(fromRow(m, activeIds));
  };

  const closePanel = () => {
    clearStaffPhotoLocal();
    setPanelMode('none');
    setEditingId(null);
    setForm(emptyForm());
  };

  const toggleDay = (bit: number) => {
    setForm((f) => ({
      ...f,
      available_days: f.available_days.includes(bit)
        ? f.available_days.filter((d) => d !== bit)
        : [...f.available_days, bit].sort((a, b) => a - b),
    }));
  };

  const buildPayload = (): Record<string, unknown> => {
    if (!clinicId) return {};
    const breakM = form.break_minutes.trim();
    const breakNum = breakM === '' ? null : Number(breakM);
    const jt = form.job_title.trim();
    const isVetJobTitle = jt === VET_JOB_TITLE_VALUE;
    return {
      clinic_id: clinicId,
      full_name: form.full_name.trim(),
      display_name: form.display_name.trim() || null,
      photo_url: form.photo_url.trim() || null,
      phone: form.phone.trim() || null,
      whatsapp_phone: form.whatsapp_phone.trim() || null,
      email: form.email.trim() || null,
      birth_date: form.birth_date.trim() || null,
      job_title: jt,
      professional_kind: professionalKindFromJobTitle(form.job_title),
      specialties: form.specialties.trim() || null,
      crmv: isVetJobTitle ? form.crmv.trim() || null : null,
      crmv_uf: isVetJobTitle ? form.crmv_uf.trim().toUpperCase() || null : null,
      internal_notes: form.internal_notes.trim() || null,
      active: form.active,
      has_hub_access: form.has_hub_access,
      hub_access_email: form.has_hub_access ? form.hub_access_email.trim() || null : null,
      hub_access_role: form.has_hub_access && form.hub_access_role ? form.hub_access_role : null,
      accepts_appointments: form.accepts_appointments,
      available_days: form.available_days.length ? form.available_days : null,
      work_hours: { default_start: form.work_start, default_end: form.work_end },
      break_minutes: breakNum != null && Number.isFinite(breakNum) ? breakNum : null,
      default_unit_id: form.default_unit_id || null,
      agenda_color: form.agenda_color.trim() || null,
      service_type_ids: form.service_type_ids,
    };
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicId || !canWrite) return;
    if (!form.full_name.trim()) {
      showError('Nome completo é obrigatório.');
      return;
    }
    if (!form.job_title.trim()) {
      showError('Função principal é obrigatória.');
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      if (panelMode === 'create') {
        await hubStaffApi.create(payload);
        showSuccess('Profissional criado');
      } else if (panelMode === 'edit' && editingId) {
        await hubStaffApi.patch(editingId, payload);
        showSuccess('Profissional atualizado');
      }
      await loadStaff();
      closePanel();
    } catch (err: unknown) {
      showError((err as Error)?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const inactivate = (m: HubStaffMember) => {
    if (!clinicId || !canWrite) return;
    showConfirm(`Inativar "${m.full_name}"?`, async () => {
      try {
        await hubStaffApi.patch(m.id, { clinic_id: clinicId, active: false });
        showSuccess('Inativado');
        await loadStaff();
        if (editingId === m.id) closePanel();
      } catch (e: unknown) {
        showError((e as Error)?.message || 'Erro');
      }
    }, 'Inativar');
  };

  const sendInvite = async () => {
    if (!clinicId || !editingId || !canInvite) return;
    try {
      await hubStaffApi.sendInvite(editingId, clinicId);
      showSuccess('Convite enviado');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao enviar convite');
    }
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
        Carregando…
      </div>
    );
  }

  return (
    <div className="hub-clientes hub-servicos-page hub-equipe-page">
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
          <p className="hub-clientes__muted">Carregando…</p>
        ) : (
          <div className="hub-servicos__table-wrap">
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
                      <td>{m.has_hub_access ? 'Sim' : 'Não'}</td>
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
        )}
      </div>

      <aside className="hub-clientes__panel">
        <div className="hub-clientes__panel-scroll">
          {panelMode === 'none' ? (
            <p className="hub-clientes__muted" style={{ margin: 0 }}>
              {canWrite ? 'Clique numa linha para editar ou crie um novo profissional.' : 'Sem permissão de edição.'}
            </p>
          ) : !canWrite ? (
            <p className="hub-clientes__muted">Sem permissão de edição.</p>
          ) : (
            <form onSubmit={handleSave}>
              <div className="hub-clientes__panel-header">
                <h2 className="hub-clientes__form-title" style={{ margin: 0 }}>
                  {panelMode === 'create' ? 'Novo profissional' : 'Editar profissional'}
                </h2>
                <button type="button" className="hub-clientes__panel-close" aria-label="Fechar" onClick={closePanel}>
                  ×
                </button>
              </div>

              <div className="hub-pets-photo-field">
                <div className="hub-pets-photo-field__label-row">
                  <span className="hub-pets-photo-field__title">Foto do profissional</span>
                  <span className="hub-pets-photo-field__optional">Opcional</span>
                </div>
                <div className="hub-pets-photo-field__row">
                  <div
                    role={canWrite && !staffPhotoUploading ? 'button' : undefined}
                    tabIndex={canWrite && !staffPhotoUploading ? 0 : undefined}
                    className="hub-pets-photo-field__circle"
                    onClick={() => {
                      if (!canWrite || staffPhotoUploading) return;
                      staffPhotoInputRef.current?.click();
                    }}
                    onKeyDown={(e) => {
                      if (!canWrite || staffPhotoUploading) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        staffPhotoInputRef.current?.click();
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!canWrite || staffPhotoUploading) return;
                      const f = e.dataTransfer.files?.[0];
                      void processStaffPhotoFile(f);
                    }}
                  >
                    {staffPhotoLocalPreview || form.photo_url.trim() ? (
                      <img src={staffPhotoLocalPreview || form.photo_url.trim()} alt="" />
                    ) : (
                      <span>
                        Sem
                        <br />
                        foto
                      </span>
                    )}
                    {staffPhotoUploading ? (
                      <div className="hub-equipe-staff-photo__uploading" aria-live="polite">
                        A enviar…
                      </div>
                    ) : null}
                  </div>
                  <div className="hub-pets-photo-field__actions">
                    <label className="hub-clientes__btn hub-clientes__btn--outline" style={{ cursor: 'pointer' }}>
                      <input
                        ref={staffPhotoInputRef}
                        id="st-photo"
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp"
                        className="hub-pets-sr-only"
                        disabled={staffPhotoUploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          void processStaffPhotoFile(f);
                        }}
                        aria-label="Escolher foto do profissional (opcional)"
                      />
                      Escolher imagem
                    </label>
                    {staffPhotoLocalPreview || form.photo_url.trim() ? (
                      <button
                        type="button"
                        className="hub-clientes__link-btn"
                        disabled={staffPhotoUploading}
                        onClick={() => {
                          clearStaffPhotoLocal();
                          setForm((f) => ({ ...f, photo_url: '' }));
                        }}
                      >
                        Remover foto
                      </button>
                    ) : null}
                    <p className="hub-pets-photo-field__hint">
                      PNG, JPG ou WEBP até 5 MB. Pode arrastar para a fotografia ou usar «Escolher imagem». O envio é
                      imediato; salve o formulário para registrar todos os dados do profissional.
                    </p>
                  </div>
                </div>
              </div>

              <h3 className="hub-servicos__form-section-title">Dados pessoais e contato</h3>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="st-fullname">
                  Nome completo *
                </label>
                <input
                  id="st-fullname"
                  className="hub-clientes__input"
                  required
                  value={form.full_name}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                />
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="st-display">
                  Apelido / nome de exibição
                </label>
                <input
                  id="st-display"
                  className="hub-clientes__input"
                  value={form.display_name}
                  onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                />
              </div>
              <div className="hub-clientes__field">
                <HubDateField
                  id="st-birth"
                  label="Data de nascimento (opcional)"
                  valueIso={form.birth_date}
                  onChangeIso={(iso) => setForm((f) => ({ ...f, birth_date: iso }))}
                />
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="st-phone">
                  Telefone
                </label>
                <input
                  id="st-phone"
                  className="hub-clientes__input"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="st-wa">
                  WhatsApp
                </label>
                <input
                  id="st-wa"
                  className="hub-clientes__input"
                  value={form.whatsapp_phone}
                  onChange={(e) => setForm((f) => ({ ...f, whatsapp_phone: e.target.value }))}
                />
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="st-email">
                  E-mail (opcional)
                </label>
                <input
                  id="st-email"
                  type="email"
                  className="hub-clientes__input"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>

              <h3 className="hub-servicos__form-section-title">Função</h3>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="st-job">
                  Função principal *
                </label>
                <HubSearchableCombobox
                  id="st-job"
                  className="hub-combobox--clientes"
                  options={jobTitleComboboxOptions}
                  value={form.job_title}
                  onChange={(v) => {
                    setForm((f) => {
                      const next = { ...f, job_title: v };
                      if (panelMode === 'create' && v.trim()) {
                        const suggested = suggestServiceTypeIdsForJobTitle(v, jobMappings, serviceTypes);
                        if (suggested.length > 0) {
                          next.service_type_ids = [...new Set([...suggested, ...f.service_type_ids])];
                        }
                      }
                      return next;
                    });
                  }}
                  placeholder="Selecionar ou buscar função principal"
                  searchPlaceholder="Buscar função principal…"
                  allowCreate={canWrite}
                  createEntityLabel="função"
                  emptyResultsLabel="Nenhuma função encontrada"
                  ariaLabel="Função principal"
                />
                {selectedJobFunctionDescription ? (
                  <p className="hub-clientes__muted" style={{ fontSize: 12, marginTop: 6 }}>
                    {selectedJobFunctionDescription}
                  </p>
                ) : null}
              </div>

              <h3 className="hub-servicos__form-section-title">Dados profissionais</h3>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="st-spec">
                  Especialidades
                </label>
                <textarea
                  id="st-spec"
                  className="hub-clientes__textarea"
                  rows={2}
                  value={form.specialties}
                  onChange={(e) => setForm((f) => ({ ...f, specialties: e.target.value }))}
                />
              </div>
              {crmvFieldsVisible ? (
                <div className="hub-clientes__field" style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 8 }}>
                  <div>
                    <label className="hub-clientes__label" htmlFor="st-crmv">
                      CRMV / registo
                    </label>
                    <input
                      id="st-crmv"
                      className="hub-clientes__input"
                      value={form.crmv}
                      onChange={(e) => setForm((f) => ({ ...f, crmv: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="hub-clientes__label" htmlFor="st-uf">
                      UF
                    </label>
                    <input
                      id="st-uf"
                      className="hub-clientes__input"
                      maxLength={2}
                      value={form.crmv_uf}
                      onChange={(e) => setForm((f) => ({ ...f, crmv_uf: e.target.value.toUpperCase() }))}
                    />
                  </div>
                </div>
              ) : null}
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="st-notes">
                  Observações internas
                </label>
                <textarea
                  id="st-notes"
                  className="hub-clientes__textarea"
                  rows={3}
                  value={form.internal_notes}
                  onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))}
                />
              </div>
              <div className="hub-clientes__field">
                <HubCheckbox
                  checked={form.active}
                  onChange={(active) => setForm((f) => ({ ...f, active }))}
                >
                  Profissional ativo
                </HubCheckbox>
              </div>

              <h3 className="hub-servicos__form-section-title">Serviços que pode realizar</h3>
              <p className="hub-equipe__service-group-hint">
                Sugeridos com base na função principal e nos grupos em Configurações; pode ajustar manualmente.
                Selecione os grupos de serviço que este profissional pode realizar (o mesmo conjunto de categorias
                que em «Grupo» nos tipos de serviço; cada cartão associa todos os serviços desse grupo no catálogo).
              </p>
              <div className="hub-equipe__service-group-grid">
                {staffServiceGroupRows.map(({ opt, disabled, selected, partial, accent }) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={disabled}
                    className={`hub-equipe__group-card${selected ? ' hub-equipe__group-card--selected' : ''}${partial ? ' hub-equipe__group-card--partial' : ''}`}
                    onClick={() => toggleServiceGroup(opt.value)}
                    aria-pressed={selected}
                  >
                    <span className="hub-equipe__group-card__icon-wrap" aria-hidden>
                      <ServiceGroupIcon group={opt.value} color={accent} size={22} strokeWidth={2.1} />
                    </span>
                    <span className="hub-equipe__group-card__label">{opt.label}</span>
                    {selected || partial ? (
                      <span className="hub-equipe__group-card__check" aria-hidden>
                        <Check size={14} strokeWidth={3} />
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
              {serviceTypes.length === 0 ? (
                <p className="hub-clientes__muted" style={{ marginTop: 10 }}>
                  Sem tipos de serviço no catálogo. Crie serviços em Tipos de serviço para poder associar grupos.
                </p>
              ) : null}

              <h3 className="hub-servicos__form-section-title hub-equipe__form-section-title-spaced">Acesso ao PetMi Hub</h3>
              <div className="hub-clientes__field">
                <HubCheckbox
                  checked={form.has_hub_access}
                  onChange={(has_hub_access) => setForm((f) => ({ ...f, has_hub_access }))}
                >
                  Tem acesso ao PetMi Hub
                </HubCheckbox>
                <p className="hub-clientes__muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Se não, o profissional pode aparecer na agenda e relatórios, mas não faz login.
                </p>
              </div>
              {form.has_hub_access ? (
                <>
                  <div className="hub-clientes__field">
                    <label className="hub-clientes__label" htmlFor="st-acc-email">
                      E-mail de acesso
                    </label>
                    <input
                      id="st-acc-email"
                      type="email"
                      className="hub-clientes__input"
                      value={form.hub_access_email}
                      onChange={(e) => setForm((f) => ({ ...f, hub_access_email: e.target.value }))}
                    />
                  </div>
                  <div className="hub-clientes__field">
                    <label className="hub-clientes__label" htmlFor="st-acc-role">
                      Perfil de permissão
                    </label>
                    <select
                      id="st-acc-role"
                      className="hub-clientes__select-input"
                      value={form.hub_access_role}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, hub_access_role: e.target.value as HubStaffAccessRole | '' }))
                      }
                    >
                      <option value="">—</option>
                      {HUB_ACCESS_ROLE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {panelMode === 'edit' && editingId && canInvite ? (
                    <div className="hub-clientes__field">
                      <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={() => void sendInvite()}>
                        Enviar convite de acesso
                      </button>
                      <p className="hub-clientes__muted" style={{ fontSize: 12, marginTop: 6 }}>
                        Requer e-mail de acesso, perfil, unidade padrão e permissões de convite.
                      </p>
                    </div>
                  ) : null}
                </>
              ) : null}

              <h3 className="hub-servicos__form-section-title">Agenda</h3>
              <div className="hub-clientes__field">
                <HubCheckbox
                  checked={form.accepts_appointments}
                  onChange={(accepts_appointments) => setForm((f) => ({ ...f, accepts_appointments }))}
                >
                  Pode receber atendimentos
                </HubCheckbox>
              </div>
              <div className="hub-clientes__field">
                <span className="hub-clientes__label">Dias disponíveis</span>
                <div className="hub-equipe__days-row">
                  {WEEKDAY_OPTS.map(({ bit, label }) => (
                    <HubCheckbox
                      key={bit}
                      checked={form.available_days.includes(bit)}
                      onChange={() => toggleDay(bit)}
                    >
                      {label}
                    </HubCheckbox>
                  ))}
                </div>
              </div>
              <div className="hub-clientes__field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label className="hub-clientes__label" htmlFor="st-ws">
                    Início
                  </label>
                  <input
                    id="st-ws"
                    type="time"
                    className="hub-clientes__input"
                    value={form.work_start}
                    onChange={(e) => setForm((f) => ({ ...f, work_start: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="hub-clientes__label" htmlFor="st-we">
                    Fim
                  </label>
                  <input
                    id="st-we"
                    type="time"
                    className="hub-clientes__input"
                    value={form.work_end}
                    onChange={(e) => setForm((f) => ({ ...f, work_end: e.target.value }))}
                  />
                </div>
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="st-break">
                  Intervalo (minutos)
                </label>
                <input
                  id="st-break"
                  type="number"
                  min={0}
                  className="hub-clientes__input"
                  value={form.break_minutes}
                  onChange={(e) => setForm((f) => ({ ...f, break_minutes: e.target.value }))}
                />
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="st-unit">
                  Unidade onde trabalha
                </label>
                <select
                  id="st-unit"
                  className="hub-clientes__select-input"
                  value={form.default_unit_id}
                  onChange={(e) => setForm((f) => ({ ...f, default_unit_id: e.target.value }))}
                >
                  <option value="">—</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="st-color">
                  Cor na agenda
                </label>
                <input
                  id="st-color"
                  type="color"
                  className="hub-clientes__input"
                  style={{ maxWidth: 80, height: 40, padding: 4 }}
                  value={form.agenda_color.startsWith('#') ? form.agenda_color : '#3B82F6'}
                  onChange={(e) => setForm((f) => ({ ...f, agenda_color: e.target.value }))}
                />
              </div>

              <div className="hub-clientes__btn-row" style={{ marginTop: 16 }}>
                <button type="submit" className="hub-clientes__btn hub-clientes__btn--primary" disabled={saving}>
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
                <HubCancelButton onClick={closePanel} />
              </div>
            </form>
          )}
        </div>
      </aside>
    </div>
  );
};

export default HubStaffPage;
