import React, { useMemo } from 'react';
import {
  ExternalLink,
  Facebook,
  Globe,
  Instagram,
  MapPin,
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
import type { HubClinicPublicLandingData } from './clinicPublicProfileTypes';
import {
  addressQuery,
  buildServiceInquiryMessage,
  formatAddressDisplay,
  getOpenStatus,
  groupHours,
  mapsSearchUrl,
  splitFeaturedOffers,
} from './clinicPublicLandingUtils';
import './clinic-public-profile.css';

export type HubClinicPublicLandingProps = {
  data: HubClinicPublicLandingData;
  /** Wordmark PetMi Hub no rodapé (fundo claro). */
  brandLogoSrc?: string;
  /** Wordmark com texto claro para tema escuro. */
  brandLogoOnDarkSrc?: string;
};

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

type OfferBlock = {
  key: string;
  title: string;
  blurb: string | null;
  color: string | null;
  groupSlug: string | null;
  services: HubClinicPublicLandingData['services'];
  flat?: boolean;
};

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

function OfferCard({
  block,
  displayMode,
  inquiryHref,
}: {
  block: OfferBlock;
  displayMode: string;
  inquiryHref: string | null;
}) {
  const only = block.flat ? block.services[0] : null;
  const meta = only ? serviceMeta(only) : null;
  const showGroupIcon = displayMode === 'groups' || Boolean(block.groupSlug);
  const groupAccent = resolveServiceAccentColor(block.color, block.groupSlug || 'outros');
  const body = (
    <>
      {showGroupIcon ? (
        <span
          className="hub-cpp__offer-icon hub-cpp__offer-icon--card"
          style={{ background: hexToSoftFill(groupAccent), color: groupAccent }}
          aria-hidden
        >
          <ServiceGroupIcon group={block.groupSlug || 'outros'} color={groupAccent} size={20} />
        </span>
      ) : null}
      <h3>{block.title}</h3>
      {block.blurb ? <p>{block.blurb}</p> : null}
      {meta ? <div className="hub-cpp__meta">{meta}</div> : null}
      {inquiryHref ? (
        <span className="hub-cpp__card-cta">
          <MessageCircle size={15} strokeWidth={2.2} aria-hidden />
          Perguntar no WhatsApp
        </span>
      ) : null}
    </>
  );

  if (inquiryHref) {
    return (
      <a
        className="hub-cpp__card hub-cpp__card--link"
        href={inquiryHref}
        target="_blank"
        rel="noreferrer"
      >
        {body}
      </a>
    );
  }

  return <article className="hub-cpp__card">{body}</article>;
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
  const phoneForWa = profile.whatsapp_phone || profile.phone;

  const wa = useMemo(() => buildWhatsappLink(phoneForWa, ''), [phoneForWa]);

  const offerBlocks = useMemo((): OfferBlock[] => {
    if (displayMode === 'groups') {
      return serviceGroups.map((g) => ({
        key: g.id,
        title: g.name,
        blurb: g.blurb,
        color: g.color,
        groupSlug: g.slug,
        services: [],
      }));
    }
    if (displayMode === 'services') {
      return services.map((s) => ({
        key: s.id,
        title: s.name,
        blurb: s.blurb,
        color: null,
        groupSlug: s.service_group || null,
        services: [s],
        flat: true,
      }));
    }
    const used = new Set<string>();
    const blocks: OfferBlock[] = serviceGroups.map((g) => {
      const nested = services.filter((s) => s.service_group === g.slug);
      nested.forEach((s) => used.add(s.id));
      return {
        key: g.id,
        title: g.name,
        blurb: g.blurb,
        color: g.color,
        groupSlug: g.slug,
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

  const { featured: featuredOffers, more: moreOffers } = useMemo(
    () => (displayMode === 'both' ? { featured: offerBlocks, more: [] } : splitFeaturedOffers(offerBlocks)),
    [displayMode, offerBlocks],
  );

  const inquiryHrefFor = (title: string): string | null =>
    buildWhatsappLink(phoneForWa, buildServiceInquiryMessage(profile.clinic_name, title));

  const hasOffer = offerBlocks.length > 0;
  const telHref = profile.phone ? `tel:${profile.phone.replace(/\D/g, '')}` : null;
  const addressLine = formatAddressDisplay(profile.address);
  const mapQ = addressQuery(data);
  const mapsHref = mapQ ? mapsSearchUrl(mapQ) : null;
  const showMapEmbed = Boolean(profile.show_map && mapQ);
  const hasHours = Object.keys(profile.business_hours || {}).length > 0;
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
  const showContactLinks =
    socialEntries.length > 0 || Boolean(wa) || Boolean(profile.show_phone && profile.phone);
  const showVisit =
    hasHours || Boolean(profile.show_address && addressLine) || showMapEmbed || showContactLinks || units.length > 1;

  const offerSectionTitle = displayMode === 'groups' ? 'Áreas de atendimento' : 'Serviços';

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

          {(openStatus || (profile.show_address && addressLine)) && (
            <div className="hub-cpp__hero-meta">
              {openStatus ? (
                <span
                  className={[
                    'hub-cpp__hero-chip',
                    openStatus.open ? 'hub-cpp__hero-chip--open' : 'hub-cpp__hero-chip--closed',
                  ].join(' ')}
                >
                  <span className="hub-cpp__hours-status-dot" aria-hidden />
                  {openStatus.label}
                </span>
              ) : null}
              {profile.show_address && addressLine ? (
                <span className="hub-cpp__hero-chip hub-cpp__hero-chip--place">
                  <MapPin size={14} strokeWidth={2.2} aria-hidden />
                  {addressLine}
                </span>
              ) : null}
            </div>
          )}

          <div className="hub-cpp__cta-row">
            {wa ? (
              <a className="hub-cpp__btn hub-cpp__btn--primary" href={wa} target="_blank" rel="noreferrer">
                <MessageCircle size={18} strokeWidth={2.1} aria-hidden />
                Falar no WhatsApp
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
        {hasOffer ? (
          <section className="hub-cpp__section">
            <h2 className="hub-cpp__section-title">{offerSectionTitle}</h2>
            {displayMode === 'both' ? (
              <div className="hub-cpp__offer-stack">
                {offerBlocks.map((block) => {
                  const groupAccent = resolveServiceAccentColor(block.color, block.groupSlug || 'outros');
                  const groupHref = inquiryHrefFor(block.title);
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
                        <div className="hub-cpp__offer-group-copy">
                          <h3>{block.title}</h3>
                          {block.blurb ? <p>{block.blurb}</p> : null}
                          {groupHref ? (
                            <a
                              className="hub-cpp__inline-wa"
                              href={groupHref}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <MessageCircle size={14} strokeWidth={2.2} aria-hidden />
                              Perguntar sobre {block.title}
                            </a>
                          ) : null}
                        </div>
                      </div>
                      {block.services.length > 0 ? (
                        <div className="hub-cpp__grid hub-cpp__grid--nested">
                          {block.services.map((s) => {
                            const meta = serviceMeta(s);
                            const href = inquiryHrefFor(s.name);
                            const nested = (
                              <>
                                <h4>{s.name}</h4>
                                {s.blurb && s.blurb !== block.blurb ? <p>{s.blurb}</p> : null}
                                {meta ? <div className="hub-cpp__meta">{meta}</div> : null}
                                {href ? (
                                  <span className="hub-cpp__card-cta">
                                    <MessageCircle size={14} strokeWidth={2.2} aria-hidden />
                                    Perguntar no WhatsApp
                                  </span>
                                ) : null}
                              </>
                            );
                            return href ? (
                              <a
                                key={s.id}
                                className="hub-cpp__card hub-cpp__card--link"
                                href={href}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {nested}
                              </a>
                            ) : (
                              <div key={s.id} className="hub-cpp__card">
                                {nested}
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
              <>
                <div className="hub-cpp__grid hub-cpp__grid--featured">
                  {featuredOffers.map((block) => (
                    <OfferCard
                      key={block.key}
                      block={block}
                      displayMode={displayMode}
                      inquiryHref={inquiryHrefFor(block.title)}
                    />
                  ))}
                </div>
                {moreOffers.length > 0 ? (
                  <details className="hub-cpp__more-offers">
                    <summary>
                      Mais {displayMode === 'groups' ? 'áreas' : 'serviços'} ({moreOffers.length})
                    </summary>
                    <div className="hub-cpp__grid">
                      {moreOffers.map((block) => (
                        <OfferCard
                          key={block.key}
                          block={block}
                          displayMode={displayMode}
                          inquiryHref={inquiryHrefFor(block.title)}
                        />
                      ))}
                    </div>
                  </details>
                ) : null}
              </>
            )}
          </section>
        ) : null}

        {profile.about ? (
          <section className="hub-cpp__section">
            <h2 className="hub-cpp__section-title">Sobre</h2>
            <p className="hub-cpp__about">{profile.about}</p>
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
                  <div className="hub-cpp__staff-body">
                    <div className="hub-cpp__staff-head">
                      <h3>{m.name}</h3>
                      <p className="hub-cpp__staff-role">{m.job_title}</p>
                    </div>
                    {m.bio ? <p className="hub-cpp__staff-bio">{m.bio}</p> : null}
                    {m.specialties?.length ? (
                      <p className="hub-cpp__staff-specs">{m.specialties.join(' · ')}</p>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {showVisit ? (
          <section className="hub-cpp__section hub-cpp__section--visit">
            <h2 className="hub-cpp__section-title">Visite e fale conosco</h2>
            <div className="hub-cpp__visit">
              {(hasHours || (profile.show_address && addressLine) || showMapEmbed) && (
                <div className="hub-cpp__visit-panel">
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

                  {profile.show_address && addressLine ? (
                    <div className="hub-cpp__address-block">
                      <p className="hub-cpp__address-line">
                        <MapPin size={16} strokeWidth={2.1} aria-hidden />
                        {addressLine}
                      </p>
                      {mapsHref ? (
                        <a
                          className="hub-cpp__maps-link"
                          href={mapsHref}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir no Maps
                          <ExternalLink size={14} strokeWidth={2.2} aria-hidden />
                        </a>
                      ) : null}
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

                  {showMapEmbed && mapQ ? (
                    <div className="hub-cpp__map">
                      <iframe
                        title="Mapa"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        src={`https://maps.google.com/maps?q=${encodeURIComponent(mapQ)}&output=embed`}
                      />
                      {mapsHref ? (
                        <a
                          className="hub-cpp__map-fallback"
                          href={mapsHref}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MapPin size={16} strokeWidth={2.1} aria-hidden />
                          Ver no Google Maps
                          <ExternalLink size={13} strokeWidth={2.2} aria-hidden />
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}

              {showContactLinks ? (
                <div className="hub-cpp__visit-panel hub-cpp__visit-panel--contact">
                  <p className="hub-cpp__visit-label">Contato</p>
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
                </div>
              ) : null}
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
