import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Send, User } from 'lucide-react';
import { hubStaffApi, type HubStaffLinkMeta, type HubStaffAccessRole, type HubStaffMember } from '../../api/hubStaffApi';
import { hubInvitationsApi } from '../../api/hubInvitationsApi';
import type { HubServiceType } from '../../api/hubServiceTypesApi';
import {
  HUB_JOB_FUNCTION_OPTIONS,
  VET_JOB_TITLE_VALUE,
} from '../../constants/hubJobFunctions';
import { suggestServiceTypeIdsForJobTitle, type GroupJobMappings } from '../../utils/staffServiceCompatibility';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubMultiSelectCombobox } from '../../components/HubMultiSelectCombobox';
import { hubSpecialtiesApi } from '../../api/hubSpecialtiesApi';
import { specialtyCategoryForJobTitle, specialtyLabel } from '../../utils/staffSpecialties';
import { HubBrPhoneInput } from '../../components/HubBrPhoneInput';
import { HubDateField } from '../../components/HubDateField';
import { HubTimeField } from '../../components/HubTimeField';
import { HubCheckbox } from '../../components/HubCheckbox';
import { HubSidePanel } from '../../components/HubSidePanel';
import { ServiceGroupIcon } from '../../components/ServiceGroupIcon';
import { useAlert } from '../../components/AlertProvider';
import {
  HUB_OPERATIONAL_AREAS,
  HUB_OPERATIONAL_AREA_LABELS,
  type HubOperationalArea,
} from '@petimi/web-core';
import {
  SERVICE_GROUP_OPTIONS,
  KNOWN_SERVICE_GROUP_SLUGS,
  resolveServiceAccentColor,
  type HubServiceGroupValue,
} from '../../utils/serviceTypeSlug';
import {
  HUB_ACCESS_ROLE_OPTIONS,
  HUB_ACCESS_ROLE_LEGACY_OPTIONS,
  WEEKDAY_OPTS,
  emptyStaffForm,
  staffFormFromRow,
  buildStaffPayload,
  inviteReadyHint,
  suggestOperationalAreasForJobTitle,
  suggestAccessRoleForJobTitle,
  type HubStaffFormState,
} from './hubStaffFormTypes';
import HubStaffInviteSharePanel, { type StaffInviteShareResult } from './HubStaffInviteSharePanel';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import '../pets/pets-page.css';
import './equipe-page.css';
import './equipe-drawer.css';

export type HubStaffDrawerProps = {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  staff: HubStaffMember | null;
  clinicId: string;
  canWrite: boolean;
  canInvite: boolean;
  serviceTypes: HubServiceType[];
  jobMappings: GroupJobMappings;
  units: { id: string; name: string }[];
  onSaved: () => void | Promise<void>;
};

function staffLinkSuccessMessage(link: HubStaffLinkMeta | null | undefined, base: string): string {
  if (!link?.linked) {
    if (link?.message) return `${base}. ${link.message}`;
    return base;
  }
  return link.message ? `${base}. ${link.message}` : `${base}. Conta vinculada ao login.`;
}

const HubStaffDrawer: React.FC<HubStaffDrawerProps> = ({
  open,
  onClose,
  mode,
  staff,
  clinicId,
  canWrite,
  canInvite,
  serviceTypes,
  jobMappings,
  units,
  onSaved,
}) => {
  const { showError, showSuccess } = useAlert();

  // Detectar se o usuário está editando seu próprio perfil comparando clinic_user_id.
  const myClinicUserId = useMemo(() => {
    try {
      const cu = JSON.parse(localStorage.getItem('clinic_user') ?? '{}') as { id?: string };
      return cu?.id ?? null;
    } catch {
      return null;
    }
  }, []);

  const [form, setForm] = useState<HubStaffFormState>(emptyStaffForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteShare, setInviteShare] = useState<StaffInviteShareResult | null>(null);
  const [pendingInvite, setPendingInvite] = useState<StaffInviteShareResult | null>(null);
  const [inviteExpired, setInviteExpired] = useState(false);
  const [loadingPendingInvite, setLoadingPendingInvite] = useState(false);
  const [loginLinked, setLoginLinked] = useState(false);
  const [specialtyCatalog, setSpecialtyCatalog] = useState<{ id: string; name: string }[]>([]);
  const [specialtiesLoading, setSpecialtiesLoading] = useState(false);

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
    if (!open) {
      setInviteShare(null);
      setPendingInvite(null);
      setInviteExpired(false);
      setLoadingPendingInvite(false);
      return;
    }
    clearStaffPhotoLocal();
    if (mode === 'edit' && staff) {
      const activeIds = new Set(serviceTypes.map((t) => t.id));
      setEditingId(staff.id);
      setForm(staffFormFromRow(staff, activeIds));
      setLoginLinked(Boolean(staff.clinic_user_id));
    } else {
      setEditingId(null);
      const blank = emptyStaffForm();
      if (units.length > 0) {
        blank.default_unit_id = units[0]!.id;
      }
      setForm(blank);
      setLoginLinked(false);
    }
    // `units` propositalmente fora das deps: só pré-preenche na abertura; se chegar depois, o efeito abaixo completa.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- units handled separately
  }, [open, mode, staff, serviceTypes, clearStaffPhotoLocal]);

  // Se as unidades carregarem depois de abrir o drawer, preenche a unidade padrão.
  useEffect(() => {
    if (!open || units.length === 0) return;
    setForm((f) => (f.default_unit_id ? f : { ...f, default_unit_id: units[0]!.id }));
  }, [open, units]);

  useEffect(() => {
    if (!open || !canInvite || mode !== 'edit' || !staff?.id || !clinicId || staff.clinic_user_id) {
      if (staff?.clinic_user_id) {
        setPendingInvite(null);
        setInviteShare(null);
        setInviteExpired(false);
      }
      return;
    }
    let cancelled = false;
    setLoadingPendingInvite(true);
    hubStaffApi
      .getPendingInvite(staff.id, clinicId)
      .then((res) => {
        if (cancelled) return;
        if (res.pending) {
          const share: StaffInviteShareResult = {
            invitation_url: res.pending.invitation_url,
            share_message: res.pending.share_message,
            email: res.pending.email,
            expires_at: res.pending.expires_at,
            reused: true,
          };
          setPendingInvite(share);
          setInviteShare(share);
          setInviteExpired(false);
        } else {
          setPendingInvite(null);
          setInviteExpired(Boolean(res.expired));
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setPendingInvite(null);
          setInviteExpired(false);
          showError((e as Error)?.message || 'Não foi possível carregar o convite pendente.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPendingInvite(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, canInvite, mode, staff?.id, staff?.clinic_user_id, clinicId, showError]);

  useEffect(() => () => {
    if (staffPhotoBlobRef.current) URL.revokeObjectURL(staffPhotoBlobRef.current);
  }, []);

  const specialtyCategory = useMemo(() => specialtyCategoryForJobTitle(form.job_title), [form.job_title]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSpecialtiesLoading(true);
    hubSpecialtiesApi
      .list(specialtyCategory)
      .then(({ specialties }) => {
        if (cancelled) return;
        setSpecialtyCatalog(
          specialties
            .filter((s) => s.id && s.name)
            .map((s) => ({ id: s.id, name: s.name }))
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
        );
      })
      .catch(() => {
        if (!cancelled) setSpecialtyCatalog([]);
      })
      .finally(() => {
        if (!cancelled) setSpecialtiesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, specialtyCategory]);

  const specialtyNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of specialtyCatalog) map.set(s.id, s.name);
    return map;
  }, [specialtyCatalog]);

  const specialtyComboboxOptions = useMemo((): HubComboboxOption[] => {
    return specialtyCatalog.map((s) => ({ value: s.id, label: s.name }));
  }, [specialtyCatalog]);

  const resolveSpecialtyLabel = useCallback(
    (value: string) => specialtyLabel(value, specialtyNameById),
    [specialtyNameById],
  );

  const jobTitleComboboxOptions = useMemo((): HubComboboxOption[] => {
    const rows: HubComboboxOption[] = HUB_JOB_FUNCTION_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
    const jt = form.job_title.trim();
    if (jt && !rows.some((r) => r.value === jt)) rows.push({ value: jt, label: jt });
    return [{ value: '', label: '—' }, ...rows];
  }, [form.job_title]);

  const selectedJobFunctionDescription = useMemo(
    () => HUB_JOB_FUNCTION_OPTIONS.find((o) => o.value === form.job_title.trim())?.description ?? '',
    [form.job_title],
  );

  const crmvFieldsVisible = form.job_title.trim() === VET_JOB_TITLE_VALUE;

  const serviceTypesByGroup = useMemo(() => {
    const map = new Map<string, HubServiceType[]>();
    for (const o of SERVICE_GROUP_OPTIONS) map.set(o.value, []);
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
      const selectedCount = ids.filter((id) => form.service_type_ids.includes(id)).length;
      const serviceCount = typesIn.length;
      const firstHex = typesIn.find((t) => {
        const c = (t.group_color ?? t.agenda_color)?.trim();
        return c && /^#[0-9A-Fa-f]{6}$/.test(c);
      });
      const accent = (firstHex?.group_color ?? firstHex?.agenda_color)?.trim() ?? resolveServiceAccentColor(null, opt.value);
      return {
        opt,
        disabled: serviceCount === 0,
        selected: serviceCount > 0 && selectedCount === serviceCount,
        partial: selectedCount > 0 && selectedCount < serviceCount,
        selectedCount,
        serviceCount,
        accent,
      };
    });
  }, [serviceTypesByGroup, form.service_type_ids]);

  const availableServiceGroupRows = useMemo(
    () => staffServiceGroupRows.filter((row) => !row.disabled),
    [staffServiceGroupRows],
  );

  const emptyServiceGroupLabels = useMemo(
    () => staffServiceGroupRows.filter((row) => row.disabled).map((row) => row.opt.label),
    [staffServiceGroupRows],
  );

  const selectedServiceSummary = useMemo(() => {
    const groups = staffServiceGroupRows.filter((row) => row.selectedCount > 0).length;
    const services = form.service_type_ids.length;
    if (groups === 0) return null;
    const groupLabel = groups === 1 ? '1 grupo' : `${groups} grupos`;
    const serviceLabel = services === 1 ? '1 serviço' : `${services} serviços`;
    return `${groupLabel} · ${serviceLabel}`;
  }, [staffServiceGroupRows, form.service_type_ids.length]);

  const toggleServiceGroup = useCallback(
    (groupValue: string) => {
      const list = serviceTypesByGroup.get(groupValue) ?? [];
      const ids = list.map((t) => t.id);
      if (ids.length === 0) return;
      setForm((f) => {
        const allOn = ids.every((id) => f.service_type_ids.includes(id));
        if (allOn) return { ...f, service_type_ids: f.service_type_ids.filter((id) => !ids.includes(id)) };
        const merged = new Set(f.service_type_ids);
        for (const id of ids) merged.add(id);
        return { ...f, service_type_ids: [...merged] };
      });
    },
    [serviceTypesByGroup],
  );

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
      if (staffPhotoBlobRef.current) URL.revokeObjectURL(staffPhotoBlobRef.current);
      staffPhotoBlobRef.current = blobUrl;
      setStaffPhotoLocalPreview(blobUrl);
      setStaffPhotoUploading(true);
      try {
        const { url } = await hubStaffApi.uploadPhoto(clinicId, file);
        if (staffPhotoBlobRef.current) URL.revokeObjectURL(staffPhotoBlobRef.current);
        staffPhotoBlobRef.current = null;
        setStaffPhotoLocalPreview(null);
        setForm((f) => ({ ...f, photo_url: url }));
      } catch (e: unknown) {
        if (staffPhotoBlobRef.current) URL.revokeObjectURL(staffPhotoBlobRef.current);
        staffPhotoBlobRef.current = null;
        setStaffPhotoLocalPreview(null);
        showError((e as Error)?.message || 'Erro ao enviar foto');
      } finally {
        setStaffPhotoUploading(false);
      }
    },
    [clinicId, canWrite, showError],
  );

  const toggleDay = (bit: number) => {
    setForm((f) => ({
      ...f,
      available_days: f.available_days.includes(bit)
        ? f.available_days.filter((d) => d !== bit)
        : [...f.available_days, bit].sort((a, b) => a - b),
    }));
  };

  const setAvailableDays = useCallback((days: number[]) => {
    setForm((f) => ({ ...f, available_days: [...days].sort((a, b) => a - b) }));
  }, []);

  const unitComboboxOptions = useMemo((): HubComboboxOption[] => {
    const rows = units.map((u) => ({ value: u.id, label: u.name }));
    return [{ value: '', label: 'Selecionar unidade…' }, ...rows];
  }, [units]);

  const hubAccessRoleOptions = useMemo((): HubComboboxOption[] => {
    const current = form.hub_access_role;
    const legacy =
      current && HUB_ACCESS_ROLE_LEGACY_OPTIONS.some((o) => o.value === current)
        ? HUB_ACCESS_ROLE_LEGACY_OPTIONS.filter((o) => o.value === current)
        : [];
    return [
      { value: '', label: 'Selecionar perfil…' },
      ...HUB_ACCESS_ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
      ...legacy.map((o) => ({ value: o.value, label: o.label })),
    ];
  }, [form.hub_access_role]);

  const agendaColorValue = form.agenda_color.startsWith('#') ? form.agenda_color : '#3B82F6';

  const inviteHint = inviteReadyHint(form, units.length > 0);
  const canSendInvite =
    canInvite &&
    form.has_hub_access &&
    Boolean(form.hub_access_email.trim()) &&
    Boolean(form.hub_access_role) &&
    Boolean(form.default_unit_id);

  const isLoginLinked = loginLinked;

  // Bloquear auto-edição de acesso: CADMIN não pode alterar seu próprio role/acesso.
  const isSelfEdit = Boolean(
    mode === 'edit' &&
    myClinicUserId &&
    staff?.clinic_user_id &&
    staff.clinic_user_id === myClinicUserId,
  );

  const canLinkAccount =
    canWrite &&
    form.has_hub_access &&
    Boolean(form.hub_access_email.trim()) &&
    (mode === 'edit' ? !isLoginLinked : false);

  const persistStaff = useCallback(async (): Promise<{ id: string; link?: HubStaffLinkMeta | null }> => {
    const isVetJobTitle = form.job_title.trim() === VET_JOB_TITLE_VALUE;
    const payload = buildStaffPayload(clinicId, form, isVetJobTitle);
    if (mode === 'create') {
      const { staff: created, link } = await hubStaffApi.create(payload);
      return { id: created.id, link };
    }
    if (!editingId) throw new Error('Profissional não encontrado');
    const { link } = await hubStaffApi.patch(editingId, payload);
    return { id: editingId, link };
  }, [clinicId, editingId, form, mode]);

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
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
      const { link } = await persistStaff();
      if (link?.linked) setLoginLinked(true);
      const base = mode === 'create' ? 'Profissional criado' : 'Profissional atualizado';
      showSuccess(staffLinkSuccessMessage(link, base));
      await onSaved();
      onClose();
    } catch (err: unknown) {
      showError((err as Error)?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleLinkAccount = async () => {
    if (!clinicId || !canWrite || !editingId || !form.has_hub_access) return;
    if (!form.hub_access_email.trim()) {
      showError('Informe o e-mail de acesso antes de vincular.');
      return;
    }
    setLinking(true);
    try {
      if (form.full_name.trim() && form.job_title.trim()) {
        await persistStaff();
      }
      const { link } = await hubStaffApi.linkAccount(editingId, clinicId);
      if (link?.linked) setLoginLinked(true);
      showSuccess(staffLinkSuccessMessage(link, 'Conta vinculada'));
      setPendingInvite(null);
      setInviteShare(null);
      setInviteExpired(false);
      await onSaved();
    } catch (err: unknown) {
      showError((err as Error)?.message || 'Erro ao vincular conta');
    } finally {
      setLinking(false);
    }
  };

  const handleInvite = async () => {
    if (!clinicId || !canInvite) return;
    if (!canSendInvite) {
      showError(inviteHint || 'Preencha e-mail, perfil e unidade padrão para gerar o convite.');
      return;
    }
    const email = form.hub_access_email.trim();
    try {
      const check = await hubInvitationsApi.checkEmail(clinicId, email);
      if (!check.available) {
        showError(check.reason || 'E-mail indisponível para convite');
        return;
      }
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao validar e-mail');
      return;
    }
    setInviting(true);
    try {
      const { id: staffId } = await persistStaff();
      setEditingId(staffId);
      const res = await hubStaffApi.sendInvite(staffId, clinicId);
      const share: StaffInviteShareResult = {
        invitation_url: res.invitation_url,
        share_message: res.share_message,
        email,
        expires_at: (res.invitation as { expires_at?: string })?.expires_at,
        reused: Boolean(res.reused),
      };
      setInviteShare(share);
      setPendingInvite(share);
      setInviteExpired(false);
      await onSaved();
      showSuccess(res.reused ? 'Link do convite pronto para reenviar' : 'Convite gerado');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao enviar convite');
    } finally {
      setInviting(false);
    }
  };

  const handleShowPendingInvite = () => {
    if (!pendingInvite) return;
    setInviteShare(pendingInvite);
  };

  const handleClose = () => {
    setInviteShare(null);
    onClose();
  };

  const title = inviteShare ? 'Compartilhar convite' : mode === 'create' ? 'Novo profissional' : 'Editar profissional';
  const inviteButtonLabel = inviteExpired
    ? inviting
      ? 'Gerando novo link…'
      : 'Gerar novo link de convite'
    : inviting
      ? 'Gerando convite…'
      : 'Enviar convite de acesso';

  return (
    <HubSidePanel
      open={open}
      onClose={handleClose}
      title={title}
      titleIcon={<User size={20} strokeWidth={2} aria-hidden />}
      contentKey={inviteShare ? 'invite-share' : 'staff-form'}
      footer={
        inviteShare ? undefined : (
          <div className="hub-finance-page__drawer-footer">
            <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={handleClose} disabled={saving || inviting}>
              Cancelar
            </button>
            <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" disabled={saving || inviting} onClick={() => void handleSave()}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        )
      }
    >
      {inviteShare ? (
        <HubStaffInviteSharePanel
          result={inviteShare}
          whatsappPhone={form.whatsapp_phone}
          onDone={handleClose}
          onBackToForm={() => setInviteShare(null)}
        />
      ) : (
        <div className="hub-equipe-drawer__content hub-equipe-drawer">
<form onSubmit={handleSave}>
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
              <div className="hub-equipe-drawer__row">
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
              </div>
              <div className="hub-equipe-drawer__row">
                <div className="hub-clientes__field">
                  <HubDateField
                    id="st-birth"
                    label="Data de nascimento (opcional)"
                    valueIso={form.birth_date}
                    onChangeIso={(iso) => setForm((f) => ({ ...f, birth_date: iso }))}
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
              </div>
              <div className="hub-equipe-drawer__row">
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="st-phone">
                    Telefone
                  </label>
                  <HubBrPhoneInput
                    id="st-phone"
                    className="hub-clientes__input"
                    value={form.phone}
                    onChange={(phone) => setForm((f) => ({ ...f, phone }))}
                    disabled={!canWrite}
                  />
                </div>
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="st-wa">
                    WhatsApp
                  </label>
                  <HubBrPhoneInput
                    id="st-wa"
                    className="hub-clientes__input"
                    value={form.whatsapp_phone}
                    onChange={(whatsapp_phone) => setForm((f) => ({ ...f, whatsapp_phone }))}
                    disabled={!canWrite}
                  />
                </div>
              </div>

              <section className="hub-equipe__role" aria-labelledby="st-role-title">
                <h3 id="st-role-title" className="hub-servicos__form-section-title">
                  Função
                </h3>
                <div className="hub-equipe__section-panel hub-equipe__role-panel">
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
                          if (mode === 'create' && v.trim()) {
                            const suggested = suggestServiceTypeIdsForJobTitle(v, jobMappings, serviceTypes);
                            if (suggested.length > 0) {
                              next.service_type_ids = [...new Set([...suggested, ...f.service_type_ids])];
                            }
                            if (next.operational_areas.length === 0) {
                              next.operational_areas = suggestOperationalAreasForJobTitle(v);
                            }
                            const suggestedRole = suggestAccessRoleForJobTitle(v);
                            if (!next.hub_access_role && suggestedRole) {
                              next.hub_access_role = suggestedRole;
                              next.has_hub_access = true;
                            }
                          }
                          return next;
                        });
                      }}
                      placeholder="Selecionar função principal"
                      searchPlaceholder="Buscar função principal…"
                      allowCreate={canWrite}
                      createEntityLabel="função"
                      emptyResultsLabel="Nenhuma função encontrada"
                      ariaLabel="Função principal"
                      disabled={!canWrite}
                    />
                  </div>
                  {selectedJobFunctionDescription ? (
                    <p className="hub-equipe__role-hint">{selectedJobFunctionDescription}</p>
                  ) : null}
                </div>
              </section>

              <section className="hub-equipe__pro" aria-labelledby="st-pro-title">
                <div className="hub-equipe__service-group-header">
                  <h3 id="st-pro-title" className="hub-servicos__form-section-title">
                    Dados profissionais
                  </h3>
                  {form.specialties.length > 0 ? (
                    <span className="hub-equipe__service-group-badge">
                      {form.specialties.length === 1
                        ? '1 especialidade'
                        : `${form.specialties.length} especialidades`}
                    </span>
                  ) : null}
                </div>

                <div className="hub-equipe__section-panel hub-equipe__pro-panel">
                  {crmvFieldsVisible ? (
                    <div className="hub-equipe-drawer__row hub-equipe-drawer__row--crmv">
                      <div className="hub-clientes__field">
                        <label className="hub-clientes__label" htmlFor="st-crmv">
                          CRMV / registro
                        </label>
                        <input
                          id="st-crmv"
                          className="hub-clientes__input"
                          placeholder="Número"
                          value={form.crmv}
                          onChange={(e) => setForm((f) => ({ ...f, crmv: e.target.value }))}
                          disabled={!canWrite}
                        />
                      </div>
                      <div className="hub-clientes__field">
                        <label className="hub-clientes__label" htmlFor="st-uf">
                          UF
                        </label>
                        <input
                          id="st-uf"
                          className="hub-clientes__input"
                          maxLength={2}
                          placeholder="SP"
                          value={form.crmv_uf}
                          onChange={(e) => setForm((f) => ({ ...f, crmv_uf: e.target.value.toUpperCase() }))}
                          disabled={!canWrite}
                        />
                      </div>
                    </div>
                  ) : null}
                  <div className="hub-clientes__field">
                    <label className="hub-clientes__label" htmlFor="st-spec">
                      Especialidades
                    </label>
                    <HubMultiSelectCombobox
                      id="st-spec"
                      className="hub-combobox--clientes"
                      options={specialtyComboboxOptions}
                      value={form.specialties}
                      onChange={(specialties) => setForm((f) => ({ ...f, specialties }))}
                      placeholder={
                        specialtiesLoading ? 'Carregando especialidades…' : 'Busque e selecione especialidades…'
                      }
                      searchPlaceholder="Buscar especialidades…"
                      allowCreate
                      createEntityLabel="especialidade"
                      resolveLabel={resolveSpecialtyLabel}
                      disabled={!canWrite || specialtiesLoading}
                      ariaLabel="Especialidades do profissional"
                    />
                    <p className="hub-clientes__muted" style={{ fontSize: 12, marginTop: 6 }}>
                      Catálogo PetMiVet; pode adicionar especialidades personalizadas.
                    </p>
                  </div>
                  <div className="hub-clientes__field">
                    <label className="hub-clientes__label" htmlFor="st-notes">
                      Observações internas
                    </label>
                    <textarea
                      id="st-notes"
                      className="hub-clientes__textarea"
                      rows={3}
                      placeholder="Notas visíveis apenas para a equipe da clínica"
                      value={form.internal_notes}
                      onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))}
                      disabled={!canWrite}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  className={`hub-equipe__section-toggle hub-equipe__pro-active${form.active ? ' hub-equipe__section-toggle--on' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
                  aria-pressed={form.active}
                  disabled={!canWrite}
                >
                  <span className="hub-equipe__section-toggle__copy">
                    <span className="hub-equipe__section-toggle__title">Profissional ativo</span>
                    <span className="hub-equipe__section-toggle__hint">
                      {form.active
                        ? 'Disponível para agenda, serviços e relatórios'
                        : 'Inativo — não aparece em novos agendamentos'}
                    </span>
                  </span>
                  <span className="hub-equipe__section-toggle__switch" aria-hidden />
                </button>
              </section>

              <section className="hub-equipe__service-groups" aria-labelledby="st-services-title">
                <div className="hub-equipe__service-group-header">
                  <h3 id="st-services-title" className="hub-servicos__form-section-title">
                    Serviços que pode realizar
                  </h3>
                  {selectedServiceSummary ? (
                    <span className="hub-equipe__service-group-badge">{selectedServiceSummary}</span>
                  ) : null}
                </div>
                <p className="hub-equipe__service-group-hint">
                  Sugestão automática pela função principal. Cada grupo inclui todos os serviços desse tipo no
                  catálogo da clínica.
                </p>
                {availableServiceGroupRows.length > 0 ? (
                  <div className="hub-equipe__service-group-grid">
                    {availableServiceGroupRows.map(
                      ({ opt, selected, partial, accent, selectedCount, serviceCount }) => {
                        const meta = selected
                          ? serviceCount === 1
                            ? '1 serviço selecionado'
                            : `${serviceCount} serviços selecionados`
                          : partial
                            ? `${selectedCount} de ${serviceCount} serviços`
                            : serviceCount === 1
                              ? '1 serviço no catálogo'
                              : `${serviceCount} serviços no catálogo`;

                        return (
                          <button
                            key={opt.value}
                            type="button"
                            className={`hub-equipe__group-card${selected ? ' hub-equipe__group-card--selected' : ''}${partial ? ' hub-equipe__group-card--partial' : ''}`}
                            onClick={() => toggleServiceGroup(opt.value)}
                            aria-pressed={selected || partial}
                          >
                            <span className="hub-equipe__group-card__icon-wrap" aria-hidden>
                              <ServiceGroupIcon group={opt.value} color={accent} size={22} strokeWidth={2.1} />
                            </span>
                            <span className="hub-equipe__group-card__body">
                              <span className="hub-equipe__group-card__label">{opt.label}</span>
                              <span className="hub-equipe__group-card__meta">{meta}</span>
                            </span>
                            {selected || partial ? (
                              <span className="hub-equipe__group-card__check" aria-hidden>
                                <Check size={13} strokeWidth={3} />
                              </span>
                            ) : null}
                          </button>
                        );
                      },
                    )}
                  </div>
                ) : (
                  <p className="hub-clientes__muted">
                    Sem tipos de serviço no catálogo. Crie serviços em Tipos de serviço para associar grupos.
                  </p>
                )}
                {emptyServiceGroupLabels.length > 0 ? (
                  <p className="hub-equipe__service-group-empty">
                    Sem serviços cadastrados em: {emptyServiceGroupLabels.join(', ')}.
                  </p>
                ) : null}
              </section>

              <section className="hub-equipe__agenda" aria-labelledby="st-agenda-title">
                <h3 id="st-agenda-title" className="hub-servicos__form-section-title hub-equipe__form-section-title-spaced">
                  Agenda
                </h3>

                <button
                  type="button"
                  className={`hub-equipe__section-toggle${form.accepts_appointments ? ' hub-equipe__section-toggle--on' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, accepts_appointments: !f.accepts_appointments }))}
                  aria-pressed={form.accepts_appointments}
                  disabled={!canWrite}
                >
                  <span className="hub-equipe__section-toggle__copy">
                    <span className="hub-equipe__section-toggle__title">Pode receber atendimentos</span>
                    <span className="hub-equipe__section-toggle__hint">
                      {form.accepts_appointments
                        ? 'Profissional disponível para marcação na agenda'
                        : 'Não aparece como opção ao agendar'}
                    </span>
                  </span>
                  <span className="hub-equipe__section-toggle__switch" aria-hidden />
                </button>

                {form.accepts_appointments ? (
                  <div className="hub-equipe__section-panel">
                    <div className="hub-equipe__agenda-block">
                      <div className="hub-equipe__agenda-block-head">
                        <span className="hub-clientes__label">Dias disponíveis</span>
                        <div className="hub-equipe__agenda-presets">
                          <button type="button" onClick={() => setAvailableDays([1, 2, 3, 4, 5])}>
                            Seg–Sex
                          </button>
                          <button type="button" onClick={() => setAvailableDays([0, 1, 2, 3, 4, 5, 6])}>
                            Todos
                          </button>
                          <button type="button" onClick={() => setAvailableDays([])}>
                            Limpar
                          </button>
                        </div>
                      </div>
                      <div className="hub-equipe__day-pills" role="group" aria-label="Dias disponíveis">
                        {WEEKDAY_OPTS.map(({ bit, label }) => {
                          const active = form.available_days.includes(bit);
                          return (
                            <button
                              key={bit}
                              type="button"
                              className={`hub-equipe__day-pill${active ? ' hub-equipe__day-pill--active' : ''}`}
                              aria-pressed={active}
                              onClick={() => toggleDay(bit)}
                              disabled={!canWrite}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="hub-equipe-drawer__row">
                      <div className="hub-clientes__field">
                        <HubTimeField
                          id="st-ws"
                          label="Horário de início"
                          valueHm={form.work_start}
                          onChangeHm={(work_start) => setForm((f) => ({ ...f, work_start }))}
                          disabled={!canWrite}
                        />
                      </div>
                      <div className="hub-clientes__field">
                        <HubTimeField
                          id="st-we"
                          label="Horário de fim"
                          valueHm={form.work_end}
                          onChangeHm={(work_end) => setForm((f) => ({ ...f, work_end }))}
                          disabled={!canWrite}
                        />
                      </div>
                    </div>

                    <div className="hub-equipe-drawer__row">
                      <div className="hub-clientes__field">
                        <label className="hub-clientes__label" htmlFor="st-break">
                          Intervalo (min)
                        </label>
                        <input
                          id="st-break"
                          type="number"
                          min={0}
                          className="hub-clientes__input"
                          placeholder="Ex.: 60"
                          value={form.break_minutes}
                          onChange={(e) => setForm((f) => ({ ...f, break_minutes: e.target.value }))}
                          disabled={!canWrite}
                        />
                      </div>
                      <div className="hub-clientes__field">
                        <label className="hub-clientes__label" htmlFor="st-unit">
                          Unidade padrão
                        </label>
                        <HubSearchableCombobox
                          id="st-unit"
                          className="hub-combobox--clientes"
                          options={unitComboboxOptions}
                          value={form.default_unit_id}
                          onChange={(default_unit_id) => setForm((f) => ({ ...f, default_unit_id }))}
                          placeholder="Selecionar unidade…"
                          searchPlaceholder="Buscar unidade…"
                          disabled={!canWrite}
                          ariaLabel="Unidade onde trabalha"
                        />
                      </div>
                    </div>

                    <div className="hub-clientes__field hub-equipe__agenda-color">
                      <span className="hub-clientes__label">Cor na agenda</span>
                      <div className="hub-equipe__agenda-color__row">
                        <span
                          className="hub-equipe__agenda-color__preview"
                          style={{ backgroundColor: agendaColorValue }}
                          aria-hidden
                        />
                        <input
                          id="st-color"
                          type="color"
                          className="hub-equipe__agenda-color__input"
                          value={agendaColorValue}
                          onChange={(e) => setForm((f) => ({ ...f, agenda_color: e.target.value }))}
                          disabled={!canWrite}
                          aria-label="Selecionar cor na agenda"
                        />
                        <span className="hub-equipe__agenda-color__hex">{agendaColorValue.toUpperCase()}</span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="hub-equipe__hub-access" aria-labelledby="st-hub-access-title">
                <h3 id="st-hub-access-title" className="hub-servicos__form-section-title hub-equipe__form-section-title-spaced">
                  Acesso ao PetMi Hub
                </h3>

                {isSelfEdit && (
                  <p className="hub-equipe__self-edit-warn">
                    Você está editando seu próprio perfil. Por segurança, acesso e perfil de permissão só podem ser alterados por outro administrador.
                  </p>
                )}

                <button
                  type="button"
                  className={`hub-equipe__section-toggle${form.has_hub_access ? ' hub-equipe__section-toggle--on' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, has_hub_access: !f.has_hub_access }))}
                  aria-pressed={form.has_hub_access}
                  disabled={!canWrite || isSelfEdit}
                >
                  <span className="hub-equipe__section-toggle__copy">
                    <span className="hub-equipe__section-toggle__title">Tem acesso ao PetMi Hub</span>
                    <span className="hub-equipe__section-toggle__hint">
                      {form.has_hub_access
                        ? 'Pode fazer login e usar o sistema'
                        : 'Sem login — ainda pode aparecer na agenda e relatórios'}
                    </span>
                  </span>
                  <span className="hub-equipe__section-toggle__switch" aria-hidden />
                </button>

                {form.has_hub_access ? (
                  <div className="hub-equipe__section-panel">
                    <div className="hub-equipe-drawer__row">
                      <div className="hub-clientes__field">
                        <label className="hub-clientes__label" htmlFor="st-acc-email">
                          E-mail de acesso
                        </label>
                        <input
                          id="st-acc-email"
                          type="email"
                          className="hub-clientes__input"
                          placeholder="email@exemplo.com"
                          value={form.hub_access_email}
                          onChange={(e) => setForm((f) => ({ ...f, hub_access_email: e.target.value }))}
                          disabled={!canWrite}
                        />
                      </div>
                      <div className="hub-clientes__field">
                        <label className="hub-clientes__label" htmlFor="st-acc-unit">
                          Unidade padrão *
                        </label>
                        <HubSearchableCombobox
                          id="st-acc-unit"
                          className="hub-combobox--clientes"
                          options={unitComboboxOptions}
                          value={form.default_unit_id}
                          onChange={(default_unit_id) => setForm((f) => ({ ...f, default_unit_id }))}
                          placeholder="Selecionar unidade…"
                          searchPlaceholder="Buscar unidade…"
                          disabled={!canWrite}
                          ariaLabel="Unidade padrão do profissional"
                        />
                        <p className="hub-equipe__role-hint">
                          Necessária para gerar o convite de acesso, mesmo sem agenda.
                        </p>
                      </div>
                    </div>

                    <div className="hub-clientes__field">
                      <label className="hub-clientes__label" htmlFor="st-acc-role">
                        Perfil de permissão
                      </label>
                      <p className="hub-equipe__role-hint">
                        Quem a pessoa é no sistema: Admin, Gerente, Recepção, Funcionário ou Financeiro.
                        Banho, clínica, Leva e Traz etc. não são perfil — marque em «Áreas do Hub».
                      </p>
                      <HubSearchableCombobox
                        id="st-acc-role"
                        className="hub-combobox--clientes"
                        options={hubAccessRoleOptions}
                        value={form.hub_access_role}
                        onChange={(hub_access_role) =>
                          setForm((f) => ({ ...f, hub_access_role: hub_access_role as HubStaffAccessRole | '' }))
                        }
                        placeholder="Selecionar perfil…"
                        searchPlaceholder="Buscar perfil…"
                        clearable={false}
                        disabled={!canWrite || isSelfEdit}
                        ariaLabel="Perfil de permissão no Hub"
                      />
                    </div>

                    <div className="hub-equipe__operational-areas">
                      <p className="hub-clientes__label">Áreas do Hub</p>
                      <p className="hub-equipe__role-hint">
                        O que a pessoa faz no dia a dia. Ex.: Funcionário + Banho &amp; Tosa; Funcionário + Leva e
                        Traz; Recepção costuma usar Recepção + Caixa.
                      </p>
                      <div className="hub-equipe__operational-areas__grid" role="group" aria-label="Áreas operacionais do Hub">
                        {HUB_OPERATIONAL_AREAS.map((area) => {
                          const checked = form.operational_areas.includes(area);
                          return (
                            <HubCheckbox
                              key={area}
                              id={`st-area-${area}`}
                              checked={checked}
                              disabled={!canWrite}
                              onChange={(nextChecked) => {
                                setForm((f) => {
                                  const areas = new Set(f.operational_areas);
                                  if (nextChecked) areas.add(area as HubOperationalArea);
                                  else areas.delete(area as HubOperationalArea);
                                  return { ...f, operational_areas: [...areas] as HubOperationalArea[] };
                                });
                              }}
                            >
                              {HUB_OPERATIONAL_AREA_LABELS[area]}
                            </HubCheckbox>
                          );
                        })}
                      </div>
                    </div>

                    {form.has_hub_access ? (
                      <div
                        className={`hub-equipe__hub-link-status${
                          isLoginLinked ? ' hub-equipe__hub-link-status--linked' : ''
                        }`}
                        role="status"
                      >
                        {isLoginLinked ? (
                          <p className="hub-equipe__hub-link-status__text hub-equipe__hub-link-status__text--ok">
                            Login vinculado — este profissional está associado a uma conta ativa na clínica.
                          </p>
                        ) : (
                          <>
                            <p className="hub-equipe__hub-link-status__text">
                              Sem vínculo com login. Se o e-mail de acesso já tem conta nesta clínica, salve ou use
                              «Vincular conta».
                            </p>
                            {canLinkAccount ? (
                              <button
                                type="button"
                                className="hub-servicos__btn-ghost-sm"
                                disabled={linking || saving || inviting}
                                onClick={() => void handleLinkAccount()}
                              >
                                {linking ? 'Vinculando…' : 'Vincular conta existente'}
                              </button>
                            ) : null}
                          </>
                        )}
                      </div>
                    ) : null}

                    {canInvite && form.has_hub_access && !isLoginLinked ? (
                      <div className="hub-equipe__hub-invite">
                        <div className="hub-equipe__hub-invite__head">
                          <span className="hub-equipe__hub-invite__icon" aria-hidden>
                            <Send size={18} strokeWidth={2} />
                          </span>
                          <div>
                            <p className="hub-equipe__hub-invite__title">Convite de acesso</p>
                            <p className="hub-equipe__hub-invite__text">
                              {loadingPendingInvite
                                ? 'Carregando convite pendente…'
                                : pendingInvite
                                  ? `Há um convite pendente (válido até ${
                                      pendingInvite.expires_at
                                        ? new Date(pendingInvite.expires_at).toLocaleDateString('pt-BR')
                                        : '—'
                                    }). Você pode ver e reenviar o link.`
                                  : inviteExpired
                                    ? 'O último convite expirou. Gere um novo link para compartilhar.'
                                    : 'Salva o cadastro e gera um link para compartilhar (válido por 7 dias).'}
                            </p>
                          </div>
                        </div>
                        {pendingInvite ? (
                          <button
                            type="button"
                            className="hub-clientes__btn hub-clientes__btn--primary"
                            disabled={loadingPendingInvite}
                            onClick={handleShowPendingInvite}
                          >
                            Ver link do convite
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="hub-clientes__btn hub-clientes__btn--primary"
                            disabled={inviting || saving || !canWrite || !canSendInvite}
                            onClick={() => void handleInvite()}
                          >
                            {inviteButtonLabel}
                          </button>
                        )}
                        {inviteHint && !pendingInvite ? (
                          <p className="hub-equipe__hub-invite__hint hub-equipe__hub-invite__hint--warn">{inviteHint}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="hub-equipe__hub-access-off">
                    O profissional pode ser usado na operação (agenda, serviços, relatórios) sem conta de login no
                    Hub.
                  </p>
                )}
              </section>

            </form>
        </div>
      )}
    </HubSidePanel>
  );
};

export default HubStaffDrawer;
