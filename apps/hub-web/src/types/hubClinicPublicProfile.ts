export type HubPublicThemePreset = 'warm' | 'clean' | 'dark';

export type HubPublicServicesDisplayMode = 'groups' | 'services' | 'both';

export type HubPublicSocialLinks = {
  instagram?: string | null;
  facebook?: string | null;
  tiktok?: string | null;
  youtube?: string | null;
  site?: string | null;
};

export type HubPublicDayHours = {
  closed?: boolean;
  open?: string | null;
  close?: string | null;
};

export type HubPublicBusinessHours = Partial<Record<'0' | '1' | '2' | '3' | '4' | '5' | '6', HubPublicDayHours>>;

export type HubClinicPublicProfileRow = {
  clinic_id: string;
  enabled: boolean;
  public_slug: string | null;
  headline: string | null;
  about: string | null;
  cover_image_url: string | null;
  logo_override_url: string | null;
  accent_color: string | null;
  theme_preset: HubPublicThemePreset;
  services_display_mode?: HubPublicServicesDisplayMode;
  whatsapp_phone: string | null;
  show_phone: boolean;
  show_address: boolean;
  show_map: boolean;
  cta_label: string | null;
  cta_url: string | null;
  social_links: HubPublicSocialLinks;
  business_hours: HubPublicBusinessHours;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type HubClinicPublicServiceEditorRow = {
  id: string;
  name: string;
  service_group?: string | null;
  sale_amount?: number | null;
  default_duration_minutes?: number | null;
  active?: boolean;
  description?: string | null;
  show_on_public_profile?: boolean;
  public_sort_order?: number;
  public_blurb?: string | null;
  show_public_price?: boolean;
};

export type HubClinicPublicStaffEditorRow = {
  id: string;
  full_name: string;
  display_name?: string | null;
  photo_url?: string | null;
  job_title: string;
  professional_kind?: string;
  specialties?: string[];
  active?: boolean;
  show_on_public_profile?: boolean;
  public_bio?: string | null;
  public_sort_order?: number;
};

export type HubClinicPublicGroupEditorRow = {
  id: string;
  name: string;
  slug: string;
  color?: string | null;
  description?: string | null;
  display_order?: number;
  archived_at?: string | null;
  show_on_public_profile?: boolean;
  public_sort_order?: number;
  public_blurb?: string | null;
};

export type HubClinicPublicProfileEditorResponse = {
  profile: HubClinicPublicProfileRow;
  clinic: {
    id: string;
    name?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    photo_url?: string | null;
    description?: string | null;
  } | null;
  services: HubClinicPublicServiceEditorRow[];
  service_groups: HubClinicPublicGroupEditorRow[];
  staff: HubClinicPublicStaffEditorRow[];
};

export type PatchHubClinicPublicProfileBody = {
  enabled?: boolean;
  public_slug?: string | null;
  headline?: string | null;
  about?: string | null;
  accent_color?: string | null;
  theme_preset?: HubPublicThemePreset;
  services_display_mode?: HubPublicServicesDisplayMode;
  whatsapp_phone?: string | null;
  show_phone?: boolean;
  show_address?: boolean;
  show_map?: boolean;
  cta_label?: string | null;
  cta_url?: string | null;
  social_links?: HubPublicSocialLinks;
  business_hours?: HubPublicBusinessHours;
  seo_title?: string | null;
  seo_description?: string | null;
  cover_image_url?: string | null;
  logo_override_url?: string | null;
  services?: Array<{
    id: string;
    show_on_public_profile?: boolean;
    public_sort_order?: number;
    public_blurb?: string | null;
    show_public_price?: boolean;
  }>;
  service_groups?: Array<{
    id: string;
    show_on_public_profile?: boolean;
    public_sort_order?: number;
    public_blurb?: string | null;
  }>;
  staff?: Array<{
    id: string;
    show_on_public_profile?: boolean;
    public_sort_order?: number;
    public_bio?: string | null;
  }>;
};

/** Payload sanitizado do GET público */
export type HubPublicClinicLandingPayload = {
  profile: {
    slug: string;
    headline: string | null;
    about: string | null;
    cover_image_url: string | null;
    logo_url: string | null;
    accent_color: string | null;
    theme_preset: HubPublicThemePreset;
    services_display_mode: HubPublicServicesDisplayMode;
    whatsapp_phone: string | null;
    phone: string | null;
    show_phone: boolean;
    show_address: boolean;
    show_map: boolean;
    address: { line: string | null; city: string | null; state: string | null } | null;
    cta_label: string | null;
    cta_url: string | null;
    social_links: HubPublicSocialLinks;
    business_hours: HubPublicBusinessHours;
    seo_title: string | null;
    seo_description: string | null;
    clinic_name: string;
  };
  services: Array<{
    id: string;
    name: string;
    service_group?: string | null;
    default_duration_minutes: number | null;
    blurb: string | null;
    price: number | null;
    price_note?: string | null;
  }>;
  service_groups: Array<{
    id: string;
    name: string;
    slug: string;
    color: string | null;
    blurb: string | null;
  }>;
  staff: Array<{
    id: string;
    name: string;
    photo_url: string | null;
    job_title: string;
    professional_kind: string;
    specialties: string[];
    bio: string | null;
  }>;
  units: Array<{
    id: string;
    name: string | null;
    nickname: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    phone: string | null;
    is_main: boolean;
  }>;
};
