import React, { useMemo } from 'react';
import {
  Facebook,
  Globe,
  Instagram,
  MessageCircle,
  Music2,
  Phone,
  Youtube,
  type LucideIcon,
} from 'lucide-react';
import { ServiceGroupIcon } from '../../components/ServiceGroupIcon';
import { buildWhatsappLink } from '../../utils/whatsappLink';
import { formatBrPhoneDisplay } from '../../utils/formatBrPhone';
import {
  allowsPublicServicePrice,
  hexToSoftFill,
  PUBLIC_PRICE_EVALUATION_NOTE,
  resolveServiceAccentColor,
} from '../../utils/serviceTypeSlug';
import type { HubClinicPublicLandingData, HubPublicBusinessHours, HubPublicDayHours } from './clinicPublicProfileTypes';
import './clinic-public-profile.css';

export type HubClinicPublicLandingProps = {
  data: HubClinicPublicLandingData;
  /** Wordmark PetMi Hub no rodapé (fundo claro). */
  brandLogoSrc?: string;
  /** Wordmark com texto claro para tema escuro. */
  brandLogoOnDarkSrc?: string;
};

const DAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const SOCIAL_META: Array<{
  key: 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'site';
  label: string;
  Icon: LucideIcon;
}> = [
  { key: 'instagram', label: 'Instagram', Icon: Instagram },
  { key: 'facebook', label: 'Facebook', Icon: Facebook },
  { key: 'tiktok', label: 'TikTok', Icon: Music2 },
  { key: 'youtube', label: 'YouTube', Icon: Youtube },
  { key: 'site', label: 'Site', Icon: Globe },
];

function formatMoney(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function socialHref(kind: string, value: string): string {
  const v = value.trim();
  if (/^https?:\/\//i.test(v)) return v;
  if (kind === 'instagram') return `https://instagram.com/${v.replace(/^@/, '')}`;
  if (kind === 'facebook') return `https://facebook.com/${v.replace(/^@/, '')}`;
  if (kind === 'tiktok') return `https://tiktok.com/@${v.replace(/^@/, '')}`;
  if (kind === 'youtube') return `https://youtube.com/${v}`;
  if (kind === 'site') return v.includes('.') ? `https://${v}` : v;
  return v;
}

function daySignature(d: HubPublicDayHours | undefined): string {
  if (!d || d.closed) return 'closed';
  return `open:${d.open || ''}-${d.close || ''}`;
}

function formatDayRange(start: number, end: number): string {
  if (start === end) return DAY_LABELS[start];
  if (start === 1 && end === 5) return 'Seg a sex';
  if (start === 0 && end === 6) return 'Todos os dias';
  if (start === 1 && end === 6) return 'Seg a sáb';
  return `${DAY_SHORT[start]} a ${DAY_SHORT[end]}`;
}

function formatHoursValue(d: HubPublicDayHours | undefined, sig: string): string {
  if (!d || d.closed || sig === 'closed') return 'Fechado';
  if (d.open && d.close) return `${d.open} – ${d.close}`;
  return '—';
}

/** Agrupa dias consecutivos com o mesmo horário. */
function groupHours(hours: HubPublicBusinessHours): Array<{ day: string; value: string }> {
  const rows: Array<{ day: string; value: string }> = [];
  let i = 0;
  while (i < 7) {
    const key = String(i) as keyof HubPublicBusinessHours;
    const sig = daySignature(hours[key]);
    let j = i;
    while (j + 1 < 7) {
      const nextKey = String(j + 1) as keyof HubPublicBusinessHours;
      if (daySignature(hours[nextKey]) !== sig) break;
      j += 1;
    }
    rows.push({
      day: formatDayRange(i, j),
      value: formatHoursValue(hours[key], sig),
    });
    i = j + 1;
  }
  return rows;
}

function parseHm(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function getOpenStatus(
  hours: HubPublicBusinessHours,
  now = new Date(),
): { open: boolean; label: string } | null {
  if (!Object.keys(hours).length) return null;
  const key = String(now.getDay()) as keyof HubPublicBusinessHours;
  const d = hours[key];
  if (!d) return null;
  if (d.closed || !d.open || !d.close) {
    return { open: false, label: 'Fechado agora' };
  }
  const openM = parseHm(d.open);
  const closeM = parseHm(d.close);
  if (openM == null || closeM == null) return null;
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins >= openM && mins < closeM) {
    return { open: true, label: `Aberto agora · fecha às ${d.close}` };
  }
  if (mins < openM) {
    return { open: false, label: `Abre hoje às ${d.open}` };
  }
  return { open: false, label: 'Fechado agora' };
}

function addressQuery(data: HubClinicPublicLandingData): string | null {
  const a = data.profile.address;
  if (!a) return null;
  const parts = [a.line, a.city, a.state].filter((x) => x && String(x).trim());
  if (parts.length === 0 && data.units[0]) {
    const u = data.units[0];
    const up = [u.address, u.city, u.state].filter((x) => x && String(x).trim());
    return up.length ? up.join(', ') : null;
  }
  return parts.length ? parts.join(', ') : null;
}

function serviceMeta(s: {
  service_group?: string | null;
  default_duration_minutes: number | null;
  price: number | null;
  price_note?: string | null;
}): string | null {
  const canPrice = allowsPublicServicePrice(s.service_group);
  const pricePart = canPrice
    ? s.price != null
      ? formatMoney(s.price)
      : null
    : s.price_note?.trim() || PUBLIC_PRICE_EVALUATION_NOTE;
  const meta = [
    s.default_duration_minutes ? `${s.default_duration_minutes} min` : null,
    pricePart,
  ]
    .filter(Boolean)
    .join(' · ');
  return meta || null;
}

const HubClinicPublicLanding: React.FC<HubClinicPublicLandingProps> = ({
  data,
  brandLogoSrc = '/petmi-hub.svg',
  brandLogoOnDarkSrc = '/petmi-hub-on-dark.svg',
}) => {
  const { profile, services, staff, units } = data;
  const serviceGroups = data.service_groups || [];
  const accent = profile.accent_color || '#c86a4d';
  const theme = profile.theme_preset || 'warm';
  const displayMode = profile.services_display_mode || 'services';
  const footerLogoSrc = theme === 'dark' ? brandLogoOnDarkSrc : brandLogoSrc;

  const wa = useMemo(
    () => buildWhatsappLink(profile.whatsapp_phone || profile.phone, ''),
    [profile.whatsapp_phone, profile.phone],
  );

  const offerBlocks = useMemo(() => {
    if (displayMode === 'groups') {
      return serviceGroups.map((g) => ({
        key: g.id,
        title: g.name,
        blurb: g.blurb,
        color: g.color,
        groupSlug: g.slug as string | null,
        services: [] as typeof services,
      }));
    }
    if (displayMode === 'services') {
      return services.map((s) => ({
        key: s.id,
        title: s.name,
        blurb: s.blurb,
        color: null as string | null,
        groupSlug: (s.service_group || null) as string | null,
        services: [s],
        flat: true as const,
      }));
    }
    const used = new Set<string>();
    const blocks = serviceGroups.map((g) => {
      const nested = services.filter((s) => s.service_group === g.slug);
      nested.forEach((s) => used.add(s.id));
      return {
        key: g.id,
        title: g.name,
        blurb: g.blurb,
        color: g.color,
        groupSlug: g.slug as string | null,
        services: nested,
      };
    });
    const orphans = services.filter((s) => !used.has(s.id));
    for (const s of orphans) {
      blocks.push({
        key: `svc-${s.id}`,
        title: s.name,
        blurb: s.blurb,
        color: null,
        groupSlug: s.service_group || null,
        services: [s],
      });
    }
    return blocks;
  }, [displayMode, serviceGroups, services]);

  const hasOffer = offerBlocks.length > 0;
  const telHref = profile.phone ? `tel:${profile.phone.replace(/\D/g, '')}` : null;
  const mapQ = profile.show_map ? addressQuery(data) : null;
  const businessHours = profile.business_hours || {};
  const hasHours = Object.keys(businessHours).length > 0;
  const hours = useMemo(
    () => groupHours(profile.business_hours || {}),
    [profile.business_hours],
  );
  const openStatus = useMemo(
    () => getOpenStatus(profile.business_hours || {}),
    [profile.business_hours],
  );

  const socialEntries = SOCIAL_META.filter(({ key }) => {
    const v = profile.social_links?.[key];
    return typeof v === 'string' && v.trim().length > 0;
  });

  const initial = (profile.clinic_name || '?').trim().charAt(0).toUpperCase();
  const showContact =
    socialEntries.length > 0 || Boolean(wa) || Boolean(profile.show_phone && profile.phone);

  return (
    <div
      className={['hub-cpp', wa ? 'hub-cpp--has-wa-sticky' : ''].filter(Boolean).join(' ')}
      data-theme={theme}
      style={{ ['--cpp-accent' as string]: accent }}
    >
      <header
        className="hub-cpp__hero"
        style={
          profile.cover_image_url
            ? { backgroundImage: `url(${profile.cover_image_url})` }
            : undefined
        }
      >
        <div className="hub-cpp__hero-overlay" aria-hidden />
        <div className="hub-cpp__hero-inner">
          {profile.logo_url ? (
            <img className="hub-cpp__logo" src={profile.logo_url} alt="" />
          ) : (
            <div className="hub-cpp__logo hub-cpp__logo--placeholder" aria-hidden>
              {initial}
            </div>
          )}
          <h1 className="hub-cpp__clinic-name">{profile.clinic_name}</h1>
          {profile.headline ? <p className="hub-cpp__headline">{profile.headline}</p> : null}
          <div className="hub-cpp__cta-row">
            {wa ? (
              <a className="hub-cpp__btn hub-cpp__btn--primary" href={wa} target="_blank" rel="noreferrer">
                <MessageCircle size={18} strokeWidth={2.1} aria-hidden />
                WhatsApp
              </a>
            ) : null}
            {telHref && profile.show_phone ? (
              <a className="hub-cpp__btn hub-cpp__btn--ghost" href={telHref}>
                <Phone size={17} strokeWidth={2.1} aria-hidden />
                Ligar
              </a>
            ) : null}
            {profile.cta_url ? (
              <a
                className="hub-cpp__btn hub-cpp__btn--ghost"
                href={profile.cta_url}
                target="_blank"
                rel="noreferrer"
              >
                {profile.cta_label?.trim() || 'Saiba mais'}
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <main className="hub-cpp__main">
        {profile.about ? (
          <section className="hub-cpp__section">
            <h2 className="hub-cpp__section-title">Sobre</h2>
            <p className="hub-cpp__about">{profile.about}</p>
          </section>
        ) : null}

        {hasOffer ? (
          <section className="hub-cpp__section">
            <h2 className="hub-cpp__section-title">
              {displayMode === 'groups' ? 'Áreas de atendimento' : 'Serviços'}
            </h2>
            {displayMode === 'both' ? (
              <div className="hub-cpp__offer-stack">
                {offerBlocks.map((block) => {
                  const groupAccent = resolveServiceAccentColor(block.color, block.groupSlug || 'outros');
                  return (
                    <article key={block.key} className="hub-cpp__offer-group">
                      <div className="hub-cpp__offer-group-head">
                        <span
                          className="hub-cpp__offer-icon"
                          style={{ background: hexToSoftFill(groupAccent), color: groupAccent }}
                          aria-hidden
                        >
                          <ServiceGroupIcon
                            group={block.groupSlug || 'outros'}
                            color={groupAccent}
                            size={18}
                          />
                        </span>
                        <div>
                          <h3>{block.title}</h3>
                          {block.blurb ? <p>{block.blurb}</p> : null}
                        </div>
                      </div>
                      {block.services.length > 0 ? (
                        <div className="hub-cpp__grid hub-cpp__grid--nested">
                          {block.services.map((s) => {
                            const meta = serviceMeta(s);
                            return (
                              <div key={s.id} className="hub-cpp__card">
                                <h4>{s.name}</h4>
                                {s.blurb && s.blurb !== block.blurb ? <p>{s.blurb}</p> : null}
                                {meta ? <div className="hub-cpp__meta">{meta}</div> : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="hub-cpp__grid">
                {offerBlocks.map((block) => {
                  const only = 'flat' in block && block.flat ? block.services[0] : null;
                  const meta = only ? serviceMeta(only) : null;
                  const showGroupIcon = displayMode === 'groups' || Boolean(block.groupSlug);
                  const groupAccent = resolveServiceAccentColor(block.color, block.groupSlug || 'outros');
                  return (
                    <article key={block.key} className="hub-cpp__card">
                      {showGroupIcon ? (
                        <span
                          className="hub-cpp__offer-icon hub-cpp__offer-icon--card"
                          style={{ background: hexToSoftFill(groupAccent), color: groupAccent }}
                          aria-hidden
                        >
                          <ServiceGroupIcon
                            group={block.groupSlug || 'outros'}
                            color={groupAccent}
                            size={20}
                          />
                        </span>
                      ) : null}
                      <h3>{block.title}</h3>
                      {block.blurb ? <p>{block.blurb}</p> : null}
                      {meta ? <div className="hub-cpp__meta">{meta}</div> : null}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}

        {staff.length > 0 ? (
          <section className="hub-cpp__section">
            <h2 className="hub-cpp__section-title">Equipe</h2>
            <div className="hub-cpp__staff">
              {staff.map((m) => (
                <article key={m.id} className="hub-cpp__staff-card">
                  {m.photo_url ? (
                    <img className="hub-cpp__staff-photo" src={m.photo_url} alt="" />
                  ) : (
                    <div className="hub-cpp__staff-photo hub-cpp__staff-photo--ph" aria-hidden>
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h3>{m.name}</h3>
                    <p className="hub-cpp__staff-role">{m.job_title}</p>
                  </div>
                  {m.bio ? <p>{m.bio}</p> : null}
                  {m.specialties?.length ? (
                    <p className="hub-cpp__staff-specs">{m.specialties.join(' · ')}</p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {hasHours || profile.show_address ? (
          <section className="hub-cpp__section">
            <h2 className="hub-cpp__section-title">Horários e localização</h2>
            {hasHours ? (
              <div className="hub-cpp__hours">
                {openStatus ? (
                  <p
                    className={[
                      'hub-cpp__hours-status',
                      openStatus.open
                        ? 'hub-cpp__hours-status--open'
                        : 'hub-cpp__hours-status--closed',
                    ].join(' ')}
                  >
                    <span className="hub-cpp__hours-status-dot" aria-hidden />
                    {openStatus.label}
                  </p>
                ) : null}
                <ul className="hub-cpp__hours-list">
                  {hours.map((row) => (
                    <li key={row.day}>
                      <span>{row.day}</span>
                      <span>{row.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {profile.show_address && profile.address ? (
              <div className="hub-cpp__address-block">
                <p className="hub-cpp__about hub-cpp__about--wide">
                  {[profile.address.line, profile.address.city, profile.address.state]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {units.length > 1 ? (
                  <div className="hub-cpp__grid hub-cpp__grid--units">
                    {units.map((u) => (
                      <article key={u.id} className="hub-cpp__card">
                        <h3>{u.nickname || u.name || 'Unidade'}</h3>
                        <p>{[u.address, u.city, u.state].filter(Boolean).join(', ')}</p>
                        {u.phone ? (
                          <p className="hub-cpp__meta">{formatBrPhoneDisplay(u.phone)}</p>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {mapQ ? (
              <div className="hub-cpp__map">
                <iframe
                  title="Mapa"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(mapQ)}&output=embed`}
                />
              </div>
            ) : null}
          </section>
        ) : null}

        {showContact ? (
          <section className="hub-cpp__section">
            <h2 className="hub-cpp__section-title">Contato</h2>
            <div className="hub-cpp__social">
              {wa ? (
                <a
                  className="hub-cpp__social-link hub-cpp__social-link--wa"
                  href={wa}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle size={18} strokeWidth={2.1} aria-hidden />
                  WhatsApp
                </a>
              ) : null}
              {profile.show_phone && profile.phone && telHref ? (
                <a className="hub-cpp__social-link" href={telHref}>
                  <Phone size={17} strokeWidth={2.1} aria-hidden />
                  {formatBrPhoneDisplay(profile.phone)}
                </a>
              ) : null}
              {socialEntries.map(({ key, label, Icon }) => {
                const raw = profile.social_links[key]!;
                return (
                  <a
                    key={key}
                    className="hub-cpp__social-link"
                    href={socialHref(key, raw)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Icon size={17} strokeWidth={2.1} aria-hidden />
                    {label}
                  </a>
                );
              })}
            </div>
          </section>
        ) : null}
      </main>

      <footer className="hub-cpp__footer">
        <a
          className="hub-cpp__footer-brand"
          href="https://hub.petmi.app"
          target="_blank"
          rel="noreferrer"
        >
          <span className="hub-cpp__footer-credit">Página criada com</span>
          <img
            className="hub-cpp__footer-logo"
            src={footerLogoSrc}
            alt="PetMi Hub"
            width={140}
            height={33}
          />
        </a>
      </footer>

      {wa ? (
        <a
          className="hub-cpp__wa-sticky"
          href={wa}
          target="_blank"
          rel="noreferrer"
          aria-label="Falar no WhatsApp"
        >
          <MessageCircle size={20} strokeWidth={2.1} aria-hidden />
          Falar no WhatsApp
        </a>
      ) : null}
    </div>
  );
};

export default HubClinicPublicLanding;
