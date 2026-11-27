"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LAUNCH_PAID_CATALOG = exports.PAST_DUE_GRACE_DAYS = exports.VET_SOLO_PLAN_ID = exports.VET_SOLO_PLAN_SLUG = exports.PLAN_CONFIG_BY_SLUG = exports.ALL_HUB_MODULES = void 0;
exports.parsePlanConfig = parsePlanConfig;
exports.defaultModulesForPlanSlug = defaultModulesForPlanSlug;
exports.mergePaidLaunchCatalog = mergePaidLaunchCatalog;
/** Módulos SaaS do Hub (catálogo `hub_platform_modules`). */
exports.ALL_HUB_MODULES = ['hub_core', 'clinic', 'grooming', 'boarding'];
const ALL = [...exports.ALL_HUB_MODULES];
const FULL_OPS = {
    default_modules: ALL,
    locked_modules: false,
    disabled_operational_areas: [],
    unit_label: 'unidade',
};
/** Fallbacks tipados — usados se a coluna plan_config ainda não existir ou vier vazia. */
exports.PLAN_CONFIG_BY_SLUG = {
    beta: FULL_OPS,
    vet_solo: {
        default_modules: ['hub_core', 'clinic'],
        locked_modules: true,
        disabled_operational_areas: ['banho_tosa', 'hotel_creche', 'leva_traz', 'recepcao'],
        unit_label: 'area_atendimento',
    },
    solo: FULL_OPS,
    growth: FULL_OPS,
    network: FULL_OPS,
};
exports.VET_SOLO_PLAN_SLUG = 'vet_solo';
exports.VET_SOLO_PLAN_ID = 'a1000000-0000-4000-8000-000000000005';
exports.PAST_DUE_GRACE_DAYS = Number(process.env.HUB_PAST_DUE_GRACE_DAYS || 7);
function parsePlanConfig(slug, raw) {
    const fallback = (slug && exports.PLAN_CONFIG_BY_SLUG[slug]) || FULL_OPS;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return fallback;
    const obj = raw;
    const modulesRaw = obj.default_modules;
    const areasRaw = obj.disabled_operational_areas;
    const default_modules = Array.isArray(modulesRaw)
        ? modulesRaw.map(String).filter(Boolean)
        : fallback.default_modules;
    const disabled_operational_areas = Array.isArray(areasRaw)
        ? areasRaw.map(String).filter(Boolean)
        : fallback.disabled_operational_areas;
    return {
        default_modules: default_modules.length ? default_modules : fallback.default_modules,
        locked_modules: typeof obj.locked_modules === 'boolean' ? obj.locked_modules : fallback.locked_modules,
        disabled_operational_areas,
        unit_label: obj.unit_label === 'area_atendimento' ? 'area_atendimento' : 'unidade',
    };
}
function defaultModulesForPlanSlug(slug) {
    const cfg = exports.PLAN_CONFIG_BY_SLUG[slug || ''] || FULL_OPS;
    const set = new Set(cfg.default_modules.map(String));
    set.add('hub_core');
    return Array.from(set);
}
exports.LAUNCH_PAID_CATALOG = [
    {
        slug: 'vet_solo',
        name: 'Vet Solo',
        description: 'Veterinário independente ou volante — agenda, clientes e clínica. 1 área de atendimento e até 2 usuários.',
        max_units: 1,
        max_users: 2,
        monthly_price_cents: 6900,
        sort_order: 5,
    },
    {
        slug: 'solo',
        name: 'Essencial',
        description: 'Uma unidade e equipe de até 5 pessoas. Clínica, banho e tosa, hotel e creche e leva e traz inclusos.',
        max_units: 1,
        max_users: 5,
        monthly_price_cents: 14900,
        sort_order: 10,
    },
    {
        slug: 'growth',
        name: 'Expansão',
        description: 'Até 3 unidades e 20 pessoas na equipe. A mesma operação completa, para quem já tem filial.',
        max_units: 3,
        max_users: 20,
        monthly_price_cents: 29700,
        sort_order: 20,
    },
    {
        slug: 'network',
        name: 'Rede',
        description: 'Até 10 unidades e 50 pessoas na equipe. Operações maiores sob consulta.',
        max_units: 10,
        max_users: 50,
        monthly_price_cents: 49700,
        sort_order: 30,
    },
];
function mergePaidLaunchCatalog(fromDb) {
    const bySlug = new Map(fromDb.map((p) => [p.slug, p]));
    return exports.LAUNCH_PAID_CATALOG.map((canonical) => {
        const db = bySlug.get(canonical.slug);
        if (!db) {
            return {
                slug: canonical.slug,
                name: canonical.name,
                description: canonical.description,
                max_units: canonical.max_units,
                max_users: canonical.max_users,
                monthly_price_cents: canonical.monthly_price_cents,
                sort_order: canonical.sort_order,
            };
        }
        return {
            slug: canonical.slug,
            name: db.name || canonical.name,
            description: db.description ?? canonical.description,
            max_units: db.max_units ?? canonical.max_units,
            max_users: db.max_users ?? canonical.max_users,
            monthly_price_cents: db.monthly_price_cents ?? canonical.monthly_price_cents,
            sort_order: db.sort_order ?? canonical.sort_order,
            plan_config: db.plan_config,
        };
    }).sort((a, b) => a.sort_order - b.sort_order);
}
