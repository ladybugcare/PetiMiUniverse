"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PRESCRIPTION_DISCLAIMERS = exports.VALIDATION_CODE_REGEX = void 0;
exports.generateValidationCode = generateValidationCode;
exports.generatePublicToken = generatePublicToken;
exports.canonicalizeSnapshot = canonicalizeSnapshot;
exports.computeContentHash = computeContentHash;
exports.truncateContentHash = truncateContentHash;
exports.maskPublicToken = maskPublicToken;
exports.resolvePrescriptionPublicUrl = resolvePrescriptionPublicUrl;
exports.computeDocumentStatus = computeDocumentStatus;
exports.normalizeMedicationItem = normalizeMedicationItem;
exports.buildPrescriptionSnapshot = buildPrescriptionSnapshot;
exports.snapshotToPdfView = snapshotToPdfView;
exports.resolvePrescriptionValidityDays = resolvePrescriptionValidityDays;
exports.addDaysIso = addDaysIso;
exports.mapLoadedIssueContext = mapLoadedIssueContext;
const node_crypto_1 = require("node:crypto");
exports.VALIDATION_CODE_REGEX = /^RX-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
exports.DEFAULT_PRESCRIPTION_DISCLAIMERS = [
    'Documento gerado pelo PetMi Hub para validação de autenticidade. Não substitui assinatura qualificada ICP-Brasil.',
    'A dispensação de medicamentos é de responsabilidade do profissional emitente e da farmácia, conforme legislação vigente.',
    'Medicamentos controlados ou antimicrobianos podem exigir documentação adicional; consulte a farmácia.',
];
function embedOne(x) {
    if (x == null)
        return null;
    return Array.isArray(x) ? (x[0] ?? null) : x;
}
function generateValidationCode() {
    const part = () => Array.from({ length: 4 }, () => CROCKFORD[(0, node_crypto_1.randomBytes)(1)[0] % CROCKFORD.length]).join('');
    return `RX-${part()}-${part()}`;
}
function generatePublicToken() {
    return (0, node_crypto_1.randomBytes)(24).toString('base64url');
}
function sortObjectKeys(value) {
    if (value == null || typeof value !== 'object')
        return value;
    if (Array.isArray(value))
        return value.map(sortObjectKeys);
    const obj = value;
    const sorted = {};
    for (const key of Object.keys(obj).sort()) {
        sorted[key] = sortObjectKeys(obj[key]);
    }
    return sorted;
}
function canonicalizeSnapshot(snapshot) {
    return JSON.stringify(sortObjectKeys(snapshot));
}
function computeContentHash(snapshot) {
    return (0, node_crypto_1.createHash)('sha256').update(canonicalizeSnapshot(snapshot)).digest('hex');
}
function truncateContentHash(hash, edge = 8) {
    if (hash.length <= edge * 2 + 1)
        return hash;
    return `${hash.slice(0, edge)}…${hash.slice(-edge)}`;
}
function maskPublicToken(token) {
    if (token.length <= 10)
        return '***';
    return `${token.slice(0, 4)}…${token.slice(-4)}`;
}
function resolvePrescriptionPublicUrl(publicToken) {
    const base = process.env.HUB_WEB_URL?.trim() ||
        process.env.VITE_HUB_WEB_URL?.trim() ||
        process.env.FRONTEND_URL?.trim() ||
        'http://localhost:3002';
    return `${base.replace(/\/$/, '')}/receita/${publicToken}`;
}
function computeDocumentStatus(doc) {
    if (doc.revoked_at)
        return 'revoked';
    if (doc.expires_at && new Date(doc.expires_at).getTime() < Date.now())
        return 'expired';
    return 'valid';
}
function normalizeMedicationItem(item) {
    return {
        medication_name: String(item.medication_name ?? ''),
        presentation: item.presentation ?? null,
        concentration: item.concentration ??
            item.dosage ??
            null,
        quantity: item.quantity ?? null,
        posology: item.posology ??
            item.frequency ??
            null,
        duration: item.duration ?? null,
        instructions: item.instructions ?? null,
        administration: item.administration ?? null,
    };
}
function buildPrescriptionSnapshot(input) {
    const disclaimers = [...exports.DEFAULT_PRESCRIPTION_DISCLAIMERS];
    const extra = input.customDisclaimer?.trim();
    if (extra)
        disclaimers.push(extra);
    return {
        version: 1,
        prescription_id: input.prescriptionId,
        document_version: input.documentVersion,
        clinic: { id: input.clinic.id, name: input.clinic.name },
        pet: {
            id: input.pet.id,
            name: input.pet.name,
            species: input.pet.species ?? null,
            breed: input.pet.breed ?? null,
        },
        guardian: { id: input.guardian.id, full_name: input.guardian.full_name },
        veterinarian: {
            id: input.veterinarian.id,
            full_name: input.veterinarian.full_name,
            crmv: input.veterinarian.crmv ?? null,
            crmv_uf: input.veterinarian.crmv_uf ?? null,
        },
        medications: [...input.items]
            .sort((a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0))
            .map(normalizeMedicationItem),
        notes: input.notes ?? null,
        issued_at: input.issuedAt,
        disclaimers,
    };
}
function snapshotToPdfView(snapshot) {
    return {
        id: snapshot.prescription_id,
        clinic_id: snapshot.clinic.id,
        prescribed_at: snapshot.issued_at,
        notes: snapshot.notes,
        items: snapshot.medications.map((med, idx) => ({
            medication_name: med.medication_name,
            presentation: med.presentation,
            concentration: med.concentration,
            quantity: med.quantity,
            posology: med.posology,
            dosage: med.concentration,
            frequency: med.posology,
            duration: med.duration,
            instructions: med.instructions,
            order_index: idx,
        })),
        clinic: { name: snapshot.clinic.name },
        pet: {
            name: snapshot.pet.name,
            species: snapshot.pet.species,
            breed: snapshot.pet.breed,
        },
        guardian: { full_name: snapshot.guardian.full_name },
        staff: {
            full_name: snapshot.veterinarian.full_name,
            crmv: snapshot.veterinarian.crmv,
            crmv_uf: snapshot.veterinarian.crmv_uf,
        },
    };
}
function resolvePrescriptionValidityDays(prescriptionDefaults) {
    const raw = prescriptionDefaults?.validity_days;
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(n) && n >= 1 && n <= 365)
        return Math.floor(n);
    return 30;
}
function addDaysIso(iso, days) {
    const d = new Date(iso);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString();
}
function mapLoadedIssueContext(rx, items, clinicEmbed, petEmbed, guardianEmbed, staffEmbed, fallbackGuardianName = 'Tutor não informado') {
    const clinic = embedOne(clinicEmbed) ?? {
        id: String(rx.clinic_id),
        name: 'Clínica veterinária',
    };
    const petRow = embedOne(petEmbed);
    const guardianRow = embedOne(guardianEmbed);
    const staffRow = embedOne(staffEmbed);
    return {
        prescription: rx,
        items,
        clinic: { id: clinic.id, name: clinic.name },
        pet: {
            id: petRow?.id ?? String(rx.pet_id),
            name: petRow?.name ?? '—',
            species: petRow?.species ?? null,
            breed: petRow?.breed ?? null,
        },
        guardian: {
            id: (guardianRow?.id ?? rx.guardian_id ?? null),
            full_name: guardianRow?.full_name ?? fallbackGuardianName,
        },
        veterinarian: {
            id: (staffRow?.id ?? rx.hub_staff_member_id ?? null),
            full_name: staffRow?.full_name ?? 'Veterinário responsável',
            crmv: staffRow?.crmv ?? null,
            crmv_uf: staffRow?.crmv_uf ?? null,
        },
    };
}
