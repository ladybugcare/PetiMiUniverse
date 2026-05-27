import type {
  HubQuote,
  HubQuoteLine,
  HubQuoteLineServiceEmbed,
  HubQuotePet,
  HubQuoteStatus,
} from '../../api/hubQuotesApi';

export function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? x[0] ?? null : x;
}

export function petLabel(p: HubQuotePet, idx: number): string {
  return (p.display_name && p.display_name.trim()) || `Pet ${idx + 1}`;
}

export function clinicDisplayName(quote: HubQuote): string | null {
  const c = embedOne(quote.clinic);
  const n = c?.name?.trim();
  return n || null;
}

export function sizeTierLabelPt(tier: string): string {
  const m: Record<string, string> = {
    mini: 'Mini',
    pequeno: 'Pequeno',
    medio: 'Médio',
    grande: 'Grande',
    gigante: 'Gigante',
  };
  return m[tier] ?? tier;
}

export function sexLabelPt(s: HubQuotePet['sex']): string {
  if (s === 'M') return 'Macho';
  if (s === 'F') return 'Fêmea';
  if (s === 'U') return '—';
  return '—';
}

export function ageLabelPt(ageMonths: number | null | undefined): string {
  if (ageMonths == null || !Number.isFinite(ageMonths)) return '—';
  if (ageMonths < 12) return `${Math.round(ageMonths)} meses`;
  const y = Math.floor(ageMonths / 12);
  const m = Math.round(ageMonths % 12);
  if (m <= 0) return `${y} ano${y !== 1 ? 's' : ''}`;
  return `${y}a ${m}m`;
}

function lineServiceEmbed(ln: HubQuoteLine): HubQuoteLineServiceEmbed | null {
  const raw = ln.hub_service_types;
  if (!raw) return null;
  return embedOne(raw);
}

function describePricingVariantSuffix(raw: HubQuoteLine['pricing_variant']): string {
  if (!raw || typeof raw !== 'object') return '';
  const o = raw as Record<string, unknown>;
  if (o.period === 'full_day') return ' · Dia completo';
  if (o.period === 'half_day') return ' · Meio período';
  if (o.consult_type === 'padrao') return ' · Consulta padrão';
  if (o.consult_type === 'retorno') return ' · Retorno';
  if (typeof o.km_tier_index === 'number' && Number.isFinite(o.km_tier_index)) return ` · Faixa ${o.km_tier_index + 1}`;
  return '';
}

export function publicLineServiceTitle(ln: HubQuoteLine): string {
  const st = lineServiceEmbed(ln);
  const v = describePricingVariantSuffix(ln.pricing_variant);
  if (st) return `${st.name}${v}`;
  return `${ln.description?.trim() || 'Serviço'}${v}`;
}

export function publicLineServiceSubtitle(ln: HubQuoteLine): string | null {
  const st = lineServiceEmbed(ln);
  const d = st?.description?.trim();
  if (d) return d;
  const lineDesc = ln.description?.trim();
  if (st && lineDesc && lineDesc !== st.name) return lineDesc;
  return null;
}

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function discountAmount(quote: HubQuote): number {
  const sub = Number(quote.subtotal_amount ?? 0);
  const kind = quote.discount_kind;
  const val = Number(quote.discount_value ?? 0);
  if (!kind || val <= 0) return 0;
  if (kind === 'percent') {
    const pct = Math.min(100, Math.max(0, val));
    return roundMoney2((sub * pct) / 100);
  }
  return roundMoney2(Math.min(sub, val));
}

export function staffStatusLabel(s: HubQuoteStatus): string {
  const m: Record<HubQuoteStatus, string> = {
    draft: 'Rascunho',
    sent: 'Enviado',
    awaiting_return: 'Aguardando retorno',
    accepted: 'Aprovado',
    expired: 'Expirado',
    cancelled: 'Cancelado',
  };
  return m[s] || s;
}

export function staffStatusClass(s: HubQuoteStatus): string {
  return `hub-orcamentos__status hub-orcamentos__status--${s}`;
}
