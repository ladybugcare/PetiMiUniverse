"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapClinicalPartiesForPublic = mapClinicalPartiesForPublic;
const prescriptionValidation_1 = require("./prescriptionValidation");
function mapClinicalPartiesForPublic(parties) {
    const addressLine = (0, prescriptionValidation_1.formatClinicAddress)(parties.clinic);
    return {
        clinic: {
            name: parties.clinic.name,
            phone: parties.clinic.phone ?? null,
            email: parties.clinic.email ?? null,
            address_line: addressLine || null,
        },
        pet: {
            name: parties.pet.name,
            species: parties.pet.species,
            breed: parties.pet.breed,
            age_label: (0, prescriptionValidation_1.formatAgeFromBirthDate)(parties.pet.birth_date),
        },
        guardian: {
            full_name: parties.guardian.full_name,
            phone: parties.guardian.phone ?? null,
            tax_id_display: (0, prescriptionValidation_1.formatTaxIdDisplay)(parties.guardian.tax_id),
            id_doc_number: parties.guardian.id_doc_number ?? null,
            address_line: (0, prescriptionValidation_1.formatGuardianAddress)(parties.guardian),
        },
        veterinarian: {
            full_name: parties.veterinarian.full_name,
            crmv: parties.veterinarian.crmv,
            crmv_uf: parties.veterinarian.crmv_uf,
            signature_image_url: parties.veterinarian.signature_image_url ?? null,
            stamp_image_url: parties.veterinarian.stamp_image_url ?? null,
        },
    };
}
