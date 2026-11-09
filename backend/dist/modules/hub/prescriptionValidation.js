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
exports.formatAgeFromBirthDate = formatAgeFromBirthDate;
exports.formatGuardianAddress = formatGuardianAddress;
exports.formatClinicAddress = formatClinicAddress;
exports.formatTaxIdDisplay = formatTaxIdDisplay;
exports.formatMedicationQuantityLine = formatMedicationQuantityLine;
exports.formatMedicationInstructions = formatMedicationInstructions;
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
        use_route: item.use_route ?? null,
    };
}
function formatAgeFromBirthDate(birthDate, now = new Date()) {
    if (!birthDate)
        return 'Não informado';
    const d = new Date(`${birthDate}T12:00:00`);
    if (Number.isNaN(d.getTime()))
        return 'Não informado';
    let years = now.getFullYear() - d.getFullYear();
    let months = now.getMonth() - d.getMonth();
    if (now.getDate() < d.getDate())
        months -= 1;
    if (months < 0) {
        years -= 1;
        months += 12;
    }
    if (years < 0)
        return 'Não informado';
    if (years === 0)
        return months === 1 ? '1 mês' : `${Math.max(months, 0)} meses`;
    if (months === 0)
        return years === 1 ? '1 ano' : `${years} anos`;
    return `${years} ano${years > 1 ? 's' : ''}, ${months} ${months === 1 ? 'mês' : 'meses'}`;
}
function formatGuardianAddress(g) {
    const line1 = [g.street, g.street_number].filter(Boolean).join(', ').trim();
    const line2 = [g.district, g.city, g.state].filter(Boolean).join(', ').trim();
    const parts = [line1, line2, g.postal_code?.trim()].filter(Boolean);
    return parts.length ? parts.join(' — ') : 'Não informado';
}
function formatClinicAddress(c) {
    const parts = [c.address?.trim(), [c.city, c.state].filter(Boolean).join(' - ')].filter(Boolean);
    return parts.join(', ') || '';
}
function formatTaxIdDisplay(taxId) {
    const digits = String(taxId ?? '').replace(/\D/g, '');
    if (digits.length === 11) {
        return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    }
    if (digits.length === 14) {
        return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
    }
    return taxId?.trim() || 'Não informado';
}
function formatMedicationQuantityLine(med) {
    return [med.quantity, med.presentation].filter(Boolean).join(' ').trim();
}
function formatMedicationInstructions(med) {
    const bits = [
        med.posology,
        med.duration ? `durante ${med.duration}` : null,
        med.concentration ? `(${med.concentration})` : null,
        med.instructions,
    ].filter(Boolean);
    return bits.join(' ').trim();
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
        clinic: {
            id: input.clinic.id,
            name: input.clinic.name,
            phone: input.clinic.phone ?? null,
            email: input.clinic.email ?? null,
            address: input.clinic.address ?? null,
            city: input.clinic.city ?? null,
            state: input.clinic.state ?? null,
        },
        pet: {
            id: input.pet.id,
            name: input.pet.name,
            species: input.pet.species ?? null,
            breed: input.pet.breed ?? null,
            birth_date: input.pet.birth_date ?? null,
        },
        guardian: {
            id: input.guardian.id,
            full_name: input.guardian.full_name,
            phone: input.guardian.phone ?? null,
            tax_id: input.guardian.tax_id ?? null,
            id_doc_number: input.guardian.id_doc_number ?? null,
            street: input.guardian.street ?? null,
            street_number: input.guardian.street_number ?? null,
            district: input.guardian.district ?? null,
            city: input.guardian.city ?? null,
            state: input.guardian.state ?? null,
            postal_code: input.guardian.postal_code ?? null,
        },
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
function snapshotToPdfView(snapshot, opts) {
    return {
        id: snapshot.prescription_id,
        clinic_id: snapshot.clinic.id,
        prescribed_at: snapshot.issued_at,
        expires_at: opts?.expires_at ?? null,
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
            administration: med.administration,
            use_route: med.use_route,
            order_index: idx,
        })),
        clinic: snapshot.clinic,
        pet: snapshot.pet,
        guardian: snapshot.guardian,
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
        clinic: {
            id: clinic.id,
            name: clinic.name,
            phone: clinic.phone ?? null,
            email: clinic.email ?? null,
            address: clinic.address ?? null,
            city: clinic.city ?? null,
            state: clinic.state ?? null,
        },
        pet: {
            id: petRow?.id ?? String(rx.pet_id),
            name: petRow?.name ?? '—',
            species: petRow?.species ?? null,
            breed: petRow?.breed ?? null,
            birth_date: petRow?.birth_date ?? null,
        },
        guardian: {
            id: (guardianRow?.id ?? rx.guardian_id ?? null),
            full_name: guardianRow?.full_name ?? fallbackGuardianName,
            phone: guardianRow?.phone ?? null,
            tax_id: guardianRow?.tax_id ?? null,
            id_doc_number: guardianRow?.id_doc_number ?? null,
            street: guardianRow?.street ?? null,
            street_number: guardianRow?.street_number ?? null,
            district: guardianRow?.district ?? null,
            city: guardianRow?.city ?? null,
            state: guardianRow?.state ?? null,
            postal_code: guardianRow?.postal_code ?? null,
        },
        veterinarian: {
            id: (staffRow?.id ?? rx.hub_staff_member_id ?? null),
            full_name: staffRow?.full_name ?? 'Veterinário responsável',
            crmv: staffRow?.crmv ?? null,
            crmv_uf: staffRow?.crmv_uf ?? null,
        },
    };
}
