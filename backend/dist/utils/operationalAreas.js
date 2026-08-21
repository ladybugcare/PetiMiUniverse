"use strict";
/** Áreas operacionais do Hub — complementam o papel de governança (CADMIN, CASSISTANT, …). */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPERATIONAL_AREA_PERMISSIONS = exports.HUB_OPERATIONAL_AREA_LABELS = exports.HUB_OPERATIONAL_AREAS = void 0;
exports.isHubOperationalArea = isHubOperationalArea;
exports.sanitizeOperationalAreas = sanitizeOperationalAreas;
exports.defaultOperationalAreasForJobTitle = defaultOperationalAreasForJobTitle;
exports.permissionsFromOperationalAreas = permissionsFromOperationalAreas;
exports.HUB_OPERATIONAL_AREAS = [
    'recepcao',
    'caixa',
    'financeiro',
    'clinica',
    'banho_tosa',
    'hotel_creche',
    'leva_traz',
    'estoque',
    'servicos',
    'equipe',
];
const AREA_SET = new Set(exports.HUB_OPERATIONAL_AREAS);
exports.HUB_OPERATIONAL_AREA_LABELS = {
    recepcao: 'Recepção',
    caixa: 'Caixa',
    financeiro: 'Financeiro (backoffice)',
    clinica: 'Clínica',
    banho_tosa: 'Banho & Tosa',
    hotel_creche: 'Hotel & Creche',
    leva_traz: 'Leva e Traz',
    estoque: 'Estoque',
    servicos: 'Serviços e catálogo',
    equipe: 'Equipe',
};
/** Permissões concedidas por cada área (união com o papel de governança). */
exports.OPERATIONAL_AREA_PERMISSIONS = {
    recepcao: [
        'hub.appointments.read',
        'hub.appointments.write',
        'hub.guardians.read',
        'hub.guardians.write',
        'hub.pets.read',
        'hub.pets.write',
        'hub.prospects.read',
        'hub.quotes.read',
    ],
    caixa: [
        'hub.financial.read',
        'hub.cash.session',
        'hub.cash.receive',
        'hub.receivables.create',
    ],
    financeiro: ['hub.financial.read', 'hub.financial.write'],
    clinica: [
        'hub.clinic.read',
        'hub.clinic.write',
        'hub.appointments.read',
        'hub.inventory.read',
        'hub.staff.read',
        'hub.guardians.read',
        'hub.pets.read',
    ],
    banho_tosa: [
        'hub.guardians.read',
        'hub.pets.read',
        'hub.service_types.read',
        'hub.appointments.read',
        'grooming.queue.read',
        'grooming.queue.manage',
    ],
    hotel_creche: [
        'hub.guardians.read',
        'hub.pets.read',
        'hub.appointments.read',
        'boarding.reservations.read',
        'boarding.reservations.manage',
        'boarding.daily_report.write',
    ],
    /** Motorista-first: ver rota e atualizar paradas (sem montar rotas/frota). */
    leva_traz: ['pickup.routes.read', 'pickup.stops.update'],
    estoque: ['hub.inventory.read', 'hub.inventory.write'],
    servicos: ['hub.service_types.read', 'hub.service_types.write'],
    equipe: ['hub.staff.read', 'hub.staff.write', 'hub.staff.invite', 'user.invite'],
};
function isHubOperationalArea(value) {
    return AREA_SET.has(value);
}
function sanitizeOperationalAreas(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    const seen = new Set();
    for (const item of raw) {
        const s = String(item).trim();
        if (!s || seen.has(s) || !isHubOperationalArea(s))
            continue;
        seen.add(s);
        out.push(s);
    }
    return out;
}
/** Defaults sugeridos ao escolher a função principal na Equipe. */
function defaultOperationalAreasForJobTitle(jobTitle) {
    const j = jobTitle.trim();
    if (j === 'Recepção')
        return ['recepcao', 'caixa'];
    if (j === 'Banho & Tosa')
        return ['banho_tosa'];
    if (j === 'Motorista')
        return ['leva_traz'];
    if (j === 'Médico(a) Veterinário(a)' ||
        j === 'Auxiliar Veterinário(a)' ||
        j === 'Enfermeiro(a) Veterinário(a)') {
        return ['clinica'];
    }
    if (j === 'Recreador(a)' || j === 'Adestrador(a)')
        return ['hotel_creche'];
    return [];
}
function permissionsFromOperationalAreas(areas) {
    const out = new Set();
    for (const area of sanitizeOperationalAreas([...areas])) {
        for (const p of exports.OPERATIONAL_AREA_PERMISSIONS[area])
            out.add(p);
    }
    return [...out];
}
