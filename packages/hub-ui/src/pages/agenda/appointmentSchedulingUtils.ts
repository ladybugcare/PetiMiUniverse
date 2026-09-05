import type { HubQuotePricingVariant } from '../../api/hubQuotesApi';
import type { CreateHubAppointmentPayload } from '../../api/hubAgendaApi';

export type SchedulingServiceChip = {
  hub_service_type_id: string;
  name: string;
  duration_minutes: number;
  pricing_variant?: HubQuotePricingVariant | null;
  sale_amount_override?: number | null;
};

export type ExtraBlock = {
  key: string;
  /** ID do agendamento filho (modo edição). */
  appointment_id?: string;
  expanded: boolean;
  block_title: string;
  /** true quando o usuário editou o título manualmente. */
  block_title_user_edited: boolean;
  block_description: string;
  block_description_user_edited: boolean;
  /** Filtro de grupo de serviço só para este bloco (`all` ou slug). */
  group_filter: string;
  services: SchedulingServiceChip[];
  starts_hm: string;
  ends_hm: string;
  hub_staff_member_id: string;
  resource_label: string;
};

/** Título automático: "Serviço A + Serviço B — Pet" (paridade com o bloco principal). */
export function buildBlockTitleFromServices(serviceNames: string[], petName?: string | null): string {
  const svcPart = serviceNames.filter(Boolean).join(' + ');
  const petPart = (petName ?? '').trim();
  if (!svcPart && !petPart) return '';
  if (!petPart) return svcPart;
  if (!svcPart) return petPart;
  return `${svcPart} — ${petPart}`;
}

/** Texto com bullets a partir das descrições dos tipos de serviço (cadastro). */
export function buildServiceDescriptionBullets(
  types: Array<{ id: string; description?: string | null }>,
  serviceIdsOrdered: string[],
): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const id of serviceIdsOrdered) {
    if (seen.has(id)) continue;
    seen.add(id);
    const st = types.find((t) => t.id === id);
    const d = (st?.description ?? '').trim();
    if (d) lines.push(`- ${d}`);
  }
  return lines.join('\n');
}

/** Aplica título/descrição automáticos e recalcula fim quando o usuário não editou. */
export function applyExtraBlockAutoFields(
  block: ExtraBlock,
  serviceTypes: Array<{ id: string; description?: string | null }>,
  petName?: string | null,
  opts?: { recalcEnds?: boolean },
): ExtraBlock {
  const next: ExtraBlock = { ...block, services: block.services.map((s) => ({ ...s })) };
  const names = next.services.map((s) => s.name);
  const ids = next.services.map((s) => s.hub_service_type_id);

  if (!next.block_title_user_edited) {
    next.block_title = buildBlockTitleFromServices(names, petName);
  }
  if (!next.block_description_user_edited) {
    next.block_description = buildServiceDescriptionBullets(serviceTypes, ids);
  }

  if (opts?.recalcEnds !== false) {
    const dur = next.services.reduce((sum, s) => sum + s.duration_minutes, 0);
    if (dur > 0) {
      next.ends_hm = addMinutes(next.starts_hm, dur);
    }
  }
  return next;
}

/** Subtítulo compacto do cabeçalho: "10:00–11:30 · 90 min · Banho + Tosa". */
export function buildBlockHeaderSubtitle(opts: {
  startsHm: string;
  endsHm: string;
  durationMin: number;
  serviceNames: string[];
  maxServiceNames?: number;
}): string {
  const max = opts.maxServiceNames ?? 2;
  const names = opts.serviceNames.filter(Boolean);
  const svcPart =
    names.length === 0
      ? ''
      : names.length <= max
        ? names.join(' + ')
        : `${names.slice(0, max).join(' + ')} +${names.length - max}`;
  const parts: string[] = [];
  if (opts.startsHm && opts.endsHm) parts.push(`${opts.startsHm}–${opts.endsHm}`);
  else if (opts.startsHm) parts.push(opts.startsHm);
  if (opts.durationMin > 0) parts.push(`${opts.durationMin} min`);
  if (svcPart) parts.push(svcPart);
  return parts.join(' · ');
}

export type PetVisitTiming = {
  startsHm: string;
  endsHm: string;
};

export function addMinutes(hm: string, mins: number): string {
  const [h, m] = hm.split(':').map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function minHm(times: string[]): string {
  if (times.length === 0) return '09:00';
  return times.reduce((a, b) => (hmToMinutes(a) <= hmToMinutes(b) ? a : b));
}

export function maxHm(times: string[]): string {
  if (times.length === 0) return '10:00';
  return times.reduce((a, b) => (hmToMinutes(a) >= hmToMinutes(b) ? a : b));
}

export function minutesToHm(totalMin: number): string {
  const t = ((totalMin % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function tsToHm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function toIsoTs(dateYmd: string, hm: string): string {
  const [h, m] = hm.split(':').map(Number);
  const d = new Date(`${dateYmd}T00:00:00`);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.toISOString();
}

export function addDaysToYmd(dateYmd: string, days: number): string {
  const [y, mo, d] = dateYmd.split('-').map(Number);
  const dt = new Date(y!, (mo ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** Fim do intervalo HH:MM; avança um dia quando endHm <= startHm (cruza meia-noite). */
export function toEndIsoTs(dateYmd: string, startHm: string, endHm: string): string {
  const endDate = hmToMinutes(endHm) <= hmToMinutes(startHm) ? addDaysToYmd(dateYmd, 1) : dateYmd;
  return toIsoTs(endDate, endHm);
}

/** Primeiro instante em dateYmd+HM que não seja anterior a anchorIso. */
export function toIsoTsOnOrAfter(dateYmd: string, hm: string, anchorIso: string): string {
  let candDate = dateYmd;
  let candidate = toIsoTs(candDate, hm);
  const anchorMs = new Date(anchorIso).getTime();
  while (new Date(candidate).getTime() < anchorMs) {
    candDate = addDaysToYmd(candDate, 1);
    candidate = toIsoTs(candDate, hm);
  }
  return candidate;
}

/**
 * Versão para pernas de retorno L&T: garante o mesmo dia do atendimento.
 * Se o horário escolhido for anterior ao fim do serviço (anchorIso),
 * usa o anchorIso diretamente — nunca avança ao dia seguinte.
 *
 * Diferença de toIsoTsOnOrAfter: aquela avança dias; esta usa o anchor como fallback.
 */
export function toIsoTsForPickupReturn(dateYmd: string, hm: string, anchorIso: string): string {
  const candidate = toIsoTs(dateYmd, hm);
  return new Date(candidate).getTime() >= new Date(anchorIso).getTime() ? candidate : anchorIso;
}

export function buildExtraBlocksApiPayload(
  extraBlocks: ExtraBlock[],
  dateYmd: string,
  lastServiceEndAt: string,
): CreateHubAppointmentPayload['extra_blocks'] {
  let cursor = lastServiceEndAt;
  return extraBlocks
    .filter((b) => b.services.length > 0)
    .map((b) => {
      const blockStart = toIsoTsOnOrAfter(dateYmd, b.starts_hm, cursor);
      const blockEnd = toEndIsoTs(blockStart.slice(0, 10), b.starts_hm, b.ends_hm);
      cursor = blockEnd;
      return {
        ...(b.appointment_id ? { id: b.appointment_id } : {}),
        starts_at: blockStart,
        ends_at: blockEnd,
        services: b.services.map((s) => ({
          hub_service_type_id: s.hub_service_type_id,
          duration_minutes: s.duration_minutes,
          pricing_variant: s.pricing_variant ?? undefined,
        })),
        hub_staff_member_id: b.hub_staff_member_id || null,
        resource_label: b.resource_label || null,
        title: b.block_title.trim() || null,
        notes: b.block_description.trim() || null,
      };
    });
}

export function cloneExtraBlock(block: ExtraBlock): ExtraBlock {
  return {
    ...block,
    services: block.services.map((s) => ({ ...s })),
  };
}

export function cloneExtraBlocks(blocks: ExtraBlock[]): ExtraBlock[] {
  return blocks.map(cloneExtraBlock);
}

export function petMainDurationMin(services: SchedulingServiceChip[], addons: SchedulingServiceChip[]): number {
  const dur =
    services.reduce((s, c) => s + c.duration_minutes, 0) +
    addons.reduce((s, c) => s + c.duration_minutes, 0);
  return Math.max(dur, 30);
}

export function petExtraBlocksDurationMin(extraBlocks: ExtraBlock[]): number {
  return extraBlocks.reduce(
    (sum, b) => sum + b.services.reduce((s, c) => s + c.duration_minutes, 0),
    0,
  );
}

export type PetVisitTimingInput = {
  petId: string;
  services: SchedulingServiceChip[];
  selectedAddons: SchedulingServiceChip[];
  extraBlocks: ExtraBlock[];
  startsHmOverride?: string;
  endsHmOverride?: string;
};

export function computePetVisitTimings(
  configs: PetVisitTimingInput[],
  visitStartsHm: string,
  syncSameStaffForAll: boolean,
): Map<string, PetVisitTiming> {
  const result = new Map<string, PetVisitTiming>();

  if (syncSameStaffForAll) {
    let cursorMin = hmToMinutes(visitStartsHm);
    for (const cfg of configs) {
      const mainDur = petMainDurationMin(cfg.services, cfg.selectedAddons);
      const petStartHm = minutesToHm(cursorMin);
      const petEndHm = addMinutes(petStartHm, mainDur);
      result.set(cfg.petId, { startsHm: petStartHm, endsHm: petEndHm });
      cursorMin = hmToMinutes(petEndHm) + petExtraBlocksDurationMin(cfg.extraBlocks);
    }
    return result;
  }

  for (const cfg of configs) {
    const petStartHm = cfg.startsHmOverride ?? visitStartsHm;
    const mainDur = petMainDurationMin(cfg.services, cfg.selectedAddons);
    const petEndHm = cfg.endsHmOverride ?? addMinutes(petStartHm, mainDur);
    result.set(cfg.petId, { startsHm: petStartHm, endsHm: petEndHm });
  }
  return result;
}

export function visitEndHmFromTimings(
  configs: PetVisitTimingInput[],
  timings: Map<string, PetVisitTiming>,
  syncSameStaffForAll: boolean,
): string {
  if (configs.length === 0) return '10:00';

  if (syncSameStaffForAll) {
    const lastCfg = configs[configs.length - 1]!;
    const lastTiming = timings.get(lastCfg.petId);
    if (!lastTiming) return '10:00';
    const endWithExtras = addMinutes(lastTiming.endsHm, petExtraBlocksDurationMin(lastCfg.extraBlocks));
    return endWithExtras;
  }

  const ends: string[] = [];
  for (const cfg of configs) {
    const t = timings.get(cfg.petId);
    if (!t) continue;
    ends.push(addMinutes(t.endsHm, petExtraBlocksDurationMin(cfg.extraBlocks)));
  }
  return ends.length > 0 ? maxHm(ends) : '10:00';
}

export function visitTotalDurationMin(
  configs: PetVisitTimingInput[],
  syncSameStaffForAll: boolean,
): number {
  if (syncSameStaffForAll) {
    return configs.reduce(
      (sum, cfg) =>
        sum +
        petMainDurationMin(cfg.services, cfg.selectedAddons) +
        petExtraBlocksDurationMin(cfg.extraBlocks),
      0,
    );
  }
  return configs.reduce((max, cfg) => {
    const span =
      petMainDurationMin(cfg.services, cfg.selectedAddons) +
      petExtraBlocksDurationMin(cfg.extraBlocks);
    return Math.max(max, span);
  }, 0);
}

export function createEmptyExtraBlock(opts: {
  groupFilter: string;
  startsHm: string;
  staffId: string;
  resourceLabel: string;
}): ExtraBlock {
  return {
    key: String(Date.now()),
    expanded: true,
    block_title: '',
    block_title_user_edited: false,
    block_description: '',
    block_description_user_edited: false,
    group_filter: opts.groupFilter,
    services: [],
    starts_hm: opts.startsHm,
    ends_hm: addMinutes(opts.startsHm, 60),
    hub_staff_member_id: opts.staffId,
    resource_label: opts.resourceLabel,
  };
}
