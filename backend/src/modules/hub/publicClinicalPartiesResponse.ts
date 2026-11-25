import type { ClinicalPartySnapshot } from './clinicalDocumentValidation';
import {
  formatAgeFromBirthDate,
  formatClinicAddress,
  formatGuardianAddress,
  formatTaxIdDisplay,
} from './prescriptionValidation';

/** Partes sanitizadas para páginas públicas (receita / exames / encaminhamento). */
export type PublicClinicalPartiesPayload = {
  clinic: {
    name: string;
    phone: string | null;
    email: string | null;
    address_line: string | null;
  };
  pet: {
    name: string;
    species: string | null;
    breed: string | null;
    age_label: string;
  };
  guardian: {
    full_name: string;
    phone: string | null;
    tax_id_display: string;
    id_doc_number: string | null;
    address_line: string;
  };
  veterinarian: {
    full_name: string;
    crmv: string | null;
    crmv_uf: string | null;
    signature_image_url: string | null;
    stamp_image_url: string | null;
  };
};

export function mapClinicalPartiesForPublic(
  parties: Pick<ClinicalPartySnapshot, 'clinic' | 'pet' | 'guardian' | 'veterinarian'>,
): PublicClinicalPartiesPayload {
  const addressLine = formatClinicAddress(parties.clinic);
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
      age_label: formatAgeFromBirthDate(parties.pet.birth_date),
    },
    guardian: {
      full_name: parties.guardian.full_name,
      phone: parties.guardian.phone ?? null,
      tax_id_display: formatTaxIdDisplay(parties.guardian.tax_id),
      id_doc_number: parties.guardian.id_doc_number ?? null,
      address_line: formatGuardianAddress(parties.guardian),
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
