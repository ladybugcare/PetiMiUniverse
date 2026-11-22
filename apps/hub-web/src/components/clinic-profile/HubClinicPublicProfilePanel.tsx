import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ChevronDown,
  Clock3,
  Copy,
  ExternalLink,
  Globe,
  ImagePlus,
  LayoutTemplate,
  Phone,
  Save,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react';
import {
  HubBrPhoneInput,
  HubCheckbox,
  HubLoading,
  HubSearchableCombobox,
  HubTimeField,
  allowsPublicServicePrice,
  formatBrPhoneFromApi,
  useAlert,
} from '@petimi/hub-ui';
import '@petimi/hub-ui/pages/clientes/clientes.css';
import { hubClinicPublicProfileApi } from '../../services/hubClinicPublicProfileApi';
import type {
  HubClinicPublicGroupEditorRow,
  HubClinicPublicProfileRow,
  HubClinicPublicServiceEditorRow,
  HubClinicPublicStaffEditorRow,
  HubPublicBusinessHours,
  HubPublicServicesDisplayMode,
  HubPublicSocialLinks,
  HubPublicThemePreset,
} from '../../types/hubClinicPublicProfile';
import { HubAccountProfileCard } from '../profile';
import HubCoverCropModal from './HubCoverCropModal';
import './HubClinicPublicProfilePanel.css';

const DAY_KEYS = ['0', '1', '2', '3', '4', '5', '6'] as const;
const DAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
/** Segunda a sexta (1–5). */
const WEEKDAY_KEYS = ['1', '2', '3', '4', '5'] as const;

const SOCIAL_LABELS: Record<'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'site', string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  site: 'Site',
};

const THEME_OPTIONS: Array<{ value: HubPublicThemePreset; label: string }> = [
  { value: 'warm', label: 'Aconchegante (padrão PetMi)' },
  { value: 'clean', label: 'Clara e limpa' },
  { value: 'dark', label: 'Escura' },
];

const SERVICES_MODE_OPTIONS: Array<{ value: HubPublicServicesDisplayMode; label: string }> = [
  { value: 'groups', label: 'Só grupos (ex.: Clínica, Banho & Tosa)' },
  { value: 'services', label: 'Só serviços (ex.: Consulta, Vacina)' },
  { value: 'both', label: 'Grupos e os serviços de cada um' },
];

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;

type SectionId = 'content' | 'contact' | 'hours' | 'social' | 'services' | 'team';

/** Durante a digitação: espaço e símbolos viram `-`; mantém hífen no final. */
function slugifyTyping(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 60);
}

/** Valor final (save/blur): remove hífens nas pontas. */
function slugify(input: string): string {
  return slugifyTyping(input).replace(/-+$/g, '');
}

function EditorSection({
  id,
  title,
  subtitle,
  icon,
  badge,
  open,
  onToggle,
  children,
}: {
  id: SectionId;
  title: string;
  subtitle: string;
  icon: ReactNode;
  badge?: { label: string; ok?: boolean };
  open: boolean;
  onToggle: (id: SectionId) => void;
  children: ReactNode;
}) {
  return (
    <section
      className={['hub-cpp-editor__section', open ? 'hub-cpp-editor__section--open' : '']
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className="hub-cpp-editor__section-toggle"
        aria-expanded={open}
        aria-controls={`cpp-section-${id}`}
        onClick={() => onToggle(id)}
      >
        <span className="hub-cpp-editor__section-icon" aria-hidden>
          {icon}
        </span>
        <span className="hub-cpp-editor__section-copy">
          <h3 className="hub-cpp-editor__section-title">{title}</h3>
          <p className="hub-cpp-editor__section-sub">{subtitle}</p>
        </span>
        <span className="hub-cpp-editor__section-meta">
          {badge ? (
            <span
              className={['hub-cpp-editor__badge', badge.ok ? 'hub-cpp-editor__badge--ok' : '']
                .filter(Boolean)
                .join(' ')}
            >
              {badge.label}
            </span>
          ) : null}
          <ChevronDown className="hub-cpp-editor__chevron" size={18} aria-hidden />
        </span>
      </button>
      {open ? (
        <div className="hub-cpp-editor__section-body" id={`cpp-section-${id}`}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

export type HubClinicPublicProfilePanelProps = {
  clinicId: string;
  clinicName: string;
  canEdit: boolean;
};

const HubClinicPublicProfilePanel: React.FC<HubClinicPublicProfilePanelProps> = ({
  clinicId,
  clinicName,
  canEdit,
}) => {
  const { showError, showSuccess } = useAlert();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [coverCropSrc, setCoverCropSrc] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [profile, setProfile] = useState<HubClinicPublicProfileRow | null>(null);
  const [services, setServices] = useState<HubClinicPublicServiceEditorRow[]>([]);
  const [serviceGroups, setServiceGroups] = useState<HubClinicPublicGroupEditorRow[]>([]);
  const [staff, setStaff] = useState<HubClinicPublicStaffEditorRow[]>([]);

  const [enabled, setEnabled] = useState(false);
  const [slug, setSlug] = useState('');
  const [headline, setHeadline] = useState('');
  const [about, setAbout] = useState('');
  const [accent, setAccent] = useState('#c86a4d');
  const [theme, setTheme] = useState<HubPublicThemePreset>('warm');
  const [servicesMode, setServicesMode] = useState<HubPublicServicesDisplayMode>('services');
  const [whatsapp, setWhatsapp] = useState('');
  const [showPhone, setShowPhone] = useState(true);
  const [showAddress, setShowAddress] = useState(true);
  const [showMap, setShowMap] = useState(false);
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [social, setSocial] = useState<HubPublicSocialLinks>({});
  const [hours, setHours] = useState<HubPublicBusinessHours>({});
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');

  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>({
    content: true,
    contact: true,
    hours: false,
    social: false,
    services: false,
    team: false,
  });

  const publicUrl = useMemo(() => {
    const s = slug.trim().toLowerCase();
    if (!s) return '';
    return `${window.location.origin}/c/${s}`;
  }, [slug]);

  const servicesSelected = useMemo(
    () => services.filter((s) => s.show_on_public_profile).length,
    [services],
  );
  const groupsSelected = useMemo(
    () => serviceGroups.filter((g) => g.show_on_public_profile).length,
    [serviceGroups],
  );
  const staffSelected = useMemo(
    () => staff.filter((s) => s.show_on_public_profile).length,
    [staff],
  );
  const showGroupsPicker = servicesMode === 'groups' || servicesMode === 'both';
  const showServicesPicker = servicesMode === 'services' || servicesMode === 'both';
  const servicesSectionBadge = useMemo(() => {
    if (servicesMode === 'groups') {
      return groupsSelected > 0
        ? { label: `${groupsSelected} grupo${groupsSelected === 1 ? '' : 's'}`, ok: true }
        : { label: 'Nenhum grupo' };
    }
    if (servicesMode === 'services') {
      return servicesSelected > 0
        ? { label: `${servicesSelected} serviço${servicesSelected === 1 ? '' : 's'}`, ok: true }
        : { label: 'Nenhum serviço' };
    }
    const parts = [
      groupsSelected > 0 ? `${groupsSelected} grupo${groupsSelected === 1 ? '' : 's'}` : null,
      servicesSelected > 0 ? `${servicesSelected} serviço${servicesSelected === 1 ? '' : 's'}` : null,
    ].filter(Boolean);
    return parts.length
      ? { label: parts.join(' · '), ok: true }
      : { label: 'Nada selecionado' };
  }, [servicesMode, groupsSelected, servicesSelected]);
  const openDaysCount = useMemo(
    () => DAY_KEYS.filter((k) => hours[k] && !hours[k]?.closed).length,
    [hours],
  );
  const socialFilled = useMemo(
    () =>
      (['instagram', 'facebook', 'tiktok', 'youtube', 'site'] as const).filter((k) =>
        Boolean(social[k]?.trim()),
      ).length,
    [social],
  );

  const load = async () => {
    setLoading(true);
    try {
      const res = await hubClinicPublicProfileApi.getEditor(clinicId);
      setProfile(res.profile);
      setServices(res.services || []);
      setServiceGroups(res.service_groups || []);
      setStaff(res.staff || []);
      setEnabled(!!res.profile.enabled);
      setSlug(res.profile.public_slug || slugify(clinicName) || '');
      setHeadline(res.profile.headline || '');
      setAbout(res.profile.about || res.clinic?.description || '');
      setAccent(res.profile.accent_color || '#c86a4d');
      setTheme(res.profile.theme_preset || 'warm');
      setServicesMode(res.profile.services_display_mode || 'services');
      setWhatsapp(formatBrPhoneFromApi(res.profile.whatsapp_phone || res.clinic?.phone || ''));
      setShowPhone(res.profile.show_phone !== false);
      setShowAddress(res.profile.show_address !== false);
      setShowMap(!!res.profile.show_map);
      setCtaLabel(res.profile.cta_label || '');
      setCtaUrl(res.profile.cta_url || '');
      setSocial(res.profile.social_links || {});
      setHours(res.profile.business_hours || {});
      setSeoTitle(res.profile.seo_title || '');
      setSeoDescription(res.profile.seo_description || '');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar página pública');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when clinic changes
  }, [clinicId]);

  const toggleSection = (id: SectionId) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const updateService = (id: string, patch: Partial<HubClinicPublicServiceEditorRow>) => {
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const updateGroup = (id: string, patch: Partial<HubClinicPublicGroupEditorRow>) => {
    setServiceGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };

  const updateStaff = (id: string, patch: Partial<HubClinicPublicStaffEditorRow>) => {
    setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const applyHoursToDays = (
    keys: readonly string[],
    opts: { closed: boolean; open?: string; close?: string; closeOthers?: boolean },
  ) => {
    setHours((prev) => {
      const next: HubPublicBusinessHours = { ...prev };
      if (opts.closeOthers) {
        for (const key of DAY_KEYS) {
          const cur = next[key];
          next[key] = {
            closed: true,
            open: cur?.open || '09:00',
            close: cur?.close || '18:00',
          };
        }
      }
      for (const key of keys) {
        const k = key as keyof HubPublicBusinessHours;
        const cur = next[k];
        next[k] = {
          closed: opts.closed,
          open: opts.open || cur?.open || '09:00',
          close: opts.close || cur?.close || '18:00',
        };
      }
      return next;
    });
  };

  const save = async (opts?: { nextEnabled?: boolean }) => {
    if (!canEdit) return;
    const nextEnabled = opts?.nextEnabled ?? enabled;
    const cleanSlug = slugify(slug);
    if (nextEnabled && (!cleanSlug || !SLUG_RE.test(cleanSlug))) {
      showError('Endereço da página inválido. Use 3–60 caracteres (letras, números e hífen).');
      setOpenSections((prev) => ({ ...prev, content: true }));
      return;
    }
    setSaving(true);
    try {
      const res = await hubClinicPublicProfileApi.patch(clinicId, {
        enabled: nextEnabled,
        public_slug: cleanSlug || null,
        headline: headline.trim() || null,
        about: about.trim() || null,
        accent_color: accent || null,
        theme_preset: theme,
        services_display_mode: servicesMode,
        whatsapp_phone: whatsapp.trim() || null,
        show_phone: showPhone,
        show_address: showAddress,
        show_map: showMap,
        cta_label: ctaLabel.trim() || null,
        cta_url: ctaUrl.trim() || null,
        social_links: social,
        business_hours: hours,
        seo_title: seoTitle.trim() || null,
        seo_description: seoDescription.trim() || null,
        services: services.map((s, idx) => ({
          id: s.id,
          show_on_public_profile: !!s.show_on_public_profile,
          public_sort_order: s.public_sort_order ?? idx,
          public_blurb: s.public_blurb ?? null,
          show_public_price:
            allowsPublicServicePrice(s.service_group) && !!s.show_public_price,
        })),
        service_groups: serviceGroups.map((g, idx) => ({
          id: g.id,
          show_on_public_profile: !!g.show_on_public_profile,
          public_sort_order: g.public_sort_order ?? idx,
          public_blurb: g.public_blurb ?? null,
        })),
        staff: staff.map((s, idx) => ({
          id: s.id,
          show_on_public_profile: !!s.show_on_public_profile,
          public_sort_order: s.public_sort_order ?? idx,
          public_bio: s.public_bio ?? null,
        })),
      });
      setProfile(res.profile);
      setServices(res.services);
      setServiceGroups(res.service_groups || []);
      setStaff(res.staff);
      setEnabled(!!res.profile.enabled);
      setServicesMode(res.profile.services_display_mode || servicesMode);
      setSlug(res.profile.public_slug || cleanSlug);
      if (opts?.nextEnabled === true) {
        showSuccess('Página publicada.');
      } else if (opts?.nextEnabled === false) {
        showSuccess('Página desativada. O link público não abre mais.');
      } else {
        showSuccess(nextEnabled ? 'Página pública atualizada.' : 'Rascunho salvo.');
      }
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const closeCoverCrop = () => {
    setCoverCropSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (coverInputRef.current) coverInputRef.current.value = '';
  };

  const onPickCover = (file: File | undefined) => {
    if (!file || !canEdit) return;
    setCoverCropSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const onConfirmCoverCrop = async (file: File) => {
    if (!canEdit) return;
    setCoverUploading(true);
    try {
      const res = await hubClinicPublicProfileApi.uploadCover(clinicId, file);
      setProfile(res.profile);
      showSuccess('Capa atualizada.');
      closeCoverCrop();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro no upload da capa');
    } finally {
      setCoverUploading(false);
    }
  };

  const onUploadLogo = async (file: File | undefined) => {
    if (!file || !canEdit) return;
    try {
      const res = await hubClinicPublicProfileApi.uploadLogo(clinicId, file);
      setProfile(res.profile);
      showSuccess('Logo da página atualizado.');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro no upload');
    }
  };

  const copyLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      showSuccess('Link copiado.');
    } catch {
      showError('Não foi possível copiar o link.');
    }
  };

  if (loading) {
    return (
      <HubAccountProfileCard
        title="Página pública"
        subtitle="Monte a vitrine online da clínica e compartilhe com tutores."
      >
        <HubLoading variant="block" label="Carregando página pública…" />
      </HubAccountProfileCard>
    );
  }

  return (
    <HubAccountProfileCard
      title="Página pública"
      subtitle="Monte a vitrine online da clínica e compartilhe com tutores."
      actions={
        canEdit ? (
          <>
            <button
              type="button"
              className={[
                'hub-ap__btn',
                enabled ? 'hub-ap__btn--outline' : 'hub-ap__btn--primary',
              ].join(' ')}
              onClick={() => void save({ nextEnabled: !enabled })}
              disabled={saving}
            >
              <Globe size={16} aria-hidden />
              {enabled ? 'Desativar' : 'Publicar'}
            </button>
            <button
              type="button"
              className={[
                'hub-ap__btn',
                enabled ? 'hub-ap__btn--primary' : 'hub-ap__btn--outline',
              ].join(' ')}
              onClick={() => void save()}
              disabled={saving}
            >
              <Save size={16} aria-hidden />
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </>
        ) : null
      }
    >
      <div className="hub-cpp-editor">
        <div className="hub-cpp-editor__publish">
          <div className="hub-cpp-editor__publish-top">
            <div>
              <p className="hub-cpp-editor__publish-label">Status da página</p>
              <p className="hub-cpp-editor__hint">
                {enabled
                  ? 'Quem tiver o link consegue ver a página agora.'
                  : 'Rascunho: o link público só abre depois de publicar.'}
              </p>
            </div>
            <span
              className={[
                'hub-cpp-editor__status',
                enabled ? 'hub-cpp-editor__status--live' : 'hub-cpp-editor__status--draft',
              ].join(' ')}
            >
              {enabled ? 'No ar' : 'Rascunho'}
            </span>
          </div>

          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="cpp-slug">
              Endereço da página
            </label>
            <div className="hub-cpp-editor__slug">
              <span className="hub-cpp-editor__slug-prefix">/c/</span>
              <input
                id="cpp-slug"
                className="hub-clientes__input"
                value={slug}
                onChange={(e) => setSlug(slugifyTyping(e.target.value))}
                onBlur={() => setSlug((prev) => slugify(prev))}
                disabled={!canEdit}
                placeholder="minha-clinica"
              />
            </div>
            <p className="hub-cpp-editor__hint">
              Use só letras, números e hífen. Espaço vira hífen automaticamente.
            </p>
            {publicUrl ? (
              <div className="hub-cpp-editor__link-row">
                <code>{publicUrl}</code>
                <div className="hub-cpp-editor__publish-actions">
                  <button
                    type="button"
                    className="hub-ap__btn hub-ap__btn--outline"
                    onClick={() => void copyLink()}
                  >
                    <Copy size={14} aria-hidden /> Copiar link
                  </button>
                  {enabled ? (
                    <a
                      className="hub-ap__btn hub-ap__btn--outline"
                      href={publicUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={14} aria-hidden /> Abrir página
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <EditorSection
          id="content"
          title="Conteúdo principal"
          subtitle="Frase de destaque, texto sobre a clínica, visual e imagens."
          icon={<LayoutTemplate size={18} />}
          open={openSections.content}
          onToggle={toggleSection}
          badge={
            headline.trim() || about.trim()
              ? { label: 'Preenchido', ok: true }
              : { label: 'Opcional' }
          }
        >
          <div className="hub-cpp-editor__grid2">
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor="cpp-headline">
                Frase de destaque
              </label>
              <input
                id="cpp-headline"
                className="hub-clientes__input"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                disabled={!canEdit}
                maxLength={200}
                placeholder="Ex.: Cuidado completo para o seu pet"
              />
              <p className="hub-cpp-editor__hint">
                Aparece bem grande no topo, logo abaixo do nome da clínica.
              </p>
            </div>
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor="cpp-theme">
                Estilo visual
              </label>
              <HubSearchableCombobox
                id="cpp-theme"
                className="hub-combobox--clientes"
                options={THEME_OPTIONS}
                value={theme}
                onChange={(v) => {
                  if (v === 'warm' || v === 'clean' || v === 'dark') setTheme(v);
                }}
                placeholder="Escolher estilo"
                searchPlaceholder="Buscar estilo…"
                allowCreate={false}
                clearable={false}
                disabled={!canEdit}
                ariaLabel="Estilo visual da página"
              />
            </div>
          </div>

          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="cpp-about">
              Sobre a clínica
            </label>
            <textarea
              id="cpp-about"
              className="hub-clientes__input hub-clientes__textarea"
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              disabled={!canEdit}
              rows={4}
              maxLength={4000}
              placeholder="Conte quem vocês são e o que oferecem…"
            />
          </div>

          <div className="hub-cpp-editor__grid2">
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor="cpp-accent">
                Cor de destaque
              </label>
              <input
                id="cpp-accent"
                className="hub-clientes__input"
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                disabled={!canEdit}
                style={{ maxWidth: 88, padding: 4, height: 42 }}
              />
            </div>
            <div className="hub-clientes__field">
              <span className="hub-clientes__label">Imagens</span>
              <div className="hub-cpp-editor__media">
                <button
                  type="button"
                  className="hub-ap__btn hub-ap__btn--outline"
                  disabled={!canEdit}
                  onClick={() => coverInputRef.current?.click()}
                >
                  <ImagePlus size={14} aria-hidden /> Foto de capa
                </button>
                <button
                  type="button"
                  className="hub-ap__btn hub-ap__btn--outline"
                  disabled={!canEdit}
                  onClick={() => logoInputRef.current?.click()}
                >
                  <ImagePlus size={14} aria-hidden /> Logo da página
                </button>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(e) => {
                    onPickCover(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(e) => void onUploadLogo(e.target.files?.[0])}
                />
              </div>
              <p className="hub-cpp-editor__hint">
                A capa usa proporção 2,5∶1. Depois de escolher a foto, você ajusta o recorte.
              </p>
              {(profile?.cover_image_url || profile?.logo_override_url) && (
                <div className="hub-cpp-editor__thumbs">
                  {profile.cover_image_url ? (
                    <img
                      className="hub-cpp-editor__thumb-cover"
                      src={profile.cover_image_url}
                      alt="Capa"
                    />
                  ) : null}
                  {profile.logo_override_url ? (
                    <img src={profile.logo_override_url} alt="Logo" />
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </EditorSection>

        <HubCoverCropModal
          open={Boolean(coverCropSrc)}
          imageSrc={coverCropSrc}
          busy={coverUploading}
          onClose={closeCoverCrop}
          onConfirm={onConfirmCoverCrop}
        />

        <EditorSection
          id="contact"
          title="Contato e botões"
          subtitle="WhatsApp, telefone, endereço, mapa e botão extra."
          icon={<Phone size={18} />}
          open={openSections.contact}
          onToggle={toggleSection}
          badge={whatsapp.trim() ? { label: 'WhatsApp ok', ok: true } : { label: 'Recomendado' }}
        >
          <div className="hub-cpp-editor__grid2">
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor="cpp-whatsapp">
                WhatsApp
              </label>
              <HubBrPhoneInput
                id="cpp-whatsapp"
                className="hub-clientes__input"
                value={whatsapp}
                onChange={setWhatsapp}
                disabled={!canEdit}
              />
            </div>
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor="cpp-cta-url">
                Botão extra (opcional)
              </label>
              <input
                id="cpp-cta-url"
                className="hub-clientes__input"
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                disabled={!canEdit}
                placeholder="https://… (link do botão)"
              />
              <input
                className="hub-clientes__input"
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
                disabled={!canEdit}
                placeholder="Texto do botão (ex.: Agendar)"
                style={{ marginTop: 8 }}
              />
            </div>
          </div>

          <div className="hub-cpp-editor__checks">
            <HubCheckbox checked={showPhone} onChange={setShowPhone} disabled={!canEdit}>
              Mostrar telefone
            </HubCheckbox>
            <HubCheckbox checked={showAddress} onChange={setShowAddress} disabled={!canEdit}>
              Mostrar endereço
            </HubCheckbox>
            <HubCheckbox checked={showMap} onChange={setShowMap} disabled={!canEdit}>
              Mostrar mapa
            </HubCheckbox>
          </div>
        </EditorSection>

        <EditorSection
          id="hours"
          title="Horário de funcionamento"
          subtitle="Dias e horários que aparecem na página."
          icon={<Clock3 size={18} />}
          open={openSections.hours}
          onToggle={toggleSection}
          badge={
            openDaysCount > 0
              ? { label: `${openDaysCount} dia${openDaysCount === 1 ? '' : 's'} aberto${openDaysCount === 1 ? '' : 's'}`, ok: true }
              : { label: 'Não definido' }
          }
        >
          <div className="hub-cpp-editor__hours">
            <div className="hub-cpp-editor__hours-toolbar">
              <span className="hub-cpp-editor__hours-toolbar-label">Atalhos</span>
              <button
                type="button"
                className="hub-ap__btn hub-ap__btn--outline"
                disabled={!canEdit}
                onClick={() =>
                  applyHoursToDays(WEEKDAY_KEYS, {
                    closed: false,
                    open: '09:00',
                    close: '18:00',
                    closeOthers: true,
                  })
                }
              >
                Seg a sex
              </button>
              <button
                type="button"
                className="hub-ap__btn hub-ap__btn--outline"
                disabled={!canEdit}
                onClick={() =>
                  applyHoursToDays(DAY_KEYS, {
                    closed: false,
                    open: '09:00',
                    close: '18:00',
                  })
                }
              >
                Todos os dias
              </button>
              <button
                type="button"
                className="hub-ap__btn hub-ap__btn--outline"
                disabled={!canEdit}
                onClick={() => applyHoursToDays(DAY_KEYS, { closed: true })}
              >
                Fechar todos
              </button>
            </div>
            <p className="hub-cpp-editor__hint" style={{ marginTop: 0 }}>
              Seg a sex define 09:00–18:00 nos dias úteis e fecha sábado e domingo. Depois você pode
              ajustar cada dia.
            </p>
            {DAY_KEYS.map((key, i) => {
              const d = hours[key] || { closed: true, open: '09:00', close: '18:00' };
              const closed = !!d.closed;
              return (
                <div
                  key={key}
                  className={[
                    'hub-cpp-editor__hour-row',
                    closed ? 'hub-cpp-editor__hour-row--closed' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="hub-cpp-editor__day">{DAY_LABELS[i]}</span>
                  <div className="hub-cpp-editor__open-check">
                    <HubCheckbox
                      checked={!closed}
                      onChange={(openDay) =>
                        setHours((prev) => ({
                          ...prev,
                          [key]: {
                            closed: !openDay,
                            open: d.open || '09:00',
                            close: d.close || '18:00',
                          },
                        }))
                      }
                      disabled={!canEdit}
                    >
                      Aberto
                    </HubCheckbox>
                  </div>
                  <HubTimeField
                    id={`cpp-open-${key}`}
                    label="Abre"
                    valueHm={d.open || '09:00'}
                    onChangeHm={(hm) =>
                      setHours((prev) => ({
                        ...prev,
                        [key]: { ...d, closed: false, open: hm },
                      }))
                    }
                    disabled={!canEdit || closed}
                    minuteStep={15}
                  />
                  <HubTimeField
                    id={`cpp-close-${key}`}
                    label="Fecha"
                    valueHm={d.close || '18:00'}
                    onChangeHm={(hm) =>
                      setHours((prev) => ({
                        ...prev,
                        [key]: { ...d, closed: false, close: hm },
                      }))
                    }
                    disabled={!canEdit || closed}
                    minuteStep={15}
                  />
                </div>
              );
            })}
          </div>
        </EditorSection>

        <EditorSection
          id="social"
          title="Redes e busca no Google"
          subtitle="Links das redes e como a clínica aparece na pesquisa."
          icon={<Globe size={18} />}
          open={openSections.social}
          onToggle={toggleSection}
          badge={
            socialFilled > 0
              ? { label: `${socialFilled} rede${socialFilled === 1 ? '' : 's'}`, ok: true }
              : { label: 'Opcional' }
          }
        >
          <div className="hub-cpp-editor__grid2">
            {(['instagram', 'facebook', 'tiktok', 'youtube', 'site'] as const).map((key) => (
              <div key={key} className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor={`cpp-social-${key}`}>
                  {SOCIAL_LABELS[key]}
                </label>
                <input
                  id={`cpp-social-${key}`}
                  className="hub-clientes__input"
                  value={social[key] || ''}
                  onChange={(e) => setSocial((prev) => ({ ...prev, [key]: e.target.value }))}
                  disabled={!canEdit}
                  placeholder={key === 'site' ? 'https://…' : '@sua_clinica'}
                />
              </div>
            ))}
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor="cpp-seo-title">
                Título na busca do Google
              </label>
              <input
                id="cpp-seo-title"
                className="hub-clientes__input"
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
                disabled={!canEdit}
                placeholder="Ex.: Clínica Diana — veterinária em São Paulo"
              />
            </div>
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor="cpp-seo-desc">
                Descrição na busca do Google
              </label>
              <input
                id="cpp-seo-desc"
                className="hub-clientes__input"
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
                disabled={!canEdit}
                placeholder="Uma frase curta sobre a clínica"
              />
            </div>
          </div>
        </EditorSection>

        <EditorSection
          id="services"
          title="O que oferecer na página"
          subtitle="Mostre só os grupos, só os serviços, ou os dois juntos."
          icon={<Wrench size={18} />}
          open={openSections.services}
          onToggle={toggleSection}
          badge={servicesSectionBadge}
        >
          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="cpp-services-mode">
              Como mostrar
            </label>
            <HubSearchableCombobox
              id="cpp-services-mode"
              className="hub-combobox--clientes"
              options={SERVICES_MODE_OPTIONS}
              value={servicesMode}
              onChange={(v) => {
                if (v === 'groups' || v === 'services' || v === 'both') setServicesMode(v);
              }}
              placeholder="Escolher como mostrar"
              searchPlaceholder="Buscar opção…"
              allowCreate={false}
              clearable={false}
              disabled={!canEdit}
              ariaLabel="Como mostrar serviços na página"
            />
            <p className="hub-cpp-editor__hint">
              {servicesMode === 'groups'
                ? 'A página lista só as áreas (grupos), sem detalhar cada serviço interno.'
                : servicesMode === 'services'
                  ? 'A página lista os serviços escolhidos, um a um.'
                  : 'A página mostra os grupos e, dentro de cada um, os serviços marcados.'}
            </p>
          </div>

          {showGroupsPicker ? (
            <div className="hub-cpp-editor__offer-block">
              <h4 className="hub-cpp-editor__offer-title">Grupos</h4>
              {serviceGroups.length === 0 ? (
                <p className="hub-cpp-editor__empty">
                  Nenhum grupo cadastrado. Crie grupos em Configurações → Serviços.
                </p>
              ) : (
                <ul className="hub-cpp-editor__list">
                  {serviceGroups.map((g) => (
                    <li key={g.id}>
                      <HubCheckbox
                        checked={!!g.show_on_public_profile}
                        onChange={(c) => updateGroup(g.id, { show_on_public_profile: c })}
                        disabled={!canEdit}
                      >
                        {g.name}
                      </HubCheckbox>
                      {g.show_on_public_profile ? (
                        <div className="hub-cpp-editor__list-extra">
                          <input
                            className="hub-clientes__input"
                            value={g.public_blurb || ''}
                            onChange={(e) => updateGroup(g.id, { public_blurb: e.target.value })}
                            disabled={!canEdit}
                            placeholder="Texto curto sobre o grupo (opcional)"
                          />
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {showServicesPicker ? (
            <div className="hub-cpp-editor__offer-block">
              <h4 className="hub-cpp-editor__offer-title">Serviços</h4>
              <p className="hub-cpp-editor__hint">
                Preço público só para serviços padronizados (banho, hotel, creche, leva e traz),
                conforme regras do CFMV. Serviços clínicos aparecem como “Valor sob avaliação
                veterinária.”
              </p>
              {services.length === 0 ? (
                <p className="hub-cpp-editor__empty">
                  Nenhum serviço no catálogo. Cadastre serviços em Serviços para listá-los aqui.
                </p>
              ) : (
                <ul className="hub-cpp-editor__list">
                  {services.map((s) => {
                    const priceAllowed = allowsPublicServicePrice(s.service_group);
                    return (
                    <li key={s.id}>
                      <HubCheckbox
                        checked={!!s.show_on_public_profile}
                        onChange={(c) =>
                          updateService(s.id, {
                            show_on_public_profile: c,
                            ...(c && !priceAllowed ? { show_public_price: false } : {}),
                          })
                        }
                        disabled={!canEdit || s.active === false}
                      >
                        {s.name}
                        {s.service_group ? (
                          <span className="hub-cpp-editor__item-meta"> · {s.service_group}</span>
                        ) : null}
                      </HubCheckbox>
                      {s.show_on_public_profile ? (
                        <div className="hub-cpp-editor__list-extra">
                          <input
                            className="hub-clientes__input"
                            value={s.public_blurb || ''}
                            onChange={(e) => updateService(s.id, { public_blurb: e.target.value })}
                            disabled={!canEdit}
                            placeholder="Texto curto sobre o serviço (opcional)"
                          />
                          {priceAllowed ? (
                            <HubCheckbox
                              checked={!!s.show_public_price}
                              onChange={(c) => updateService(s.id, { show_public_price: c })}
                              disabled={!canEdit}
                            >
                              Mostrar preço
                            </HubCheckbox>
                          ) : (
                            <p className="hub-cpp-editor__price-policy">
                              Valor sob avaliação veterinária. (preço público não disponível
                              para este tipo de serviço)
                            </p>
                          )}
                        </div>
                      ) : null}
                    </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </EditorSection>

        <EditorSection
          id="team"
          title="Equipe na página"
          subtitle="Mostre profissionais com foto, cargo e um texto curto."
          icon={<Users size={18} />}
          open={openSections.team}
          onToggle={toggleSection}
          badge={
            staffSelected > 0
              ? {
                  label: `${staffSelected} selecionado${staffSelected === 1 ? '' : 's'}`,
                  ok: true,
                }
              : { label: 'Nenhum' }
          }
        >
          {staff.length === 0 ? (
            <p className="hub-cpp-editor__empty">
              Nenhum profissional cadastrado. Cadastre a equipe em Equipe para destacá-los aqui.
            </p>
          ) : (
            <ul className="hub-cpp-editor__list">
              {staff.map((m) => (
                <li key={m.id}>
                  <HubCheckbox
                    checked={!!m.show_on_public_profile}
                    onChange={(c) => updateStaff(m.id, { show_on_public_profile: c })}
                    disabled={!canEdit || m.active === false}
                  >
                    {m.display_name || m.full_name}
                  </HubCheckbox>
                  {m.show_on_public_profile ? (
                    <div className="hub-cpp-editor__list-extra">
                      <textarea
                        className="hub-clientes__input hub-clientes__textarea"
                        value={m.public_bio || ''}
                        onChange={(e) => updateStaff(m.id, { public_bio: e.target.value })}
                        disabled={!canEdit}
                        rows={2}
                        placeholder="Texto curto sobre o profissional"
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </EditorSection>

        <p className="hub-cpp-editor__hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={14} aria-hidden />
          Dica: preencha o essencial, publique e refine serviços/equipe depois.
        </p>
      </div>
    </HubAccountProfileCard>
  );
};

export default HubClinicPublicProfilePanel;
