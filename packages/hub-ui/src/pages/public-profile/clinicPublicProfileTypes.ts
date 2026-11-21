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

export type HubPublicBusinessHours = Partial<
  Record<'0' | '1' | '2' | '3' | '4' | '5' | '6', HubPublicDayHours>
>;

export type HubClinicPublicLandingData = {
  profile: {
    slug: string;
    headline: string | null;
    about: string | null;
    cover_image_url: string | null;
    logo_url: string | null;
    accent_color: string | null;
    theme_preset: HubPublicThemePreset;
    services_display_mode?: HubPublicServicesDisplayMode;
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
  }>;
  service_groups?: Array<{
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
