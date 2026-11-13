import { useCallback, useMemo, useSyncExternalStore } from 'react';

export type HubAccessMode = 'full' | 'soft_lock' | 'read_history';

export type HubSubscriptionEntitlements = {
  status: string;
  is_beta: boolean;
  base_plan_slug: string | null;
  enabled_modules: string[];
  beta_free_until: string | null;
  disabled_operational_areas?: string[];
  max_units?: number | null;
  max_users?: number | null;
  usage?: { units: number; users: number };
  limits_exceeded?: { units: boolean; users: boolean };
  access_mode?: HubAccessMode;
  plan_config?: {
    default_modules?: string[];
    locked_modules?: boolean;
    disabled_operational_areas?: string[];
    unit_label?: string;
  } | null;
};

const STORAGE_KEY = 'hub_subscription';
const EVENT = 'petimi:clinic-storage-updated';

function readSubscription(): HubSubscriptionEntitlements | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as HubSubscriptionEntitlements;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  const handler = () => onChange();
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

let cachedRaw: string | null = null;
let cachedParsed: HubSubscriptionEntitlements | null = null;

function getSnapshot(): HubSubscriptionEntitlements | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedParsed;
  cachedRaw = raw;
  cachedParsed = readSubscription();
  return cachedParsed;
}

function getServerSnapshot(): HubSubscriptionEntitlements | null {
  return null;
}

const MODULE_BY_PATH_PREFIX: Array<{ prefix: string; module?: string; area?: string }> = [
  { prefix: '/hub/clinica', module: 'clinic' },
  { prefix: '/hub/banho-tosa', module: 'grooming' },
  { prefix: '/hub/hotel-creche', module: 'boarding' },
  { prefix: '/hub/leva-e-traz', area: 'leva_traz' },
  { prefix: '/hub/recepcao', area: 'recepcao' },
];

const NAV_ENTITLEMENT: Record<string, { module?: string; area?: string }> = {
  '/hub/clinica': { module: 'clinic' },
  '/hub/banho-tosa': { module: 'grooming' },
  '/hub/hotel-creche': { module: 'boarding' },
  '/hub/leva-e-traz': { area: 'leva_traz' },
  '/hub/recepcao': { area: 'recepcao' },
};

export function useHubEntitlements() {
  const subscription = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const disabledAreas = useMemo(
    () => new Set(subscription?.disabled_operational_areas || []),
    [subscription?.disabled_operational_areas],
  );

  const modules = useMemo(
    () => new Set(subscription?.enabled_modules || ['hub_core']),
    [subscription?.enabled_modules],
  );

  const hasModule = useCallback(
    (slug: string) => {
      if (!subscription || subscription.is_beta) return true;
      return modules.has(slug);
    },
    [subscription, modules],
  );

  const hasPlanArea = useCallback(
    (area: string) => {
      if (!subscription || subscription.is_beta) return true;
      return !disabledAreas.has(area);
    },
    [subscription, disabledAreas],
  );

  const navItemAllowed = useCallback(
    (to: string) => {
      const rule = NAV_ENTITLEMENT[to];
      if (!rule) return true;
      if (rule.module && !hasModule(rule.module)) return false;
      if (rule.area && !hasPlanArea(rule.area)) return false;
      return true;
    },
    [hasModule, hasPlanArea],
  );

  const pathAllowed = useCallback(
    (pathname: string) => {
      const match = MODULE_BY_PATH_PREFIX.find(
        (p) => pathname === p.prefix || pathname.startsWith(`${p.prefix}/`),
      );
      if (!match) return true;
      if (match.module && !hasModule(match.module)) return false;
      if (match.area && !hasPlanArea(match.area)) return false;
      return true;
    },
    [hasModule, hasPlanArea],
  );

  const accessMode: HubAccessMode = subscription?.access_mode || 'full';
  const limitsExceeded = Boolean(
    subscription?.limits_exceeded?.units || subscription?.limits_exceeded?.users,
  );

  return {
    subscription,
    hasModule,
    hasPlanArea,
    navItemAllowed,
    pathAllowed,
    accessMode,
    limitsExceeded,
    isBeta: Boolean(subscription?.is_beta),
  };
}

export function entitlementBlockedMessage(kind: 'module' | 'area' | 'path' = 'module'): string {
  if (kind === 'area') {
    return 'Este recurso não está disponível no seu plano. Faça upgrade em Plano para liberar.';
  }
  return 'Este módulo não está incluído no seu plano. Veja as opções em Plano.';
}
